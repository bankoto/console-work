import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHandler } from '../server/handler.mjs';
const handler=createHandler();
const publicAssets=new Map([['/assets/bankoto-logo.jpeg','assets/bankoto-logo.jpeg'],['/assets/homepage.css','assets/homepage.css'],['/assets/homepage.js','assets/homepage.js'],['/bankoto-homepage.html','bankoto-homepage.html']]);
http.createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost:3100').pathname;
  if(path.startsWith('/api/console/')) return handler(req,res);
  try {
    if(path.startsWith('/clients')) {res.writeHead(302,{Location:'/console/accounting'});res.end();return;}
    const asset=publicAssets.get(path)||(path==='/console/app.js'?'dist/console/app.js':path==='/console/report-notes.js'?'dist/console/report-notes.js':path==='/console/report-notes.css'?'web/report-notes.css':path==='/console/styles.css'?'web/styles.css':path==='/console/formation.css'?'web/formation.css':path.startsWith('/console')?'web/index.html':path==='/'?'index.html':null);
    if(!asset) {res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',asset.endsWith('.js')?'text/javascript':asset.endsWith('.css')?'text/css':asset.endsWith('.jpeg')?'image/jpeg':'text/html; charset=utf-8');res.end(await readFile(asset));
  } catch {res.writeHead(500);res.end('Unavailable');}
}).listen(3100,()=>console.log('Bankoto Console: http://localhost:3100/console/login'));
