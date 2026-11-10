const slides = [...document.querySelectorAll('.platform-slide')];
const tabs = [...document.querySelectorAll('.platform-tab')];
const stage = document.querySelector('#platform-stage');
const progress = document.querySelector('.cycle-track');
const rotation = document.querySelector('#rotation-toggle');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let current = Math.max(0, slides.findIndex(slide => slide.dataset.platform === location.hash.slice(1)));
let autoplay = !reducedMotion.matches, timer, hovering = false;
const icons = {
  invoice: '<path d="M7 3h10v18l-3-2-3 2-3-2-3 2V5a2 2 0 0 1 2-2Z"/><path d="M8 8h6m-6 4h6"/>',
  inventory: '<path d="m3 7 9-4 9 4-9 4-9-4Zm0 0v10l9 4 9-4V7m-9 4v10M7 5l10 4"/>',
  expenses: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h8m-8 5h2m4 0h2m-8 4h2m4 0h2"/>',
  payments: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/>',
  clients: '<path d="M4 21V6l8-3v18M12 8h8v13M2 21h20M7 8h2m-2 4h2m-2 4h2m7-4h1m-1 4h1"/>',
  experts: '<circle cx="9" cy="7" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2"/>',
  formation: '<path d="m12 3 8 4v13H4V7l8-4Zm-4 8h1m6 0h1M8 15h1m6 0h1m-6 5v-5h4v5"/>',
  people: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  sales: '<path d="M4 20h16M6 16v-4m6 4V8m6 8V4M4 9l6-5 5 2 5-4"/>',
  operations: '<path d="M4 5h16M4 12h16M4 19h16"/><circle cx="9" cy="5" r="2" fill="#fff"/><circle cx="16" cy="12" r="2" fill="#fff"/><circle cx="8" cy="19" r="2" fill="#fff"/>',
};
const models = [
  { core: 'Business core', nodes: [['Invoicing','invoice'],['Inventory','inventory'],['Expenses','expenses'],['Payments','payments']] },
  { core: 'Client workspace', nodes: [['Clients','clients'],['Experts','experts'],['Accounting','expenses'],['Formation','formation']] },
  { core: 'Agentic tools', nodes: [['Finance','expenses'],['People','people'],['Sales','sales'],['Operations','operations']] },
];
function diagram(model, index) {
  const centers = [[151,166],[463,166],[463,376],[151,376]];
  const nodes = model.nodes.map(([label, icon], i) => {
    const [x,y] = centers[i];
    return `<g transform="translate(${x-69} ${y-38})"><rect x="0" y="5" width="138" height="76" rx="7" fill="#c7dfea" opacity=".2"/><rect width="138" height="76" rx="7" fill="#fff" stroke="#cbdde9"/><text x="13" y="17" class="diagram-node-id">0${i+1}</text><g transform="translate(57 14)" fill="none" stroke="#5798c1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${icons[icon]}</g><text x="69" y="61" text-anchor="middle" class="diagram-node-label">${label}</text></g>`;
  }).join('');
  return `<svg viewBox="0 0 620 520" role="img" aria-label="Illustrated ${['Bankoto ERP','Bankoto Console','Bankoto Office'][index]} workflow: ${model.nodes.map(n=>n[0]).join(', ')} connected through ${model.core.toLowerCase()}."><defs><radialGradient id="glow-${index}"><stop stop-color="#b9d8ed" stop-opacity=".5"/><stop offset="1" stop-color="#e9f4fc" stop-opacity="0"/></radialGradient></defs>
    <ellipse cx="308" cy="283" rx="223" ry="186" fill="url(#glow-${index})"/><g fill="none" stroke="#bfd5e4" stroke-width=".8"><ellipse cx="308" cy="283" rx="235" ry="110" transform="rotate(-31 308 283)"/><ellipse cx="308" cy="283" rx="235" ry="110" transform="rotate(31 308 283)"/><ellipse cx="308" cy="283" rx="184" ry="179"/><ellipse cx="308" cy="283" rx="206" ry="61"/><path d="M308 66v425M62 283h492" stroke-dasharray="3 7"/><path d="m299 72 9-6 9 6m232 202 6 9-6 9M299 485l9 6 9-6"/></g>
    <g stroke="#88b7d5" fill="none" stroke-width="1.2"><path d="m151 166 157 117 155-117M151 376l157-93 155 93"/><path d="m151 166 157 117 155-117M151 376l157-93 155 93" stroke="#4a93c4" class="diagram-flow"/></g>
    <g fill="#6ca7cc"><circle cx="230" cy="224" r="3" class="diagram-pulse"/><circle cx="384" cy="225" r="3" class="diagram-pulse"/><circle cx="230" cy="330" r="3"/><circle cx="385" cy="329" r="3"/></g>${nodes}
    <g><rect x="237" y="228" width="144" height="116" rx="10" fill="#bed8e8" opacity=".3"/><rect x="237" y="222" width="144" height="116" rx="10" fill="#fff" stroke="#91bad5"/><path d="M250 235h8m-8 0v8m118-8h-8m8 0v8M250 325h8m-8 0v-8m118 8h-8m8 0v-8" stroke="#b3cddd" fill="none"/><image href="/assets/bankoto-logo.jpeg" x="285" y="230" width="48" height="48"/><text x="309" y="295" text-anchor="middle" class="diagram-core-label">${model.core}</text><text x="309" y="315" text-anchor="middle" class="diagram-node-id">BANKOTO / 0${index+1}</text></g>
    <g class="diagram-coordinate"><text x="302" y="56">Y</text><text x="562" y="286">X</text><text x="60" y="460">FIG. 0${index+1}</text><text x="473" y="460">WORKFLOW MAP</text></g></svg>`;
}
document.querySelectorAll('.diagram-host').forEach((host, index) => { host.insertAdjacentHTML('beforeend', diagram(models[index], index)); });
function schedule() {
  clearTimeout(timer); progress.classList.remove('running','paused');
  if (!autoplay) return;
  void progress.offsetWidth; progress.classList.add('running');
  if (hovering || document.hidden) { progress.classList.add('paused'); return; }
  timer = setTimeout(() => selectSlide((current + 1) % slides.length, false), 9000);
}
function updatePlayback() {
  rotation.setAttribute('aria-label', autoplay ? 'Pause slideshow' : 'Play slideshow');
  rotation.setAttribute('aria-pressed', String(!autoplay));
  rotation.innerHTML = `<span class="rotation-symbol" aria-hidden="true">${autoplay ? 'Ⅱ' : '▶'}</span><span>${autoplay ? 'PAUSE' : 'PLAY'}</span>`;
  stage.setAttribute('aria-live', autoplay ? 'off' : 'polite');
}
function selectSlide(index, manual = true) {
  current = (index + slides.length) % slides.length;
  if (manual) autoplay = false;
  slides.forEach((slide, i) => { slide.hidden = i !== current; slide.classList.toggle('is-active', i === current); });
  tabs.forEach((tab, i) => { tab.setAttribute('aria-selected', String(i === current)); tab.tabIndex = i === current ? 0 : -1; });
  document.querySelector('#slide-current').textContent = String(current + 1).padStart(2,'0');
  if (manual) history.replaceState({},'',`#${slides[current].dataset.platform}`);
  document.querySelector('.platform-menu').open = false;
  updatePlayback(); schedule();
}
document.querySelectorAll('[data-slide]').forEach(button => button.addEventListener('click', () => selectSlide(Number(button.dataset.slide))));
document.querySelector('#previous-platform').onclick = () => selectSlide(current - 1);
document.querySelector('#next-platform').onclick = () => selectSlide(current + 1);
rotation.onclick = () => { autoplay = !autoplay; updatePlayback(); schedule(); };
document.querySelector('.platform-tabs').addEventListener('keydown', event => {
  const keys = { ArrowDown:1, ArrowRight:1, ArrowUp:-1, ArrowLeft:-1 };
  if (event.key in keys) { event.preventDefault(); selectSlide(current + keys[event.key]); tabs[current].focus(); }
  else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); selectSlide(event.key === 'Home' ? 0 : slides.length - 1); tabs[current].focus(); }
});
stage.addEventListener('mouseenter', () => { hovering = true; schedule(); });
stage.addEventListener('mouseleave', () => { hovering = false; schedule(); });
document.querySelector('.showcase').addEventListener('focusin', () => { autoplay = false; updatePlayback(); schedule(); });
document.addEventListener('visibilitychange', schedule);
reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) { autoplay = false; updatePlayback(); schedule(); } });
window.addEventListener('hashchange', () => { const index = slides.findIndex(slide=>slide.dataset.platform === location.hash.slice(1)); if(index>=0)selectSlide(index); });
const company = document.querySelector('#company-dialog');
document.querySelector('#about-bankoto').onclick = () => { autoplay=false;updatePlayback();schedule();company.showModal(); };
document.querySelector('#close-company').onclick = () => company.close();
company.addEventListener('click', event => { if(event.target===company){const rect=company.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)company.close();} });
document.addEventListener('click', event => { const menu=document.querySelector('.platform-menu');if(menu.open&&!menu.contains(event.target))menu.open=false; });
selectSlide(current, false);

const compactNavigation=matchMedia('(max-width: 900px)');
function syncNavigation(){document.querySelector('.platform-tabs').setAttribute('aria-orientation',compactNavigation.matches?'horizontal':'vertical');}
compactNavigation.addEventListener('change',syncNavigation);syncNavigation();
