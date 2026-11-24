import { get } from '../api.js';
import { html, raw, ic, inr, inrShort, fmt, monthLabel, statStrip, mountTable, todayStr, date } from '../ui.js';
import { barChart, hbar, donut, legend, PALETTE, C } from '../charts.js';
import { can } from '../app.js';
// Charts are drawn on a narrower canvas on phones so their labels stay readable.
const W = (wide = 680) => (innerWidth < 640 ? 360 : innerWidth < 1100 ? Math.min(wide, 620) : wide);

function addDays(d, n) { const [y, m, dd] = d.split('-').map(Number); const x = new Date(y, m - 1, dd + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; }

export async function render(el, { route }) {
  const tabsAll = [
    { id: 'sales', label: 'Sales', icon: 'trend', perm: 'finance.view' },
    { id: 'production', label: 'Production', icon: 'factory', perm: 'production.view' },
    { id: 'purchases', label: 'Log purchases', icon: 'log', perm: ['yard.view', 'finance.view'] },
    { id: 'stock', label: 'Stock', icon: 'boxes', perm: 'inventory.view' },
  ].filter((t) => can(t.perm));
  if (!tabsAll.length) { el.innerHTML = '<div class="card"><div class="empty">No reports for your role.</div></div>'; return; }
  const tab = tabsAll.some((t) => t.id === route.query.get('tab')) ? route.query.get('tab') : tabsAll[0].id;
  const to = route.query.get('to') || todayStr();
  const preset = route.query.get('p') || '90';
  const from = route.query.get('from') || addDays(to, -(Number(preset) - 1));
  const qs = (o) => { const p = new URLSearchParams({ tab, p: preset, from, to, ...o }); return `#/reports?${p}`; };
  el.innerHTML = String(html`
    <div class="page-head"><div><h1>Reports</h1><div class="sub">${tab === 'stock' ? 'Current position' : html`${date(from)} – ${date(to)}`}</div></div>
      <div class="actions no-print">
        ${tab !== 'stock' ? html`<div class="chips" style="background:var(--hover);padding:3px;border-radius:9px">${[['30', '30 days'], ['90', '90 days'], ['180', '6 months']].map(([p, l]) => html`<a class="chip ${preset === p && !route.query.get('custom') ? 'on' : ''}" href="${`#/reports?tab=${tab}&p=${p}`}">${l}</a>`)}</div>
        <input class="input sm" type="date" id="from" value="${from}" max="${to}" style="width:150px" aria-label="From"><input class="input sm" type="date" id="to" value="${to}" max="${todayStr()}" style="width:150px" aria-label="To">` : ''}
        <button class="btn" data-print>${ic('printer', 'sm')} Print</button>
      </div></div>
    <div class="tabs">${tabsAll.map((t) => html`<a class="tab ${t.id === tab ? 'on' : ''}" href="${qs({ tab: t.id })}">${ic(t.icon, 'sm')}${t.label}</a>`)}</div>
    <div id="rb">${raw('<div class="skeleton" style="height:320px"></div>')}</div>`);
  const onDate = () => { const f = el.querySelector('#from').value, t = el.querySelector('#to').value; if (f && t) location.hash = `#/reports?tab=${tab}&custom=1&from=${f}&to=${t}`; };
  el.querySelector('#from')?.addEventListener('change', onDate);
  el.querySelector('#to')?.addEventListener('change', onDate);
  const body = el.querySelector('#rb');
  const q = `from=${from}&to=${to}`;
  if (tab === 'sales') return sales(body, await get(`/api/reports/sales?${q}`));
  if (tab === 'production') return production(body, await get(`/api/reports/production?${q}`));
  if (tab === 'purchases') return purchases(body, await get(`/api/reports/purchases?${q}`));
  return stockRep(body, await get('/api/reports/stock'));
}

function sales(el, r) {
  const months = r.byMonth.map((m) => ({ label: monthLabel(m.month), values: [m.taxable] }));
  const cats = r.byCategory.map((c, i) => ({ label: c.name, value: c.taxable, color: PALETTE[i % PALETTE.length] }));
  const states = r.byState.map((s, i) => ({ label: s.name, value: s.taxable, color: PALETTE[i % PALETTE.length] }));
  el.innerHTML = String(html`
    ${statStrip([{ label: 'Sales (taxable)', value: r.total, unit: '₹', icon: 'trend' }, { label: 'GST charged', value: r.gst, unit: '₹', icon: 'shield' }, { label: 'Invoices', value: r.invoices, unit: '', icon: 'file' }, { label: 'Average invoice', value: r.avgInvoice, unit: '₹', icon: 'receipt' }, { label: 'Active distributors', value: r.distributors, unit: '', icon: 'store' }])}
    <div class="grid g-main mt">
      <div class="card"><div class="card-h"><div><h3>Sales by month</h3><div class="sub">Taxable value</div></div></div><div class="card-b chart">${raw(barChart({ width: W(), data: months, series: [{ name: 'Sales', color: C.primary }], format: (v) => inrShort(v), height: 260 }))}</div></div>
      <div class="card"><div class="card-h"><div><h3>By product category</h3></div></div><div class="card-b" style="display:flex;flex-direction:column;align-items:center;gap:14px">
        <div class="chart">${raw(donut({ items: cats, label: inrShort(r.total), sub: 'total', format: inr, size: 170 }))}</div>
        <div style="width:100%">${cats.map((c) => html`<div class="small" style="display:flex;padding:5px 0"><span class="dotlabel"><i style="background:${c.color}"></i>${c.label}</span><b style="margin-left:auto" class="num">${inrShort(c.value)} · ${Math.round((c.value / (r.total || 1)) * 100)}%</b></div>`)}</div></div></div>
    </div>
    <div class="grid g2 mt">
      <div class="card"><div class="card-h"><div><h3>Top distributors</h3></div></div><div class="card-b chart">${raw(hbar({ width: W(), items: r.byDistributor.slice(0, 8).map((d) => ({ label: d.name.length > 18 ? d.name.slice(0, 17) + '…' : d.name, value: d.taxable, color: C.primary })), format: inrShort }))}</div></div>
      <div class="card"><div class="card-h"><div><h3>By state</h3></div></div><div class="card-b chart">${raw(hbar({ width: W(), items: states, format: inrShort }))}</div></div>
    </div>
    <div class="card mt" id="t1"></div>`);
  mountTable(el.querySelector('#t1'), {
    rows: r.byProduct, exportName: 'sales-by-product', pageSize: 15, placeholder: 'Search product…', columns: [
      { key: 'name', label: 'Product', render: (x) => html`<b style="font-weight:500">${x.name}</b>` }, { key: 'category', label: 'Category' },
      { key: 'qty', label: 'Sheets', num: true, render: (x) => `${fmt(x.qty)}${x.unit === 'Sheet' ? '' : ` ${x.unit}`}` }, { key: 'taxable', label: 'Sales', num: true, render: (x) => inr(x.taxable) },
      { key: 'share', label: 'Share', num: true, sort: (x) => x.taxable, render: (x) => html`<div style="display:flex;gap:8px;align-items:center;justify-content:flex-end"><div class="bar" style="width:80px;flex:none"><span style="width:${(x.taxable / (r.total || 1)) * 100}%"></span></div>${Math.round((x.taxable / (r.total || 1)) * 1000) / 10}%</div>`, csv: (x) => Math.round((x.taxable / (r.total || 1)) * 1000) / 10 },
    ],
  });
}

function production(el, r) {
  const series = [{ name: 'Logs peeled', color: C.amber }, { name: 'Veneer', color: C.primary }];
  el.innerHTML = String(html`
    ${statStrip([{ label: 'Sheets made', value: r.sheets, unit: 'sheets', icon: 'boxes' }, { label: 'Batches', value: r.workOrders, unit: '', icon: 'factory' }, { label: 'Logs peeled', value: r.inputCft, unit: 'CFT', icon: 'log' }, { label: 'Veneer produced', value: r.veneerCft, unit: 'CFT', icon: 'layers' }, { label: 'Recovery', value: r.yield, unit: '%', sub: 'Target 75%', icon: 'gauge', good: r.yield >= 75 }, { label: 'Peeler cores', value: r.offcutKg, unit: 'nos', icon: 'log' }])}
    <div class="grid g-main mt">
      <div class="card"><div class="card-h"><div><h3>Sheets made by month</h3></div></div><div class="card-b chart">${raw(barChart({ width: W(), data: r.byMonth.map((m) => ({ label: monthLabel(m.month), values: [m.sheets] })), series: [{ name: 'Sheets', color: C.primary }], format: (v) => fmt(v) }))}</div></div>
      <div class="card"><div class="card-h"><div><h3>Recovery by wood</h3><div class="sub">Veneer ÷ log CFT</div></div></div><div class="card-b chart">${raw(hbar({ width: W(), items: r.bySpecies.map((s) => ({ label: s.name, value: s.yield, color: s.color })), max: 100, target: 75, format: (v) => `${fmt(v)}%` }))}</div></div>
    </div>
    <div class="grid g2 mt">
      <div class="card"><div class="card-h"><div><h3>Logs vs veneer by month</h3><div class="sub">CFT</div></div><div class="right">${raw(legend(series))}</div></div><div class="card-b chart">${raw(barChart({ width: W(), data: r.byMonth.map((m) => ({ label: monthLabel(m.month), values: [m.inputCft, m.veneerCft] })), series, format: (v) => `${fmt(v)} CFT` }))}</div></div>
      <div class="card"><div class="card-h"><h3>By shift</h3></div><div class="table-wrap"><table class="t"><thead><tr><th>Shift</th><th class="num">Batches</th><th class="num">Log CFT</th><th class="num">Veneer CFT</th><th class="num">Sheets</th><th class="num">Recovery</th></tr></thead><tbody>
        ${r.byShift.map((x) => html`<tr><td><b style="font-weight:500">${x.name}</b></td><td class="num">${x.workOrders}</td><td class="num">${fmt(x.inputCft)}</td><td class="num">${fmt(x.veneerCft)}</td><td class="num">${fmt(x.sheets)}</td><td class="num"><b>${fmt(x.yield)}%</b></td></tr>`)}
      </tbody></table></div></div>
    </div>
    <div class="card mt"><div class="card-h"><div><h3>Lowest recovery batches</h3><div class="sub">Check knife sharpness, log quality and the operator</div></div></div><div class="table-wrap"><table class="t"><thead><tr><th>Batch</th><th>Wood</th><th class="num">Log CFT</th><th class="num">Veneer CFT</th><th class="num">Sheets</th><th class="num">Recovery</th></tr></thead><tbody>
      ${r.worst.map((w) => html`<tr class="click" data-href="#/production/${w.id}"><td><b style="font-weight:500">${w.no}</b><div class="small muted">${date(w.date)}</div></td><td>${w.species}</td><td class="num">${fmt(w.inputCft)}</td><td class="num">${fmt(w.veneerCft)}</td><td class="num">${fmt(w.sheets)}</td><td class="num"><b style="color:${w.yield < 68 ? 'var(--bad)' : 'var(--warn)'}">${fmt(w.yield)}%</b></td></tr>`)}
    </tbody></table></div></div>`);
}

function purchases(el, r) {
  el.innerHTML = String(html`
    ${statStrip([{ label: 'Arrivals', value: r.trucks, unit: '', icon: 'truck' }, { label: 'Logs', value: r.logs, unit: '', icon: 'log' }, { label: 'Volume', value: r.cft, unit: 'CFT', icon: 'calc' }, { label: 'Purchase value', value: r.amount, unit: '₹', icon: 'wallet' }, { label: 'Average rate', value: r.cft ? Math.round(r.amount / r.cft) : 0, unit: '₹/CFT', icon: 'tag' }])}
    <div class="grid g-main mt">
      <div class="card"><div class="card-h"><div><h3>Purchases by month</h3><div class="sub">Value before GST</div></div></div><div class="card-b chart">${raw(barChart({ width: W(), data: r.byMonth.map((m) => ({ label: monthLabel(m.id), values: [m.amount] })), series: [{ name: 'Purchases', color: C.amber }], format: inrShort, height: 260 }))}</div></div>
      <div class="card"><div class="card-h"><div><h3>Volume by species</h3></div></div><div class="card-b chart">${raw(hbar({ width: W(), items: r.bySpecies.map((s) => ({ label: s.name, value: s.cft, color: s.color })), format: (v) => `${fmt(Math.round(v))} CFT` }))}</div></div>
    </div>
    <div class="card mt" id="t1"></div>`);
  mountTable(el.querySelector('#t1'), {
    rows: r.bySupplier, exportName: 'purchases-by-supplier', search: false, paginate: false, columns: [
      { key: 'name', label: 'Supplier', render: (x) => html`<b style="font-weight:500">${x.name}</b>` }, { key: 'trucks', label: 'Trucks', num: true }, { key: 'logs', label: 'Logs', num: true },
      { key: 'cft', label: 'CFT', num: true, render: (x) => fmt(x.cft) }, { key: 'avgRate', label: 'Avg ₹/CFT', num: true, render: (x) => inr(x.avgRate) }, { key: 'amount', label: 'Value', num: true, render: (x) => inr(x.amount) },
    ],
    footer: (rs) => ['Total', rs.reduce((a, x) => a + x.trucks, 0), rs.reduce((a, x) => a + x.logs, 0), fmt(rs.reduce((a, x) => a + x.cft, 0)), '', inr(rs.reduce((a, x) => a + x.amount, 0))],
  });
}

function stockRep(el, r) {
  const cats = r.byCategory.map((c, i) => ({ label: c.name, value: c.value, color: PALETTE[i % PALETTE.length] }));
  const ageColors = [C.green, C.primary, C.amber, C.red];
  el.innerHTML = String(html`
    ${statStrip([{ label: 'Finished stock value', value: r.value, unit: '₹', icon: 'boxes' }, { label: 'Logs in yard', value: r.logAgeing.reduce((a, b) => a + b.cft, 0), unit: 'CFT', icon: 'log' }, { label: 'Logs older than 45 days', value: r.logAgeing[3].logs, unit: 'logs', icon: 'clock', bad: r.logAgeing[3].logs > 0 }, { label: 'Slow-moving products', value: r.slow.length, unit: '', icon: 'alert', sub: 'No dispatch in 30 days' }])}
    <div class="grid g3 mt">
      <div class="card"><div class="card-h"><h3>Value by category</h3></div><div class="card-b" style="display:flex;flex-direction:column;align-items:center;gap:12px"><div class="chart">${raw(donut({ items: cats, label: inrShort(r.value), sub: 'stock value', format: inr, size: 160 }))}</div>
        <div style="width:100%">${cats.map((c) => html`<div class="small" style="display:flex;padding:4px 0"><span class="dotlabel"><i style="background:${c.color}"></i>${c.label}</span><b class="num" style="margin-left:auto">${inrShort(c.value)}</b></div>`)}</div></div></div>
      <div class="card"><div class="card-h"><div><h3>Log ageing in yard</h3><div class="sub">Older logs crack and lose value</div></div></div><div class="card-b">
        <div class="split-bar">${r.logAgeing.map((a, i) => (a.cft ? html`<span style="flex:${a.cft};background:${ageColors[i]}" data-tip="${a.label}: ${fmt(a.cft)} CFT"></span>` : ''))}</div>
        <div class="rank mt">${r.logAgeing.map((a, i) => html`<div class="rank-row"><div><div class="rn dotlabel"><i style="background:${ageColors[i]}"></i>${a.label}</div><div class="rs">${a.logs} logs · ${inrShort(a.value)}</div></div><div class="rv">${fmt(a.cft)} CFT</div></div>`)}</div></div></div>
      <div class="card"><div class="card-h"><div><h3>Slow-moving stock</h3><div class="sub">No dispatch in the last 30 days</div></div></div><div class="card-b" style="padding-top:6px">
        ${r.slow.length ? html`<div class="rank">${r.slow.slice(0, 7).map((p) => html`<div class="rank-row"><div><div class="rn">${p.name}</div><div class="rs">${fmt(p.total)} ${p.unit}</div></div><div class="rv">${inrShort(p.value)}</div></div>`)}</div>` : html`<div class="empty">${ic('checkCircle', 'lg')}<div>Everything moved this month.</div></div>`}</div></div>
    </div>
    <div class="card mt" id="t1"></div>`);
  mountTable(el.querySelector('#t1'), {
    rows: r.top, exportName: 'top-stock', search: false, paginate: false, columns: [
      { key: 'name', label: 'Highest-value stock', render: (x) => html`<b style="font-weight:500">${x.name}</b>` }, { key: 'category', label: 'Category' },
      { key: 'total', label: 'On hand', num: true, render: (x) => `${fmt(x.total)} ${x.unit}` }, { key: 'value', label: 'Value', num: true, render: (x) => inr(x.value) },
    ],
  });
}
