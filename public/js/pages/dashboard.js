import { get } from '../api.js';
import { html, raw, ic, inrShort, fmt, date, ts, dateShort, kpiCard, cu } from '../ui.js';
import { lineChart, hbar, donut, legend, barChart, PALETTE, C } from '../charts.js';
import { session } from '../app.js';
// Charts are drawn on a narrower canvas on phones so their labels stay readable.
// Short day labels on phones so 14 bars don't collide.
const dayLabel = (d) => (innerWidth < 640 ? String(Number(d.slice(8, 10))) : dateShort(d));
const W = (wide = 680) => (innerWidth < 640 ? 360 : innerWidth < 1100 ? Math.min(wide, 620) : wide);

function greet() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }
const TILES = [
  { perm: 'yard.edit', icon: 'truck', tone: 'amber', title: 'Logs arrived', sub: 'Measure & number a truck or container', href: '#/yard?new=1' },
  { perm: 'production.edit', icon: 'factory', tone: 'indigo', title: 'Start peeling', sub: 'Send logs to the lathe', href: '#/production?new=1' },
  { perm: 'production.edit', icon: 'checkCircle', tone: 'green', title: 'Record sheets made', sub: 'Veneer and sheets for a batch', href: '#/production' },
  { perm: 'inventory.edit', icon: 'boxes', tone: 'rose', title: 'Count stock', sub: 'Every Monday & Thursday', href: '#/inventory?tab=count&new=1' },
  { perm: 'stores.edit', icon: 'tag', tone: 'slate', title: 'Stores', sub: 'Glue, blades, gloves — in & out', href: '#/stores' },
  { perm: 'dispatch.edit', icon: 'send', tone: 'amber', title: 'Load a truck', sub: 'Dispatch approved orders', href: '#/dispatch' },
  { perm: 'sales.edit', icon: 'cart', tone: 'indigo', title: 'Take an order', sub: 'Sheets for a distributor', href: '#/orders?new=1' },
  { perm: 'finance.edit', icon: 'receipt', tone: 'green', title: 'Money received', sub: 'Record a distributor payment', href: '#/finance?tab=receipts&new=receipt' },
  { perm: 'tally.export', icon: 'download', tone: 'slate', title: 'Send to Tally', sub: 'Sales, receipts, purchases', href: '#/finance?tab=tally' },
  { perm: ['inventory.approve', 'finance.approve'], icon: 'shield', tone: 'rose', title: 'Approvals', sub: 'Credit limits & stock differences', href: '#/approvals' },
  { perm: ['finance.view', 'sales.view', 'production.view'], icon: 'chart', tone: 'slate', title: 'Reports', sub: 'Sales, production, stock', href: '#/reports' },
];
const ACT = { create: 'plus', approve: 'check', close: 'checkCircle', login: 'lock', update: 'edit', hold: 'alert', request: 'clock', reject: 'x', cancel: 'x', setup: 'settings' };

export async function render(el) {
  const d = await get('/api/dashboard');
  const first = session.user.name.replace(/^CA\s+/, '').split(' ')[0];
  const perms = session.user.perms;
  const has = (p) => (Array.isArray(p) ? p.some((x) => perms.includes(x)) : perms.includes(p));
  const seen = new Set();
  const MD = ['Approvals', 'Reports', 'Take an order', 'Record sheets made', 'Count stock', 'Send to Tally'];
  const pool = session.user.role === 'owner' ? MD.map((t) => TILES.find((x) => x.title === t)) : TILES;
  const tiles = pool.filter((t) => has(t.perm) && !seen.has(t.href + t.title) && seen.add(t.href + t.title)).slice(0, 6);
  const parts = [];

  parts.push(html`
    <div class="page-head dash-head">
      <div><h1>${greet()}, ${first}</h1><div class="sub dash-date"><i class="dash-live" title="Live"></i>${date(d.today)} · ${session.company.short} at a glance</div></div>
      <div class="actions"><button class="btn" id="refresh" aria-label="Refresh">${ic('refresh', 'sm')}<span>Refresh</span></button></div>
    </div>
    ${tiles.length ? html`<div class="section-title" style="margin-top:0"><h2>What would you like to do?</h2></div><div class="tiles">${tiles.map((t, i) => html`<a class="action-tile" href="${t.href}" style="--i:${i}"><span class="at-ic ${t.tone}">${ic(t.icon)}</span><span class="at-t">${t.title}</span><span class="at-s">${t.sub}</span>${ic('arrowRight', 'sm at-go')}</a>`)}</div>` : ''}
    <div class="section-title"><h2>Today at a glance</h2></div>
    <div class="grid g4">${d.kpis.map(kpiCard)}</div>
    ${d.strip.length ? html`<div class="card strip mt">${d.strip.map((s) => html`<a href="${s.href}"><div class="sl">${s.label}</div><div class="sv">${cu(s, s.unit === '₹' ? inrShort(s.value) : fmt(s.value))}${s.unit && s.unit !== '₹' ? html`<small>${s.unit}</small>` : ''}</div></a>`)}</div>` : ''}`);

  // Main chart + attention
  let mainChart = '';
  if (d.salesWeeks) {
    const series = [{ name: 'Sales (taxable)', color: C.primary, values: d.salesWeeks.map((w) => w.sales) }, { name: 'Collections', color: C.green, values: d.salesWeeks.map((w) => w.collections), dash: true }];
    mainChart = html`<div class="card"><div class="card-h"><div><h3>Sales & collections</h3><div class="sub">Weekly, last 12 weeks</div></div><div class="right">${raw(legend(series))}</div></div>
      <div class="card-b chart">${raw(lineChart({ width: W(), labels: d.salesWeeks.map((w) => dateShort(w.label)), series, format: (v) => inrShort(v), height: 280 }))}</div></div>`;
  } else if (d.production14) mainChart = productionCard(d);
  else if (d.yard) mainChart = yardCard(d);
  const attention = html`<div class="card"><div class="card-h"><div><h3>Needs attention</h3><div class="sub">${d.alerts.length ? `${d.alerts.length} item${d.alerts.length > 1 ? 's' : ''}` : 'All clear'}</div></div></div>
    <div class="card-b" style="padding-top:8px">${d.alerts.length ? html`<div class="alert-list">${d.alerts.map((a) => html`<a class="alert-item" href="${a.href}"><span class="ai ${a.level}">${ic(a.level === 'bad' ? 'alert' : a.level === 'warn' ? 'clock' : 'info', 'sm')}</span><span style="min-width:0"><div class="at">${a.title}</div><div class="as">${a.sub}</div></span>${ic('chevronRight', 'sm chev')}</a>`)}</div>`
      : html`<div class="empty">${ic('checkCircle', 'lg')}<div>Nothing needs your attention right now.</div></div>`}</div></div>`;
  parts.push(html`<div class="grid g-main mt">${mainChart}${attention}</div>`);

  // Lower row
  const row = [];
  if (d.salesWeeks && d.production14) row.push(productionCard(d));
  if (d.yieldBySpecies) row.push(html`<div class="card"><div class="card-h"><div><h3>Recovery by wood</h3><div class="sub">Veneer ÷ log volume, 30 days · target 75%</div></div></div><div class="card-b chart">${raw(hbar({ width: W(), items: d.yieldBySpecies.map((x) => ({ label: x.name, value: x.value, color: x.color })), max: 100, target: 75, format: (v) => `${fmt(v)}%` }))}</div></div>`);
  if (d.topOutstanding) {
    const mx = Math.max(...d.topOutstanding.map((x) => x.outstanding), 1);
    row.push(html`<div class="card"><div class="card-h"><div><h3>Top outstanding</h3><div class="sub">Distributors owing the most</div></div><div class="right"><a class="btn sm" href="#/distributors">All</a></div></div>
      <div class="card-b" style="padding-top:6px"><div class="rank">${d.topOutstanding.map((x) => html`<a class="rank-row" href="#/distributors/${x.id}"><div><div class="rn">${x.name}</div><div class="rs">${x.city} · ${x.creditUsedPct}% of limit used${x.overdue > 0 ? html` · <span style="color:var(--bad)">${inrShort(x.overdue)} overdue</span>` : ''}</div></div><div class="rv">${inrShort(x.outstanding)}</div><div class="bar ${x.creditUsedPct > 100 ? 'bad' : ''}"><span style="width:${(x.outstanding / mx) * 100}%"></span></div></a>`)}</div></div></div>`);
  } else if (d.stockByLocation) {
    const items = d.stockByLocation.map((x, i) => ({ label: x.name, value: x.value, color: PALETTE[i % PALETTE.length] }));
    const total = items.reduce((a, b) => a + b.value, 0);
    row.push(html`<div class="card"><div class="card-h"><div><h3>Stock value by godown</h3><div class="sub">At list price</div></div></div>
      <div class="card-b" style="display:flex;gap:18px;align-items:center;flex-wrap:wrap"><div class="chart">${raw(donut({ items, label: inrShort(total), sub: 'total', format: inrShort, size: 160 }))}</div>
      <div style="flex:1;min-width:150px">${items.map((x) => html`<div style="display:flex;gap:8px;align-items:center;padding:6px 0" class="small"><span class="dotlabel"><i style="background:${x.color}"></i>${x.label}</span><b class="num" style="margin-left:auto">${inrShort(x.value)}</b></div>`)}</div></div></div>`);
  }
  if (!d.salesWeeks && d.production14 && d.yard) row.push(yardCard(d));
  row.push(html`<div class="card"><div class="card-h"><div><h3>Recent activity</h3><div class="sub">Every change is recorded</div></div>${session.user.perms.includes('audit.view') ? html`<div class="right"><a class="btn sm" href="#/admin?tab=audit">Audit log</a></div>` : ''}</div>
    <div class="card-b"><div class="timeline">${d.activity.slice(0, 6).map((a) => html`<div class="tl"><span class="ta">${ic(ACT[a.action] || 'info', 'sm')}</span><div style="min-width:0"><div class="tt">${a.summary}</div><div class="tm">${a.user} · ${ts(a.ts)}</div></div></div>`)}</div></div></div>`);
  for (let i = 0; i < row.length; i += 2) parts.push(html`<div class="grid g2 mt">${row.slice(i, i + 2)}</div>`);

  el.innerHTML = String(html`${parts}`);
  el.querySelector('#refresh').onclick = async (e) => {
    const btn = e.currentTarget; btn.classList.add('spin'); btn.disabled = true;
    try { await render(el); } finally { btn.classList.remove('spin'); btn.disabled = false; }
  };
}

function productionCard(d) {
  return html`<div class="card"><div class="card-h"><div><h3>Sheets made per day</h3><div class="sub">Last 14 days · ${fmt(d.production14.reduce((a, x) => a + x.sheets, 0))} sheets</div></div></div>
    <div class="card-b chart">${raw(barChart({ width: W(), data: d.production14.map((x) => ({ label: dayLabel(x.date), values: [x.sheets] })), series: [{ name: 'Sheets', color: C.primary }], format: (v) => fmt(v), height: 260 }))}</div></div>`;
}
function yardCard(d) {
  return html`<div class="card"><div class="card-h"><div><h3>Logs in yard</h3><div class="sub">${fmt(d.yard.logs)} logs · ${fmt(d.yard.cft)} CFT · ${inrShort(d.yard.value)} at cost</div></div></div>
    <div class="card-b chart">${raw(hbar({ width: W(), items: d.yard.species.map((s) => ({ label: s.name, value: s.cft, color: s.color })), format: (v) => `${fmt(v)} CFT` }))}</div></div>`;
}
