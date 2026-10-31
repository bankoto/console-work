import { captureAnchor, locateAnchor, reportRoot, normalizedText } from './report-anchor.js';

const bridge = window.bankotoReport;
if (bridge) startNotes();
function startNotes() {
  // Report detail drawers share the annotation controls outside their own panel.
  document.querySelector('#drill-panel')?.setAttribute('aria-modal', 'false');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const date = value => new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' });
  const period = id => new Date(id + '-02').toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  let comments = [], counts = { total: 0, open: 0 }, next = null, canComment = false, canResolve = false, draft = null, active = null, target = null, picking = false, loaded = false, loading = false, hovered = null, selectionAnchor = null;
  let focusId = new URL(location.href).searchParams.get('comment');
  if (focusId && !/^[0-9a-f-]{36}$/i.test(focusId)) focusId = null;
  const ui = document.createElement('div'); ui.dataset.bankotoNotes = '';
  ui.innerHTML = `<div class="bn-launcher"><a href="/console/accounting/${encodeURIComponent(bridge.clientId)}">← Accounting</a><button type="button" class="bn-annotate" hidden>Annotate area</button><button type="button" id="bn-toggle" aria-expanded="false" aria-controls="bn-panel">Comments <span id="bn-count">…</span></button></div>
    <aside id="bn-panel" class="bn-panel" aria-label="Report comments" hidden><header class="bn-header"><div><small>ACCOUNTING FEEDBACK</small><h2>Comments & annotations</h2><p id="bn-summary">Loading report comments…</p></div><button type="button" class="bn-close" aria-label="Close comments">×</button></header>
    <div class="bn-tools"><button type="button" class="bn-annotate bn-primary" hidden>Annotate an area</button><button type="button" id="bn-section" hidden>Comment on this section</button><p id="bn-help">Select a saved comment to return to its report area.</p></div>
    <div id="bn-message" role="status" aria-live="polite"></div><div id="bn-composer"></div>
    <div class="bn-filters"><label for="bn-filter">Show comments</label><select id="bn-filter"><option value="all">All comments</option><option value="open">Open comments</option><option value="resolved">Resolved comments</option></select><button type="button" id="bn-refresh">Refresh</button></div>
    <div id="bn-list" aria-label="Saved comments"></div><button type="button" id="bn-more" hidden>Load older comments</button></aside>
    <div id="bn-pick-instruction" role="status" hidden>Click a report area to add a comment. <button type="button" id="bn-stop-picking">Cancel</button></div>
    <button type="button" id="bn-selection" hidden>Comment on selection</button><div id="bn-highlight" hidden><span>Referenced area</span></div>`;
  document.body.append(ui);
  const $ = selector => ui.querySelector(selector), panel = $('#bn-panel');
  function openPanel(open = true) {
    panel.hidden = !open; $('#bn-toggle').setAttribute('aria-expanded', String(open)); document.body.classList.toggle('bn-open', open);
    requestAnimationFrame(() => { positionHighlight(); if(open && active){const card=$(`#bn-list [data-note="${active}"]`);if(card){const header=$('.bn-header');panel.scrollTop+=card.getBoundingClientRect().top-panel.getBoundingClientRect().top-header.getBoundingClientRect().height-12;}} });
  }
  function message(text = '', error = false) { const el = $('#bn-message'); el.textContent = text; el.classList.toggle('bn-error', error); }
  async function api(path, body, method = body ? 'POST' : 'GET') {
    const response = await fetch('/api/console/' + path, { credentials: 'same-origin', method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || 'The comment could not be saved. Please try again.'); return data;
  }
  function renderList() {
    $('#bn-count').textContent = counts.open; $('#bn-summary').textContent = `${counts.open} open · ${counts.total} saved for this client`;
    $('#bn-list').innerHTML = comments.length ? comments.map(note => `<article class="bn-note ${note.id === active ? 'bn-active' : ''} ${note.resolved ? 'bn-resolved' : ''}" data-note="${note.id}"><div class="bn-note-meta"><strong>${esc(note.authorName)}</strong><span>${esc(note.authorKind)} · ${date(note.createdAt)}</span></div><button type="button" class="bn-jump" data-jump="${note.id}"><span>${esc(period(note.anchor.period))} · ${esc(note.anchor.sheet)}</span><blockquote>${esc(note.anchor.quote || note.anchor.targetText || 'Selected report area')}</blockquote><small>↗ Go to referenced area</small></button><p class="bn-note-body">${esc(note.body)}</p><div class="bn-note-footer"><span>${note.resolved ? '✓ Resolved' : 'Open comment'}</span>${canResolve ? `<button type="button" data-resolve="${note.id}" data-resolved="${!note.resolved}">${note.resolved ? 'Reopen' : 'Mark resolved'}</button>` : ''}</div></article>`).join('') : `<div class="bn-empty"><strong>${$('#bn-filter').value === 'all' ? 'No comments yet' : 'No matching comments'}</strong><p>${canComment ? 'Annotate any report area or select text to leave feedback. Your comments are saved for the administrator to review.' : 'Comments from this client’s assigned team will appear here.'}</p></div>`;
    $('#bn-more').hidden = !next;
  }
  async function load(append = false) {
    if (loading) return; loading = true; $('#bn-refresh').disabled = true; $('#bn-filter').disabled = true; $('#bn-more').disabled = true;
    try {
      const query = new URLSearchParams({ clientId: bridge.clientId, status: $('#bn-filter').value }); if (append && next) query.set('before', next); if (focusId) query.set('commentId', focusId);
      const result = await api('report-comments?' + query); canComment = result.canComment; canResolve = result.canResolve; counts = result.counts; next = result.next;
      comments = append ? [...comments, ...result.comments.filter(c => !comments.some(old => old.id === c.id))] : result.comments;
      if (result.focusComment && !comments.some(c => c.id === result.focusComment.id)) comments.unshift(result.focusComment);
      ui.querySelectorAll('.bn-annotate').forEach(el => { el.hidden = !canComment; }); $('#bn-section').hidden = !canComment;
      $('#bn-help').textContent = canComment ? 'Click Annotate an area, then select a card, table cell, chart or report text. You can also select text directly.' : 'Manager view: review comments and jump to their report areas. A direct Accounting assignment is required to add comments.';
      renderList(); if (!loaded && (counts.total || focusId) && innerWidth >= 1200) openPanel(); loaded = true;
      if (focusId) { const note = comments.find(c => c.id === focusId); if (note) jump(note); else { openPanel(); message('This comment is no longer available.', true); } focusId = null; }
    } catch (error) { message(error.message, true); $('#bn-summary').textContent = 'Comments are temporarily unavailable'; $('#bn-count').textContent = '!'; }
    finally { loading = false; $('#bn-refresh').disabled = false; $('#bn-filter').disabled = false; $('#bn-more').disabled = false; }
  }
  function positionHighlight() {
    const marker = $('#bn-highlight');
    if (!target?.isConnected || !target.getClientRects().length) { marker.hidden = true; return; }
    const rect = target.getBoundingClientRect(); marker.hidden = false;
    Object.assign(marker.style, { top: `${rect.top - 4}px`, left: `${rect.left - 4}px`, width: `${rect.width + 8}px`, height: `${rect.height + 8}px` });
  }
  function highlight(element) { target = element; if (!element) { positionHighlight(); return; } element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' }); if (!element.hasAttribute('tabindex')) element.setAttribute('tabindex', '-1'); element.focus({ preventScroll: true }); positionHighlight(); }
  function jump(note) {
    cancelPicking(); draft = null; $('#bn-composer').replaceChildren(); active = note.id;
    const restored = bridge.restore(note.anchor), element = restored && note.anchor.reportVersion === bridge.version ? locateAnchor(note.anchor) : null;
    if (innerWidth < 1200) openPanel(false); else openPanel(); renderList();
    highlight(element); const url = new URL(location.href); url.searchParams.set('comment', note.id); history.replaceState({}, '', url);
    if (!element) { openPanel(); message('The referenced area has changed or is unavailable. The original report excerpt is preserved below.', true); }
    else message('Referenced area highlighted.');
  }
  function composer(anchor) {
    if (!anchor || !canComment) return; if(draft && $('#bn-body')?.value.trim() && !confirm('Discard the unsaved comment and select another area?'))return; cancelPicking(); selectionAnchor = null; $('#bn-selection').hidden = true; draft = anchor; active = null; openPanel(); message('');
    $('#bn-composer').innerHTML = `<form id="bn-form"><div class="bn-context"><strong>${esc(period(anchor.period))} · ${esc(anchor.sheet)}</strong><blockquote>${esc(anchor.quote || anchor.targetText || 'Selected report area')}</blockquote></div><label for="bn-body">Your comment</label><textarea id="bn-body" name="body" required maxlength="3000" rows="4" placeholder="What should the administrator review?"></textarea><div class="bn-compose-actions"><button type="button" id="bn-cancel-draft">Cancel</button><button type="submit" class="bn-primary">Save comment</button></div><p class="bn-private">Visible to the administrator and people with access to this client’s Accounting module.</p></form>`;
    $('#bn-cancel-draft').onclick = () => { draft = null; $('#bn-composer').replaceChildren(); highlight(null); };
    $('#bn-form').onsubmit = async event => {
      event.preventDefault(); const form = event.target, button = form.querySelector('[type=submit]'); button.disabled = true;
      try {
        const result = await api('report-comments', { clientId: bridge.clientId, body: form.elements.body.value, anchor: draft });
        active = result.comment.id; comments.unshift(result.comment); counts.total++; counts.open++; draft = null; $('#bn-composer').replaceChildren(); $('#bn-filter').value = 'all'; renderList(); await load(); message('Comment saved. The administrator can open its referenced area.');
        const url = new URL(location.href); url.searchParams.set('comment', active); history.replaceState({}, '', url);
      } catch (error) { message(error.message, true); button.disabled = false; }
    };
    requestAnimationFrame(() => { const el = locateAnchor(anchor); if (innerWidth >= 1200) highlight(el); else target = el; $('#bn-body').focus(); });
  }
  function cancelPicking() { picking = false; document.body.classList.remove('bn-picking'); $('#bn-pick-instruction').hidden = true; hovered?.classList.remove('bn-hover'); hovered = null; }
  function areaFor(element) {
    if (!element || element.closest('[data-bankoto-notes],button,a,input,select,textarea') || !reportRoot(element)) return null;
    return element.closest('td,th,.metric,.status,.treatment,.bi-card,.bi-bar-row,.commentary-card,.report-kpi,h1,h2,h3,h4,p,li,article,.panel,.bi-chart,.report-card') || element;
  }
  ui.addEventListener('click', async event => {
    if (event.target.closest('#bn-toggle')) { openPanel(panel.hidden); if (!loaded) load(); }
    if (event.target.closest('.bn-close')) openPanel(false);
    if (event.target.closest('.bn-annotate')) { if (draft && $('#bn-body')?.value.trim() && !confirm('Discard the unsaved comment and select another area?')) return; draft = null; $('#bn-composer').replaceChildren(); picking = true; openPanel(false); document.body.classList.add('bn-picking'); $('#bn-pick-instruction').hidden = false; $('#bn-selection').hidden = true; }
    if (event.target.closest('#bn-stop-picking')) cancelPicking();
    if (event.target.closest('#bn-section')) composer(captureAnchor(document.querySelector('#drill-overlay:not([hidden]) h2') || document.querySelector('#page-title'), bridge));
    if (event.target.closest('#bn-selection')) composer(selectionAnchor);
    if (event.target.closest('#bn-refresh')) load();
    if (event.target.closest('#bn-more')) load(true);
    const id = event.target.closest('[data-jump]')?.dataset.jump; if (id) { if (draft && $('#bn-body')?.value.trim() && !confirm('Discard the unsaved comment and open this reference?')) return; jump(comments.find(c => c.id === id)); }
    const review = event.target.closest('[data-resolve]');
    if (review) { review.disabled = true; try { await api('report-comments', { id: review.dataset.resolve, resolved: review.dataset.resolved === 'true' }, 'PATCH'); await load(); message(review.dataset.resolved === 'true' ? 'Comment marked resolved.' : 'Comment reopened.'); } catch (error) { message(error.message, true); review.disabled = false; } }
  });
  $('#bn-filter').onchange = () => load();
  document.addEventListener('pointermove', event => { if (!picking) return; const area = areaFor(event.target); if (area !== hovered) { hovered?.classList.remove('bn-hover'); hovered = area; hovered?.classList.add('bn-hover'); } });
  document.addEventListener('click', event => { if (!picking || event.target.closest('[data-bankoto-notes]')) return; const area = areaFor(event.target); if (!area) return; event.preventDefault(); event.stopImmediatePropagation(); const anchor = captureAnchor(area, bridge); target = area; composer(anchor); }, true);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { cancelPicking(); $('#bn-selection').hidden = true; } if (picking && event.key === 'Enter' && reportRoot(document.activeElement)) { const area = areaFor(document.activeElement); if (area) { event.preventDefault(); composer(captureAnchor(area, bridge)); } } });
  function showSelection() {
    if (!canComment || picking) return; $('#bn-selection').hidden = true; const selection = getSelection(), text = normalizedText(selection?.toString());
    if (!text || !selection.rangeCount) { $('#bn-selection').hidden = true; return; }
    const range = selection.getRangeAt(0), node = range.commonAncestorContainer, element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    if (!reportRoot(element) || element.closest('[data-bankoto-notes]') || !reportRoot(range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement) || !reportRoot(range.endContainer.nodeType === Node.ELEMENT_NODE ? range.endContainer : range.endContainer.parentElement)) return;
    selectionAnchor = captureAnchor(element, bridge, text); if (!selectionAnchor) return;
    const rect = range.getBoundingClientRect(), button = $('#bn-selection'); button.hidden = false; button.style.left = `${Math.max(8, Math.min(innerWidth - 200, rect.left))}px`; button.style.top = `${Math.max(8, Math.min(innerHeight - 50, rect.bottom + 8))}px`;
  }
  document.addEventListener('mouseup', event => { if (!event.target.closest('[data-bankoto-notes]')) showSelection(); });
  document.addEventListener('keyup', event => { if (event.key.startsWith('Arrow') || event.key === 'Shift') showSelection(); });
  $('#bn-selection').onmousedown = event => event.preventDefault();
  document.addEventListener('scroll', positionHighlight, true); window.addEventListener('resize', positionHighlight);
  const observer = new MutationObserver(() => { if (target && (!target.isConnected || !target.getClientRects().length)) { target = null; positionHighlight(); } });
  observer.observe(document.querySelector('.main'), { childList: true, subtree: true }); observer.observe(document.querySelector('#drill-overlay'), { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true });
  window.addEventListener('beforeunload', event => { if (draft && $('#bn-body')?.value.trim()) { event.preventDefault(); event.returnValue = ''; } });
  load();
}
