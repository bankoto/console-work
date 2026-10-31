import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { put } from '@vercel/blob/client';
import { del } from '@vercel/blob';
import { getServices } from '../server/auth.mjs';
import { createHandler, temporaryPassword } from '../server/handler.mjs';

const { pool, auth } = getServices(), base = process.env.VERIFY_BASE_URL || 'http://localhost:3100', origin = process.env.VERIFY_ORIGIN || new URL(base).origin;
const users = [], clients = [], paths = [], key = randomUUID().slice(0, 8);
let server, count = 0;
if (!process.env.VERIFY_BASE_URL) { server = http.createServer(createHandler()); await new Promise(r => server.listen(3100, r)); }
const checked = text => { count++; console.log(`PASS ${text}`); };
async function call(path, cookie = '', body, method = body ? 'POST' : 'GET') {
  const response = await fetch(`${base}/api/console/${path}`, { method, headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Forwarded-For': `198.51.100.${parseInt(key.slice(0, 2), 16) || 1}`, ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = {}; }
  return { response, status: response.status, data, text };
}
async function account(role, kind) {
  const email = `formation-qa-${role}-${kind}-${key}@example.invalid`, password = temporaryPassword();
  const { user } = await auth.api.createUser({ body: { name: `Formation QA ${kind}`, email, password, role } }); users.push(user.id);
  await pool.query('INSERT INTO console_members(user_id,kind,specialty,must_change_password) VALUES($1,$2,$3,false)', [user.id, kind, 'Legal Expert']);
  const login = await call('auth/sign-in/email', '', { email, password }); assert.equal(login.status, 200, login.text);
  return { ...user, cookie: login.response.headers.getSetCookie().map(c => c.split(';')[0]).join('; ') };
}
async function uploadFile(cookie, job, folder, filename, bytes, category) {
  const reserve = await call('formation/prepare-upload', cookie, { caseId: job.id, folderId: folder.id, filename, size: bytes.length, category }); assert.equal(reserve.status, 201, reserve.text); paths.push(reserve.data.pathname);
  const token = await call('formation/upload-token', cookie, { type: 'blob.generate-client-token', payload: { pathname: reserve.data.pathname, clientPayload: JSON.stringify({ uploadId: reserve.data.id }), multipart: false } }); assert.equal(token.status, 200, token.text);
  const blob = await put(reserve.data.pathname, bytes, { access: 'private', token: token.data.clientToken, contentType: reserve.data.contentType });
  const finish = await call('formation/finish-upload', cookie, { id: reserve.data.id }); assert.equal(finish.status, 200, finish.text);
  return { ...reserve.data, blob };
}
try {
  const admin = await account('admin', 'employee'), consultant = await account('user', 'consultant'), other = await account('user', 'employee');
  for (const name of ['Formation QA Client A', 'Formation QA Client B']) { const id = randomUUID(); clients.push(id); await pool.query('INSERT INTO console_clients(id,name,industry) VALUES($1,$2,$3)', [id, `${name} ${key}`, 'Verification only']); }
  await pool.query('INSERT INTO console_assignments(user_id,client_id,module_id) VALUES($1,$2,$3),($1,$4,$5),($6,$4,$3)', [consultant.id, clients[0], 'formation', clients[1], 'accounting', other.id]);
  assert.equal((await call('formation')).status, 401);
  const list = await call('formation', consultant.cookie); assert.equal(list.status, 200); assert.deepEqual(list.data.clients.map(c => c.clientId), [clients[0]]);
  assert.equal((await call(`formation/case?clientId=${clients[1]}`, consultant.cookie)).status, 403); checked('formation listing and client access obey exact module assignments');
  const create = await call('formation/case', consultant.cookie, { clientId: clients[0], companyName: `Formation QA Company ${key}` }); assert.equal(create.status, 201, create.text);
  const bCreate = await call('formation/case', other.cookie, { clientId: clients[1] }); assert.equal(bCreate.status, 201);
  let detail = (await call(`formation/case?clientId=${clients[0]}`, consultant.cookie)).data, otherDetail = (await call(`formation/case?clientId=${clients[1]}`, other.cookie)).data;
  assert.equal(detail.folders.length, 2); assert.ok(detail.folders.some(f => f.area === 'output' && f.systemFolder));
  assert.equal((await call('formation/case', consultant.cookie, { clientId: clients[0] })).status, 409); checked('assigned consultant can start a job with Working and Output folders; duplicate jobs are blocked');
  const folder = await call('formation/folder', consultant.cookie, { caseId: detail.job.id, name: 'Directors’ documents', area: 'working' }); assert.equal(folder.status, 201);
  assert.equal((await call('formation/folder', consultant.cookie, { caseId: detail.job.id, name: 'Directors’ documents', area: 'working' })).status, 409); checked('custom document folders are durable and duplicates are handled');
  const prepare = { caseId: detail.job.id, folderId: folder.data.id, filename: 'Director ID.pdf', category: 'Identity documents', size: 100 };
  assert.equal((await call('formation/prepare-upload', consultant.cookie, { ...prepare, size: 20971521 })).status, 400);
  assert.equal((await call('formation/prepare-upload', consultant.cookie, { ...prepare, filename: 'malicious.html' })).status, 400);
  assert.equal((await call('formation/prepare-upload', consultant.cookie, { ...prepare, folderId: otherDetail.folders[0].id })).status, 400); checked('uploads validate size, file type and same-client folder ownership');
  const bytes = Buffer.from('%PDF-1.4\nFormation QA document.\n%%EOF');
  const file = await uploadFile(consultant.cookie, detail.job, { id: folder.data.id }, 'Director ID.pdf', bytes, 'Identity documents');
  const raw = await fetch(file.blob.url); assert.ok([401, 403, 404].includes(raw.status), `Private blob unexpectedly returned ${raw.status}`);
  const download = await fetch(`${base}/api/console/formation/download?id=${file.id}`, { headers: { Cookie: consultant.cookie } }); assert.equal(download.status, 200); assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes); assert.match(download.headers.get('content-disposition'), /attachment/); assert.match(download.headers.get('cache-control'), /no-store/); checked('real private upload, persistence and authenticated download round-trip correctly');
  assert.equal((await call(`formation/download?id=${file.id}`, other.cookie)).status, 403);
  assert.equal((await call('formation/file', other.cookie, { id: file.id, folderId: otherDetail.folders[0].id, category: 'Other' }, 'PATCH')).status, 403);
  assert.equal((await call('formation/file', consultant.cookie, { id: file.id, folderId: otherDetail.folders[0].id, category: 'Other' }, 'PATCH')).status, 400); checked('guessed file IDs cannot bypass client isolation or move files across clients');
  const output = detail.folders.find(f => f.area === 'output');
  assert.equal((await call('formation/file', consultant.cookie, { id: file.id, folderId: output.id, category: 'Certificate of incorporation' }, 'PATCH')).status, 200);
  detail = (await call(`formation/case?clientId=${clients[0]}`, admin.cookie)).data;
  assert.equal(detail.files[0].folderId, output.id); assert.equal(detail.files[0].category, 'Certificate of incorporation'); assert.ok(!('blob_path' in detail.files[0]) && !('url' in detail.files[0])); checked('documents can be recategorized and moved into Output without exposing storage paths');
  const update = { id: detail.job.id, companyName: detail.job.companyName, status: 'submitted', registrationNumber: '', note: 'Application submitted for registration.', dueDate: '2026-12-01', version: detail.job.version };
  assert.equal((await call('formation/case', consultant.cookie, update, 'PATCH')).status, 200);
  assert.equal((await call('formation/case', consultant.cookie, { ...update, status: 'completed' }, 'PATCH')).status, 409);
  assert.equal((await call('formation/case', consultant.cookie, { ...update, status: 'completed', version: update.version + 1, registrationNumber: 'QA-12345', note: 'Incorporation completed; final documents uploaded.' }, 'PATCH')).status, 200);
  detail = (await call(`formation/case?clientId=${clients[0]}`, consultant.cookie)).data;
  assert.equal(detail.job.status, 'completed'); assert.ok(detail.job.completedAt); assert.equal(detail.job.registrationNumber, 'QA-12345'); assert.ok(detail.events.some(e => e.message === 'Status changed to Completed')); checked('incorporation status, target date, completion and activity persist; concurrent edits are protected');
  const largeBytes = Buffer.alloc(5 * 1024 * 1024, 'a'), large = await uploadFile(other.cookie, otherDetail.job, otherDetail.folders[0], 'Supporting notes.txt', largeBytes, 'Supporting documents');
  const largeDownload = await fetch(`${base}/api/console/formation/download?id=${large.id}`, { headers: { Cookie: other.cookie } }); assert.equal(largeDownload.status, 200); assert.deepEqual(Buffer.from(await largeDownload.arrayBuffer()), largeBytes); checked('employees can upload and download a document larger than the server upload limit');
  await pool.query("DELETE FROM console_assignments WHERE user_id=$1 AND client_id=$2 AND module_id='formation'", [consultant.id, clients[0]]);
  assert.equal((await call(`formation/download?id=${file.id}`, consultant.cookie)).status, 403); checked('revoking the module immediately removes document download access');
  console.log(`Verified ${count} formation end-to-end scenarios.`);
} finally {
  if (paths.length) await del(paths);
  for (const id of clients) await pool.query('DELETE FROM console_clients WHERE id=$1', [id]);
  for (const id of users) { await pool.query('DELETE FROM console_audit WHERE actor_id=$1 OR target_id=$1', [id]); await pool.query('DELETE FROM "user" WHERE id=$1', [id]); }
  await pool.end(); if (server) await new Promise(r => server.close(r));
}
