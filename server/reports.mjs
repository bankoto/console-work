import { createCipheriv, createDecipheriv, createHash, pbkdf2Sync, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { HttpError } from './access.mjs';

const reportFile = 'report-admin-v10-20261010.enc';
const context = 'MTT-Aug-Sep-2026-report-admin-v10';
export const downloads = {
  'MTT_Innovations_August_2026_Management_Report.pdf': ['august-management-report-v10-20261010.pdf.enc','MTT-Aug-2026-management-report-pdf-admin-v10','application/pdf'],
  'MTT_Innovations_August_2026_Management_Report.docx': ['august-management-report-v10-20261010.docx.enc','MTT-Aug-2026-management-report-docx-admin-v10','application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  'MTT_Innovations_August_2026_Accounts_Phase_1_2.xlsx': ['august-accounts-v10-20261010.xlsx.enc','MTT-Aug-2026-accounts-xlsx-admin-v10','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  'MTT_Innovations_September_2026_Management_Report.pdf': ['september-management-report-v10-20261010.pdf.enc','MTT-Sep-2026-management-report-pdf-admin-v10','application/pdf'],
  'MTT_Innovations_September_2026_Management_Report.docx': ['september-management-report-v10-20261010.docx.enc','MTT-Sep-2026-management-report-docx-admin-v10','application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  'MTT_Innovations_September_2026_Financial_Report.xlsx': ['september-accounts-v10-20261010.xlsx.enc','MTT-Sep-2026-accounts-xlsx-admin-v10','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
};
function wrappingKey() { return createHash('sha256').update(process.env.BETTER_AUTH_SECRET).digest(); }
export function sealKey(key) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', wrappingKey(), iv);
  return Buffer.concat([iv, cipher.update(key), cipher.final(), cipher.getAuthTag()]).toString('base64');
}
export function unsealKey(value) {
  const b = Buffer.from(value, 'base64'), decipher = createDecipheriv('aes-256-gcm', wrappingKey(), b.subarray(0,12));
  decipher.setAuthTag(b.subarray(-16));
  return Buffer.concat([decipher.update(b.subarray(12,-16)), decipher.final()]);
}
export async function decryptAsset(file, aad, key) {
  const b = await readFile(resolve('clients/mtt', file));
  const decipher = createDecipheriv('aes-256-gcm', key, b.subarray(0,12));
  decipher.setAAD(Buffer.from(aad)); decipher.setAuthTag(b.subarray(-16));
  return Buffer.concat([decipher.update(b.subarray(12,-16)), decipher.final()]);
}
export async function connectReport(password) {
  if (typeof password !== 'string' || password.length > 256) throw new HttpError(400, 'Enter the existing admin report password.');
  const variants = [...new Set([password, password.includes('\\@') ? password : password.replace('@', '\\@')])];
  for (const candidate of variants) {
    const key = pbkdf2Sync(candidate, Buffer.from('28afaad76335ff7fd72e692d578c6367','hex'),310000,32,'sha256');
    try { await decryptAsset(reportFile, context, key); return sealKey(key); } catch { /* Try the original report's normalization. */ }
  }
  throw new HttpError(400, 'The existing admin report password does not match.');
}
export async function getReport(sealedKey) {
  if (!sealedKey) throw new HttpError(409, 'An administrator needs to connect this report using its existing admin report password.');
  let html = (await decryptAsset(reportFile, context, unsealKey(sealedKey))).toString('utf8');
  html = html.replace(/<base\b[^>]*>/gi, '');
  html = html.replace('</head>', '<base href="/api/console/report/"><meta name="robots" content="noindex,nofollow,noarchive"></head>');
  // Only known downloads are rewritten; arbitrary paths never reach the filesystem.
  for (const name of Object.keys(downloads)) html = html.replaceAll(name, `/api/console/download?clientId=mtt&name=${encodeURIComponent(name)}`);
  html = html.replace('</body>', '<a href="/console/accounting" style="position:fixed;bottom:16px;right:18px;z-index:99999;background:#102f4c;color:white;padding:12px 18px;border-radius:9px;font:600 13px Arial;text-decoration:none">← Accounting workspace</a></body>');
  return html;
}
