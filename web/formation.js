import { upload } from '@vercel/blob/client';

export function createFormationWorkspace(ctx) {
  const { api, send, esc, icon, tag, toast, busy, showModal, navigate } = ctx;
  let summary, detail, selectedArea = 'working', selectedFolder = '', filter = '', categoryFilter = '', routeClient = '', generation = 0, uploading = false;
  const date = value => value ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' }) : '—';
  const size = value => value < 1024 * 1024 ? `${Math.max(1, Math.round(value / 1024))} KB` : `${(value / (1024 * 1024)).toFixed(1)} MB`;
  const status = id => summary?.statuses.find(s => s.id === id) || { label: 'Not started', color: 'grey' };
  const statusTag = id => tag(status(id).label, status(id).color);
  const options = (items, value) => items.map(i => `<option value="${esc(i.id)}" ${i.id === value ? 'selected' : ''}>${esc(i.label)}</option>`).join('');
  const folderOptions = value => ['working', 'output'].map(area => `<optgroup label="${area === 'working' ? 'Working documents' : 'Output documents'}">${detail.folders.filter(f => f.area === area).map(f => `<option value="${f.id}" ${f.id === value ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</optgroup>`).join('');
  const defaultFolder = () => selectedFolder || detail.folders.find(f => f.area === selectedArea && f.systemFolder)?.id;
  const categories = value => `<label for="formation-category">Document category</label><input id="formation-category" name="category" list="formation-categories" value="${esc(value || '')}" placeholder="Choose or type a category" required maxlength="80"><datalist id="formation-categories">${summary.categories.map(c => `<option value="${esc(c)}"></option>`).join('')}</datalist>`;

  function view(clientId = '') {
    if (clientId !== routeClient) { selectedArea = 'working'; selectedFolder = ''; filter = ''; categoryFilter = ''; }
    routeClient = clientId;
    return `<div id="formation-root"><div class="page-heading"><div><div class="eyebrow">COMPANY FORMATION</div><h1>${clientId ? 'Incorporation workspace' : 'From paperwork to incorporated.'}</h1><p>Loading your client’s formation work…</p></div></div><div class="card empty">${icon('formation')}<p>Opening Company Formation…</p></div></div>`;
  }
  async function load(clientId = routeClient) {
    const current = ++generation, root = document.querySelector('#formation-root');
    try {
      const nextSummary = await api('formation');
      const nextDetail = clientId ? await api(`formation/case?clientId=${encodeURIComponent(clientId)}`) : null;
      if (current !== generation || !root?.isConnected) return;
      if (nextDetail?.job?.status === 'completed' && detail?.job?.id !== nextDetail.job.id) { selectedArea = 'output'; selectedFolder = ''; }
      summary = nextSummary; detail = nextDetail;
      root.innerHTML = clientId ? detailView() : listView();
      bindFilters();
    } catch (e) {
      if (current !== generation || !root?.isConnected) return;
      root.innerHTML = `<a class="back-link" href="/console/formation" data-route>${icon('back')} Company Formation</a><div class="card empty">${icon('lock')}<h2>Workspace unavailable</h2><p>${esc(e.message)}</p><button class="button" data-formation-action="reload">Try again</button></div>`;
    }
  }
  function listView() {
    const started = summary.clients.filter(c => c.id), completed = started.filter(c => c.status === 'completed');
    return `<div class="page-heading"><div><div class="eyebrow">COMPANY FORMATION</div><h1>From paperwork to incorporated.</h1><p>Keep client documents, incorporation progress and final outputs together.</p></div>${summary.clients.some(c => c.canEdit && !c.id) ? `<button class="button primary" data-formation-action="new-job">${icon('plus')} New incorporation</button>` : ''}</div>
      <section class="stats formation-stats" aria-label="Incorporation summary">
        ${[[started.length, 'Incorporation jobs', 'Across your assigned clients', 'formation'], [started.length - completed.length, 'In progress', 'Active incorporation work', 'clock'], [started.filter(c => c.status === 'action_required').length, 'Action required', 'Jobs needing attention', 'file'], [completed.length, 'Completed', 'Ready for final handover', 'check']].map(([n, label, desc, key]) => `<div class="stat"><div><p class="stat-label">${label}</p><p class="stat-value">${String(n).padStart(2, '0')}</p><p class="stat-desc">${desc}</p></div><span class="stat-icon ${key === 'check' ? 'teal' : ''}">${icon(key)}</span></div>`).join('')}
      </section><section class="card"><div class="card-header"><div><h2>Client incorporation work</h2><p>A clear status for every client, with documents in one place.</p></div>${tag('Private client files', 'green')}</div><div class="formation-toolbar"><div class="search">${icon('search')}<input id="formation-search" type="search" placeholder="Search client or company…" aria-label="Search incorporation clients"></div><select id="formation-status-filter" aria-label="Filter incorporation status"><option value="">All statuses</option>${options(summary.statuses, '')}</select></div><div id="formation-clients">${clientRows(summary.clients)}</div></section>`;
  }
  function clientRows(clients) {
    if (!clients.length) return `<div class="empty">${icon('formation')}<h2>${summary.clients.length ? 'No matching incorporation work' : 'Your next company starts here.'}</h2><p>${summary.clients.length ? 'Try another client name or status.' : ctx.getUser().role === 'admin' ? 'Add a client in Client directory, then start their incorporation workspace. Assign employees or consultants in Team members.' : 'Your administrator will assign clients to your Company Formation module.'}</p>${!summary.clients.length && ctx.getUser().role === 'admin' ? '<a class="button primary" href="/console/clients" data-route>Open client directory</a>' : ''}</div>`;
    return `<div class="table-wrap"><table><thead><tr><th>CLIENT / COMPANY</th><th>INCORPORATION STATUS</th><th>DOCUMENTS</th><th>TARGET DATE</th><th></th></tr></thead><tbody>${clients.map(c => `<tr><td><div class="client-cell"><span class="client-logo">${icon('formation')}</span><div><strong>${esc(c.companyName || c.clientName)}</strong><small>${esc(c.companyName ? c.clientName : c.industry || 'Client workspace')}</small></div></div></td><td>${statusTag(c.status)}${c.updatedAt ? `<small>Updated ${date(c.updatedAt)}</small>` : ''}</td><td>${c.fileCount} files<small>${c.outputCount} in Output</small></td><td>${date(c.dueDate)}</td><td><a class="cell-link" href="/console/formation/${encodeURIComponent(c.clientId)}" data-route>${c.id ? 'Open workspace' : c.canEdit ? 'Start work' : 'View client'} ${icon('arrow')}</a></td></tr>`).join('')}</tbody></table></div>`;
  }
  function detailView() {
    const { client, job, canEdit } = detail;
    const managerNotice = canEdit ? '' : '<div class="callout"><strong>Manager view</strong>You can view progress and download your team’s documents. Ask an administrator for a direct client assignment if you also need to edit.</div>';
    if (!job) return `<a class="back-link" href="/console/formation" data-route>${icon('back')} Company Formation</a><div class="page-heading"><div><div class="eyebrow">CLIENT INCORPORATION</div><h1>${esc(client.name)}</h1><p>${esc(client.industry || 'Client workspace')}</p></div>${statusTag('not_started')}</div>${managerNotice}<div class="card empty">${icon('formation')}<h2>${canEdit ? 'Start this client’s incorporation work.' : 'Incorporation work has not started yet.'}</h2><p>${canEdit ? 'Create their workspace to track progress, collect categorized documents and keep final documents in an Output folder.' : 'This workspace will show your team’s progress and documents once work begins.'}</p>${canEdit ? `<button class="button primary" data-formation-action="start-job">${icon('plus')} Create incorporation workspace</button>` : ''}</div>`;
    if (selectedFolder && !detail.folders.some(f => f.id === selectedFolder)) selectedFolder = '';
    const outputs = detail.files.filter(f => detail.folders.find(d => d.id === f.folderId)?.area === 'output').length;
    const completed = job.status === 'completed';
    return `<a class="back-link" href="/console/formation" data-route>${icon('back')} Company Formation</a>
      <div class="page-heading formation-job-heading"><div><div class="eyebrow">CLIENT INCORPORATION</div><h1>${esc(job.companyName)}</h1><p>${esc(client.name)} · Updated ${date(job.updatedAt)}</p></div>${canEdit ? `<div class="formation-heading-actions"><button class="button" data-formation-action="update-status">${icon('clock')} Update progress</button><button class="button primary" data-formation-action="upload">${icon('upload')} Upload files</button></div>` : ''}</div>${managerNotice}
      <section class="formation-progress-card"><div class="formation-status-main"><span class="formation-status-icon ${completed ? 'complete' : ''}">${icon(completed ? 'check' : 'formation')}</span><div><div class="eyebrow">CURRENT STATUS</div><h2>${esc(status(job.status).label)}</h2><p>${esc(job.latestNote || 'Keep this status up to date as the incorporation work progresses.')}</p></div></div><div class="formation-job-meta"><div><span>Target date</span><strong>${date(job.dueDate)}</strong></div><div><span>Registration number</span><strong>${esc(job.registrationNumber || 'Pending')}</strong></div><div><span>${completed ? 'Completed' : 'Started'}</span><strong>${date(completed ? job.completedAt : job.createdAt)}</strong></div></div></section>
      <div class="formation-output-banner ${completed ? 'is-complete' : ''}"><div class="formation-output-symbol">${icon('folder-check')}</div><div><strong>${completed ? 'Incorporation completed. Final documents live here.' : 'A dedicated home for the final documents.'}</strong><p>${outputs} ${outputs === 1 ? 'document' : 'documents'} in Output. ${canEdit ? 'Upload completed documents here, or move them from your working folders.' : 'Download completed documents from your team’s Output folder.'}</p></div><button class="button" data-formation-action="view-output">View Output ${icon('arrow')}</button></div>
      <section class="card formation-document-card"><div class="card-header"><div><h2>Client documents</h2><p>${canEdit ? 'Organize the paperwork. Keep the handover clear.' : 'View your team’s paperwork and completed documents.'}</p></div>${canEdit ? `<button class="button" data-formation-action="new-folder">${icon('plus')} New folder</button>` : ''}</div><div class="formation-files-layout"><aside class="formation-folder-nav" aria-label="Document folders">${folderNav()}</aside><div class="formation-files-main"><div class="formation-files-heading"><div><div class="eyebrow">${selectedArea === 'output' ? 'COMPLETED DOCUMENTS' : 'WORKING DOCUMENTS'}</div><h3 id="formation-folder-title">${esc(selectedFolder ? detail.folders.find(f => f.id === selectedFolder)?.name : selectedArea === 'output' ? 'Output documents' : 'Working documents')}</h3></div>${canEdit ? `<button class="button primary" data-formation-action="upload">${icon('upload')} Upload</button>` : ''}</div><div class="formation-file-filters"><div class="search">${icon('search')}<input id="formation-file-search" type="search" placeholder="Search documents…" aria-label="Search documents" value="${esc(filter)}"></div><select id="formation-category-filter" aria-label="Filter document category"><option value="">All categories</option>${[...new Set(detail.files.map(f => f.category))].sort().map(c => `<option value="${esc(c)}" ${categoryFilter === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div><div id="formation-file-list">${fileList()}</div></div></div></section>
      <section class="card formation-activity"><div class="card-header"><div><h2>Progress & activity</h2><p>A shared record of status updates and document work.</p></div>${icon('clock')}</div><ol>${detail.events.map(e => `<li><span class="formation-event-dot"></span><div><strong>${esc(e.message)}</strong>${e.note ? `<p>${esc(e.note)}</p>` : ''}<small>${esc(e.actorName || 'Workspace member')} · ${date(e.createdAt)}</small></div></li>`).join('')}</ol></section>`;
  }
  function folderNav() {
    return ['working', 'output'].map(area => `<div class="formation-folder-group"><button class="formation-folder-area ${selectedArea === area && !selectedFolder ? 'selected' : ''}" data-formation-area="${area}">${icon(area === 'output' ? 'folder-check' : 'folder')}<span>${area === 'output' ? 'Output documents' : 'Working documents'}</span><small>${detail.files.filter(f => detail.folders.find(d => d.id === f.folderId)?.area === area).length}</small></button>${detail.folders.filter(f => f.area === area && !f.systemFolder).map(f => `<button class="formation-folder-child ${selectedFolder === f.id ? 'selected' : ''}" data-formation-folder="${f.id}">${icon('folder')}<span>${esc(f.name)}</span><small>${detail.files.filter(file => file.folderId === f.id).length}</small></button>`).join('')}</div>`).join('') + '<p class="formation-folder-note">Files are private to your assigned client workspace. All documents can be downloaded.</p>';
  }
  function fileList() {
    const files = detail.files.filter(f => (selectedFolder ? f.folderId === selectedFolder : detail.folders.find(d => d.id === f.folderId)?.area === selectedArea) && (!filter || (f.filename + ' ' + f.category).toLowerCase().includes(filter.toLowerCase())) && (!categoryFilter || f.category === categoryFilter));
    if (!files.length) return `<div class="empty formation-files-empty">${icon(selectedArea === 'output' ? 'folder-check' : 'folder')}<h2>${filter || categoryFilter ? 'No matching documents' : selectedArea === 'output' ? 'Ready for the final handover.' : 'Keep the paperwork together.'}</h2><p>${filter || categoryFilter ? 'Try a different search or category.' : !detail.canEdit ? 'Your team has not uploaded documents to this folder yet.' : selectedArea === 'output' ? 'Store the incorporation certificate, registered documents and other completed deliverables here. Your team can download every file.' : 'Upload client documents and give each one a category. Create folders to organize the work your way.'}</p>${filter || categoryFilter || !detail.canEdit ? '' : '<button class="button" data-formation-action="upload">Upload documents</button>'}</div>`;
    return `<div class="table-wrap"><table class="formation-file-table"><thead><tr><th>DOCUMENT</th><th>CATEGORY</th><th>ADDED BY</th><th></th></tr></thead><tbody>${files.map(f => `<tr><td><div class="client-cell"><span class="formation-file-icon">${icon('file')}</span><div><strong title="${esc(f.filename)}">${esc(f.filename)}</strong><small>${size(f.size)} · ${date(f.uploadedAt)}</small></div></div></td><td><span class="tag grey">${esc(f.category)}</span></td><td>${esc(f.uploadedBy || 'Workspace member')}</td><td><div class="inline-actions"><a class="button" href="/api/console/formation/download?id=${f.id}" aria-label="Download ${esc(f.filename)}">${icon('download')} Download</a>${detail.canEdit ? `<button class="button" data-formation-edit-file="${f.id}" title="Change category or folder" aria-label="Organize ${esc(f.filename)}">${icon('settings')}</button>` : ''}</div></td></tr>`).join('')}</tbody></table></div>`;
  }
  function redrawDetail() { const root = document.querySelector('#formation-root'); if (root) { root.innerHTML = detailView(); bindFilters(); } }
  function bindFilters() {
    const clientSearch = document.querySelector('#formation-search'), statusSelect = document.querySelector('#formation-status-filter');
    const filterClients = () => { document.querySelector('#formation-clients').innerHTML = clientRows(summary.clients.filter(c => (!statusSelect.value || c.status === statusSelect.value) && `${c.clientName} ${c.companyName || ''}`.toLowerCase().includes(clientSearch.value.toLowerCase()))); };
    if (clientSearch) { clientSearch.oninput = filterClients; statusSelect.onchange = filterClients; }
    const fileSearch = document.querySelector('#formation-file-search'), categorySelect = document.querySelector('#formation-category-filter');
    const filterFiles = () => { filter = fileSearch.value; categoryFilter = categorySelect.value; document.querySelector('#formation-file-list').innerHTML = fileList(); };
    if (fileSearch) { fileSearch.oninput = filterFiles; categorySelect.onchange = filterFiles; }
  }
  function newJob(clientId) {
    const eligible = summary.clients.filter(c => c.canEdit && !c.id && (!clientId || c.clientId === clientId));
    if (!eligible.length) { toast('Each available client already has an incorporation workspace. Add another client in Client directory.'); return; }
    const form = showModal('Start an incorporation', 'Create a client workspace for documents and progress.', `<div class="field"><label for="formation-client">Client</label><select id="formation-client" name="clientId">${eligible.map(c => `<option value="${esc(c.clientId)}">${esc(c.clientName)}</option>`).join('')}</select></div><div class="field"><label for="formation-company">Proposed company name</label><input id="formation-company" name="companyName" required maxlength="180" value="${esc(eligible[0].clientName)}"></div><p class="field-hint">Working documents and Output documents folders will be created automatically.</p>`, '<button class="button primary" type="submit">Create workspace</button>');
    form.elements.clientId.onchange = () => { form.elements.companyName.value = eligible.find(c => c.clientId === form.elements.clientId.value)?.clientName || ''; };
    form.onsubmit = e => { e.preventDefault(); busy(form, async () => { const result = await send('formation/case', { clientId: form.elements.clientId.value, companyName: form.elements.companyName.value }); document.querySelector('#modal').close(); toast('Incorporation workspace created.'); navigate(`/console/formation/${encodeURIComponent(result.clientId)}`); }); };
  }
  function updateStatus() {
    if (!detail?.canEdit) return;
    const job = detail.job;
    const form = showModal('Update incorporation progress', detail.client.name, `<div class="field"><label for="formation-company-name">Proposed / registered company name</label><input id="formation-company-name" name="companyName" required maxlength="180" value="${esc(job.companyName)}"></div><div class="form-grid"><div class="field"><label for="formation-new-status">Incorporation status</label><select id="formation-new-status" name="status">${options(summary.statuses, job.status)}</select></div><div class="field"><label for="formation-due-date">Target date</label><input id="formation-due-date" name="dueDate" type="date" value="${esc(job.dueDate || '')}"></div></div><div class="field"><label for="formation-registration">Registration number <span class="muted">(optional)</span></label><input id="formation-registration" name="registrationNumber" maxlength="100" value="${esc(job.registrationNumber)}"></div><div class="field"><label for="formation-note">Progress update <span class="muted">(optional)</span></label><textarea id="formation-note" name="note" maxlength="2000" rows="3" placeholder="What has changed? What needs to happen next?">${esc(job.latestNote)}</textarea></div><p class="field-hint">When the job is completed, keep final deliverables in Output documents for your team to download.</p>`, '<button class="button primary" type="submit">Save progress</button>');
    form.onsubmit = e => { e.preventDefault(); busy(form, async () => { await send('formation/case', { id: job.id, version: job.version, companyName: form.elements.companyName.value, status: form.elements.status.value, dueDate: form.elements.dueDate.value, registrationNumber: form.elements.registrationNumber.value, note: form.elements.note.value }, 'PATCH'); if (form.elements.status.value === 'completed') { selectedArea = 'output'; selectedFolder = ''; } document.querySelector('#modal').close(); toast('Incorporation progress updated.'); await load(); }); };
  }
  function newFolder() {
    if (!detail?.canEdit) return;
    const form = showModal('Create a document folder', 'Organize this client’s incorporation files.', `<div class="field"><label for="formation-folder-name">Folder name</label><input id="formation-folder-name" name="name" required maxlength="80" placeholder="e.g. Directors’ documents"></div><div class="field"><label for="formation-folder-area">Folder area</label><select id="formation-folder-area" name="area"><option value="working" ${selectedArea === 'working' ? 'selected' : ''}>Working documents</option><option value="output" ${selectedArea === 'output' ? 'selected' : ''}>Output documents</option></select></div>`, '<button class="button primary" type="submit">Create folder</button>');
    form.onsubmit = e => { e.preventDefault(); busy(form, async () => { const area = form.elements.area.value, result = await send('formation/folder', { caseId: detail.job.id, name: form.elements.name.value, area }); selectedArea = area; selectedFolder = result.id; document.querySelector('#modal').close(); await load(); toast('Document folder created.'); }); };
  }
  function uploadFiles() {
    if (!detail?.canEdit) return;
    const form = showModal('Upload client documents', 'Add files to this client’s incorporation workspace.', `<div class="field"><label for="formation-file-input">Choose documents</label><input id="formation-file-input" name="files" type="file" multiple required accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.webp,.zip"><p class="field-hint">Up to 20 files at a time, 20 MB each. PDF, Office documents, spreadsheets, images, text and ZIP files.</p></div><div class="field"><label for="formation-upload-folder">Folder</label><select id="formation-upload-folder" name="folderId">${folderOptions(defaultFolder())}</select></div><div class="field">${categories(selectedArea === 'output' ? 'Registry documents' : 'Supporting documents')}</div><div id="formation-upload-progress" role="status" aria-live="polite"></div>`, `<button class="button primary" type="submit">${icon('upload')} Upload documents</button>`);
    const finished = new Set();
    form.onsubmit = e => { e.preventDefault(); busy(form, async () => {
      const files = [...form.elements.files.files].filter(f => !finished.has(f));
      if (!files.length) throw new Error('Choose at least one document to upload.');
      if (files.length > 20) throw new Error('Choose up to 20 files at a time.');
      if (files.some(f => f.size < 1 || f.size > summary.maxFileSize)) throw new Error('Each document must be between 1 byte and 20 MB.');
      const folderId = form.elements.folderId.value, category = form.elements.category.value, modal = document.querySelector('#modal'), progress = form.querySelector('#formation-upload-progress');
      uploading = true; modal.querySelectorAll('[data-close],input,select').forEach(el => { el.disabled = true; });
      try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i]; let reservation;
          progress.textContent = `Preparing ${i + 1} of ${files.length}: ${file.name}`;
          try {
            reservation = await send('formation/prepare-upload', { caseId: detail.job.id, folderId, category, filename: file.name, size: file.size });
            await upload(reservation.pathname, file, { access: 'private', contentType: reservation.contentType, handleUploadUrl: '/api/console/formation/upload-token', clientPayload: JSON.stringify({ uploadId: reservation.id }), onUploadProgress: p => { progress.textContent = `Uploading ${i + 1} of ${files.length}: ${file.name} · ${Math.round(p.percentage)}%`; } });
            await send('formation/finish-upload', { id: reservation.id });
            finished.add(file);
          } catch (error) {
            if (reservation) await send('formation/cancel-upload', { id: reservation.id }).catch(() => {});
            throw new Error(`${finished.size ? `${finished.size} document(s) already uploaded. ` : ''}${file.name}: ${error.message} You can retry the remaining files.`);
          }
        }
        modal.close(); await load(); toast(`${finished.size} document${finished.size === 1 ? '' : 's'} uploaded.`);
      } finally { uploading = false; modal.querySelectorAll('[data-close],input,select').forEach(el => { el.disabled = false; }); }
    }); };
  }
  function editFile(id) {
    if (!detail?.canEdit) return;
    const file = detail.files.find(f => f.id === id); if (!file) return;
    const output = detail.folders.find(f => f.area === 'output' && f.systemFolder);
    const form = showModal('Organize document', esc(file.filename), `<div class="field">${categories(file.category)}</div><div class="field"><label for="formation-edit-folder">Folder</label><select id="formation-edit-folder" name="folderId">${folderOptions(file.folderId)}</select></div><button class="button" type="button" id="formation-move-output">${icon('folder-check')} Move to Output documents</button><p class="field-hint" style="margin-top:10px">Keep completed deliverables in Output documents so your team can find and download the final files.</p>`, '<button class="button primary" type="submit">Save document</button>');
    form.querySelector('#formation-move-output').onclick = () => { form.elements.folderId.value = output.id; };
    form.onsubmit = e => { e.preventDefault(); busy(form, async () => { await send('formation/file', { id: file.id, category: form.elements.category.value, folderId: form.elements.folderId.value }, 'PATCH'); document.querySelector('#modal').close(); await load(); toast('Document category and folder updated.'); }); };
  }
  document.querySelector('#modal').addEventListener('cancel', e => { if (uploading) e.preventDefault(); });
  document.addEventListener('click', e => {
    const action = e.target.closest('[data-formation-action]')?.dataset.formationAction;
    if (action === 'new-job') newJob();
    else if (action === 'start-job') newJob(detail.client.id);
    else if (action === 'update-status') updateStatus();
    else if (action === 'upload') uploadFiles();
    else if (action === 'new-folder') newFolder();
    else if (action === 'reload') load();
    else if (action === 'view-output') { selectedArea = 'output'; selectedFolder = ''; filter = ''; categoryFilter = ''; redrawDetail(); document.querySelector('.formation-document-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    const area = e.target.closest('[data-formation-area]')?.dataset.formationArea;
    if (area) { selectedArea = area; selectedFolder = ''; filter = ''; categoryFilter = ''; redrawDetail(); }
    const folderId = e.target.closest('[data-formation-folder]')?.dataset.formationFolder;
    if (folderId) { selectedFolder = folderId; selectedArea = detail.folders.find(f => f.id === folderId).area; filter = ''; categoryFilter = ''; redrawDetail(); }
    const fileId = e.target.closest('[data-formation-edit-file]')?.dataset.formationEditFile;
    if (fileId) editFile(fileId);
  });
  return { view, load };
}
