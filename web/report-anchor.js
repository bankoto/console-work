export const normalizedText = value => String(value || '').replace(/\s+/g, ' ').trim();
export function reportRoot(element) {
  return element?.closest('#drill-panel') || element?.closest('.main');
}
export function captureAnchor(element, bridge, quote = '') {
  const root = reportRoot(element); if (!root || !element || !root.contains(element)) return null;
  const path = []; let node = element;
  while (node !== root) { path.unshift([...node.parentElement.children].indexOf(node)); node = node.parentElement; }
  const cell = element.closest('td,th');
  return { ...bridge.state(), reportVersion: bridge.version, root: root.id === 'drill-panel' ? 'drill' : 'main', path,
    tag: element.localName, targetId: element.id || '', targetText: normalizedText(element.innerText || element.textContent).slice(0, 600),
    quote: normalizedText(quote).slice(0, 600), rowText: cell ? normalizedText(cell.parentElement.innerText).slice(0, 1600) : '', cellIndex: cell?.cellIndex ?? null,
  };
}
export function locateAnchor(anchor) {
  const root = anchor.root === 'drill' ? document.querySelector('#drill-panel') : document.querySelector('.main'); if (!root) return null;
  const matches = element => {
    if (!element || !root.contains(element) || !element.getClientRects().length) return false;
    const text = normalizedText(element.innerText || element.textContent);
    return (!anchor.targetText || text.slice(0, 600) === anchor.targetText) && (!anchor.quote || text.includes(anchor.quote));
  };
  if (anchor.targetId) { const element = document.getElementById(anchor.targetId); if (matches(element)) return element; }
  let element = root; for (const index of anchor.path) element = element?.children[index];
  if (matches(element)) return element;
  if (anchor.rowText && anchor.cellIndex !== null) {
    const rows = [...root.querySelectorAll('tr')].filter(row => normalizedText(row.innerText).slice(0, 1600) === anchor.rowText);
    if (rows.length === 1 && matches(rows[0].cells[anchor.cellIndex])) return rows[0].cells[anchor.cellIndex];
  }
  const candidates = [...root.getElementsByTagName(anchor.tag)].filter(matches);
  return candidates.length === 1 ? candidates[0] : null;
}
