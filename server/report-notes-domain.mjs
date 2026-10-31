import { HttpError } from './access.mjs';

export function commentId(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)) throw new HttpError(400, 'Select a valid report comment.');
  return value;
}
function text(value, max, label, optional = false) {
  if (optional && value == null) return '';
  if (typeof value !== 'string' || value.length > max || (!optional && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new HttpError(400, `Enter a valid ${label}.`);
  return value.trim();
}
export function validateComment(body, metadata) {
  const content = text(body?.body, 3000, 'comment (up to 3,000 characters)'), a = body?.anchor;
  if (!a || a.reportVersion !== metadata.version || !Object.hasOwn(metadata.periods, a.period)) throw new HttpError(400, 'Select an area in the current report.');
  const period = metadata.periods[a.period], sheet = text(a.sheet, 120, 'report section');
  if (!['Overview', 'Management Report'].includes(sheet) && !Object.hasOwn(period.sheets, sheet)) throw new HttpError(400, 'This section is not in the selected reporting month.');
  if (!Number.isInteger(a.page) || a.page < 1 || a.page > Math.max(1, Math.ceil((period.sheets[sheet]?.rows?.length || 0) / 100))) throw new HttpError(400, 'Select a valid report page.');
  if (!['main', 'drill'].includes(a.root) || !Array.isArray(a.path) || a.path.length > 40 || a.path.some(n => !Number.isInteger(n) || n < 0 || n > 10000)) throw new HttpError(400, 'Select a report area to annotate.');
  const drillKey = text(a.drillKey, 300, 'transaction detail', true);
  if ((a.root === 'drill' && !drillKey) || (drillKey && !Object.hasOwn(period.sheets[sheet]?.drilldowns || {}, drillKey))) throw new HttpError(400, 'Select a valid transaction detail.');
  const tag = text(a.tag, 20, 'report area');
  if (!/^[a-z][a-z0-9-]*$/.test(tag)) throw new HttpError(400, 'Select a valid report area.');
  const targetId = text(a.targetId, 100, 'report reference', true);
  if (targetId && !/^[a-zA-Z][\w:.-]*$/.test(targetId)) throw new HttpError(400, 'Select a valid report reference.');
  if (a.cellIndex != null && (!Number.isInteger(a.cellIndex) || a.cellIndex < 0 || a.cellIndex > 100)) throw new HttpError(400, 'Select a valid table cell.');
  return { body: content, anchor: {
    reportVersion: a.reportVersion, period: a.period, sheet, page: a.page,
    search: text(a.search, 300, 'schedule search', true), drillKey, drillSearch: text(a.drillSearch, 300, 'transaction search', true),
    root: a.root, path: a.path, tag, targetId,
    targetText: text(a.targetText, 600, 'report excerpt', true), quote: text(a.quote, 600, 'selected text', true),
    rowText: text(a.rowText, 1600, 'table row', true), cellIndex: a.cellIndex ?? null,
  } };
}
export function commentListOptions(url) {
  const status = url.searchParams.get('status') || 'all', limit = Number(url.searchParams.get('limit') || 100), before = url.searchParams.get('before');
  if (!['all', 'open', 'resolved'].includes(status) || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new HttpError(400, 'Select a valid comment filter.');
  return { status, limit, before: before ? commentId(before) : null };
}
