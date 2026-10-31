import { randomUUID } from 'node:crypto';
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { getServices } from '../server/auth.mjs';
import { temporaryPassword } from '../server/handler.mjs';
const { pool, auth } = getServices(), file = '.vercel/management-browser-qa.json';
const state = { users: [], clients: [] };
try {
  if (process.argv.includes('--remove')) {
    const stored = JSON.parse(await readFile(file, 'utf8'));
    for (const id of stored.clients) await pool.query('DELETE FROM console_clients WHERE id=$1 AND industry=$2', [id, 'Browser verification only']);
    for (const p of stored.users) {
      await pool.query('DELETE FROM console_audit WHERE actor_id=$1 OR target_id=$1', [p.id]);
      await pool.query('DELETE FROM "user" WHERE id=$1 AND email=$2', [p.id, p.email]);
    }
    await unlink(file); console.log('Browser management fixtures removed.');
  } else {
    const password = temporaryPassword();
    for (const [name, kind, managerIndex] of [['Sample Manager', 'employee', null], ['Sample Employee', 'employee', 0], ['Sample Consultant', 'consultant', 0]]) {
      const email = `management-browser-${name.split(' ')[1].toLowerCase()}@example.invalid`;
      const { user } = await auth.api.createUser({ body: { name, email, password, role: 'user' } });
      state.users.push({ id: user.id, email, password }); await writeFile(file, JSON.stringify(state));
      await pool.query('INSERT INTO console_members(user_id,kind,specialty,manager_id,must_change_password) VALUES($1,$2,$3,$4,false)', [user.id, kind, kind === 'employee' ? 'Accountant' : 'Legal Expert', managerIndex === null ? null : state.users[managerIndex].id]);
    }
    for (const [index, name] of ['Sample Client Alpha', 'Sample Client Beta'].entries()) {
      const id = randomUUID(); state.clients.push(id); await writeFile(file, JSON.stringify(state));
      await pool.query('INSERT INTO console_clients(id,name,industry) VALUES($1,$2,$3)', [id, name, 'Browser verification only']);
      await pool.query('INSERT INTO console_assignments(user_id,client_id,module_id) VALUES($1,$2,$3)', [state.users[index + 1].id, id, 'formation']);
      const job = randomUUID(); await pool.query('INSERT INTO console_formation_cases(id,client_id,company_name,status,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$5)', [job, id, `${name} Limited`, index ? 'preparing_application' : 'not_started', state.users[index + 1].id]);
      for (const [area, folder] of [['working', 'Working documents'], ['output', 'Output documents']]) await pool.query('INSERT INTO console_formation_folders(id,case_id,name,area,system_folder) VALUES($1,$2,$3,$4,true)', [randomUUID(), job, folder, area]);
    }
    console.log(JSON.stringify({ managerEmail: state.users[0].email, password, sampleClient: state.clients[0] }));
  }
} finally { await pool.end(); }
