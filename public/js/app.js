// App shell: session, sidebar, topbar, command palette, router, tooltips.
import { api, get, setToken, hasToken } from './api.js';
import { html, raw, ic, esc, initials, avatarColor, loadingSkeleton, errorBox, toast, animateNumbers } from './ui.js';
import { icon } from './icons.js';
import { sfx, setSound, soundOn } from './sound.js';
import { HELP } from './help.js';

export const session = { user: null, company: null, masters: null, meta: null };
export const can = (p) => !!session.user && (Array.isArray(p) ? p.some((x) => session.user.perms.includes(x)) : session.user.perms.includes(p));

/** Masters (products, parties, species…) cached for the session; refresh after edits. */
export async function masters(force = false) {
  if (!session.masters || force) session.masters = await get('/api/masters');
  return session.masters;
}
export function speciesColor(id) { const s = session.masters?.species.find((x) => x.id === id); return s ? s.color : '#c49a6c'; }

const NAV = [
  { group: 'Overview' },
  { id: 'dashboard', label: 'Home', icon: 'dashboard', perm: 'dashboard' },
  { id: 'approvals', label: 'Approvals', icon: 'approve', perm: ['inventory.approve', 'finance.approve', 'audit.view'], badge: 'approvals' },
  { id: 'reports', label: 'Reports', icon: 'chart', perm: ['finance.view', 'sales.view', 'production.view', 'inventory.view', 'yard.view'] },
  { group: 'Operations' },
  { id: 'yard', label: 'Logs in (yard)', icon: 'log', perm: 'yard.view' },
  { id: 'production', label: 'Production', icon: 'factory', perm: 'production.view' },
  { id: 'inventory', label: 'Plywood stock', icon: 'boxes', perm: 'inventory.view', badge: 'countDue' },
  { id: 'stores', label: 'Stores', icon: 'tag', perm: 'stores.view', badge: 'storesLow' },
  { id: 'dispatch', label: 'Dispatch', icon: 'truck', perm: 'dispatch.view', badge: 'toDispatch' },
  { group: 'Sales' },
  { id: 'orders', label: 'Orders', icon: 'cart', perm: 'sales.view', badge: 'ordersToApprove' },
  { id: 'enquiries', label: 'Website enquiries', icon: 'send', perm: 'sales.view', badge: 'enquiries' },
  { id: 'distributors', label: 'Distributors', icon: 'store', perm: ['sales.view', 'finance.view'] },
  { group: 'Accounts' },
  { id: 'finance', label: 'Accounts', icon: 'wallet', perm: 'finance.view' },
  { group: 'Setup' },
  { id: 'masters', label: 'Products & parties', icon: 'layers', perm: 'masters.view' },
  { id: 'admin', label: 'Users & history', icon: 'shield', perm: ['admin.users', 'audit.view'] },
];
const QUICK = [
  { label: 'Logs arrived', sub: 'Truck or container at the yard', icon: 'log', perm: 'yard.edit', href: '#/yard?new=1' },
  { label: 'Start peeling', sub: 'Send logs to production', icon: 'factory', perm: 'production.edit', href: '#/production?new=1' },
  { label: 'Stock count', sub: 'Monday & Thursday count', icon: 'boxes', perm: 'inventory.edit', href: '#/inventory?tab=count&new=1' },
  { label: 'Store item issued', sub: 'Glue, blades, gloves…', icon: 'tag', perm: 'stores.edit', href: '#/stores?new=issue' },
  { label: 'Distributor order', sub: 'Sheets, priced per sq ft', icon: 'cart', perm: 'sales.edit', href: '#/orders?new=1' },
  { label: 'Money received', sub: 'Payment from distributor', icon: 'receipt', perm: 'finance.edit', href: '#/finance?tab=receipts&new=receipt' },
  { label: 'Send to Tally', sub: 'Export vouchers', icon: 'download', perm: 'tally.export', href: '#/finance?tab=tally' },
];

const ROUTES = {
  login: () => import('./pages/login.js'),
  dashboard: () => import('./pages/dashboard.js'),
  approvals: () => import('./pages/approvals.js'),
  reports: () => import('./pages/reports.js'),
  yard: () => import('./pages/yard.js'),
  production: () => import('./pages/production.js'),
  inventory: () => import('./pages/inventory.js'),
  stores: () => import('./pages/stores.js'),
  dispatch: () => import('./pages/dispatch.js'),
  orders: () => import('./pages/orders.js'),
  distributors: () => import('./pages/distributors.js'),
  finance: () => import('./pages/finance.js'),
  invoice: () => import('./pages/invoice.js'),
  masters: () => import('./pages/masters.js'),
  admin: () => import('./pages/admin.js'),
  enquiries: () => import('./pages/enquiries.js'),
};
const SHORT = { dashboard: 'Home', yard: 'Yard', inventory: 'Stock', finance: 'Accounts', distributors: 'Parties', approvals: 'Approvals' };
const TITLES = { dashboard: 'Home', approvals: 'Approvals', reports: 'Reports', yard: 'Logs in (yard)', production: 'Production', inventory: 'Plywood stock', stores: 'Stores', dispatch: 'Dispatch', orders: 'Orders', enquiries: 'Website enquiries', distributors: 'Distributors', finance: 'Accounts', invoice: 'Invoice', masters: 'Products & parties', admin: 'Users & history' };

export function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qstr] = h.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  return { page: parts[0] || '', id: parts[1] || null, sub: parts[2] || null, query: new URLSearchParams(qstr || '') };
}
export const go = (hash) => { if (location.hash === hash) render(); else location.hash = hash; };

const root = document.getElementById('root');
let shellMounted = false;
let renderSeq = 0;
let lastPage = null;

const BOTTOM = {
  owner: ['dashboard', 'approvals', 'finance', 'reports'],
  accounts: ['dashboard', 'orders', 'finance', 'distributors'],
  production: ['dashboard', 'yard', 'production', 'inventory'],
};
const ROLE_TONE = { owner: 'md', accounts: 'acc', production: 'prod' };

function shell() {
  const u = session.user;
  const quick = QUICK.filter((q) => can(q.perm));
  const tone = ROLE_TONE[u.role] || 'md';
  root.innerHTML = `
  <div class="app">
    <aside class="sidebar" id="sidebar" aria-label="Menu">
      <div class="sb-top">
        <a class="brand" href="#/dashboard"><img src="/img/logo.svg" alt=""><div class="brand-t"><div class="bt">${esc(session.company?.short || 'Raajply')}</div><div class="bs">Plywood ERP · Magadi</div></div></a>
        <button class="icon-btn sb-rail" id="railBtn" aria-label="Collapse menu" data-tip-side="Collapse menu">${icon('chevronLeft', 'sm')}</button>
        <button class="icon-btn sb-close" id="closeSb" aria-label="Close menu">${icon('x')}</button>
      </div>
      <div class="sb-role tone-${tone}">
        <span class="avatar">${esc(initials(u.name))}</span>
        <div class="sr-t"><b>${esc(u.name)}</b><span>${esc(u.roleName)}</span></div>
        <button class="sr-switch" id="switchRole" title="Switch demo role">${icon('swap', 'sm')}<span>Switch</span></button>
      </div>
      <button class="sb-search" id="sbSearch">${icon('search', 'sm')}<span>Search…</span><kbd>⌘K</kbd></button>
      <nav class="nav" id="nav" aria-label="Main"></nav>
      <div class="sb-foot">
        <button class="sf-btn" id="soundBtn" aria-pressed="${soundOn()}">${icon('bell', 'sm')}<span>Sounds</span><span class="sw-pill" data-on="${soundOn()}"></span></button>
        <button class="sf-btn" id="bigBtn" aria-pressed="${document.documentElement.classList.contains('big')}">${icon('eye', 'sm')}<span>Bigger text</span><span class="sw-pill" data-on="${document.documentElement.classList.contains('big')}"></span></button>
        <button class="sf-btn out" id="logoutBtn">${icon('logout', 'sm')}<span>Sign out</span></button>
      </div>
    </aside>
    <div class="scrim" id="scrim"></div>
    <div class="main"><div class="panel">
      <header class="topbar">
        <button class="icon-btn menu-btn" id="menuBtn" aria-label="Open menu">${icon('menu')}</button>
        <div class="where" id="where"></div>
        <button class="search-btn" id="searchBtn" aria-label="Search">${icon('search', 'sm')}<span>Search or jump to…</span><kbd>⌘K</kbd></button>
        <div class="top-right">
          ${session.company?.demo ? '<span class="demo-pill">Demo data</span>' : ''}
          <button class="icon-btn help-btn" id="helpBtn" aria-label="Help for this page"><b>?</b><span>Help</span></button>
          <a class="icon-btn" href="#/approvals" id="bell" aria-label="Notifications">${icon('bell')}</a>
          ${quick.length ? `<div class="quick-wrap"><button class="btn primary" id="quickBtn" aria-haspopup="true">${icon('plus', 'sm')} New</button>
            <div class="menu hidden" id="quickMenu">${quick.map((q) => `<a href="${q.href}">${icon(q.icon, 'sm')}<span><div>${esc(q.label)}</div><div class="small muted">${esc(q.sub)}</div></span></a>`).join('')}</div></div>` : ''}
          <button class="top-avatar tone-${tone}" id="topAvatar" aria-label="Open menu">${esc(initials(u.name))}</button>
        </div>
      </header>
      <main class="content" id="page" tabindex="-1"></main>
    </div></div>
    <nav class="bottom-nav" id="bottomNav" aria-label="Quick navigation"></nav>
    ${quick.length ? `<button class="fab" id="fab" aria-label="New entry">${icon('plus')}</button>` : ''}
  </div>`;
  shellMounted = true;
  renderNav();
  try { if (localStorage.getItem('raajply-rail') === '1') document.documentElement.classList.add('rail'); } catch { /* ignore */ }
  const $ = (id) => document.getElementById(id);
  $('menuBtn').onclick = (e) => { e.stopPropagation(); openDrawer(); };
  $('topAvatar').onclick = (e) => { e.stopPropagation(); openDrawer(); };
  $('closeSb').onclick = () => closeDrawer();
  $('scrim').onclick = () => closeDrawer();
  $('railBtn').onclick = () => { const on = !document.documentElement.classList.contains('rail'); document.documentElement.classList.toggle('rail', on); try { localStorage.setItem('raajply-rail', on ? '1' : '0'); } catch { /* ignore */ } sfx(on ? 'drawerClose' : 'drawerOpen'); };
  const qb = $('quickBtn'), qm = $('quickMenu');
  if (qb) qb.onclick = (e) => { e.stopPropagation(); const open = qm.classList.contains('hidden'); document.querySelectorAll('.menu').forEach((x) => x.classList.add('hidden')); if (open) { qm.classList.remove('hidden'); sfx('open'); } };
  if ($('fab')) $('fab').onclick = () => openSheet('Start something new', `<div class="sheet-list">${quick.map((q, i) => `<a href="${q.href}" style="--i:${i}"><span class="sl-ic">${icon(q.icon)}</span><span><b>${esc(q.label)}</b><small>${esc(q.sub)}</small></span>${icon('chevronRight', 'sm')}</a>`).join('')}</div>`);
  $('logoutBtn').onclick = logout;
  $('switchRole').onclick = logout;
  $('searchBtn').onclick = openPalette;
  $('sbSearch').onclick = () => { closeDrawer(true); openPalette(); };
  $('helpBtn').onclick = openHelp;
  const pill = (id, on) => { const b = $(id); b.setAttribute('aria-pressed', String(on)); b.querySelector('.sw-pill').dataset.on = String(on); };
  $('soundBtn').onclick = (e) => { e.stopPropagation(); setSound(!soundOn()); pill('soundBtn', soundOn()); };
  $('bigBtn').onclick = (e) => { e.stopPropagation(); const on = !document.documentElement.classList.contains('big'); document.documentElement.classList.toggle('big', on); try { localStorage.setItem('raajply-big', on ? '1' : '0'); } catch { /* ignore */ } pill('bigBtn', on); sfx('toggle'); };
  swipeDrawer();
  refreshBadges();
}

// ---------- Phone drawer ----------
const isPhone = () => matchMedia('(max-width: 960px)').matches;
function openDrawer() {
  const sb = document.getElementById('sidebar');
  if (!sb || sb.classList.contains('open')) return;
  sb.classList.add('open'); document.getElementById('scrim').classList.add('on');
  document.body.classList.add('lock');
  sfx('drawerOpen');
}
function closeDrawer(silent) {
  const sb = document.getElementById('sidebar');
  if (!sb || !sb.classList.contains('open')) return;
  sb.classList.remove('open'); sb.style.transform = '';
  document.getElementById('scrim')?.classList.remove('on');
  document.body.classList.remove('lock');
  if (!silent) sfx('drawerClose');
}
/** Swipe left on the drawer to close it; swipe right from the left edge to open it. */
function swipeDrawer() {
  const sb = document.getElementById('sidebar');
  let x0 = null, y0 = 0, dx = 0, fromEdge = false;
  sb.addEventListener('touchstart', (e) => { if (!sb.classList.contains('open')) return; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; sb.style.transition = 'none'; }, { passive: true });
  sb.addEventListener('touchmove', (e) => { if (x0 === null) return; dx = Math.min(0, e.touches[0].clientX - x0); if (Math.abs(e.touches[0].clientY - y0) > Math.abs(dx) && dx > -10) return; sb.style.transform = `translateX(${dx}px)`; }, { passive: true });
  sb.addEventListener('touchend', () => { if (x0 === null) return; sb.style.transition = ''; sb.style.transform = ''; if (dx < -70) closeDrawer(); x0 = null; });
  document.addEventListener('touchstart', (e) => { fromEdge = isPhone() && e.touches[0].clientX < 18 && !sb.classList.contains('open'); x0 = fromEdge ? e.touches[0].clientX : x0; }, { passive: true });
  document.addEventListener('touchend', (e) => { if (fromEdge && e.changedTouches[0].clientX - x0 > 60) openDrawer(); fromEdge = false; }, { passive: true });
}

// ---------- Bottom sheet (phones) ----------
export function openSheet(title, bodyHtml) {
  document.querySelectorAll('.sheet-bg, .modal-bg, .help-bg, .cmdk-bg').forEach((x) => x.remove());
  document.body.classList.remove('lock');
  const bg = document.createElement('div');
  bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet" role="dialog" aria-label="${esc(title)}"><div class="sheet-grab"></div><div class="sheet-h"><h3>${esc(title)}</h3><button class="icon-btn" data-x aria-label="Close">${icon('x')}</button></div><div class="sheet-b">${bodyHtml}</div></div>`;
  document.body.appendChild(bg);
  document.body.classList.add('lock');
  sfx('sheetUp');
  const sheet = bg.querySelector('.sheet');
  const close = () => { if (!bg.isConnected) return; bg.classList.add('closing'); sfx('close'); document.body.classList.remove('lock'); setTimeout(() => bg.remove(), 240); };
  bg.addEventListener('click', (e) => { if (e.target === bg || e.target.closest('[data-x]') || e.target.closest('.sheet-b a')) close(); });
  let y0 = null, dy = 0;
  sheet.addEventListener('touchstart', (e) => { if (sheet.querySelector('.sheet-b').scrollTop > 0) return; y0 = e.touches[0].clientY; dy = 0; sheet.style.transition = 'none'; }, { passive: true });
  sheet.addEventListener('touchmove', (e) => { if (y0 === null) return; dy = Math.max(0, e.touches[0].clientY - y0); sheet.style.transform = `translateY(${dy}px)`; }, { passive: true });
  sheet.addEventListener('touchend', () => { if (y0 === null) return; sheet.style.transition = ''; sheet.style.transform = ''; if (dy > 90) close(); y0 = null; });
  return { close, el: bg };
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.menu') && !e.target.closest('#quickBtn')) document.querySelectorAll('.menu').forEach((m) => m.classList.add('hidden'));
  if (e.target.closest('.menu a')) document.querySelectorAll('.menu').forEach((m) => m.classList.add('hidden'));
  const sb = document.getElementById('sidebar');
  if (sb && sb.classList.contains('open') && e.target.closest('#sidebar .nav a, #sidebar .brand')) closeDrawer(true);
  // Sounds: a different voice for each kind of control
  if (e.target.closest('.nav a, .bottom-nav a')) sfx('nav');
  else if (e.target.closest('.tab')) sfx('tab');
  else if (e.target.closest('.chip, th.sortable, .seg button')) sfx('chip');
  else if (e.target.closest('#refresh')) sfx('refresh');
  else if (e.target.closest('.btn, .cmdk-item, .alert-item, .rank-row, .action-tile, tr.click, .icon-btn, .strip a[href], a.kpi, .sheet-list a, .fab')) sfx('tap');
  // CSP-friendly behaviours (no inline handlers): print buttons and clickable rows
  if (e.target.closest('[data-print]')) { window.print(); return; }
  const row = e.target.closest('[data-href]');
  if (row && !e.target.closest('a,button,input,select')) location.hash = row.dataset.href;
});
// Soft hover tick on desktop for navigation and big tiles
let hoverEl = null;
document.addEventListener('mouseover', (e) => {
  const t = e.target.closest && e.target.closest('.nav a, .action-tile, .role-pick, .tab');
  if (t && t !== hoverEl) { hoverEl = t; sfx('hover'); } else if (!t) hoverEl = null;
});

let badgeData = {};
function renderNav() {
  const { page } = parseHash();
  const items = [];
  let pendingGroup = null;
  for (const n of NAV) {
    if (n.group) { pendingGroup = n.group; continue; }
    if (!can(n.perm)) continue;
    if (pendingGroup) { items.push(`<div class="nav-group">${esc(pendingGroup)}</div>`); pendingGroup = null; }
    const active = page === n.id || (page === 'invoice' && n.id === 'finance');
    const b = n.badge && badgeData[n.badge] ? `<span class="badge">${badgeData[n.badge]}</span>` : '';
    items.push(`<a href="#/${n.id}" class="${active ? 'active' : ''}" ${active ? 'aria-current="page"' : ''}>${icon(n.icon)}<span>${esc(n.label)}</span>${b}</a>`);
  }
  document.getElementById('nav').innerHTML = items.join('');
  const bn = document.getElementById('bottomNav');
  if (bn) {
    const ids = (BOTTOM[session.user.role] || BOTTOM.owner).map((id) => NAV.find((n) => n.id === id)).filter((n) => n && can(n.perm));
    bn.innerHTML = ids.map((n) => { const active = page === n.id || (page === 'invoice' && n.id === 'finance'); const b = n.badge && badgeData[n.badge] ? `<i class="bn-badge">${badgeData[n.badge]}</i>` : ''; return `<a href="#/${n.id}" class="${active ? 'on' : ''}">${icon(n.icon)}${b}<span>${esc(SHORT[n.id] || n.label)}</span></a>`; }).join('')
      + `<button type="button" id="bnMore" class="${ids.some((n) => n.id === page || (page === 'invoice' && n.id === 'finance')) ? '' : 'on'}">${icon('menu')}<span>More</span></button>`;
    bn.querySelector('#bnMore').onclick = (e) => { e.stopPropagation(); openDrawer(); };
  }
  const r = parseHash();
  const w = document.getElementById('where');
  if (w) w.innerHTML = `<span class="w-co">${esc(session.company?.short || '')}</span>${icon('chevronRight', 'sm w-sep')}${r.id ? `<a href="#/${esc(r.page === 'invoice' ? 'finance?tab=invoices' : r.page)}" class="w-back" aria-label="Back">${icon('chevronLeft', 'sm')}</a>` : ''}<b>${esc(TITLES[r.page] || '')}</b>${r.id ? `${icon('chevronRight', 'sm w-sep2')}<span class="mono w-id">${esc(r.id)}</span>` : ''}`;
}
export async function refreshBadges() {
  try {
    const prevTotal = badgeData.total;
    badgeData = await get('/api/notifications');
    if (prevTotal !== undefined && badgeData.total > prevTotal) sfx('notify');
    renderNav();
    const bell = document.getElementById('bell');
    if (bell) bell.innerHTML = icon('bell') + (badgeData.total ? `<span class="dot">${badgeData.total}</span>` : '');
    const ta = document.getElementById('topAvatar');
    if (ta) ta.classList.toggle('has-dot', !!badgeData.total);
  } catch { /* ignore */ }
}

// ---------- Command palette (⌘K / Ctrl+K / "/") ----------
function openPalette() {
  if (document.querySelector('.cmdk-bg')) return;
  const bg = document.createElement('div');
  bg.className = 'cmdk-bg';
  bg.innerHTML = `<div class="cmdk" role="dialog" aria-label="Search"><div class="cmdk-in">${icon('search')}<input placeholder="Search orders, invoices, distributors, logs — or type a page name" aria-label="Search"><kbd>Esc</kbd></div><div class="cmdk-list"></div>
    <div class="cmdk-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>Esc</kbd> close</span></div></div>`;
  document.body.appendChild(bg);
  const input = bg.querySelector('input'), list = bg.querySelector('.cmdk-list');
  const pages = NAV.filter((n) => n.id && can(n.perm)).map((n) => ({ type: 'Go to', label: n.label, icon: n.icon, href: `#/${n.id}` }));
  const actions = QUICK.filter((q) => can(q.perm)).map((q) => ({ type: 'Create', label: `New ${q.label.toLowerCase()}`, sub: q.sub, icon: 'plus', href: q.href }));
  let items = [], sel = 0, t = null;
  const close = () => { bg.remove(); document.removeEventListener('keydown', onKey, true); };
  const draw = (results) => {
    const q = input.value.trim().toLowerCase();
    const fp = pages.filter((p) => !q || p.label.toLowerCase().includes(q));
    const fa = actions.filter((p) => !q || p.label.toLowerCase().includes(q));
    const groups = [['Results', results || []], ['Create', fa], ['Pages', fp]];
    items = groups.flatMap(([, arr]) => arr);
    if (sel >= items.length) sel = 0;
    let k = 0;
    list.innerHTML = groups.filter(([, arr]) => arr.length).map(([name, arr]) => `<div class="cmdk-sec">${name}</div>${arr.map((r) => `<a class="cmdk-item ${k === sel ? 'on' : ''}" data-i="${k++}" href="${esc(r.href)}">${icon(r.icon || TYPE_ICON[r.type] || 'arrowRight', 'sm')}<span>${esc(r.label)}</span><span class="s">${esc(r.sub || r.type || '')}</span></a>`).join('')}`).join('') || '<div class="empty small">No matches</div>';
  };
  const TYPE_ICON = { Distributor: 'store', Product: 'boxes', Order: 'cart', Invoice: 'file', 'Gate entry': 'truck', 'Log arrival': 'truck', 'Work order': 'factory', 'Production batch': 'factory', Log: 'log', Supplier: 'users' };
  let lastResults = [];
  input.addEventListener('input', () => {
    clearTimeout(t); sel = 0;
    const q = input.value.trim();
    if (q.length < 2) { lastResults = []; draw([]); return; }
    draw(lastResults);
    t = setTimeout(async () => { try { lastResults = await get(`/api/search?q=${encodeURIComponent(q)}`); draw(lastResults); } catch { /* ignore */ } }, 160);
  });
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'ArrowDown') { sel = Math.min(items.length - 1, sel + 1); draw(lastResults); e.preventDefault(); }
    if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(lastResults); e.preventDefault(); }
    if (e.key === 'Enter' && items[sel]) { e.preventDefault(); location.hash = items[sel].href; close(); }
  };
  document.addEventListener('keydown', onKey, true);
  list.addEventListener('click', (e) => { if (e.target.closest('a')) close(); });
  list.addEventListener('mousemove', (e) => { const a = e.target.closest('[data-i]'); if (a && Number(a.dataset.i) !== sel) { sel = Number(a.dataset.i); list.querySelectorAll('.cmdk-item').forEach((x) => x.classList.toggle('on', Number(x.dataset.i) === sel)); } });
  bg.addEventListener('mousedown', (e) => { if (e.target === bg) close(); });
  draw([]);
  input.focus();
}
document.addEventListener('keydown', (e) => {
  if (!session.user) return;
  if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName))) { e.preventDefault(); openPalette(); }
});

async function logout() {
  sfx('logout');
  closeDrawer(true);
  setToken(null);
  session.user = null; session.masters = null; shellMounted = false;
  location.hash = '#/login';
  render();
}
window.addEventListener('erp:logout', () => { if (session.user) { toast('Your session ended. Please sign in again.', 'bad'); logout(); } });

export async function startSession(token) {
  setToken(token);
  const me = await get('/api/me');
  session.user = me.user; session.company = me.company; session.meta = me.meta;
  await masters(true);
  shellMounted = false;
}

async function render() {
  const seq = ++renderSeq;
  const route = parseHash();
  // demo deep link: /?as=owner#/dashboard  (used for screenshots and quick demos)
  const as = new URLSearchParams(location.search).get('as');
  if (as && !session.user) {
    try { const r = await api('/api/auth/demo-login', { method: 'POST', body: { role: as } }); await startSession(r.token); } catch { /* fall through to login */ }
    history.replaceState(null, '', location.pathname + location.hash);
  }
  if (!session.user && hasToken()) {
    try { await startSession(localStorage.getItem('timber-erp-token')); } catch { setToken(null); }
  }
  if (!session.user) {
    if (route.page !== 'login') { history.replaceState(null, '', '#/login'); }
    shellMounted = false;
    const mod = await ROUTES.login();
    root.innerHTML = '';
    mod.render(root, { route: parseHash() });
    document.title = 'Sign in · Raajply';
    return;
  }
  if (!route.page || route.page === 'login') { history.replaceState(null, '', '#/dashboard'); return render(); }
  const firstPaint = !shellMounted;
  if (!shellMounted) shell();
  else if (lastPage !== route.page) sfx('page');
  lastPage = route.page;
  closeDrawer(true);
  document.querySelectorAll('.sheet-bg, .modal-bg, .help-bg, .cmdk-bg').forEach((x) => x.remove());
  document.body.classList.remove('lock');
  document.querySelectorAll('.menu').forEach((m) => m.classList.add('hidden'));
  renderNav();
  const page = document.getElementById('page');
  const loader = ROUTES[route.page];
  document.title = `${TITLES[route.page] || 'Not found'} · Raajply`;
  if (!loader) { page.innerHTML = String(errorBox('This page does not exist.')); return; }
  page.onclick = null;
  page.innerHTML = String(loadingSkeleton());
  try {
    const mod = await loader();
    if (seq !== renderSeq) return;
    await mod.render(page, { route, seq: () => seq === renderSeq });
    page.focus({ preventScroll: true });
    if (!firstPaint) page.classList.remove('pg-in'), void page.offsetWidth, page.classList.add('pg-in');
    animateNumbers(page);
    revealOnScroll(page);
  } catch (e) {
    if (seq !== renderSeq) return;
    console.error(e);
    page.innerHTML = String(errorBox(e.status === 403 ? 'Your role does not have access to this page.' : e.message));
  }
  if (lastScrollPage !== route.page + route.id) window.scrollTo(0, 0);
  lastScrollPage = route.page + route.id;
}
let lastScrollPage = '';
export const rerender = render;

window.addEventListener('hashchange', render);

// Tooltip for chart marks
const tip = document.createElement('div');
tip.className = 'tooltip hidden';
document.body.appendChild(tip);
document.addEventListener('mousemove', (e) => {
  const t = e.target.closest && e.target.closest('[data-tip]');
  if (!t) { tip.classList.add('hidden'); return; }
  tip.textContent = t.getAttribute('data-tip');
  tip.classList.remove('hidden');
  const w = tip.offsetWidth;
  tip.style.left = Math.min(window.innerWidth - w - 8, e.clientX + 12) + 'px';
  tip.style.top = e.clientY + 14 + 'px';
});

// ---------- Help panel ----------
function openHelp() {
  if (document.querySelector('.help-bg')) return;
  const { page } = parseHash();
  const h = HELP[page] || HELP.dashboard;
  const bg = document.createElement('div');
  bg.className = 'help-bg';
  bg.innerHTML = `<aside class="help" role="dialog" aria-label="Help"><div class="help-h"><span class="help-ic">?</span><div><div class="small muted">Help · ${esc(TITLES[page] || '')}</div><h3>${esc(h.title)}</h3></div><button class="icon-btn" data-x aria-label="Close help">${icon('x')}</button></div>
    <div class="help-b"><p class="help-lead">${esc(h.what)}</p>${h.steps.map((s, i) => `<div class="help-step"><span>${i + 1}</span><div><b>${esc(s[0])}</b><p>${esc(s[1])}</p></div></div>`).join('')}
    ${h.tip ? `<div class="notice info">${icon('info', 'sm')}<span>${esc(h.tip)}</span></div>` : ''}
    <div class="help-keys"><div><kbd>⌘K</kbd> or <kbd>/</kbd> search anything</div><div><kbd>+ New</kbd> start any entry from anywhere</div></div></div></aside>`;
  document.body.appendChild(bg);
  sfx('open');
  const close = () => { bg.classList.add('closing'); sfx('close'); setTimeout(() => bg.remove(), 220); document.removeEventListener('keydown', k); };
  const k = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', k);
  bg.addEventListener('mousedown', (e) => { if (e.target === bg || e.target.closest('[data-x]')) close(); });
}

// ---------- Scroll reveal: cards below the fold fade up as you scroll ----------
let revealIO = null;
function revealOnScroll(root) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
  revealIO?.disconnect();
  revealIO = new IntersectionObserver((ens) => ens.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('rv-in'); revealIO.unobserve(en.target); } }), { rootMargin: '0px 0px -40px 0px', threshold: 0.05 });
  root.querySelectorAll('.card, .action-tile').forEach((el) => {
    if (el.getBoundingClientRect().top > innerHeight - 20) { el.classList.add('rv'); revealIO.observe(el); }
  });
}

// ---------- Tap ripple (phones) & pressed feedback ----------
document.addEventListener('pointerdown', (e) => {
  const t = e.target.closest('.btn, .action-tile, .nav a, .chip, .icon-btn, .kpi');
  if (!t || e.pointerType === 'mouse') return;
  const r = t.getBoundingClientRect();
  const s = document.createElement('span');
  s.className = 'ripple';
  const d = Math.max(r.width, r.height) * 2;
  s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
  if (getComputedStyle(t).position === 'static') t.style.position = 'relative';
  t.style.overflow = 'hidden';
  t.appendChild(s);
  setTimeout(() => s.remove(), 600);
}, { passive: true });

try { if (localStorage.getItem('raajply-big') === '1') document.documentElement.classList.add('big'); } catch { /* ignore */ }

render();
export { html, raw, ic };
