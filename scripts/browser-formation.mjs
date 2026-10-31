import { randomUUID } from 'node:crypto';
import { del } from '@vercel/blob';
import { getServices } from '../server/auth.mjs';
const { pool } = getServices(), clientId = 'formation-ui-verification';
try {
  if (process.argv.includes('--remove')) {
    const files = (await pool.query('SELECT f.blob_path FROM console_formation_files f JOIN console_formation_cases j ON j.id=f.case_id WHERE j.client_id=$1', [clientId])).rows;
    if (files.length) await del(files.map(f => f.blob_path));
    await pool.query('DELETE FROM console_clients WHERE id=$1', [clientId]);
    console.log('Temporary Formation browser workspace removed.');
  } else {
    const user = (await pool.query('SELECT id FROM "user" WHERE email=$1', ['console-browser-qa@example.invalid'])).rows[0];
    if (!user) throw new Error('Create the temporary browser verification account first.');
    await pool.query('INSERT INTO console_clients(id,name,industry) VALUES($1,$2,$3)', [clientId, 'Formation UI verification (temporary)', 'Verification only']);
    const id = randomUUID();
    await pool.query('INSERT INTO console_formation_cases(id,client_id,company_name,status,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$5)', [id, clientId, 'Formation Test Company Ltd', 'collecting_documents', user.id]);
    for (const [area, name] of [['working', 'Working documents'], ['output', 'Output documents']]) await pool.query('INSERT INTO console_formation_folders(id,case_id,name,area,system_folder) VALUES($1,$2,$3,$4,true)', [randomUUID(), id, name, area]);
    console.log(`/console/formation/${clientId}`);
  }
} finally { await pool.end(); }
