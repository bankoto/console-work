import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { getServices } from '../server/auth.mjs';
import { createHandler, temporaryPassword } from '../server/handler.mjs';
import { getReportMetadata } from '../server/reports.mjs';
const { pool, auth } = getServices(), base = process.env.VERIFY_BASE_URL || 'http://localhost:3112', origin = process.env.VERIFY_ORIGIN || new URL(process.env.BETTER_AUTH_URL || base).origin;
const users = [], notes = [], key = randomUUID().slice(0, 8); let server, count = 0;
if (!process.env.VERIFY_BASE_URL) { server = http.createServer(createHandler()); await new Promise(r => server.listen(3112, r)); }
const checked = text => { count++; console.log(`PASS ${text}`); };
async function call(path, cookie = '', body, method = body ? 'POST' : 'GET') {
  const response = await fetch(`${base}/api/console/${path}`, { method, headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Forwarded-For': `192.0.2.${parseInt(key.slice(0, 2), 16) || 1}`, ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const text = await response.text(); let data; try { data = JSON.parse(text); } catch { data = {}; } return { response, status: response.status, data, text };
}
async function account(name, kind = 'employee', role = 'user', managerId = null) {
  const email = `notes-qa-${name}-${key}@example.invalid`, password = temporaryPassword();
  const { user } = await auth.api.createUser({ body: { name: `Notes verification ${name}`, email, password, role } }); users.push(user.id);
  await pool.query('INSERT INTO console_members(user_id,kind,specialty,manager_id,must_change_password) VALUES($1,$2,$3,$4,false)', [user.id, kind, 'Accountant', managerId]);
  const login = await call('auth/sign-in/email', '', { email, password }); assert.equal(login.status, 200, login.text); return { ...user, cookie: login.response.headers.getSetCookie().map(c => c.split(';')[0]).join('; ') };
}
try {
  const admin = await account('admin', 'employee', 'admin'), manager = await account('manager'), employee = await account('employee', 'employee', 'user', manager.id), consultant = await account('consultant', 'consultant'), outsider = await account('outsider');
  await pool.query('INSERT INTO console_assignments(user_id,client_id,module_id) VALUES($1,$2,$3),($4,$2,$5)', [employee.id, 'mtt', 'accounting', consultant.id, 'tax']);
  const metadata = await getReportMetadata((await pool.query('SELECT report_key FROM console_clients WHERE id=$1', ['mtt'])).rows[0].report_key);
  const anchor = { reportVersion: metadata.version, period: '2026-09', sheet: 'Overview', page: 1, root: 'main', path: [1, 0, 0], tag: 'article', targetText: 'Verification report excerpt', quote: '', rowText: '', cellIndex: null };
  const body = { clientId: 'mtt', body: `Temporary verification feedback ${key}`, anchor };
  assert.equal((await call('report-comments?clientId=mtt')).status, 401); assert.equal((await call('report-comments?clientId=mtt', outsider.cookie)).status, 403); assert.equal((await call('report-comments', consultant.cookie, body)).status, 403); checked('anonymous, unrelated and Tax-only accounts cannot read or annotate accounting reports');
  for (const change of [{ period: '1999-01' }, { sheet: 'Unknown' }, { reportVersion: 'old' }, { path: [-1] }]) assert.equal((await call('report-comments', employee.cookie, { ...body, anchor: { ...anchor, ...change } })).status, 400);
  assert.equal((await call('report-comments', employee.cookie, { ...body, body: 'x'.repeat(3001) })).status, 400); checked('saved annotations require a real reporting month, section and valid location');
  const created = await call('report-comments', employee.cookie, body); assert.equal(created.status, 201, created.text); notes.push(created.data.comment.id);
  assert.equal(created.data.comment.authorId, employee.id); assert.equal(created.data.comment.authorKind, 'Employee');
  const read = await call('report-comments?clientId=mtt', admin.cookie); assert.ok(read.data.comments.some(n => n.id === notes[0])); assert.deepEqual(read.data.comments.find(n => n.id === notes[0]).anchor.path, anchor.path); checked('employee comments persist with their author, report context and excerpt for admin review');
  await pool.query("UPDATE console_assignments SET module_id='accounting' WHERE user_id=$1 AND client_id='mtt'", [consultant.id]);
  const second = await call('report-comments', consultant.cookie, { ...body, body: `<img src=x onerror=alert(1)> ${key}`, anchor: { ...anchor, period: '2026-08', sheet: 'Journal Entries', page: 2 } }); assert.equal(second.status, 201, second.text); notes.push(second.data.comment.id); assert.equal(second.data.comment.authorKind, 'Consultant'); assert.ok(second.data.comment.body.startsWith('<img')); checked('consultant notes retain another month and later schedule page; feedback stays plain text');
  const state = await call('report-comments?clientId=mtt', manager.cookie); assert.equal(state.status, 200); assert.equal(state.data.canComment, false); assert.equal((await call('report-comments', manager.cookie, body)).status, 403); assert.equal((await call('report-feedback', employee.cookie)).status, 403); checked('managers can review inherited notes while direct assignments control commenting and admin inbox access');
  const inbox = await call('report-feedback?status=open', admin.cookie); assert.equal(inbox.status, 200); assert.ok(inbox.data.comments.some(n => n.id === notes[0]));
  const workspace = await call('workspace', admin.cookie); assert.ok(workspace.data.reportFeedback.open >= 2); checked('admin sign-in includes an open-feedback count and all-client feedback inbox');
  const firstPage = await call('report-comments?clientId=mtt&limit=1', admin.cookie); assert.equal(firstPage.data.comments.length, 1); assert.ok(firstPage.data.next);
  const nextPage = await call(`report-comments?clientId=mtt&limit=1&before=${firstPage.data.next}`, admin.cookie); assert.equal(nextPage.status, 200); assert.notEqual(nextPage.data.comments[0].id, firstPage.data.comments[0].id);
  const focus = await call(`report-comments?clientId=mtt&commentId=${notes[0]}`, admin.cookie); assert.equal(focus.data.focusComment.id, notes[0]); checked('older feedback is paginated and direct links still retrieve a specific saved comment');
  assert.equal((await call('report-comments', employee.cookie, { id: notes[0], resolved: true }, 'PATCH')).status, 403);
  assert.equal((await call('report-comments', admin.cookie, { id: notes[0], resolved: true }, 'PATCH')).status, 200);
  const resolved = await call('report-comments?clientId=mtt&status=resolved', employee.cookie); assert.ok(resolved.data.comments.some(n => n.id === notes[0] && n.resolvedBy));
  assert.equal((await call('report-comments', admin.cookie, { id: notes[0], resolved: false }, 'PATCH')).status, 200); checked('only admin can resolve or reopen feedback; resolved notes remain available');
  const report = await call(`report?clientId=mtt&comment=${notes[0]}`, admin.cookie); assert.equal(report.status, 200); assert.ok(report.text.includes('window.bankotoReport')); assert.ok(report.text.includes('/console/report-notes.js')); assert.ok(report.text.includes('/api/console/download?clientId=mtt')); assert.match(report.response.headers.get('cache-control'), /no-store/); checked('protected dashboard exposes safe report navigation hooks and loads the annotations interface');
  await pool.query('DELETE FROM console_assignments WHERE user_id=$1 AND client_id=$2', [employee.id, 'mtt']); assert.equal((await call('report-comments?clientId=mtt', employee.cookie)).status, 403); assert.equal((await call('report-comments?clientId=mtt', manager.cookie)).status, 403);
  assert.equal((await call('report-comments', employee.cookie, body)).status, 403); checked('revoking Accounting access immediately removes comment and inherited manager access');
  console.log(`Verified ${count} report annotation scenarios.`);
} finally {
  for (const id of notes) { await pool.query('DELETE FROM console_audit WHERE target_id=$1', [id]); await pool.query('DELETE FROM console_report_comments WHERE id=$1', [id]); }
  for (const id of users) { await pool.query('DELETE FROM console_audit WHERE actor_id=$1 OR target_id=$1', [id]); await pool.query('DELETE FROM "user" WHERE id=$1', [id]); }
  await pool.end(); if (server) await new Promise(r => server.close(r));
}
