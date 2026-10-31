import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { get, head, del } from '@vercel/blob';
import { handleUpload } from '@vercel/blob/client';
import { canAccess, HttpError } from './access.mjs';
import { documentCategories, formationStatuses, maxFormationFileSize, textField, validateCaseUpdate, validateUpload } from './formation-domain.mjs';

function uuid(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)) throw new HttpError(400, 'Select a valid incorporation job, folder or document.');
  return value;
}
async function transaction(pool, fn) {
  const db = await pool.connect();
  try { await db.query('BEGIN'); const result = await fn(db); await db.query('COMMIT'); return result; }
  catch (e) { await db.query('ROLLBACK'); throw e; } finally { db.release(); }
}
async function event(db, caseId, actor, message, note = '') {
  await db.query('INSERT INTO console_formation_events(id,case_id,actor_id,message,note) VALUES($1,$2,$3,$4,$5)', [randomUUID(), caseId, actor, message, note]);
}
async function requireClient(pool, user, assignments, clientId) {
  if (!canAccess(user, assignments, clientId, 'formation')) throw new HttpError(403, 'This Company Formation client is not assigned to you.');
  const client = (await pool.query('SELECT id,name,industry FROM console_clients WHERE id=$1', [clientId])).rows[0];
  if (!client) throw new HttpError(404, 'Client not found.');
  return client;
}
async function requireCase(pool, user, assignments, id) {
  const job = (await pool.query('SELECT * FROM console_formation_cases WHERE id=$1', [uuid(id)])).rows[0];
  if (!job) throw new HttpError(404, 'Incorporation job not found.');
  await requireClient(pool, user, assignments, job.client_id);
  return job;
}
const caseFields = 'id,client_id AS "clientId",company_name AS "companyName",status,registration_number AS "registrationNumber",due_date::text AS "dueDate",latest_note AS "latestNote",version,created_at AS "createdAt",updated_at AS "updatedAt",completed_at AS "completedAt"';
const fileFields = 'f.id,f.folder_id AS "folderId",f.filename,f.category,f.content_type AS "contentType",f.size,f.ready_at AS "uploadedAt",u.name AS "uploadedBy"';

export async function formationRoute({ path, req, res, url, pool, user, assignments, bodyOf, json }) {
  if (!path.startsWith('/api/console/formation')) return false;
  if (path === '/api/console/formation' && req.method === 'GET') {
    const rows = (await pool.query(`SELECT c.id AS "clientId",c.name AS "clientName",c.industry,j.id,j.company_name AS "companyName",COALESCE(j.status,'not_started') AS status,j.due_date::text AS "dueDate",j.updated_at AS "updatedAt",
      (SELECT count(*)::int FROM console_formation_files f WHERE f.case_id=j.id AND f.state='ready') AS "fileCount",
      (SELECT count(*)::int FROM console_formation_files f JOIN console_formation_folders d ON d.id=f.folder_id WHERE f.case_id=j.id AND f.state='ready' AND d.area='output') AS "outputCount"
      FROM console_clients c LEFT JOIN console_formation_cases j ON j.client_id=c.id
      WHERE $1::boolean OR EXISTS(SELECT 1 FROM console_assignments a WHERE a.user_id=$2 AND a.client_id=c.id AND a.module_id='formation')
      ORDER BY j.updated_at DESC NULLS LAST,c.name`, [user.role === 'admin', user.id])).rows;
    json(res, 200, { clients: rows, statuses: formationStatuses, categories: documentCategories, maxFileSize: maxFormationFileSize }); return true;
  }
  if (path === '/api/console/formation/case' && req.method === 'GET') {
    const client = await requireClient(pool, user, assignments, url.searchParams.get('clientId'));
    const job = (await pool.query(`SELECT ${caseFields} FROM console_formation_cases WHERE client_id=$1`, [client.id])).rows[0];
    if (!job) { json(res, 200, { client, job: null }); return true; }
    const folders = (await pool.query('SELECT id,name,area,system_folder AS "systemFolder" FROM console_formation_folders WHERE case_id=$1 ORDER BY area DESC,system_folder DESC,name', [job.id])).rows;
    const files = (await pool.query(`SELECT ${fileFields} FROM console_formation_files f LEFT JOIN "user" u ON u.id=f.uploaded_by WHERE f.case_id=$1 AND f.state='ready' ORDER BY f.ready_at DESC`, [job.id])).rows;
    const events = (await pool.query('SELECT e.id,e.message,e.note,e.created_at AS "createdAt",u.name AS "actorName" FROM console_formation_events e LEFT JOIN "user" u ON u.id=e.actor_id WHERE e.case_id=$1 ORDER BY e.created_at DESC LIMIT 100', [job.id])).rows;
    json(res, 200, { client, job, folders, files, events }); return true;
  }
  if (path === '/api/console/formation/case' && req.method === 'POST') {
    const body = await bodyOf(req), client = await requireClient(pool, user, assignments, body.clientId);
    const companyName = textField(body.companyName || client.name, 'proposed company name', 180), id = randomUUID();
    try {
      await transaction(pool, async db => {
        await db.query('INSERT INTO console_formation_cases(id,client_id,company_name,created_by,updated_by) VALUES($1,$2,$3,$4,$4)', [id, client.id, companyName, user.id]);
        for (const [area, name] of [['working', 'Working documents'], ['output', 'Output documents']]) await db.query('INSERT INTO console_formation_folders(id,case_id,name,area,system_folder) VALUES($1,$2,$3,$4,true)', [randomUUID(), id, name, area]);
        await event(db, id, user.id, 'Incorporation workspace created');
      });
    } catch (e) { if (e.code === '23505') throw new HttpError(409, 'This client already has an incorporation workspace. Refresh to open it.'); throw e; }
    json(res, 201, { id, clientId: client.id }); return true;
  }
  if (path === '/api/console/formation/case' && req.method === 'PATCH') {
    const body = await bodyOf(req), job = await requireCase(pool, user, assignments, body.id), data = validateCaseUpdate(body);
    await transaction(pool, async db => {
      const updated = await db.query(`UPDATE console_formation_cases SET company_name=$2,status=$3,registration_number=$4,due_date=$5,latest_note=$6,updated_by=$7,updated_at=now(),version=version+1,
        completed_at=CASE WHEN $3='completed' THEN COALESCE(completed_at,now()) ELSE NULL END WHERE id=$1 AND version=$8 RETURNING id`, [job.id, data.companyName, data.status, data.registrationNumber, data.dueDate, data.note, user.id, data.version]);
      if (!updated.rowCount) throw new HttpError(409, 'Another team member updated this job. Refresh before saving your update.');
      const message = job.status !== data.status ? `Status changed to ${formationStatuses.find(s => s.id === data.status).label}` : 'Incorporation details updated';
      await event(db, job.id, user.id, message, data.note);
    });
    json(res, 200, { ok: true }); return true;
  }
  if (path === '/api/console/formation/folder' && req.method === 'POST') {
    const body = await bodyOf(req), job = await requireCase(pool, user, assignments, body.caseId);
    const name = textField(body.name, 'folder name', 80);
    if (!['working', 'output'].includes(body.area)) throw new HttpError(400, 'Select Working documents or Output documents.');
    const id = randomUUID();
    try {
      await transaction(pool, async db => {
        await db.query('INSERT INTO console_formation_folders(id,case_id,name,area) VALUES($1,$2,$3,$4)', [id, job.id, name, body.area]);
        await event(db, job.id, user.id, `Created folder: ${name}`);
      });
    } catch (e) { if (e.code === '23505') throw new HttpError(409, 'A folder with this name already exists in that area.'); throw e; }
    json(res, 201, { id }); return true;
  }
  if (path === '/api/console/formation/prepare-upload' && req.method === 'POST') {
    const body = await bodyOf(req), job = await requireCase(pool, user, assignments, body.caseId), data = validateUpload(body);
    const folder = (await pool.query('SELECT id FROM console_formation_folders WHERE id=$1 AND case_id=$2', [uuid(body.folderId), job.id])).rows[0];
    if (!folder) throw new HttpError(400, 'Select a folder belonging to this incorporation job.');
    const id = randomUUID(), safeName = data.filename.replace(/[^a-zA-Z0-9._-]/g, '_'), pathname = `formation/${job.id}/${id}/${safeName}`;
    await pool.query('INSERT INTO console_formation_files(id,case_id,folder_id,filename,category,content_type,size,blob_path,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [id, job.id, folder.id, data.filename, data.category, data.contentType, data.size, pathname, user.id]);
    json(res, 201, { id, pathname, contentType: data.contentType }); return true;
  }
  if (path === '/api/console/formation/upload-token' && req.method === 'POST') {
    const body = await bodyOf(req);
    if (body.type !== 'blob.generate-client-token') throw new HttpError(400, 'Invalid upload request.');
    const result = await handleUpload({
      body, request: req,
      onBeforeGenerateToken: async (pathname, payload) => {
        let uploadId; try { uploadId = JSON.parse(payload).uploadId; } catch { throw new HttpError(400, 'Invalid upload reservation.'); }
        const file = (await pool.query("SELECT * FROM console_formation_files WHERE id=$1 AND state='pending' AND created_at > now()-interval '1 hour'", [uuid(uploadId)])).rows[0];
        if (!file || file.uploaded_by !== user.id || file.blob_path !== pathname) throw new HttpError(403, 'This upload reservation is not available to your account.');
        await requireCase(pool, user, assignments, file.case_id);
        return { maximumSizeInBytes: file.size, allowedContentTypes: [file.content_type], addRandomSuffix: false, allowOverwrite: false, validUntil: Date.now() + 5 * 60 * 1000 };
      },
    });
    json(res, 200, result); return true;
  }
  if (path === '/api/console/formation/finish-upload' && req.method === 'POST') {
    const body = await bodyOf(req), file = (await pool.query('SELECT * FROM console_formation_files WHERE id=$1', [uuid(body.id)])).rows[0];
    if (!file || file.uploaded_by !== user.id) throw new HttpError(404, 'Upload not found.');
    await requireCase(pool, user, assignments, file.case_id);
    if (file.state === 'ready') { json(res, 200, { id: file.id }); return true; }
    let blob;
    try { blob = await head(file.blob_path); } catch (e) { if (e.name === 'BlobNotFoundError') throw new HttpError(409, 'The file upload has not finished. Please retry.'); throw e; }
    if (blob.pathname !== file.blob_path || blob.size !== file.size || blob.contentType.split(';')[0] !== file.content_type) throw new HttpError(400, 'The uploaded file does not match the reserved document.');
    await transaction(pool, async db => {
      const updated = await db.query("UPDATE console_formation_files SET state='ready',ready_at=now() WHERE id=$1 AND state='pending' RETURNING id", [file.id]);
      if (updated.rowCount) await event(db, file.case_id, user.id, `Uploaded document: ${file.filename}`);
    });
    json(res, 200, { id: file.id }); return true;
  }
  if (path === '/api/console/formation/cancel-upload' && req.method === 'POST') {
    const body = await bodyOf(req), file = (await pool.query("SELECT * FROM console_formation_files WHERE id=$1 AND state='pending'", [uuid(body.id)])).rows[0];
    if (!file || file.uploaded_by !== user.id) throw new HttpError(404, 'Pending upload not found.');
    await requireCase(pool, user, assignments, file.case_id);
    await del(file.blob_path);
    await pool.query("DELETE FROM console_formation_files WHERE id=$1 AND state='pending'", [file.id]);
    json(res, 200, { ok: true }); return true;
  }
  if (path === '/api/console/formation/file' && req.method === 'PATCH') {
    const body = await bodyOf(req), file = (await pool.query("SELECT * FROM console_formation_files WHERE id=$1 AND state='ready'", [uuid(body.id)])).rows[0];
    if (!file) throw new HttpError(404, 'Document not found.');
    await requireCase(pool, user, assignments, file.case_id);
    const folder = (await pool.query('SELECT id,name FROM console_formation_folders WHERE id=$1 AND case_id=$2', [uuid(body.folderId), file.case_id])).rows[0];
    if (!folder) throw new HttpError(400, 'Choose a folder in the same incorporation workspace.');
    const category = textField(body.category, 'document category', 80);
    await transaction(pool, async db => {
      await db.query('UPDATE console_formation_files SET folder_id=$2,category=$3 WHERE id=$1', [file.id, folder.id, category]);
      await event(db, file.case_id, user.id, `Organized document: ${file.filename}`, `Folder: ${folder.name}. Category: ${category}.`);
    });
    json(res, 200, { ok: true }); return true;
  }
  if (path === '/api/console/formation/download' && req.method === 'GET') {
    const file = (await pool.query("SELECT * FROM console_formation_files WHERE id=$1 AND state='ready'", [uuid(url.searchParams.get('id'))])).rows[0];
    if (!file) throw new HttpError(404, 'Document not found.');
    await requireCase(pool, user, assignments, file.case_id);
    const blob = await get(file.blob_path, { access: 'private', useCache: false });
    if (!blob || blob.statusCode !== 200) throw new HttpError(404, 'The stored document is unavailable.');
    const asciiName = file.filename.replace(/[^\x20-\x7E]|["\\]/g, '_');
    res.setHeader('Content-Type', file.content_type);
    res.setHeader('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.filename).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16)}`)}`);
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    await pipeline(Readable.fromWeb(blob.stream), res); return true;
  }
  throw new HttpError(404, 'Company Formation action not found.');
}
