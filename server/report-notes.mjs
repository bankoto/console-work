import { randomUUID } from 'node:crypto';
import { assertAdmin, canAccess, canEdit, HttpError } from './access.mjs';
import { getReportMetadata } from './reports.mjs';
import { commentId, commentListOptions, validateComment } from './report-notes-domain.mjs';

const fields = `n.id,n.client_id AS "clientId",c.name AS "clientName",n.author_id AS "authorId",COALESCE(u.name,n.author_name) AS "authorName",n.author_kind AS "authorKind",n.body,n.anchor,n.resolved,n.created_at AS "createdAt",n.resolved_at AS "resolvedAt",reviewer.name AS "resolvedBy"`;
const joins = `FROM console_report_comments n JOIN console_clients c ON c.id=n.client_id LEFT JOIN "user" u ON u.id=n.author_id LEFT JOIN "user" reviewer ON reviewer.id=n.resolved_by`;
async function clientAccess(pool, user, assignments, id, editing = false) {
  if (!canAccess(user, assignments, id, 'accounting')) throw new HttpError(403, 'This accounting client is not assigned to you.');
  if (editing && !canEdit(user, assignments, id, 'accounting')) throw new HttpError(403, 'A direct Accounting assignment is required to add report comments.');
  const client = (await pool.query('SELECT id,report_key FROM console_clients WHERE id=$1', [id])).rows[0];
  if (!client || id !== 'mtt') throw new HttpError(404, 'No accounting dashboard is connected for this client.');
  if (!client.report_key) throw new HttpError(409, 'Connect this client’s accounting dashboard first.');
  return client;
}
async function transaction(pool, fn) {
  const db = await pool.connect();
  try { await db.query('BEGIN'); const result = await fn(db); await db.query('COMMIT'); return result; }
  catch (e) { await db.query('ROLLBACK'); throw e; } finally { db.release(); }
}
async function list(pool, url, clientId = null) {
  const { status, limit, before } = commentListOptions(url);
  const condition = `($1::text IS NULL OR n.client_id=$1) AND ($2='all' OR n.resolved=($2='resolved'))`;
  const rows = (await pool.query(`SELECT ${fields} ${joins} WHERE ${condition}
    AND ($3::uuid IS NULL OR (n.created_at,n.id)<(SELECT created_at,id FROM console_report_comments WHERE id=$3 AND ($1::text IS NULL OR client_id=$1)))
    ORDER BY n.created_at DESC,n.id DESC LIMIT $4`, [clientId, status, before, limit + 1])).rows;
  const counts = (await pool.query(`SELECT count(*)::int AS total,count(*) FILTER(WHERE NOT resolved)::int AS open FROM console_report_comments WHERE $1::text IS NULL OR client_id=$1`, [clientId])).rows[0];
  return { comments: rows.slice(0, limit), next: rows.length > limit ? rows[limit - 1].id : null, counts };
}
export async function reportNotesRoute({ path, req, res, url, pool, user, member, assignments, bodyOf, json }) {
  if (!['/api/console/report-comments', '/api/console/report-feedback'].includes(path)) return false;
  if (path.endsWith('/report-feedback') && req.method === 'GET') {
    assertAdmin(user); json(res, 200, await list(pool, url, url.searchParams.get('clientId') || null)); return true;
  }
  if (path.endsWith('/report-comments') && req.method === 'GET') {
    const clientId = url.searchParams.get('clientId'); await clientAccess(pool, user, assignments, clientId);
    const result = await list(pool, url, clientId), focusId = url.searchParams.get('commentId');
    const focusComment = focusId ? (await pool.query(`SELECT ${fields} ${joins} WHERE n.id=$1 AND n.client_id=$2`, [commentId(focusId), clientId])).rows[0] || null : null;
    json(res, 200, { ...result, focusComment, canComment: canEdit(user, assignments, clientId, 'accounting'), canResolve: user.role === 'admin' }); return true;
  }
  if (path.endsWith('/report-comments') && req.method === 'POST') {
    const body = await bodyOf(req), client = await clientAccess(pool, user, assignments, body?.clientId, true);
    const data = validateComment(body, await getReportMetadata(client.report_key)), id = randomUUID();
    await transaction(pool, async db => {
      await db.query('INSERT INTO console_report_comments(id,client_id,author_id,author_name,author_kind,body,anchor) VALUES($1,$2,$3,$4,$5,$6,$7)', [id, client.id, user.id, user.name, user.role === 'admin' ? 'Administrator' : member.kind === 'consultant' ? 'Consultant' : 'Employee', data.body, JSON.stringify(data.anchor)]);
      await db.query('INSERT INTO console_audit(actor_id,action,target_id) VALUES($1,$2,$3)', [user.id, 'report_comment_added', id]);
    });
    const comment = (await pool.query(`SELECT ${fields} ${joins} WHERE n.id=$1`, [id])).rows[0];
    json(res, 201, { comment }); return true;
  }
  if (path.endsWith('/report-comments') && req.method === 'PATCH') {
    assertAdmin(user); const body = await bodyOf(req), id = commentId(body?.id);
    if (typeof body.resolved !== 'boolean') throw new HttpError(400, 'Choose whether this comment is resolved.');
    await transaction(pool, async db => {
      const result = await db.query('UPDATE console_report_comments SET resolved=$2,resolved_by=CASE WHEN $2 THEN $3 ELSE NULL END,resolved_at=CASE WHEN $2 THEN now() ELSE NULL END WHERE id=$1 RETURNING id', [id, body.resolved, user.id]);
      if (!result.rowCount) throw new HttpError(404, 'Comment not found.');
      await db.query('INSERT INTO console_audit(actor_id,action,target_id) VALUES($1,$2,$3)', [user.id, body.resolved ? 'report_comment_resolved' : 'report_comment_reopened', id]);
    });
    json(res, 200, { ok: true }); return true;
  }
  throw new HttpError(405, 'This comment action is not available.');
}
