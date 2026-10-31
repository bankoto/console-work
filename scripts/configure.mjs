import { randomBytes } from 'node:crypto';
import { readFile, appendFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const cli=process.env.VERCEL_CLI_PATH;
if(!cli)throw new Error('Set VERCEL_CLI_PATH to the installed Vercel CLI.');
const env=await readFile('.env.local','utf8');
if(/BETTER_AUTH_SECRET=/.test(env))throw new Error('Authentication is already configured.');
const secret=randomBytes(48).toString('base64url');
for(const [key,value] of Object.entries({BETTER_AUTH_SECRET:secret,BETTER_AUTH_URL:'https://www.bankoto.biz'})){
  const child=spawnSync(process.execPath,[cli,'env','add',key,'production','--sensitive','--yes'],{input:value+'\n',encoding:'utf8',windowsHide:true});
  if(child.status!==0)throw new Error(`${key}: ${child.stderr || 'Vercel configuration failed'}`);
  console.log(`${key} configured for production.`);
}
await appendFile('.env.local',`\nBETTER_AUTH_SECRET=${secret}\nBETTER_AUTH_URL=http://localhost:3100\n`);
console.log('Local authentication configured.');
