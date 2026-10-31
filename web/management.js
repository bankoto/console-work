export function createManagementUI(ctx) {
  const { api, send, esc, icon, tag, showModal, busy, toast } = ctx;
  function managerField(target) {
    const all = ctx.getTeam(), byId = new Map(all.map(t => [t.id, t]));
    const underTarget = person => {
      const seen = new Set(); let current = person;
      while (current && !seen.has(current.id)) {
        if (current.id === target?.id) return true;
        seen.add(current.id); current = byId.get(current.managerId);
      }
      return false;
    };
    const eligible = all.filter(t => t.kind === 'employee' && t.active && !underTarget(t));
    const oldManager = all.find(t => t.id === target?.managerId);
    return `<div class="field full"><label for="member-manager">Reports to (manager)</label><select id="member-manager" name="managerId"><option value="">No manager assigned</option>${eligible.map(t => `<option value="${esc(t.id)}" ${target?.managerId === t.id ? 'selected' : ''}>${esc(t.name)}${t.role === 'admin' ? ' · Administrator' : ''}</option>`).join('')}${oldManager && !eligible.some(t => t.id === oldManager.id) ? `<option value="${esc(oldManager.id)}" selected>${esc(oldManager.name)} · Inactive</option>` : ''}</select><p class="field-hint">Choose an employee to manage this person. The manager can view and download work for their team’s assigned clients. Direct client assignments control editing.</p></div>`;
  }
  function assignmentSummary(assignments) {
    const groups = new Map(), names = ctx.getNames();
    for (const a of assignments) {
      const name = a.clientName || ctx.getWorkspace().clients.find(c => c.id === a.clientId)?.name || 'Client';
      if (!groups.has(a.clientId)) groups.set(a.clientId, { name, modules: [] });
      groups.get(a.clientId).modules.push({ id: a.moduleId, label: names[a.moduleId] || a.moduleId });
    }
    if (!groups.size) return '<span class="muted">No clients assigned</span>';
    return `<div class="staff-client-list">${[...groups.entries()].map(([id, c]) => `<div><strong>${esc(c.name)}</strong><small>${c.modules.map(m => `<a class="cell-link" href="/console/${m.id}/${encodeURIComponent(id)}" data-route>${esc(m.label)}</a>`).join(' · ')}</small></div>`).join('')}</div>`;
  }
  async function assignClient(clientId) {
    const client = ctx.getWorkspace().clients.find(c => c.id === clientId); if (!client) return;
    let people;
    try { const result = await api('team'); ctx.setTeam(result.team); people = result.team.filter(t => t.role !== 'admin'); }
    catch (e) { toast(e.message); return; }
    const modules = ctx.getWorkspace().modules;
    const form = showModal('Assign staff to client', esc(client.name), `<p class="field-hint" style="margin-bottom:14px">Choose employees or consultants and select the modules they will work on for this client. Their other client assignments will stay in place.</p>${people.length ? `<div class="assignment-wrap"><table class="assignment-table"><thead><tr><th>EMPLOYEE / CONSULTANT</th>${modules.map(m => `<th>${esc(m.name)}</th>`).join('')}</tr></thead><tbody>${people.map(t => `<tr><td><strong>${esc(t.name)}</strong><small class="muted" style="display:block">${esc(t.kind === 'consultant' ? 'Consultant' : 'Employee')}${t.active ? '' : ' · Inactive'}</small>${t.managerName ? `<small class="muted" style="display:block">Manager: ${esc(t.managerName)}</small>` : ''}</td>${modules.map(m => `<td><input type="checkbox" name="client-assignment" data-person="${esc(t.id)}" value="${esc(m.id)}" aria-label="${esc(`${m.name} for ${t.name}`)}" ${t.assignments.some(a => a.clientId === clientId && a.moduleId === m.id) ? 'checked' : ''}></td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<div class="callout">No employees or consultants have been added yet. Add a team member to assign work to this client.</div>'}<button type="button" class="button" data-management-add-person="${esc(clientId)}" style="margin-top:16px">${icon('plus')} Add employee or consultant</button>`, `<button class="button primary" type="submit" ${people.length ? '' : 'disabled'}>Save client assignments</button>`);
    form.onsubmit = e => { e.preventDefault(); busy(form, async () => {
      const members = people.map(person => ({ userId: person.id, moduleIds: [...form.querySelectorAll('[name=client-assignment]:checked')].filter(el => el.dataset.person === person.id).map(el => el.value) }));
      await send('client-team', { clientId, members }, 'PATCH'); document.querySelector('#modal').close(); await ctx.refresh(); toast('Client staff assignments saved.');
    }); };
  }
  async function myTeamView() {
    const content = document.querySelector('#content');
    content.innerHTML = '<div class="page-heading"><div><div class="eyebrow">TEAM OVERVIEW</div><h1>Your team’s client work.</h1><p>View the clients and modules assigned to people reporting to you, including the teams below them.</p></div></div><div class="callout"><strong>Manager view</strong>You can view client work and download documents through your team. Ask an administrator for a direct assignment if you also need to edit.</div><section class="card"><div class="card-header"><div><h2>My team</h2><p>Client assignments follow the current reporting structure.</p></div></div><div id="managed-team-list" class="panel-body muted">Loading your team…</div></section>';
    try {
      const result = await api('my-team'), root = document.querySelector('#managed-team-list'); if (!root) return;
      root.className = 'table-wrap';
      root.innerHTML = result.team.length ? `<table><thead><tr><th>TEAM MEMBER</th><th>REPORTS TO</th><th>ASSIGNED CLIENTS & MODULES</th></tr></thead><tbody>${result.team.map(t => `<tr><td><strong>${esc(t.name)}</strong><small>${esc(t.specialty)} · ${esc(t.kind === 'consultant' ? 'Consultant' : 'Employee')}</small></td><td>${esc(t.managerName || '—')}<small>${t.directReport ? 'Reports directly to you' : 'Within your team'}</small></td><td>${assignmentSummary(t.assignments)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty"><h2>No team members assigned yet</h2><p>Your administrator can assign employees and consultants to you as their manager.</p></div>';
    } catch (e) { const root = document.querySelector('#managed-team-list'); if (root) { root.className = 'error'; root.textContent = e.message; } }
  }
  document.addEventListener('click', e => {
    const clientId = e.target.closest('[data-assign-client]')?.dataset.assignClient;
    if (clientId) assignClient(clientId);
    const addClient = e.target.closest('[data-management-add-person]')?.dataset.managementAddPerson;
    if (addClient) { document.querySelector('#modal').close(); ctx.openMember(null, addClient); }
  });
  return { managerField, assignmentSummary, assignClient, myTeamView };
}
