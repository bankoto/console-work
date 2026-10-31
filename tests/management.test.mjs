import test from 'node:test';
import assert from 'node:assert/strict';
import { canAccess, canEdit } from '../server/access.mjs';
import { managerIdOf, validateClientTeam } from '../server/management.mjs';

test('manager scope grants viewing while direct assignments control editing', () => {
  const user = { role: 'user' }, assignments = [{ clientId: 'a', moduleId: 'formation', direct: false }, { clientId: 'b', moduleId: 'formation', direct: true }];
  assert.equal(canAccess(user, assignments, 'a', 'formation'), true);
  assert.equal(canEdit(user, assignments, 'a', 'formation'), false);
  assert.equal(canEdit(user, assignments, 'b', 'formation'), true);
  assert.equal(canAccess(user, assignments, 'a', 'accounting'), false);
  assert.equal(canEdit(user, assignments, 'c', 'formation'), false);
  assert.equal(canEdit({ role: 'admin' }, [], 'c', 'formation'), true);
});
test('manager selection supports removal and older clients without accepting malformed IDs', () => {
  assert.equal(managerIdOf({}, 'current'), 'current');
  assert.equal(managerIdOf({ managerId: null }, 'current'), null);
  assert.equal(managerIdOf({ managerId: '' }), null);
  assert.equal(managerIdOf({ managerId: 'employee-123' }), 'employee-123');
  for (const managerId of [42, {}, 'bad id', 'x\n', 'a'.repeat(129)]) assert.throws(() => managerIdOf({ managerId }));
});
test('client staffing rejects ambiguous or unsupported assignment input', () => {
  assert.doesNotThrow(() => validateClientTeam({ clientId: 'a', members: [{ userId: 'one', moduleIds: ['formation', 'accounting'] }, { userId: 'two', moduleIds: [] }] }));
  for (const members of [[null], [{ userId: 'one', moduleIds: ['wrong'] }], [{ userId: 'one', moduleIds: ['tax', 'tax'] }], [{ userId: 'one', moduleIds: [] }, { userId: 'one', moduleIds: [] }]]) assert.throws(() => validateClientTeam({ clientId: 'a', members }));
});
