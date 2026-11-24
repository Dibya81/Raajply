// UI toolkit: safe HTML templating, formatters, data table, modal, toast, tabs.
import { icon } from './icons.js';
import { sparkline } from './charts.js';
import { sfx } from './sound.js';

// ---------- Safe HTML ----------
class SafeHTML { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new SafeHTML(String(s ?? ''));
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
function val(v) {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof SafeHTML) return v.s;
  if (Array.isArray(v)) return v.map(val).join('');
  return esc(v);
}
/** Tagged template: interpolated values are escaped unless wrapped in raw()/html``. */
export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => { out += s + (i < vals.length ? val(vals[i]) : ''); });
  return new SafeHTML(out);
}
export const ic = (name, cls) => raw(icon(name, cls));

// ---------- Formatters ----------
const nf0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const nfRs2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const inr = (n, dp = 0) => (n === null || n === undefined || Number.isNaN(Number(n)) ? '—' : (Number(n) < 0 ? '−₹' : '₹') + (dp ? nfRs2 : nf0).format(Math.abs(Number(n))));
export function inrShort(n) {
  const v = Number(n) || 0, a = Math.abs(v), s = v < 0 ? '−₹' : '₹';
  if (a >= 1e7) return `${s}${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${s}${(a / 1e5).toFixed(a >= 1e6 ? 1 : 2)} L`;
  return s + nf0.format(a);
}
export const fmt = (n) => (n === null || n === undefined ? '—' : nf2.format(Number(n)));
export const fmt0 = (n) => (n === null || n === undefined ? '—' : nf0.format(Number(n)));
export const qty = (n, unit) => `${nf2.format(Number(n) || 0)} ${unit || ''}`.trim();
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function date(d) { if (!d) return '—'; const [y, m, day] = d.slice(0, 10).split('-'); return `${Number(day)} ${MONTHS[Number(m) - 1]} ${y}`; }
export function dateShort(d) { if (!d) return '—'; const [, m, day] = d.slice(0, 10).split('-'); return `${Number(day)} ${MONTHS[Number(m) - 1]}`; }
export function ts(t) { if (!t) return '—'; return `${dateShort(t)}, ${t.slice(11, 16)}`; }
export const monthLabel = (k) => `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(2, 4)}`;
export const initials = (name) => String(name || '?').replace(/^(Mr\.|Ms\.|CA)\s+/, '').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const AV = ['#4f46e5', '#0891b2', '#db2777', '#7c3aed', '#ea580c', '#059669', '#2563eb', '#ca8a04'];
export const avatarColor = (s) => AV[[...String(s)].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length];
export function todayStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

const PILL = {
  'Pending approval': 'warn', Approved: 'info', Dispatched: 'good', 'On hold (credit)': 'bad', Cancelled: 'neutral',
  'In progress': 'info', Closed: 'good', Open: 'neutral', 'In yard': 'good', Issued: 'neutral',
  Paid: 'good', 'Part paid': 'info', Unpaid: 'neutral', Overdue: 'bad', Due: 'warn',
  Delivered: 'good', 'In transit': 'info', OK: 'good', Low: 'warn', 'Out of stock': 'bad',
  Pending: 'warn', Rejected: 'bad', Active: 'good', Disabled: 'neutral',
};
export const pill = (s, kind) => html`<span class="pill ${kind || PILL[s] || 'neutral'}">${s}</span>`;

// ---------- Toast ----------
/** Number that counts up when it appears (see animateNumbers). */
export function cu(k, formatted) { return html`<span data-cu="${k.value}" data-cu-unit="${k.unit === '₹' ? 'inr' : k.unit === '%' ? 'pct' : 'n'}">${formatted}</span>`; }
export function animateNumbers(root) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  root.querySelectorAll('[data-cu]').forEach((el) => {
    const to = Number(el.dataset.cu); if (!Number.isFinite(to) || to === 0) return;
    const unit = el.dataset.cuUnit, final = el.textContent, t0 = performance.now(), dur = 900;
    const f = (v) => (unit === 'inr' ? inrShort(v) : unit === 'pct' || Math.abs(to) < 100 && !Number.isInteger(to) ? fmt(Math.round(v * 100) / 100) : fmt0(v));
    const tick = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = k < 1 ? f(to * e) : final; if (k < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
}
export function toast(msg, kind = 'good') {
  sfx(kind === 'bad' ? 'error' : 'success');
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  const ms = kind === 'bad' ? 6000 : 3800;
  el.innerHTML = `${kind === 'bad' ? icon('alert') : '<svg class="i tick" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/></svg>'}<span>${esc(msg)}</span><i class="tbar" style="animation-duration:${ms}ms"></i>`;
  box.appendChild(el);
  while (box.children.length > 3) box.firstElementChild.remove();
  const hide = () => { el.classList.add('out'); setTimeout(() => el.remove(), 300); };
  el.addEventListener('click', hide);
  setTimeout(hide, ms);
}

// ---------- Modal ----------
export function openModal({ title, body, submit = 'Save', cancel = 'Cancel', wide = false, onSubmit, onOpen, footLeft = '', danger = false }) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<form class="modal ${wide ? 'wide' : ''}" novalidate role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="modal-h"><h3>${esc(title)}</h3><button type="button" class="icon-btn x" data-close aria-label="Close">${icon('x')}</button></div>
    <div class="modal-b">${val(body)}</div>
    <div class="modal-f"><div class="left" data-foot>${val(footLeft)}</div>
      ${cancel ? `<button type="button" class="btn" data-close>${esc(cancel)}</button>` : ''}
      ${onSubmit ? `<button type="submit" class="btn ${danger ? 'danger' : 'primary'}" data-submit>${esc(submit)}</button>` : ''}
    </div></form>`;
  document.body.appendChild(bg);
  sfx('open');
  const form = bg.querySelector('form');
  const close = () => { if (!bg.isConnected) return; sfx('close'); bg.classList.add('closing'); setTimeout(() => bg.remove(), 160); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  bg.addEventListener('mousedown', (e) => { if (e.target === bg) close(); });
  bg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  const m = { el: form, close, setFoot: (h) => { form.querySelector('[data-foot]').innerHTML = val(h); } };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!onSubmit) return;
    const btn = form.querySelector('[data-submit]');
    btn.disabled = true;
    try { const r = await onSubmit(form, m); if (r !== false) close(); } catch (err) { toast(err.message || String(err), 'bad'); } finally { btn.disabled = false; }
  });
  if (onOpen) onOpen(form, m);
  setTimeout(() => { const f = form.querySelector('input:not([type=hidden]),select,textarea'); if (f) f.focus(); }, 30);
  return m;
}
export function confirmBox(title, text, { submit = 'Confirm', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal({ title, body: html`<p style="margin:0">${text}</p>`, submit, danger, onSubmit: () => { done = true; resolve(true); } });
    const obs = new MutationObserver(() => { if (!document.body.contains(m.el)) { obs.disconnect(); if (!done) resolve(false); } });
    obs.observe(document.body, { childList: true });
  });
}
export const formData = (form) => Object.fromEntries(new FormData(form).entries());

// ---------- Tabs ----------
export function tabs(list, active, base) {
  return html`<div class="tabs" role="tablist">${list.map((t) => html`<a class="tab ${t.id === active ? 'on' : ''}" role="tab" aria-selected="${t.id === active}" href="${base}?tab=${t.id}">${t.icon ? ic(t.icon, 'sm') : ''}${t.label}${t.count !== undefined ? html` <span class="tag">${t.count}</span>` : ''}</a>`)}</div>`;
}

// ---------- Data table ----------
export function mountTable(el, opt) {
  const st = { q: opt.initialQuery || '', sort: opt.sort || null, dir: opt.dir || 'desc', page: 0, rows: opt.rows || [], filter: opt.filterValue || null };
  const size = opt.pageSize || 15;
  const cols = opt.columns;
  el.innerHTML = `
    ${opt.noTools ? '' : `<div class="tbl-tools">
      ${opt.search === false ? '' : `<div class="tsearch">${icon('search', 'sm')}<input type="search" placeholder="${esc(opt.placeholder || 'Search…')}" value="${esc(st.q)}" aria-label="Search table"></div>`}
      <div class="chips" data-chips></div>
      <span class="count" data-count></span>
      <div class="sp">${val(opt.toolbar || '')}${opt.exportName ? `<button class="btn sm" data-csv type="button">${icon('download', 'sm')} Export CSV</button>` : ''}</div>
    </div>`}
    <div class="table-wrap ${opt.cards === false ? '' : 'cards'}" style="${opt.maxHeight ? `max-height:${opt.maxHeight}px;overflow:auto` : ''}"><table class="t"><thead><tr>${cols.map((c, i) => `<th class="${c.num ? 'num' : ''} ${c.sort !== false ? 'sortable' : ''}" data-i="${i}" ${c.width ? `style="width:${c.width}"` : ''}>${esc(c.label)}<span data-arrow></span></th>`).join('')}</tr></thead><tbody></tbody><tfoot></tfoot></table></div>
    <div class="pager" data-pager></div>`;
  const tbody = el.querySelector('tbody'), tfoot = el.querySelector('tfoot');
  const searchKey = (r) => (opt.searchText ? opt.searchText(r) : cols.map((c) => (typeof c.key === 'string' ? r[c.key] : '')).join(' ')).toString().toLowerCase();
  const sortVal = (c, r) => (typeof c.sort === 'function' ? c.sort(r) : r[c.key]);

  function filtered() {
    let rows = st.rows;
    if (opt.filters && st.filter) { const f = opt.filters.find((x) => x.id === st.filter); if (f && f.test) rows = rows.filter(f.test); }
    if (st.q) { const q = st.q.toLowerCase(); rows = rows.filter((r) => searchKey(r).includes(q)); }
    if (st.sort !== null) {
      const c = cols[st.sort];
      rows = rows.slice().sort((a, b) => { const x = sortVal(c, a), y = sortVal(c, b); const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'en', { numeric: true }); return st.dir === 'asc' ? r : -r; });
    }
    return rows;
  }
  function renderChips() {
    const box = el.querySelector('[data-chips]');
    if (!box || !opt.filters) return;
    box.innerHTML = opt.filters.map((f) => `<button type="button" class="chip ${st.filter === f.id ? 'on' : ''}" data-f="${esc(f.id)}">${esc(f.label)} <span class="c">${st.rows.filter(f.test || (() => true)).length}</span></button>`).join('');
  }
  function render() {
    const rows = filtered();
    const pages = Math.max(1, Math.ceil(rows.length / size));
    if (st.page >= pages) st.page = pages - 1;
    const slice = opt.paginate === false ? rows : rows.slice(st.page * size, st.page * size + size);
    tbody.innerHTML = slice.length ? slice.map((r) => `<tr class="${opt.onRow ? 'click' : ''}" ${opt.rowKey ? `data-k="${esc(r[opt.rowKey])}"` : ''}>${cols.map((c) => `<td class="${c.num ? 'num' : ''} ${c.cls || ''}" data-label="${esc(c.label)}">${c.render ? val(c.render(r)) : esc(r[c.key] ?? '—')}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${cols.length}"><div class="empty">${icon('search', 'lg')}<div>${esc(opt.empty || 'Nothing to show')}</div></div></td></tr>`;
    tfoot.innerHTML = opt.footer && rows.length ? `<tr>${opt.footer(rows).map((c, i) => `<td class="${cols[i] && cols[i].num ? 'num' : ''}" data-label="${esc(cols[i] ? cols[i].label : '')}">${val(c)}</td>`).join('')}</tr>` : '';
    const cnt = el.querySelector('[data-count]'); if (cnt) cnt.textContent = `${rows.length.toLocaleString('en-IN')} ${rows.length === 1 ? 'row' : 'rows'}`;
    el.querySelectorAll('th').forEach((th) => { th.querySelector('[data-arrow]').innerHTML = Number(th.dataset.i) === st.sort ? icon(st.dir === 'asc' ? 'arrowUp' : 'arrowDown', 'sm') : ''; });
    const pager = el.querySelector('[data-pager]');
    if (opt.paginate === false || pages <= 1) { pager.style.display = 'none'; }
    else {
      pager.style.display = '';
      pager.innerHTML = `<span>Page ${st.page + 1} of ${pages}</span><button type="button" class="btn sm" data-p="-1" ${st.page === 0 ? 'disabled' : ''} aria-label="Previous page">${icon('chevronLeft', 'sm')}</button><button type="button" class="btn sm" data-p="1" ${st.page >= pages - 1 ? 'disabled' : ''} aria-label="Next page">${icon('chevronRight', 'sm')}</button>`;
    }
    st.lastRows = slice;
  }
  el.addEventListener('click', (e) => {
    const th = e.target.closest('th.sortable');
    if (th) { const i = Number(th.dataset.i); if (st.sort === i) st.dir = st.dir === 'asc' ? 'desc' : 'asc'; else { st.sort = i; st.dir = cols[i].num ? 'desc' : 'asc'; } render(); return; }
    const p = e.target.closest('[data-p]');
    if (p) { st.page += Number(p.dataset.p); render(); return; }
    const f = e.target.closest('[data-f]');
    if (f) { st.filter = st.filter === f.dataset.f && !opt.filterRequired ? null : f.dataset.f; st.page = 0; renderChips(); render(); return; }
    if (e.target.closest('[data-csv]')) { exportCsv(opt.exportName, cols, filtered()); return; }
    const tr = e.target.closest('tbody tr.click');
    if (tr && opt.onRow && !e.target.closest('a,button,input')) { const idx = [...tbody.children].indexOf(tr); const row = st.lastRows[idx]; if (row) opt.onRow(row); }
  });
  const si = el.querySelector('.tsearch input');
  if (si) si.addEventListener('input', () => { st.q = si.value; st.page = 0; render(); });
  renderChips(); render();
  return { setRows(rows) { st.rows = rows; renderChips(); render(); }, refresh: render, state: st };
}

function exportCsv(name, cols, rows) {
  const cell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [cols.map((c) => cell(c.label)).join(',')];
  for (const r of rows) lines.push(cols.map((c) => cell(c.csv ? c.csv(r) : typeof c.key === 'string' ? r[c.key] : '')).join(','));
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `${name}-${todayStr()}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function loadingSkeleton() {
  return html`<div class="loading-page"><div class="skeleton" style="height:34px;width:260px"></div><div class="grid g4">${[1, 2, 3, 4].map(() => html`<div class="skeleton" style="height:110px"></div>`)}</div><div class="skeleton" style="height:320px"></div></div>`;
}
export function errorBox(msg) { return html`<div class="card"><div class="empty">${ic('alert', 'lg')}<h3 style="margin:8px 0 4px">Couldn't load this page</h3><div>${msg}</div></div></div>`; }
export function kpiCard(k) {
  const v = k.unit === '₹' ? inrShort(k.value) : k.unit === '%' ? `${fmt(k.value)}` : fmt(k.value);
  const tagName = k.href ? 'a' : 'div';
  let delta = '';
  if (k.delta !== null && k.delta !== undefined) {
    const dir = Math.abs(k.delta) < 0.05 ? 'flat' : k.delta > 0 ? 'up' : 'down';
    delta = html`<span class="delta ${dir}">${dir === 'up' ? ic('arrowUp') : dir === 'down' ? ic('arrowDown') : ''}${k.delta > 0 ? '+' : ''}${fmt(k.delta)}${k.deltaUnit ? ` ${k.deltaUnit}` : '%'}</span>`;
  }
  const trend = k.trend && k.trend.some((x) => x) ? raw(`<div class="spark">${sparkline(k.trend, { color: k.bad ? '#ef4444' : '#4f46e5' })}</div>`) : '';
  return html`<${raw(tagName)} class="card kpi ${k.bad ? 'bad' : ''} ${k.good ? 'good' : ''}" ${k.href ? raw(`href="${esc(k.href)}"`) : ''}>
    <div class="kl"><span class="ic">${ic(k.icon || 'info', 'sm')}</span>${k.label}</div>
    <div class="kv">${cu(k, v)}${k.unit && k.unit !== '₹' ? html`<small>${k.unit}</small>` : ''}</div>
    ${delta || k.sub ? html`<div class="ks">${delta}${k.deltaLabel && delta ? html`<span>${k.deltaLabel}</span>` : ''}${k.sub ? html`<span>${k.sub}</span>` : ''}</div>` : ''}
    ${k.progress !== undefined ? html`<div class="prog"><div class="bar ${k.progress > 25 ? 'bad' : 'warn'}"><span style="width:${Math.min(100, k.progress)}%"></span></div><div class="small muted mt-s">${fmt(k.progress)}% ${k.progressLabel || ''}</div></div>` : ''}
    ${trend}
  </${raw(tagName)}>`;
}
/** Compact one-card row of stats — used at the top of list pages instead of big KPI tiles. */
export function statStrip(items) {
  return html`<div class="card strip stats">${items.map((k) => {
    const v = k.unit === '₹' ? inrShort(k.value) : k.unit === '%' ? fmt(k.value) : fmt(k.value);
    const inner = html`<div class="sl">${k.icon ? ic(k.icon, 'sm') : ''}${k.label}</div><div class="sv ${k.bad ? 'bad' : ''} ${k.good ? 'good' : ''}">${cu(k, v)}${k.unit && k.unit !== '₹' ? html`<small>${k.unit}</small>` : ''}</div>${k.sub ? html`<div class="ss">${k.sub}</div>` : ''}`;
    return k.href ? html`<a href="${k.href}">${inner}</a>` : html`<a role="presentation">${inner}</a>`;
  })}</div>`;
}
export function options(list, selected, { value = 'id', label = 'name', placeholder } = {}) {
  return html`${placeholder ? html`<option value="">${placeholder}</option>` : ''}${list.map((x) => html`<option value="${x[value]}" ${String(x[value]) === String(selected) ? raw('selected') : ''}>${typeof label === 'function' ? label(x) : x[label]}</option>`)}`;
}
export function qs(name) {
  const h = location.hash; const i = h.indexOf('?');
  return i < 0 ? null : new URLSearchParams(h.slice(i + 1)).get(name);
}
