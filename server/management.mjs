import { HttpError, modules } from './access.mjs';

export const managementScope = `WITH RECURSIVE scope(user_id) AS (
  SELECT user_id FROM console_members WHERE user_id=$1 AND active
  UNION SELECT m.user_id FROM console_members m JOIN scope s ON m.manager_id=s.user_id WHERE m.active
)`;

export async function effectiveAssignments(pool, userId) {
  return (await pool.query(`${managementScope}
    SELECT a.client_id AS "clientId",a.module_id AS "moduleId",bool_or(a.user_id=$1) AS direct
    FROM scope s JOIN console_assignments a ON a.user_id=s.user_id
    GROUP BY a.client_id,a.module_id ORDER BY a.client_id,a.module_id`, [userId])).rows;
}

export function managerIdOf(body, fallback = null) {
  if (!Object.hasOwn(body, 'managerId')) return fallback;
  if (body.managerId === null || body.managerId === '') return null;
  if (typeof body.managerId !== 'string' || body.managerId.length > 128 || /[\s\u0000-\u001f]/.test(body.managerId)) throw new HttpError(400, 'Select a valid manager.');
  return body.managerId;
}

export async function readTeam(pool) {
  const team = (await pool.query(`SELECT u.id,u.name,u.email,u.role,m.kind,m.specialty,m.active,m.must_change_password AS "mustChangePassword",
    m.manager_id AS "managerId",boss.name AS "managerName",(SELECT count(*)::int FROM console_members child WHERE child.manager_id=u.id) AS "reportCount"
    FROM "user" u JOIN console_members m ON m.user_id=u.id LEFT JOIN "user" boss ON boss.id=m.manager_id ORDER BY m.created_at`)).rows;
  const all = (await pool.query('SELECT user_id AS "userId",client_id AS "clientId",module_id AS "moduleId" FROM console_assignments')).rows;
  return team.map(t => ({ ...t, assignments: all.filter(a => a.userId === t.id).map(({ clientId, moduleId }) => ({ clientId, moduleId })) }));
}

export async function myTeam(pool, userId) {
  const people = (await pool.query(`${managementScope} SELECT u.id,u.name,u.email,m.kind,m.specialty,m.manager_id AS "managerId",boss.name AS "managerName"
    FROM scope s JOIN console_members m ON m.user_id=s.user_id JOIN "user" u ON u.id=s.user_id
    LEFT JOIN "user" boss ON boss.id=m.manager_id WHERE s.user_id<>$1 ORDER BY u.name`, [userId])).rows;
  const assignments = (await pool.query(`${managementScope} SELECT a.user_id AS "userId",a.client_id AS "clientId",c.name AS "clientName",a.module_id AS "moduleId"
    FROM scope s JOIN console_assignments a ON a.user_id=s.user_id JOIN console_clients c ON c.id=a.client_id WHERE s.user_id<>$1 ORDER BY c.name,a.module_id`, [userId])).rows;
  return people.map(p => ({ ...p, directReport: p.managerId === userId, assignments: assignments.filter(a => a.userId === p.id) }));
}

export function validateClientTeam(body) {
  if (!body || typeof body !== 'object' || typeof body.clientId !== 'string' || !body.clientId || !Array.isArray(body.members) || body.members.length > 500) throw new HttpError(400, 'Select a client and valid staff assignments.');
  const seen = new Set();
  for (const person of body.members) {
    if (!person || typeof person.userId !== 'string' || !person.userId || seen.has(person.userId) || !Array.isArray(person.moduleIds) || new Set(person.moduleIds).size !== person.moduleIds.length || person.moduleIds.some(id => !modules.some(m => m.id === id))) throw new HttpError(400, 'Select valid people and modules without duplicate assignments.');
    seen.add(person.userId);
  }
  return body;
}
