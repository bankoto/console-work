export function createAccountingFeedback(ctx) {
  const { api, esc, icon } = ctx;
  let generation = 0;
  function mount() {
    const current = ++generation, user = ctx.getUser(), workspace = ctx.getWorkspace(), parts = location.pathname.split('/');
    if (user.role === 'admin' && (!parts[2] || parts[2] === 'login') && workspace.reportFeedback?.open) {
      const heading = document.querySelector('#content .page-heading');
      heading?.insertAdjacentHTML('afterend', `<div class="accounting-feedback-alert"><span>${icon('file')}<strong>${workspace.reportFeedback.open} open accounting comment${workspace.reportFeedback.open === 1 ? '' : 's'}</strong><small>Your team has report feedback ready for review.</small></span><a class="button" href="/console/accounting#feedback" data-route>Review feedback ${icon('arrow')}</a></div>`);
    }
    if (parts[2] !== 'accounting' || user.role !== 'admin') return;
    const content = document.querySelector('#content'), footer = content.querySelector('.page-footer');
    const section = document.createElement('section'); section.id = 'feedback'; section.className = 'card accounting-feedback';
    section.innerHTML = '<div class="card-header"><div><h2>Report comments & feedback</h2><p>Click a comment to open the exact month, section and area your team referenced.</p></div><button class="button" id="feedback-refresh">Refresh</button></div><div class="feedback-toolbar"><label for="feedback-status">Comments</label><select id="feedback-status"><option value="open">Open comments</option><option value="all">All comments</option><option value="resolved">Resolved comments</option></select><span id="feedback-count" class="muted"></span></div><div id="feedback-list" class="panel-body muted">Loading report feedback…</div><div class="feedback-more"><button class="button" id="feedback-more" hidden>Load older comments</button></div>';
    if (footer) content.insertBefore(section, footer); else content.append(section);
    if(location.hash==='#feedback')requestAnimationFrame(()=>section.scrollIntoView({block:'start'}));
    let rows = [], next, loading = false;
    async function load(append = false) {
      if (loading) return; loading = true; section.querySelector('#feedback-refresh').disabled = true;
      try {
        const query = new URLSearchParams({ status: section.querySelector('#feedback-status').value }); if (append && next) query.set('before', next); if(parts[3])query.set('clientId',parts[3]);
        const result = await api('report-feedback?' + query); if (current !== generation || !section.isConnected) return;
        rows = append ? [...rows, ...result.comments] : result.comments; next = result.next;
        const clientId = parts[3], visible = clientId ? rows.filter(n => n.clientId === clientId) : rows;
        section.querySelector('#feedback-count').textContent = `${result.counts.open} open · ${result.counts.total} saved`;
        section.querySelector('#feedback-list').className = 'feedback-items';
        section.querySelector('#feedback-list').innerHTML = visible.length ? visible.map(n => `<a class="feedback-item" href="/api/console/report?clientId=${encodeURIComponent(n.clientId)}&comment=${n.id}" target="_blank" rel="noopener"><div class="feedback-item-heading"><strong>${esc(n.clientName)}</strong><span class="tag ${n.resolved ? 'grey' : 'green'}">${n.resolved ? 'Resolved' : 'Open'}</span></div><p>${esc(n.body)}</p><blockquote>${esc(n.anchor.quote || n.anchor.targetText || 'Selected report area')}</blockquote><div class="feedback-meta"><span>${esc(n.authorName)} · ${esc(n.authorKind)}</span><span>${esc(n.anchor.period)} · ${esc(n.anchor.sheet)}</span></div><small>Open referenced area ${icon('arrow')}</small></a>`).join('') : '<div class="empty"><h2>No comments to review</h2><p>Employee and consultant annotations will appear here. Choose All comments to include resolved feedback.</p></div>';
        section.querySelector('#feedback-more').hidden = !next;
      } catch (error) { const root = section.querySelector('#feedback-list'); root.className = 'panel-body error'; root.textContent = error.message; }
      finally { loading = false; section.querySelector('#feedback-refresh').disabled = false; }
    }
    section.querySelector('#feedback-refresh').onclick = () => load(); section.querySelector('#feedback-status').onchange = () => load(); section.querySelector('#feedback-more').onclick = () => load(true); load();
  }
  return { mount };
}
