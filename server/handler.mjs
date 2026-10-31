import { randomBytes, randomUUID } from 'node:crypto';
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';
import { getServices } from './auth.mjs';
import { assertAdmin, canAccess, HttpError, modules, specialties, validateMember } from './access.mjs';
import { connectReport, decryptAsset, downloads, getReport, unsealKey } from './reports.mjs';
import { formationRoute } from './formation.mjs';
import { effectiveAssignments, managerIdOf, myTeam, readTeam, validateClientTeam } from './management.mjs';
import { reportNotesRoute } from './report-notes.mjs';

const authPaths = new Set(['/sign-in/email', '/sign-out', '/get-session', '/ok']);
export const temporaryPassword = () => `Bk!${randomBytes(18).toString('base64url')}9a`;
function json(res, status, data) { res.statusCode = status; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify(data)); }
async function bodyOf(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { throw new HttpError(400,'Invalid request.'); } }
  let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 100000) throw new HttpError(413,'Request is too large.'); }
  try { return JSON.parse(body || '{}'); } catch { throw new HttpError(400,'Invalid request.'); }
}
function checkOrigin(req) {
  const expected = new URL(process.env.BETTER_AUTH_URL || 'http://localhost:3100').origin;
  if (req.headers.origin !== expected) throw new HttpError(403,'This request must come from Bankoto Console.');
}
async function identity(auth, pool, req, allowTemporary = false) {
  const headers = fromNodeHeaders(req.headers);
  const session = await auth.api.getSession({ headers });
  if (!session) throw new HttpError(401,'Please sign in to Bankoto Console.');
  const { rows } = await pool.query('SELECT m.*,boss.name AS manager_name,EXISTS(SELECT 1 FROM console_members child WHERE child.manager_id=m.user_id AND child.active) AS is_manager FROM console_members m LEFT JOIN "user" boss ON boss.id=m.manager_id WHERE m.user_id=$1', [session.user.id]);
  if (!rows[0]?.active) throw new HttpError(403,'Your console access is inactive. Please contact the administrator.');
  if (rows[0].must_change_password && !allowTemporary) throw new HttpError(428,'Change your temporary password to continue.');
  return { user: session.user, member: rows[0], headers };
}
async function audit(pool, actor, action, target) { await pool.query('INSERT INTO console_audit(actor_id,action,target_id) VALUES($1,$2,$3)',[actor,action,target]); }
async function assignmentsFor(pool, userId) {
  return effectiveAssignments(pool,userId);
}
async function replaceAssignments(db, userId, assignments) {
  for (const a of assignments) {
    const r = await db.query('SELECT id FROM console_clients WHERE id=$1',[a.clientId]);
    if (!r.rowCount) throw new HttpError(400,'One of the selected clients no longer exists.');
  }
  await db.query('DELETE FROM console_assignments WHERE user_id=$1',[userId]);
  for (const a of assignments) await db.query('INSERT INTO console_assignments(user_id,client_id,module_id) VALUES($1,$2,$3)',[userId,a.clientId,a.moduleId]);
}
async function transaction(pool, fn) {
  const db = await pool.connect();
  try { await db.query('BEGIN'); const value=await fn(db); await db.query('COMMIT'); return value; }
  catch(e) { await db.query('ROLLBACK'); throw e; } finally { db.release(); }
}
export function createHandler(services = getServices) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control','private, no-store, max-age=0');
    res.setHeader('X-Robots-Tag','noindex, nofollow, noarchive');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','same-origin');
    try {
      const { auth, pool } = typeof services === 'function' ? services() : services;
      const url = new URL(req.url, process.env.BETTER_AUTH_URL || 'http://localhost:3100');
      const path = url.pathname.replace(/\/$/, '');
      if (!['GET','POST','PATCH'].includes(req.method)) throw new HttpError(405,'Method not allowed.');
      if (req.method !== 'GET') checkOrigin(req);
      if (path.startsWith('/api/console/auth/')) {
        if (!authPaths.has(path.slice('/api/console/auth'.length))) throw new HttpError(404,'Not found.');
        return await toNodeHandler(auth)(req,res);
      }
      const { user, member, headers } = await identity(auth,pool,req,true);
      if (path === '/api/console/me' && req.method === 'GET') {
        return json(res,200,{user:{id:user.id,name:user.name,email:user.email,role:user.role,kind:member.kind,specialty:member.specialty,mustChangePassword:member.must_change_password,isManager:member.is_manager,managerId:member.manager_id,managerName:member.manager_name}});
      }
      if (path === '/api/console/password' && req.method === 'POST') {
        const b=await bodyOf(req);
        if (typeof b.newPassword !== 'string' || b.newPassword.length < 12 || b.newPassword.length > 128 || b.newPassword===b.currentPassword) throw new HttpError(400,'Choose a different password of 12 to 128 characters.');
        const changed=await auth.api.changePassword({headers,body:{currentPassword:b.currentPassword,newPassword:b.newPassword,revokeOtherSessions:true},asResponse:true});
        if(!changed.ok) {const failure=await changed.json();throw new HttpError(changed.status,failure.message||'The password could not be changed.');}
        await pool.query('UPDATE console_members SET must_change_password=false WHERE user_id=$1',[user.id]);
        await audit(pool,user.id,'password_changed',user.id);
        const cookies=changed.headers.getSetCookie();
        if(cookies.length) res.setHeader('Set-Cookie',cookies);
        return json(res,200,{ok:true});
      }
      if (member.must_change_password) throw new HttpError(428,'Change your temporary password to continue.');
      const assignments=await assignmentsFor(pool,user.id);
      if(await reportNotesRoute({path,req,res,url,pool,user,member,assignments,bodyOf,json})) return;
      if(await formationRoute({path,req,res,url,pool,user,assignments,bodyOf,json})) return;
      if (path === '/api/console/workspace' && req.method === 'GET') {
        const clients = user.role === 'admin'
          ? (await pool.query('SELECT id,name,industry,(report_key IS NOT NULL) AS "reportConnected" FROM console_clients ORDER BY name')).rows
          : (await pool.query('SELECT c.id,c.name,c.industry,(c.report_key IS NOT NULL) AS "reportConnected" FROM console_clients c WHERE c.id=ANY($1::text[]) ORDER BY c.name',[[...new Set(assignments.map(a=>a.clientId))]])).rows;
        const visibleModules=modules.filter(m=>user.role==='admin'||assignments.some(a=>a.moduleId===m.id));
        const teamCount=user.role==='admin' ? Number((await pool.query('SELECT count(*) FROM console_members WHERE active')).rows[0].count) : null;
        const reportFeedback=user.role==='admin'?(await pool.query('SELECT count(*)::int AS total,count(*) FILTER(WHERE NOT resolved)::int AS open FROM console_report_comments')).rows[0]:null;
        return json(res,200,{clients,modules:visibleModules,assignments,specialties,teamCount,reportFeedback});
      }
      if (path === '/api/console/team' && req.method === 'GET') {
        assertAdmin(user);
        return json(res,200,{team:await readTeam(pool)});
      }
      if (path === '/api/console/my-team' && req.method === 'GET') {
        return json(res,200,{team:await myTeam(pool,user.id)});
      }
      if (path === '/api/console/client-team' && req.method === 'PATCH') {
        assertAdmin(user);const data=validateClientTeam(await bodyOf(req));
        await transaction(pool,async db=>{
          if(!(await db.query('SELECT id FROM console_clients WHERE id=$1',[data.clientId])).rowCount) throw new HttpError(404,'Client not found.');
          for(const person of data.members){
            if(!(await db.query('SELECT m.user_id FROM console_members m JOIN "user" u ON u.id=m.user_id WHERE m.user_id=$1 AND u.role<>$2',[person.userId,'admin'])).rowCount) throw new HttpError(400,'Select an employee or consultant account.');
            await db.query('DELETE FROM console_assignments WHERE user_id=$1 AND client_id=$2',[person.userId,data.clientId]);
            for(const moduleId of person.moduleIds) await db.query('INSERT INTO console_assignments(user_id,client_id,module_id) VALUES($1,$2,$3)',[person.userId,data.clientId,moduleId]);
          }
          await audit(db,user.id,'client_assignments_updated',data.clientId);
        });
        return json(res,200,{ok:true});
      }
      if (path === '/api/console/team' && req.method === 'POST') {
        assertAdmin(user); const b=await bodyOf(req), data=validateMember(b),managerId=managerIdOf(b);
        if (typeof b.email!=='string' || b.email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) throw new HttpError(400,'Enter a valid email address.');
        // Validate references before creating the managed authentication account.
        for(const a of data.assignments) if(!(await pool.query('SELECT id FROM console_clients WHERE id=$1',[a.clientId])).rowCount) throw new HttpError(400,'Invalid client.');
        const password=temporaryPassword();
        const {user:created}=await auth.api.createUser({headers,body:{email:b.email.trim().toLowerCase(),name:data.name,password,role:'user'}});
        try {
          await transaction(pool,async db=>{
            await db.query('SELECT pg_advisory_xact_lock(4815,207)');
            await db.query('INSERT INTO console_members(user_id,kind,specialty,manager_id) VALUES($1,$2,$3,$4)',[created.id,data.kind,data.specialty,managerId]);
            await replaceAssignments(db,created.id,data.assignments);
            await audit(db,user.id,'member_created',created.id);
          });
        } catch(e) { await auth.api.removeUser({headers,body:{userId:created.id}}); throw e; }
        return json(res,201,{id:created.id,email:created.email,temporaryPassword:password});
      }
      if (path === '/api/console/team' && req.method === 'PATCH') {
        assertAdmin(user); const b=await bodyOf(req), data=validateMember(b);
        const target=(await pool.query('SELECT u.role,m.manager_id FROM "user" u JOIN console_members m ON m.user_id=u.id WHERE u.id=$1',[b.id])).rows[0];
        if(!target) throw new HttpError(404,'Team member not found.');
        if(target.role==='admin') throw new HttpError(400,'The workspace administrator cannot be changed here.');
        if(typeof b.active!=='boolean') throw new HttpError(400,'Invalid member status.');
        const managerId=managerIdOf(b,target.manager_id);
        await transaction(pool,async db=>{
          await db.query('SELECT pg_advisory_xact_lock(4815,207)');
          await db.query('UPDATE "user" SET name=$2,"updatedAt"=now() WHERE id=$1',[b.id,data.name]);
          await db.query('UPDATE console_members SET kind=$2,specialty=$3,active=$4,manager_id=$5 WHERE user_id=$1',[b.id,data.kind,data.specialty,b.active,managerId]);
          await replaceAssignments(db,b.id,data.assignments);
          // Revoke sessions when access changes; removed permissions also take effect on every request.
          await db.query('DELETE FROM "session" WHERE "userId"=$1',[b.id]);
          await audit(db,user.id,'member_updated',b.id);
        });
        return json(res,200,{ok:true});
      }
      if (path === '/api/console/reset-password' && req.method === 'POST') {
        assertAdmin(user);const b=await bodyOf(req);
        const target=(await pool.query('SELECT u.role FROM "user" u JOIN console_members m ON m.user_id=u.id WHERE u.id=$1',[b.id])).rows[0];
        if(!target || target.role==='admin') throw new HttpError(400,'Select an employee or consultant account.');
        const password=temporaryPassword();
        await auth.api.setUserPassword({headers,body:{userId:b.id,newPassword:password}});
        await transaction(pool,async db=>{
          await db.query('UPDATE console_members SET must_change_password=true WHERE user_id=$1',[b.id]);
          await db.query('DELETE FROM "session" WHERE "userId"=$1',[b.id]);
          await audit(db,user.id,'password_reset',b.id);
        });
        return json(res,200,{temporaryPassword:password});
      }
      if (path === '/api/console/clients' && req.method === 'POST') {
        assertAdmin(user);const b=await bodyOf(req);
        if(typeof b.name!=='string'||b.name.trim().length<2||b.name.length>150||typeof b.industry!=='string'||b.industry.length>100) throw new HttpError(400,'Enter a client name and valid industry.');
        const id=randomUUID();await pool.query('INSERT INTO console_clients(id,name,industry) VALUES($1,$2,$3)',[id,b.name.trim(),b.industry.trim()]);
        await audit(pool,user.id,'client_created',id);return json(res,201,{id});
      }
      if (path === '/api/console/connect-report' && req.method === 'POST') {
        assertAdmin(user);const b=await bodyOf(req);
        const key=await connectReport(b.password);
        await pool.query('UPDATE console_clients SET report_key=$1 WHERE id=$2',[key,'mtt']);
        await audit(pool,user.id,'report_connected','mtt');return json(res,200,{ok:true});
      }
      if ((path === '/api/console/report' || path === '/api/console/download') && req.method === 'GET') {
        const clientId=url.searchParams.get('clientId');
        if(!canAccess(user,assignments,clientId,'accounting')) throw new HttpError(403,'This accounting client is not assigned to you.');
        const client=(await pool.query('SELECT report_key FROM console_clients WHERE id=$1',[clientId])).rows[0];
        if(!client||clientId!=='mtt') throw new HttpError(404,'No accounting report has been added for this client.');
        if(!client.report_key) throw new HttpError(409,'An administrator needs to connect this report first.');
        if(path.endsWith('/report')) {
          res.setHeader('Content-Type','text/html; charset=utf-8');
          res.setHeader('Content-Security-Policy',"frame-ancestors 'self'; object-src 'none'; base-uri 'self'");
          res.end(await getReport(client.report_key));return;
        }
        const name=url.searchParams.get('name'), file=downloads[name];
        if(!file) throw new HttpError(404,'File not found.');
        res.setHeader('Content-Type',file[2]);res.setHeader('Content-Disposition',`attachment; filename="${name}"`);
        res.end(await decryptAsset(file[0],file[1],unsealKey(client.report_key)));return;
      }
      throw new HttpError(404,'Not found.');
    } catch(error) {
      if(error.constraint==='console_manager_hierarchy') return json(res,400,{error:error.message});
      if(error.constraint==='console_members_manager_id_fkey') return json(res,400,{error:'The selected manager no longer exists. Choose another employee.'});
      const status=error.status && typeof error.status==='number' ? error.status : error.statusCode || 500;
      if(status>=500) console.error('Console request failed:',error.code || error.cause?.code || error.name);
      if(!res.headersSent) json(res,status,{error:status>=500?'The console is temporarily unavailable. Please try again.':error.body?.message||error.message});
      else res.end();
    }
  };
}
