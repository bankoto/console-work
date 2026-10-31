import { readFile } from 'node:fs/promises';
import { getMigrations } from 'better-auth/db/migration';
import { getServices } from '../server/auth.mjs';
import { temporaryPassword } from '../server/handler.mjs';
const {pool,auth}=getServices();
try {
  const migration=await getMigrations(auth.options);await migration.runMigrations();
  await pool.query(await readFile(new URL('../server/schema.sql',import.meta.url),'utf8'));
  await pool.query(await readFile(new URL('../server/formation-schema.sql',import.meta.url),'utf8'));
  await pool.query(await readFile(new URL('../server/management-schema.sql',import.meta.url),'utf8'));
  await pool.query(await readFile(new URL('../server/report-notes-schema.sql',import.meta.url),'utf8'));
  const existing=await pool.query('SELECT id FROM "user" WHERE email=$1',['bankotofinance@gmail.com']);
  if(existing.rowCount) console.log('Console administrator already exists; password was not changed.');
  else {
    const password=temporaryPassword();
    const {user}=await auth.api.createUser({body:{name:'Bankoto Admin',email:'bankotofinance@gmail.com',password,role:'admin',data:{emailVerified:true}}});
    await pool.query('INSERT INTO console_members(user_id,kind,specialty,must_change_password) VALUES($1,$2,$3,true)',[user.id,'employee','Accountant']);
    console.log(JSON.stringify({email:user.email,temporaryPassword:password,changeOnFirstLogin:true}));
  }
} finally { await pool.end(); }
