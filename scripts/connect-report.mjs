import { getServices } from '../server/auth.mjs';
import { connectReport } from '../server/reports.mjs';
if(process.stdin.isTTY)process.stdin.setRawMode(true);
process.stdin.setEncoding('utf8');process.stdin.resume();
console.log('Ready for existing report password on stdin (input is hidden).');
const password=await new Promise(resolve=>{let value='';process.stdin.on('data',chunk=>{value+=chunk;if(/[\r\n]/.test(value))resolve(value.split(/[\r\n]/)[0]);});});
process.stdin.pause();
const {pool}=getServices();
try {const key=await connectReport(password);await pool.query('UPDATE console_clients SET report_key=$1 WHERE id=$2',[key,'mtt']);console.log('MTT August through October accounting reports connected.');}
finally{await pool.end();}
