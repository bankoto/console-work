import { HttpError } from './access.mjs';

export const formationStatuses = [
  { id: 'not_started', label: 'Not started', color: 'grey' },
  { id: 'collecting_documents', label: 'Collecting documents', color: 'amber' },
  { id: 'name_reservation', label: 'Name reservation', color: '' },
  { id: 'preparing_application', label: 'Preparing application', color: '' },
  { id: 'submitted', label: 'Submitted', color: '' },
  { id: 'action_required', label: 'Action required', color: 'amber' },
  { id: 'approved', label: 'Approved', color: 'green' },
  { id: 'completed', label: 'Completed', color: 'green' },
];
export const documentCategories = [
  'Company information', 'Identity documents', 'Proof of address',
  'Directors & shareholders', 'Forms & applications', 'Supporting documents',
  'Certificate of incorporation', 'Constitution / Memorandum & Articles',
  'Registry documents', 'Receipts & invoices', 'Other',
];
export const maxFormationFileSize = 20 * 1024 * 1024;
export const fileTypes = {
  pdf: 'application/pdf', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv', txt: 'text/plain', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', zip: 'application/zip',
};
export function textField(value, label, max, required = true) {
  if (typeof value !== 'string' || (required && !value.trim()) || value.trim().length > max || /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value)) {
    throw new HttpError(400, `Enter a valid ${label}${required ? '' : ' or leave it blank'}.`);
  }
  return value.trim();
}
export function validateCaseUpdate(body) {
  if (!formationStatuses.some(s => s.id === body.status)) throw new HttpError(400, 'Select a valid incorporation status.');
  if (!Number.isInteger(body.version) || body.version < 1) throw new HttpError(400, 'Refresh the incorporation job before saving.');
  const dueDate = body.dueDate || null;
  if (dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(Date.parse(dueDate)) || new Date(dueDate).toISOString().slice(0, 10) !== dueDate)) {
    throw new HttpError(400, 'Select a valid target date.');
  }
  return {
    companyName: textField(body.companyName, 'proposed company name', 180),
    status: body.status,
    registrationNumber: textField(body.registrationNumber ?? '', 'registration number', 100, false),
    note: textField(body.note ?? '', 'status update', 2000, false),
    dueDate,
    version: body.version,
  };
}
export function validateUpload(body) {
  const filename = textField(body.filename, 'file name', 180);
  if (/[\\/\r\n]/.test(filename) || filename.startsWith('.')) throw new HttpError(400, 'Use a file name without folders or hidden prefixes.');
  const ext = filename.split('.').pop().toLowerCase();
  if (!fileTypes[ext]) throw new HttpError(400, 'Upload a PDF, Office document, spreadsheet, image, text file or ZIP archive.');
  if (!Number.isSafeInteger(body.size) || body.size < 1 || body.size > maxFormationFileSize) throw new HttpError(400, 'Each file must be between 1 byte and 20 MB.');
  return { filename, contentType: fileTypes[ext], size: body.size, category: textField(body.category, 'document category', 80) };
}
