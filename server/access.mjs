export const modules = [
  { id: 'accounting', name: 'Accounting', description: 'Client accounts, reports and financial records.', available: true },
  { id: 'formation', name: 'Company Formation', description: 'Incorporation progress, client files and completed documents.', available: true },
  { id: 'tax', name: 'Tax', description: 'Tax compliance and client obligations.', available: false },
  { id: 'payroll', name: 'Payroll', description: 'Payroll processing and employee records.', available: false },
  { id: 'legal', name: 'Legal', description: 'Legal documents and client matters.', available: false },
];
export const specialties = ['Tax consultant', 'Accountant', 'Payroll Expert', 'Legal Expert'];
export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
export function assertAdmin(user) { if (user.role !== 'admin') throw new HttpError(403, 'Administrator access is required.'); }
export function canAccess(user, assignments, clientId, moduleId) {
  return user.role === 'admin' || assignments.some(a => a.clientId === clientId && a.moduleId === moduleId);
}
export function validateMember(body) {
  if (!body || typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.length > 100) throw new HttpError(400, 'Enter a name between 2 and 100 characters.');
  if (!['employee', 'consultant'].includes(body.kind)) throw new HttpError(400, 'Select employee or consultant.');
  if (!specialties.includes(body.specialty)) throw new HttpError(400, 'Select a valid professional label.');
  if (!Array.isArray(body.assignments) || body.assignments.length > 500) throw new HttpError(400, 'Invalid assignments.');
  const keys = new Set();
  for (const a of body.assignments) {
    if (!a || typeof a.clientId !== 'string' || !modules.some(m => m.id === a.moduleId)) throw new HttpError(400, 'Invalid client or module assignment.');
    const key = `${a.clientId}:${a.moduleId}`;
    if (keys.has(key)) throw new HttpError(400, 'Duplicate assignment.');
    keys.add(key);
  }
  return { name: body.name.trim(), kind: body.kind, specialty: body.specialty, assignments: body.assignments };
}
