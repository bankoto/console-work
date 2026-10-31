import { mkdir, copyFile, cp } from 'node:fs/promises';
await mkdir('dist/console',{recursive:true});
await copyFile('index.html','dist/index.html');
await copyFile('bankoto-homepage.html','dist/bankoto-homepage.html');
await cp('web','dist/console',{recursive:true});
console.log('Built homepage and Bankoto Console. Client reports stay in the protected server function.');
