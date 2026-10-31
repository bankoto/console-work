import test from 'node:test';
import assert from 'node:assert/strict';
import { assertAdmin,canAccess,validateMember } from '../server/access.mjs';
test('access requires the exact client and module pair',()=>{
  const user={role:'user'},assignments=[{clientId:'mtt',moduleId:'tax'},{clientId:'second',moduleId:'accounting'}];
  assert.equal(canAccess(user,assignments,'mtt','accounting'),false);
  assert.equal(canAccess(user,assignments,'second','tax'),false);
  assert.equal(canAccess(user,assignments,'mtt','tax'),true);
  assert.equal(canAccess(user,assignments,'second','accounting'),true);
  assert.equal(canAccess(user,[],'mtt','accounting'),false);
});
test('only the administrator receives universal workspace access',()=>{
  assert.equal(canAccess({role:'admin'},[],'mtt','accounting'),true);
  assert.throws(()=>assertAdmin({role:'Accountant'}),{status:403});
  assert.throws(()=>assertAdmin({role:'user'}),{status:403});
  assert.doesNotThrow(()=>assertAdmin({role:'admin'}));
});
test('professional labels never grant access',()=>{
  for(const specialty of ['Accountant','Tax consultant','Payroll Expert','Legal Expert'])assert.equal(canAccess({role:'user',specialty},[],'mtt','accounting'),false);
});
test('assignment input rejects unknown modules, duplicates and invalid labels',()=>{
  const valid={name:'Ada Accountant',kind:'consultant',specialty:'Accountant',assignments:[{clientId:'mtt',moduleId:'accounting'}]};
  assert.deepEqual(validateMember(valid),valid);
  assert.throws(()=>validateMember({...valid,specialty:'Administrator'}),{status:400});
  assert.throws(()=>validateMember({...valid,kind:'admin'}),{status:400});
  assert.throws(()=>validateMember({...valid,assignments:[{clientId:'mtt',moduleId:'admin'}]}),{status:400});
  assert.throws(()=>validateMember({...valid,assignments:[...valid.assignments,...valid.assignments]}),{status:400});
});
