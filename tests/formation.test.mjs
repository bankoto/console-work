import test from 'node:test';
import assert from 'node:assert/strict';
import { maxFormationFileSize, validateCaseUpdate, validateUpload } from '../server/formation-domain.mjs';
import { canAccess, validateMember } from '../server/access.mjs';

test('formation access is independent of accounting and legal access', () => {
  const user = { role: 'user' }, assignments = [{ clientId: 'one', moduleId: 'formation' }, { clientId: 'two', moduleId: 'legal' }];
  assert.equal(canAccess(user, assignments, 'one', 'formation'), true);
  assert.equal(canAccess(user, assignments, 'two', 'formation'), false);
  assert.equal(canAccess(user, assignments, 'one', 'legal'), false);
  assert.doesNotThrow(() => validateMember({ name: 'Formation consultant', kind: 'consultant', specialty: 'Legal Expert', assignments: [{ clientId: 'one', moduleId: 'formation' }] }));
});
test('uploads enforce document types, valid names and the 20 MB limit', () => {
  const data = { filename: 'Director ID.pdf', size: 123, category: 'Identity documents' };
  assert.equal(validateUpload(data).contentType, 'application/pdf');
  for (const filename of ['../private.pdf', 'folder\\private.pdf', '.hidden.pdf', 'program.exe', 'page.html', 'file\r\n.pdf']) assert.throws(() => validateUpload({ ...data, filename }), { status: 400 });
  for (const size of [0, -1, 1.2, maxFormationFileSize + 1]) assert.throws(() => validateUpload({ ...data, size }), { status: 400 });
  assert.equal(validateUpload({ ...data, size: maxFormationFileSize }).size, maxFormationFileSize);
  assert.equal(validateUpload({ ...data, category: 'Client-specific documents' }).category, 'Client-specific documents');
});
test('status updates validate dates and require a version for shared editing', () => {
  const data = { companyName: 'New Company Ltd', status: 'submitted', version: 1, dueDate: '2026-12-01', note: 'Application submitted.' };
  assert.equal(validateCaseUpdate(data).status, 'submitted');
  for (const dueDate of ['2026-02-30', 'tomorrow', '2026-13-01']) assert.throws(() => validateCaseUpdate({ ...data, dueDate }), { status: 400 });
  assert.throws(() => validateCaseUpdate({ ...data, version: undefined }), { status: 400 });
  assert.throws(() => validateCaseUpdate({ ...data, status: 'fake_status' }), { status: 400 });
  assert.equal(validateCaseUpdate({ ...data, status: 'completed', dueDate: '' }).dueDate, null);
});
