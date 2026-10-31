import { getServices } from '../server/auth.mjs';
import { temporaryPassword } from '../server/handler.mjs';
const {pool,auth}=getServices();const email='console-browser-qa@example.invalid';
try {
  if(process.argv.includes('--remove')){
    const r=await pool.query('SELECT id FROM "user" WHERE email=$1',[email]);
    if(r.rowCount){await pool.query('DELETE FROM console_audit WHERE actor_id=$1 OR target_id=$1',[r.rows[0].id]);await pool.query('DELETE FROM "user" WHERE id=$1',[r.rows[0].id]);}
    console.log('Temporary browser verification account removed.');
  } else {
    const password=temporaryPassword();const {user}=await auth.api.createUser({body:{name:'Bankoto QA',email,password,role:'admin'}});
    await pool.query('INSERT INTO console_members(user_id,kind,specialty,must_change_password) VALUES($1,$2,$3,false)',[user.id,'employee','Accountant']);
    console.log(JSON.stringify({email,password}));
  }
} finally{await pool.end();}
