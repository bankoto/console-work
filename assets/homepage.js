const slides = [...document.querySelectorAll('.platform-slide')];
const tabs = [...document.querySelectorAll('.platform-tab')];
const stage = document.querySelector('#platform-stage');
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
function icon(name, x, y, scale = 1) {
  return '<g transform="translate('+x+' '+y+') scale('+scale+')" fill="none" stroke="#5798c1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">'+icons[name]+'</g>';
}
function illustration(label, content) {
  return '<svg viewBox="0 0 620 520" role="img" aria-label="'+label+'"><defs><linearGradient id="surface-'+label.split(' ')[0]+'" x2="0" y2="1"><stop stop-color="#fff"/><stop offset="1" stop-color="#d8eaf7"/></linearGradient></defs>'+content+'</svg>';
}
const illustrations = [
  illustration('ERP illustration: invoicing ledger, inventory bars and payment tools.',
    '<ellipse cx="309" cy="418" rx="242" ry="27" fill="#d6e6f0" opacity=".45"/>'+
    '<rect x="65" y="103" width="446" height="302" rx="13" fill="#c6dce9" opacity=".35"/>'+
    '<rect x="65" y="94" width="446" height="302" rx="13" fill="#fff" stroke="#b5cfdf"/>'+
    '<path d="M65 140h446" stroke="#d7e4ec"/><circle cx="88" cy="117" r="4" fill="#83b6d7"/><circle cx="103" cy="117" r="4" fill="#bed8e9"/><circle cx="118" cy="117" r="4" fill="#dceaf3"/>'+
    '<text x="145" y="121" class="art-title">Business operations</text><text x="89" y="173" class="art-kicker">INVOICING</text>'+
    '<path d="M89 192h396M89 244h396M89 296h396M89 348h396" stroke="#e1eaf0"/>'+
    icon('invoice',92,208)+icon('invoice',92,260)+icon('invoice',92,312)+
    '<g stroke="#cfdee8" stroke-width="5" stroke-linecap="round"><path d="M134 214h106m-106 12h70M134 266h125m-125 12h83M134 318h92m-92 12h63"/></g>'+
    '<rect x="325" y="205" width="63" height="23" rx="11" fill="#eaf3fa"/><text x="356" y="221" text-anchor="middle" class="art-small">Draft</text>'+
    '<rect x="325" y="257" width="63" height="23" rx="11" fill="#dfeff9"/><text x="356" y="273" text-anchor="middle" class="art-small">Sent</text>'+
    '<rect x="361" y="291" width="185" height="155" rx="12" fill="#c8dde9" opacity=".4"/>'+
    '<rect x="361" y="283" width="185" height="155" rx="12" fill="url(#surface-ERP)" stroke="#a9c9de"/>'+icon('inventory',378,300)+
    '<text x="412" y="317" class="art-title">Inventory</text><path d="M382 413h141" stroke="#bdd3e2"/>'+
    '<rect x="386" y="372" width="20" height="40" rx="3" fill="#bddcef"/><rect x="419" y="351" width="20" height="61" rx="3" fill="#8bbddd"/><rect x="452" y="363" width="20" height="49" rx="3" fill="#a5cce5"/><rect x="485" y="335" width="20" height="77" rx="3" fill="#5798c1"/>'+
    '<rect x="88" y="376" width="229" height="59" rx="10" fill="#fff" stroke="#bdd4e3"/>'+icon('payments',104,394)+'<text x="139" y="410" class="art-title">Payments &amp; expenses</text>'),
  illustration('Console illustration: a client folder, assigned experts and specialist documents.',
    '<ellipse cx="316" cy="435" rx="231" ry="23" fill="#d6e6f0" opacity=".45"/>'+
    '<path d="M154 148q0-14 14-14h95l29 30h205q17 0 17 17v209q0 17-17 17H171q-17 0-17-17Z" fill="#c5deee" stroke="#a4c6dd"/>'+
    '<rect x="180" y="178" width="350" height="235" rx="12" fill="#d9e8f2" opacity=".5"/>'+
    '<rect x="180" y="170" width="350" height="235" rx="12" fill="#fff" stroke="#b2ccde"/>'+
    '<image href="/assets/bankoto-logo.jpeg" x="199" y="188" width="33" height="33"/><text x="246" y="211" class="art-title">Client workspace</text>'+
    '<path d="M201 235h306" stroke="#dfE9f0"/>'+icon('expenses',209,254)+'<text x="246" y="271" class="art-label">Accounting</text>'+icon('formation',209,301)+'<text x="246" y="318" class="art-label">Company formation</text>'+
    '<g fill="#dce9f2"><rect x="437" y="258" width="52" height="9" rx="4"/><rect x="437" y="305" width="52" height="9" rx="4"/></g>'+
    '<rect x="56" y="209" width="155" height="130" rx="12" fill="#c7deed" opacity=".4"/><rect x="56" y="201" width="155" height="130" rx="12" fill="url(#surface-Console)" stroke="#a5c6dd"/>'+
    '<text x="77" y="230" class="art-title">Assigned team</text><circle cx="90" cy="270" r="20" fill="#fff" stroke="#b9d3e4"/><circle cx="132" cy="270" r="20" fill="#fff" stroke="#b9d3e4"/><circle cx="174" cy="270" r="20" fill="#fff" stroke="#b9d3e4"/>'+
    icon('people',78,258)+icon('people',120,258)+icon('people',162,258)+'<text x="133" y="311" text-anchor="middle" class="art-small">Experts, connected</text>'+
    '<rect x="330" y="349" width="222" height="111" rx="11" fill="#d6e5ef" opacity=".5"/><rect x="330" y="341" width="222" height="111" rx="11" fill="#f9fcff" stroke="#a9c9df"/>'+icon('invoice',348,361)+
    '<text x="385" y="377" class="art-title">Client documents</text><path d="M352 398h174m-174 13h126m-126 13h148" stroke="#c6dbe9" stroke-width="4" stroke-linecap="round"/>'),
  illustration('Office illustration: an isometric toolkit with finance, people, sales and operations tools.',
    '<ellipse cx="310" cy="445" rx="225" ry="25" fill="#d4e5f0" opacity=".5"/>'+
    '<path d="m310 222 218 111v29L310 473 92 362v-29Z" fill="#c4ddec" opacity=".65"/><path d="m310 222 218 111-218 111L92 333Z" fill="#e8f3fa" stroke="#aacbe0"/>'+
    '<path d="m310 169 218 111v29L310 420 92 309v-29Z" fill="#d1e5f3" stroke="#b2d0e4"/><path d="m310 169 218 111-218 111L92 280Z" fill="#f4faff" stroke="#a8c9df"/>'+
    '<path d="m310 102 218 111v29L310 353 92 242v-29Z" fill="#d7eaf7" stroke="#a7c8df"/><path d="m310 102 218 111-218 111L92 213Z" fill="url(#surface-Office)" stroke="#91b9d4"/>'+
    '<path d="m202 158 218 111M310 102v222m-108-56 218-111" stroke="#c0d9e9"/>'+
    '<g transform="translate(281 126)"><rect width="58" height="46" rx="10" fill="#fff" stroke="#b8d2e3"/>'+icon('expenses',17,10)+'</g><text x="310" y="188" text-anchor="middle" class="art-small">Finance</text>'+
    '<g transform="translate(174 182)"><rect width="58" height="46" rx="10" fill="#fff" stroke="#b8d2e3"/>'+icon('people',17,10)+'</g><text x="203" y="244" text-anchor="middle" class="art-small">People</text>'+
    '<g transform="translate(388 182)"><rect width="58" height="46" rx="10" fill="#fff" stroke="#b8d2e3"/>'+icon('sales',17,10)+'</g><text x="417" y="244" text-anchor="middle" class="art-small">Sales</text>'+
    '<g transform="translate(281 237)"><rect width="58" height="46" rx="10" fill="#fff" stroke="#b8d2e3"/>'+icon('operations',17,10)+'</g><text x="310" y="300" text-anchor="middle" class="art-small">Operations</text>'+
    '<text x="310" y="382" text-anchor="middle" class="art-kicker">BANKOTO OFFICE</text><path d="m310 397 25 13-25 13-25-13Z" fill="#87b6d6" opacity=".6"/>')
];
document.querySelectorAll('.diagram-host').forEach((host, index) => { host.insertAdjacentHTML('beforeend', illustrations[index]); });
function schedule() {
  clearTimeout(timer);
  if (!autoplay || hovering || document.hidden) return;
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
document.querySelector('.platform-menu').addEventListener('focusin', () => { autoplay = false; updatePlayback(); schedule(); });
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
