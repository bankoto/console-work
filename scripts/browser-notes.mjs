import { readFile, writeFile, unlink } from 'node:fs/promises';
import { getServices } from '../server/auth.mjs';
import { temporaryPassword } from '../server/handler.mjs';
const { pool, auth } = getServices(), file = '.vercel/notes-browser-qa.json';
try {
  if (process.argv.includes('--remove')) {
    const people = JSON.parse(await readFile(file, 'utf8'));
    for (const person of people) {
      const notes = (await pool.query('SELECT id FROM console_report_comments WHERE author_id=$1', [person.id])).rows;
      for (const note of notes) { await pool.query('DELETE FROM console_audit WHERE target_id=$1', [note.id]); await pool.query('DELETE FROM console_report_comments WHERE id=$1', [note.id]); }
      await pool.query('DELETE FROM console_audit WHERE actor_id=$1 OR target_id=$1', [person.id]);
      await pool.query('DELETE FROM "user" WHERE id=$1 AND email=$2', [person.id, person.email]);
    }
    await unlink(file); console.log('Temporary report annotation fixtures removed.');
  } else {
    const people = [];
    for (const kind of ['employee', 'consultant']) {
      const password = temporaryPassword(), email = `notes-browser-${kind}@example.invalid`;
      const { user } = await auth.api.createUser({ body: { name: `Sample ${kind === 'employee' ? 'Accountant' : 'Consultant'}`, email, password, role: 'user' } });
      people.push({ id: user.id, email, password }); await writeFile(file, JSON.stringify(people));
      await pool.query('INSERT INTO console_members(user_id,kind,specialty,must_change_password) VALUES($1,$2,$3,false)', [user.id, kind, 'Accountant']);
      await pool.query("INSERT INTO console_assignments(user_id,client_id,module_id) VALUES($1,'mtt','accounting')", [user.id]);
    }
    console.log(JSON.stringify(people.map(({ email, password }) => ({ email, password }))));
  }
} finally { await pool.end(); }
