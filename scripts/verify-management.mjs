import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { put } from '@vercel/blob/client';
import { del } from '@vercel/blob';
import { getServices } from '../server/auth.mjs';
import { createHandler, temporaryPassword } from '../server/handler.mjs';

const { pool, auth } = getServices(), base = process.env.VERIFY_BASE_URL || 'http://localhost:3110', origin = process.env.VERIFY_ORIGIN || new URL(process.env.BETTER_AUTH_URL || base).origin;
const users = [], clients = [], paths = [], key = randomUUID().slice(0, 8);
let server, count = 0;
if (!process.env.VERIFY_BASE_URL) { server = http.createServer(createHandler()); await new Promise(r => server.listen(3110, r)); }
const checked = text => { count++; console.log(`PASS ${text}`); };
async function call(path, cookie = '', body, method = body ? 'POST' : 'GET') {
  const response = await fetch(`${base}/api/console/${path}`, { method, headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Forwarded-For': `203.0.113.${parseInt(key.slice(0, 2), 16) || 1}`, ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = {}; }
  return { response, status: response.status, data, text };
}
async function login(person) {
  const result = await call('auth/sign-in/email', '', { email: person.email, password: person.password }); assert.equal(result.status, 200, result.text);
  person.cookie = result.response.headers.getSetCookie().map(c => c.split(';')[0]).join('; '); return person.cookie;
}
let admin;
async function person(name, managerId = null, kind = 'employee', assignments = []) {
  const email = `management-qa-${name.toLowerCase()}-${key}@example.invalid`;
  const result = await call('team', admin.cookie, { name: `Management QA ${name}`, email, kind, specialty: 'Accountant', managerId, assignments });
  assert.equal(result.status, 201, result.text); users.push(result.data.id);
  await pool.query('UPDATE console_members SET must_change_password=false WHERE user_id=$1', [result.data.id]);
  const p = { id: result.data.id, name: `Management QA ${name}`, email, kind, specialty: 'Accountant', managerId, assignments, active: true, password: result.data.temporaryPassword };
  await login(p); return p;
}
async function edit(person, changes, expected = 200) {
  const result = await call('team', admin.cookie, { ...person, ...changes }, 'PATCH'); assert.equal(result.status, expected, result.text);
  if (result.status === 200) Object.assign(person, changes);
  return result;
}
async function workspace(person) { const r = await call('workspace', person.cookie); assert.equal(r.status, 200, r.text); return r.data; }
const ids = values => values.map(v => typeof v === 'string' ? v : v.id).sort();
try {
  admin = { email: `management-qa-admin-${key}@example.invalid`, password: temporaryPassword() };
  const { user } = await auth.api.createUser({ body: { name: 'Management QA admin', ...admin, role: 'admin' } }); admin.id = user.id; users.push(user.id);
  await pool.query('INSERT INTO console_members(user_id,kind,specialty,must_change_password) VALUES($1,$2,$3,false)', [user.id, 'employee', 'Accountant']); await login(admin);
  for (const name of ['A', 'B', 'C', 'Own', 'Other']) {
    const r = await call('clients', admin.cookie, { name: `Management QA Client ${name} ${key}`, industry: 'Temporary verification' }); assert.equal(r.status, 201, r.text); clients.push(r.data.id);
  }
  const [a, b, c, own, other] = clients;
  const boss = await person('Manager', null, 'employee', [{ clientId: own, moduleId: 'formation' }]);
  const lead = await person('Lead', boss.id);
  const employee = await person('Employee', lead.id, 'employee', [{ clientId: a, moduleId: 'formation' }, { clientId: b, moduleId: 'accounting' }, { clientId: 'mtt', moduleId: 'accounting' }]);
  const consultant = await person('Consultant', boss.id, 'consultant', [{ clientId: c, moduleId: 'formation' }]);
  const outsider = await person('Other', null, 'employee', [{ clientId: other, moduleId: 'formation' }]);
  const left = await person('ParallelA'), right = await person('ParallelB');
  assert.deepEqual(ids((await workspace(employee)).clients), ids([a, b, 'mtt'])); checked('administrator assigns an employee to several specific clients and modules');
  const full = await workspace(boss), intermediate = await workspace(lead);
  assert.deepEqual(ids(full.clients), ids([a, b, c, own, 'mtt'])); assert.deepEqual(ids(intermediate.clients), ids([a, b, 'mtt']));
  assert.equal(full.assignments.find(x => x.clientId === own).direct, true); assert.equal(full.assignments.find(x => x.clientId === a).direct, false);
  assert.deepEqual(ids((await workspace(outsider)).clients), [other]); checked('managers inherit direct and indirect team client/module pairs without sideways access');
  assert.equal((await call('me', boss.cookie)).data.user.isManager, true);
  const reports = (await call('my-team', boss.cookie)).data.team; assert.deepEqual(ids(reports), ids([lead, employee, consultant]));
  assert.equal(reports.find(t => t.id === employee.id).directReport, false); assert.equal(reports.find(t => t.id === consultant.id).managerId, boss.id);
  assert.deepEqual((await call('my-team', consultant.cookie)).data.team, []);
  const team = (await call('team', admin.cookie)).data.team; assert.equal(team.find(t => t.id === lead.id).managerId, boss.id); checked('admin and manager views show reporting lines and the correct team subtree');
  for (const [path, body, method] of [['team', { ...employee }, 'PATCH'], ['client-team', { clientId: a, members: [] }, 'PATCH'], ['clients', { name: 'Forbidden', industry: '' }, 'POST']]) assert.equal((await call(path, boss.cookie, body, method)).status, 403);
  assert.equal((await call('team', boss.cookie)).status, 403); checked('managers cannot change accounts, client assignments or administrator settings');
  assert.equal((await call('client-team', admin.cookie, { clientId: other, members: [{ userId: employee.id, moduleIds: ['accounting'] }] }, 'PATCH')).status, 200);
  employee.assignments.push({ clientId: other, moduleId: 'accounting' });
  assert.deepEqual(ids((await workspace(employee)).clients), ids([a, b, other, 'mtt']));
  assert.equal((await call(`formation/case?clientId=${other}`, boss.cookie)).status, 403);
  assert.equal((await call('report?clientId='+a, boss.cookie)).status, 403); checked('client staffing adds an existing employee while preserving other clients and module boundaries');
  assert.equal((await call('client-team', admin.cookie, { clientId: other, members: [{ userId: employee.id, moduleIds: [] }, { userId: 'missing-user', moduleIds: [] }] }, 'PATCH')).status, 400);
  assert.ok((await workspace(employee)).assignments.some(x => x.clientId === other));
  assert.equal((await call('client-team', admin.cookie, { clientId: other, members: [{ userId: employee.id, moduleIds: ['unknown'] }] }, 'PATCH')).status, 400); checked('invalid bulk client changes roll back without losing existing access');
  const report = await call('report?clientId=mtt', boss.cookie); assert.equal(report.status, 200, report.text.slice(0, 100)); assert.ok(report.text.includes('period-data'));
  const exportFile = await fetch(`${base}/api/console/download?clientId=mtt&name=MTT_Innovations_August_2026_Management_Report.pdf`, { headers: { Cookie: boss.cookie } }); assert.equal(exportFile.status, 200); assert.equal(Buffer.from(await exportFile.arrayBuffer()).subarray(0, 4).toString(), '%PDF'); checked('manager can open and download accounting reports inherited through the team');
  assert.equal((await call('formation/case', employee.cookie, { clientId: a })).status, 201);
  assert.equal((await call('formation/case', boss.cookie, { clientId: own })).status, 201);
  let detail = (await call(`formation/case?clientId=${a}`, boss.cookie)).data; assert.equal(detail.canEdit, false); assert.ok(detail.folders.length);
  assert.equal((await call(`formation/case?clientId=${own}`, boss.cookie)).data.canEdit, true);
  const folder = detail.folders.find(f => f.area === 'output'), bytes = Buffer.from('%PDF-1.4\nManager access verification\n%%EOF');
  const reserve = await call('formation/prepare-upload', employee.cookie, { caseId: detail.job.id, folderId: folder.id, filename: 'Manager-access-test.pdf', category: 'Registry documents', size: bytes.length }); assert.equal(reserve.status, 201, reserve.text); paths.push(reserve.data.pathname);
  const token = await call('formation/upload-token', employee.cookie, { type: 'blob.generate-client-token', payload: { pathname: reserve.data.pathname, clientPayload: JSON.stringify({ uploadId: reserve.data.id }), multipart: false } }); assert.equal(token.status, 200, token.text);
  await put(reserve.data.pathname, bytes, { access: 'private', token: token.data.clientToken, contentType: reserve.data.contentType }); assert.equal((await call('formation/finish-upload', employee.cookie, { id: reserve.data.id })).status, 200);
  const download = await fetch(`${base}/api/console/formation/download?id=${reserve.data.id}`, { headers: { Cookie: boss.cookie } }); assert.equal(download.status, 200); assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
  assert.equal((await call(`formation/download?id=${reserve.data.id}`, outsider.cookie)).status, 403); checked('manager can view incorporation progress and download private Output documents');
  for (const [path, body, method, expected = 403] of [
    ['formation/case', { id: detail.job.id, version: detail.job.version, companyName: 'Forbidden', status: 'completed' }, 'PATCH'],
    ['formation/case', { clientId: c }, 'POST'],
    ['formation/folder', { caseId: detail.job.id, name: 'Forbidden', area: 'working' }, 'POST'],
    ['formation/prepare-upload', { caseId: detail.job.id, folderId: folder.id, filename: 'Forbidden.pdf', category: 'Other', size: 5 }, 'POST'],
    ['formation/file', { id: reserve.data.id, folderId: folder.id, category: 'Forbidden' }, 'PATCH'],
    ['formation/finish-upload', { id: reserve.data.id }, 'POST', 404],
  ]) assert.equal((await call(path, boss.cookie, body, method)).status, expected, path);
  checked('inherited manager view cannot change progress, create folders, upload or organize documents');
  assert.equal((await call('client-team', admin.cookie, { clientId: a, members: [{ userId: boss.id, moduleIds: ['formation'] }] }, 'PATCH')).status, 200);
  assert.equal((await call(`formation/case?clientId=${a}`, boss.cookie)).data.canEdit, true);
  assert.equal((await call('formation/folder', boss.cookie, { caseId: detail.job.id, name: 'Directly assigned manager', area: 'working' })).status, 201);
  assert.equal((await call('client-team', admin.cookie, { clientId: a, members: [{ userId: boss.id, moduleIds: [] }] }, 'PATCH')).status, 200);
  assert.equal((await call(`formation/case?clientId=${a}`, boss.cookie)).data.canEdit, false); checked('direct assignment adds editing for a manager and removal returns to team view immediately');
  await edit(boss, { managerId: boss.id }, 400); await edit(boss, { managerId: employee.id }, 400); await edit(employee, { managerId: consultant.id }, 400); await edit(employee, { managerId: 'nonexistent' }, 400); await edit(boss, { kind: 'consultant' }, 400); checked('self-management, circular teams and consultant managers are rejected');
  const parallel = await Promise.all([call('team', admin.cookie, { ...left, managerId: right.id }, 'PATCH'), call('team', admin.cookie, { ...right, managerId: left.id }, 'PATCH')]); assert.deepEqual(parallel.map(r => r.status).sort(), [200, 400]); checked('simultaneous reporting-line edits cannot create a cycle');
  await edit(employee, { managerId: outsider.id });
  assert.deepEqual(ids((await workspace(lead)).clients), []); assert.deepEqual(ids((await workspace(boss)).clients), ids([c, own])); assert.deepEqual(ids((await workspace(outsider)).clients), ids([a, b, other, 'mtt']));
  assert.equal((await call(`formation/download?id=${reserve.data.id}`, boss.cookie)).status, 403); assert.equal((await call('me', outsider.cookie)).data.user.isManager, true); checked('moving an employee immediately removes old manager access and updates the new manager');
  await edit(employee, { active: false }); assert.deepEqual(ids((await workspace(outsider)).clients), [other]);
  await edit(employee, { active: true }); await edit(outsider, { active: false }); await edit(employee, { managerId: boss.id }); await edit(employee, { managerId: outsider.id }, 400); checked('inactive staff do not expand manager access and inactive managers cannot receive new reports');
  await edit(consultant, { managerId: null }); assert.deepEqual(ids((await workspace(boss)).clients), ids([a, b, own, other, 'mtt'])); assert.ok(!(await call('my-team', boss.cookie)).data.team.some(t => t.id === consultant.id)); checked('removing a manager clears inherited access without changing staff client assignments');
  console.log(`Verified ${count} management scenarios.`);
} finally {
  for (const path of paths) await del(path).catch(() => {});
  for (const id of clients) { await pool.query('DELETE FROM console_audit WHERE target_id=$1', [id]); await pool.query('DELETE FROM console_clients WHERE id=$1', [id]); }
  for (const id of users) { await pool.query('DELETE FROM console_audit WHERE actor_id=$1 OR target_id=$1', [id]); await pool.query('DELETE FROM "user" WHERE id=$1', [id]); }
  await pool.end(); if (server) await new Promise(r => server.close(r));
}
