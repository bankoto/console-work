import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { getServices } from '../server/auth.mjs';
import { createHandler,temporaryPassword } from '../server/handler.mjs';
const {pool,auth}=getServices();
const base=process.env.VERIFY_BASE_URL||'http://localhost:3100';
const origin=process.env.VERIFY_ORIGIN||new URL(base).origin;
let server;
if(!process.env.VERIFY_BASE_URL){server=http.createServer(createHandler());await new Promise(r=>server.listen(3100,r));}
const created=[],clientIds=[];
const unique=randomUUID().slice(0,8);
async function call(path,cookie='',body,method=body?'POST':'GET',extra={}){
  const response=await fetch(`${base}/api/console/${path}`,{method,headers:{'Content-Type':'application/json',Origin:origin,'X-Forwarded-For':`192.0.2.${parseInt(unique.slice(0,2),16)||1}`,...(cookie?{Cookie:cookie}:{}),...extra},...(body?{body:JSON.stringify(body)}:{})});
  const text=await response.text();let data;try{data=JSON.parse(text);}catch{data={};}
  return {status:response.status,response,data,text};
}
async function signIn(email,password){const r=await call('auth/sign-in/email','',{email,password});assert.equal(r.status,200,JSON.stringify(r.data));const cookies=r.response.headers.getSetCookie();assert.ok(cookies.some(c=>/HttpOnly/i.test(c)));assert.ok(cookies.some(c=>/SameSite=Lax/i.test(c)));return cookies.map(c=>c.split(';')[0]).join('; ');}
let checks=0;const checked=label=>{checks++;console.log(`PASS ${label}`);};
try {
  const adminPassword=temporaryPassword(),adminEmail=`console-test-admin-${unique}@example.invalid`;
  const {user:admin}=await auth.api.createUser({body:{name:'Console test admin',email:adminEmail,password:adminPassword,role:'admin'}});created.push(admin.id);
  await pool.query('INSERT INTO console_members(user_id,kind,specialty,must_change_password) VALUES($1,$2,$3,false)',[admin.id,'employee','Accountant']);
  let adminCookie=await signIn(adminEmail,adminPassword);
  assert.equal((await call('workspace')).status,401);assert.equal((await call('auth/sign-up/email','',{name:'Public',email:'public@example.invalid',password:temporaryPassword()})).status,404);checked('anonymous access and public registration are blocked');
  const client=await call('clients',adminCookie,{name:`Console test client ${unique}`,industry:'Test only'});assert.equal(client.status,201);clientIds.push(client.data.id);
  const memberBody={name:'Console test consultant',email:`console-test-staff-${unique}@example.invalid`,kind:'consultant',specialty:'Tax consultant',assignments:[{clientId:'mtt',moduleId:'tax'},{clientId:client.data.id,moduleId:'accounting'}]};
  const member=await call('team',adminCookie,memberBody);assert.equal(member.status,201,JSON.stringify(member.data));created.push(member.data.id);checked('administrator creates consultant with client/module pairs');
  let staffCookie=await signIn(memberBody.email,member.data.temporaryPassword);
  assert.equal((await call('me',staffCookie)).data.user.mustChangePassword,true);
  assert.equal((await call('workspace',staffCookie)).status,428);checked('temporary passwords cannot open workspace data');
  let staffPassword=temporaryPassword();const changed=await call('password',staffCookie,{currentPassword:member.data.temporaryPassword,newPassword:staffPassword});assert.equal(changed.status,200,JSON.stringify(changed.data));
  staffCookie=changed.response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')||staffCookie;checked('first-login password change works and preserves a valid session');
  const workspace=await call('workspace',staffCookie);assert.equal(workspace.status,200);assert.deepEqual(workspace.data.modules.map(m=>m.id).sort(),['accounting','tax']);assert.equal(workspace.data.clients.length,2);assert.ok(workspace.data.clients.every(c=>!('report_key' in c)));checked('staff see only assigned modules and clients; report keys stay server-side');
  assert.equal((await call('team',staffCookie)).status,403);assert.equal((await call('clients',staffCookie,{name:'Forbidden',industry:''})).status,403);
  assert.equal((await call('team',staffCookie,memberBody)).status,403);assert.equal((await call('auth/admin/create-user',staffCookie,memberBody)).status,404);checked('consultants cannot manage people, clients, or auth admin routes');
  assert.equal((await call('report?clientId=mtt',staffCookie)).status,403);assert.equal((await call('download?clientId=mtt&name=unknown',staffCookie)).status,403);checked('tax assignment does not grant access to accounting reports or downloads');
  assert.equal((await call('clients',adminCookie,{name:'Foreign',industry:''},'POST',{Origin:'https://foreign.invalid'})).status,403);checked('foreign-origin mutations are blocked');
  const update={...memberBody,id:member.data.id,active:true,assignments:[{clientId:'mtt',moduleId:'accounting'}]};
  assert.equal((await call('team',adminCookie,update,'PATCH')).status,200);assert.equal((await call('workspace',staffCookie)).status,401);
  staffCookie=await signIn(memberBody.email,staffPassword);const updated=await call('workspace',staffCookie);assert.deepEqual(updated.data.modules.map(m=>m.id),['accounting']);assert.deepEqual(updated.data.clients.map(c=>c.id),['mtt']);checked('access updates revoke sessions and remove previous assignments');
  const report=await call('report?clientId=mtt',staffCookie);assert.equal(report.status,200,JSON.stringify(report.data));assert.ok(report.text.includes('period-data'));assert.ok(report.text.includes('2026-08'));assert.ok(report.text.includes('2026-09'));assert.ok(report.text.includes('2026-10'));assert.ok(report.text.includes('/api/console/download?clientId=mtt'));assert.match(report.response.headers.get('cache-control'),/no-store/);checked('assigned accountant can open August through October dashboard without legacy password');
  for(const name of ['MTT_Innovations_August_2026_Management_Report.pdf','MTT_Innovations_September_2026_Financial_Report.xlsx','MTT_Innovations_October_2026_Management_Report.pdf','MTT_Innovations_October_2026_Financial_Report.xlsx']){const r=await fetch(`${base}/api/console/download?clientId=mtt&name=${encodeURIComponent(name)}`,{headers:{Cookie:staffCookie}});assert.equal(r.status,200);const bytes=Buffer.from(await r.arrayBuffer());assert.ok(bytes.length>10000);assert.equal(bytes.subarray(0,name.endsWith('pdf')?4:2).toString(),name.endsWith('pdf')?'%PDF':'PK');}checked('protected PDF and workbook exports decrypt correctly');
  assert.equal((await call('download?clientId=mtt&name=../../.env.local',staffCookie)).status,404);checked('download path traversal is blocked');
  const reset=await call('reset-password',adminCookie,{id:member.data.id});assert.equal(reset.status,200);assert.equal((await call('workspace',staffCookie)).status,401);staffCookie=await signIn(memberBody.email,reset.data.temporaryPassword);assert.equal((await call('workspace',staffCookie)).status,428);checked('password reset revokes sessions and requires a new personal password');
  assert.equal((await call('team',adminCookie,{...update,active:false},'PATCH')).status,200);staffCookie=await signIn(memberBody.email,reset.data.temporaryPassword);assert.equal((await call('me',staffCookie)).status,403);checked('deactivated members cannot access the console');
  console.log(`Verified ${checks} end-to-end scenarios.`);
} finally {
  for(const id of created){await pool.query('DELETE FROM console_audit WHERE actor_id=$1 OR target_id=$1',[id]);await pool.query('DELETE FROM "user" WHERE id=$1',[id]);}
  for(const id of clientIds){await pool.query('DELETE FROM console_audit WHERE target_id=$1',[id]);await pool.query('DELETE FROM console_clients WHERE id=$1',[id]);}
  await pool.end();if(server)await new Promise(r=>server.close(r));
}
