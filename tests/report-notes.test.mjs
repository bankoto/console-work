import test from 'node:test';
import assert from 'node:assert/strict';
import { validateComment, commentId, commentListOptions } from '../server/report-notes-domain.mjs';
const metadata = { version: 'v1', periods: { '2026-09': { sheets: { Ledger: { rows: Array(120).fill([]), drilldowns: { Revenue: {} } } } } } };
const anchor = { reportVersion: 'v1', period: '2026-09', sheet: 'Ledger', page: 2, root: 'main', path: [2, 3, 0], tag: 'td', targetText: 'Referenced amount', quote: 'amount', rowText: 'row', cellIndex: 2 };
test('annotations preserve report context, pagination and plain-text feedback', () => {
  const result = validateComment({ body: '  Review <script>this</script> amount\nplease  ', anchor }, metadata);
  assert.equal(result.body, 'Review <script>this</script> amount\nplease'); assert.deepEqual(result.anchor.path, [2, 3, 0]); assert.equal(result.anchor.page, 2); assert.equal(result.anchor.period, '2026-09');
  assert.doesNotThrow(() => validateComment({ body: 'Review transaction detail', anchor: { ...anchor, root: 'drill', drillKey: 'Revenue' } }, metadata));
});
test('annotation input rejects invalid report contexts and unsafe or oversized locations', () => {
  for (const changes of [{ reportVersion: 'old' }, { period: '2026-08' }, { sheet: 'Other' }, { page: 3 }, { page: 0 }, { root: 'body' }, { path: [-1] }, { path: Array(41).fill(0) }, { tag: 'td[onclick]' }, { targetId: 'bad selector]' }, { cellIndex: -1 }, { root: 'drill' }, { drillKey: 'Unknown' }, { quote: 'x'.repeat(601) }]) assert.throws(() => validateComment({ body: 'Feedback', anchor: { ...anchor, ...changes } }, metadata));
  for (const body of ['', '  ', 'x'.repeat(3001), null]) assert.throws(() => validateComment({ body, anchor }, metadata));
});
test('comment filters and cursors are constrained without limiting saved history', () => {
  const id = 'de305d54-75b4-431b-adb2-eb6b9e546014'; assert.equal(commentId(id), id);
  assert.deepEqual(commentListOptions(new URL(`https://example.invalid?limit=1&status=resolved&before=${id}`)), { status: 'resolved', limit: 1, before: id });
  for (const query of ['?limit=101', '?limit=-1', '?limit=NaN', '?status=unknown', '?before=not-a-comment']) assert.throws(() => commentListOptions(new URL('https://example.invalid' + query)));
});
