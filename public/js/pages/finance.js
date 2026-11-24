import { get, post } from '../api.js';
import { html, raw, ic, inr, inrShort, fmt, date, dateShort, pill, mountTable, openModal, toast, statStrip, monthLabel, options, todayStr } from '../ui.js';
import { barChart, lineChart, legend, donut, pie, stackedHbar, isPhone } from '../charts.js';
import { can, go, rerender } from '../app.js';
import { receiptModal } from './distributors.js';

// Raajply keeps its books of account in Tally. This page gives the accounts office and the CA
// the working views (P&L, trial balance, GST, TDS, ageing, cash) and sends vouchers to Tally.
const GROUPS = [
  { name: 'Reports', tabs: [
    { id: 'overview', label: 'Overview', icon: 'dashboard' },
    { id: 'pnl', label: 'Profit & loss', icon: 'trend' },
    { id: 'tb', label: 'Trial balance', icon: 'scale' },
    { id: 'gst', label: 'GST', icon: 'shield' },
    { id: 'tds', label: 'TDS & due dates', icon: 'clock' },
    { id: 'ageing', label: 'Receivables & payables', icon: 'wallet' },
    { id: 'cashbank', label: 'Cash & bank', icon: 'bank' },
  ] },
  { name: 'Registers', tabs: [
    { id: 'invoices', label: 'Sales invoices', icon: 'file' },
    { id: 'receipts', label: 'Money received', icon: 'receipt' },
    { id: 'bills', label: 'Purchase bills', icon: 'log' },
    { id: 'payments', label: 'Payments made', icon: 'send' },
    { id: 'expenses', label: 'Expenses', icon: 'rupee' },
  ] },
  { name: 'Tally', tabs: [{ id: 'tally', label: 'Send to Tally', icon: 'download' }] },
];
const ALIAS = { cash: 'cashbank', bank: 'cashbank' };
const COL = { brand: '#4f46e5', soft: '#a5b4fc', amber: '#f59e0b', green: '#10b981', red: '#ef4444', orange: '#f97316', slate: '#94a3b8', teal: '#0d9488' };
const MIX = ['#4f46e5', '#b45309', '#0d9488', '#ec4899', '#0ea5e9', '#8b5cf6', '#64748b', '#f59e0b', '#10b981', '#ef4444'];
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
const pct = (v, t) => (t ? Math.round((v / t) * 1000) / 10 : 0);

function tabBar(active) {
  return html`<div class="tabs ftabs" role="tablist">${GROUPS.map((g, gi) => html`${gi ? raw('<span class="ft-sep" aria-hidden="true"></span>') : ''}<span class="ft-grp">${g.name}</span>${g.tabs.map((t) => html`<a class="tab ${t.id === active ? 'on' : ''}" role="tab" aria-selected="${t.id === active}" href="#/finance?tab=${t.id}">${ic(t.icon, 'sm')}${t.label}</a>`)}`)}</div>`;
}

export async function render(el, { route }) {
  const raw0 = route.query.get('tab') || 'overview';
  const tab = ALIAS[raw0] || raw0;
  el.innerHTML = String(html`
    <div class="page-head"><div><h1>Accounts</h1><div class="sub">Profit, GST, TDS and money owed — the working papers for your CA. The books of account stay in Tally.</div></div>
      <div class="actions">${can('tally.export') ? html`<a class="btn" href="#/finance?tab=tally">${ic('download', 'sm')} Send to Tally</a>` : ''}${can('finance.edit') ? html`<button class="btn primary" id="addRcpt">${ic('receipt', 'sm')} Money received</button>` : ''}</div></div>
    ${tabBar(tab)}
    <div id="body" class="fin-body"></div>`);
  // keep the active tab in view inside the scrollable tab strip (without scrolling the page)
  const strip = el.querySelector('.ftabs'), on = strip && strip.querySelector('.tab.on');
  if (on && strip.scrollWidth > strip.clientWidth) strip.scrollLeft = Math.max(0, on.offsetLeft - strip.offsetLeft - strip.clientWidth / 2 + on.offsetWidth / 2);
  if (can('finance.edit')) {
    el.querySelector('#addRcpt').onclick = async () => receiptModal(await get('/api/distributors'), null, () => rerender());
    const nw = route.query.get('new');
    if (nw) { history.replaceState(null, '', location.hash.replace(/([?&])new=[^&]*&?/, '$1').replace(/[?&]$/, '')); if (nw === 'expense') expenseModal(); else get('/api/distributors').then((ds) => receiptModal(ds, null, () => rerender())); }
  }
  const body = el.querySelector('#body');
  const views = { overview, pnl, tb: trialBalance, gst, tds, ageing, cashbank: (b) => cashbank(b, raw0 === 'cash' ? 'cash' : 'bank'), tally, invoices, receipts, bills, payments, expenses };
  await (views[tab] || overview)(body);
}

// ---------- small building blocks ----------
function card(title, sub, body, { right = '', cls = '' } = {}) {
  return html`<div class="card ${cls}"><div class="card-h"><div><h3>${title}</h3>${sub ? html`<div class="sub">${sub}</div>` : ''}</div>${right ? html`<div class="right">${right}</div>` : ''}</div>${body}</div>`;
}
/** Donut/pie with a legend list showing amount and share — legend sits beside on desktop, below on phones. */
function mixCard(title, sub, items, { center, centerSub, kind = 'donut', href, stack = false } = {}) {
  const total = items.reduce((a, b) => a + b.value, 0);
  const size = isPhone() ? 150 : 168;
  const chart = kind === 'pie' ? pie({ items, size, format: inrShort }) : donut({ items, size, label: center || inrShort(total), sub: centerSub || 'total', format: inrShort, thickness: 22 });
  return card(title, sub, html`<div class="card-b mix ${stack ? 'stack' : ''}"><div class="chart mix-c">${raw(chart)}</div>
    <div class="mix-l">${items.map((x) => html`<div class="mix-r" data-tip="${x.label}: ${inr(x.value)}"><i style="background:${x.color}"></i><span class="mix-n">${x.label}</span><span class="mix-p">${fmt(pct(x.value, total))}%</span><b>${inrShort(x.value)}</b></div>`)}</div></div>`, { right: href ? html`<a class="btn sm ghost" href="${href}">Details ${ic('chevronRight', 'sm')}</a>` : '' });
}
function urgency(d) { return d <= 7 ? 'bad' : d <= 15 ? 'warn' : 'ok'; }
function dueList(items, limit = 99) {
  if (!items.length) return html`<div class="empty small">Nothing due in the next few weeks.</div>`;
  return html`<div class="due-list">${items.slice(0, limit).map((c, i) => html`<div class="due ${urgency(c.daysLeft)}" style="--i:${i}">
    <div class="due-d"><b>${Number(c.date.slice(8))}</b><span>${dateShort(c.date).split(' ')[1]}</span></div>
    <div class="due-t"><b>${c.title}</b><span>${c.form || c.kind}</span></div>
    <div class="due-l"><b>${c.daysLeft === 0 ? 'Today' : c.daysLeft}</b>${c.daysLeft ? html`<span>days</span>` : ''}</div></div>`)}</div>`;
}
function periodLine(p, ok) {
  return html`<div class="fin-period"><span>${ic('clock', 'sm')} ${p.fy} · ${date(p.from)} → ${date(p.to)} <span class="muted">(demo data starts ${date(p.from)})</span></span>
    ${ok === undefined ? '' : ok ? html`<span class="tie good">${ic('checkCircle', 'sm')} Books tie — debits equal credits</span>` : html`<span class="tie bad">${ic('alert', 'sm')} Trial balance does not tie</span>`}</div>`;
}
function csvDownload(name, rows) {
  const cell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + rows.map((r) => r.map(cell).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = `${name}-${todayStr()}.csv`; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('CSV downloaded');
}

// ---------- 1. Overview ----------
async function overview(el) {
  const [s, o] = await Promise.all([get('/api/finance/statements/summary'), get('/api/finance/overview')]);
  const p = s.pnl;
  const cb = s.cash + s.bank;
  const ag = o.ageing;
  const ageItems = [['0–30 days', ag.b0, COL.brand], ['31–60 days', ag.b30, COL.amber], ['61–90 days', ag.b60, COL.orange], ['90+ days', ag.b90, COL.red]].map(([label, value, color]) => ({ label, value, color })).filter((x) => x.value > 0);
  const mix = s.mix.byCategory.map((x, i) => ({ ...x, color: MIX[i % MIX.length] }));
  const costs = s.costStructure.slice(0, 7).map((x, i) => ({ label: cap(x.label), value: x.value, color: MIX[i % MIX.length] }));
  const rest = s.costStructure.slice(7).reduce((a, x) => a + x.value, 0);
  if (rest) costs.push({ label: 'Other', value: rest, color: '#cbd5e1' });
  const series = [{ name: 'Sales', color: COL.brand }, { name: 'Collections', color: COL.soft }, { name: 'Purchases', color: COL.amber }];
  const cf = s.cashflow;
  el.innerHTML = String(html`
    ${periodLine(s.period, s.trialBalanceOk)}
    ${statStrip([
      { label: 'Revenue (FY to date)', value: p.revenue, unit: '₹', sub: `${fmt(s.mix.sqft)} sq ft · avg ₹${fmt(s.mix.avgRate)}/sq ft`, icon: 'trend', href: '#/finance?tab=pnl' },
      { label: 'Gross margin', value: p.grossPct, unit: '%', sub: `${inrShort(p.gross)} gross profit`, icon: 'gauge', good: p.grossPct >= 20, href: '#/finance?tab=pnl' },
      { label: 'Operating margin (EBITDA)', value: p.ebitdaPct, unit: '%', sub: `${inrShort(p.ebitda)} before depreciation & tax`, icon: 'chart', href: '#/finance?tab=pnl' },
      { label: 'Cash + bank', value: cb, unit: '₹', sub: `Bank ${inrShort(s.bank)} · cash ${inrShort(s.cash)}`, icon: 'bank', href: '#/finance?tab=cashbank' },
    ])}
    ${statStrip([
      { label: 'Receivables', value: s.receivables, unit: '₹', sub: `Collected in ~${s.dso} days (DSO)`, icon: 'wallet', bad: o.overdue > 0, href: '#/finance?tab=ageing' },
      { label: 'Payables', value: s.payables, unit: '₹', sub: `Paid in ~${s.dpo} days (DPO)`, icon: 'send', href: '#/finance?tab=ageing' },
      { label: 'GST to pay this month', value: s.gstThisMonth, unit: '₹', sub: 'Cash after input credit · 3B by 20th', icon: 'shield', href: '#/finance?tab=gst' },
      { label: 'MSME dues past 45 days', value: s.msmeAtRisk, unit: '₹', sub: s.msmeAtRisk ? 'Not deductible until paid — s.43B(h)' : 'All MSME suppliers paid in time', icon: 'alert', bad: s.msmeAtRisk > 0, good: !s.msmeAtRisk, href: '#/finance?tab=ageing' },
    ])}
    <div class="grid g-main mt">
      ${card('Money in and out', 'Sales, collections and purchases — last 6 months', html`<div class="card-b chart">${raw(barChart({ data: o.months.map((m) => ({ label: monthLabel(m.month), values: [m.revenue, m.collections, m.purchases] })), series, format: (v) => inrShort(v), height: 260 }))}</div>`, { right: raw(legend(series)) })}
      ${card('Due dates', 'GST, TDS, PF and income-tax deadlines', html`<div class="card-b" style="padding-top:10px">${dueList(s.compliance, 5)}<a class="btn sm mt" href="#/finance?tab=tds" style="width:100%">${ic('clock', 'sm')} All due dates</a></div>`)}
    </div>
    <div class="grid g3 mt">
      ${mixCard('What we sell', 'Sales by plywood type (net of GST)', mix, { centerSub: 'sales', href: '#/reports?tab=sales' })}
      ${mixCard('Where the money goes', 'Purchases and expenses', costs, { kind: 'pie' })}
      ${mixCard('Who owes us, how long', 'Receivables by age', ageItems, { center: inrShort(o.receivables), centerSub: 'owed to us', href: '#/finance?tab=ageing' })}
    </div>
    <div class="grid g-main mt">
      ${card('Cash & bank balance', 'Month-end balances', html`<div class="card-b chart">${raw(lineChart({ labels: cf.map((m) => monthLabel(m.month)), series: [{ name: 'Bank', color: COL.brand, values: cf.map((m) => m.bank) }, { name: 'Cash in hand', color: COL.green, values: cf.map((m) => m.cash), dash: true }], format: inrShort, height: 240 }))}</div>`, { right: raw(legend([{ name: 'Bank', color: COL.brand }, { name: 'Cash', color: COL.green }])) })}
      ${card('Tally', 'Books of account', html`<div class="card-b" data-tallybox><div class="skeleton" style="height:120px"></div></div>`)}
    </div>
    <div class="card mt"><div class="card-h"><div><h3>Monthly summary</h3><div class="sub">Taxable values · the current month is partial</div></div></div>
      <div class="table-wrap"><table class="t"><thead><tr><th>Month</th><th class="num">Sales</th><th class="num">Purchases</th><th class="num">Expenses</th><th class="num">Collected</th><th class="num">GST payable (net)</th></tr></thead><tbody>
      ${o.months.map((m) => html`<tr><td><b>${monthLabel(m.month)}</b></td><td class="num">${inr(m.revenue)}</td><td class="num">${inr(m.purchases)}</td><td class="num">${inr(m.expenses)}</td><td class="num">${inr(m.collections)}</td><td class="num">${inr(m.gstNet)}</td></tr>`)}
      </tbody></table></div></div>`);
  const box = el.querySelector('[data-tallybox]');
  if (can('tally.export')) {
    const t = await get('/api/tally');
    const n = t.pending.sales + t.pending.receipts + t.pending.purchases;
    const last = t.exports[0];
    box.innerHTML = String(html`<div class="tally-mini"><div class="tm-n ${n ? 'warn' : 'good'}">${n}</div><div><b>${n ? 'entries waiting for Tally' : 'Tally is up to date'}</b><div class="small muted">${t.pending.sales} sales · ${t.pending.receipts} receipts · ${t.pending.purchases} purchases</div></div></div>
      <div class="small muted mt">${last ? html`Last sent ${date(last.ts.slice(0, 10))} by ${last.user} (${last.sales + last.receipts + last.purchases} vouchers).` : 'Nothing sent yet.'}</div>
      <a class="btn primary mt" href="#/finance?tab=tally" style="width:100%">${ic('download', 'sm')} Open Send to Tally</a>`);
  } else box.innerHTML = String(html`<div class="small muted">Ask Accounts to send the latest entries to Tally.</div>`);
}

// ---------- 2. Profit & loss ----------
async function pnl(el) {
  const d = await get('/api/finance/statements/pnl');
  const s = d.summary, cs = d.closingStock;
  const cols = [...d.months, 'total'];
  const rev = d.lines.find((l) => l.strong)?.values || {};
  const gp = d.lines.find((l) => /Gross profit/.test(l.label || ''))?.values || {};
  const eb = d.lines.find((l) => /EBITDA/.test(l.label || ''))?.values || {};
  const bars = [{ name: 'Sales', color: COL.soft }, { name: 'Gross profit', color: COL.brand }, { name: 'EBITDA', color: COL.green }];
  el.innerHTML = String(html`
    ${periodLine(d.period)}
    <div class="pl-hero">
      <div class="plh"><span>Sales</span><b>${inrShort(s.revenue)}</b><small>net of GST</small></div>
      <div class="plh-op">−</div>
      <div class="plh"><span>Materials</span><b>${inrShort(s.purchases)}</b><small>${fmt(pct(s.purchases, s.revenue))}% of sales</small></div>
      <div class="plh-op">−</div>
      <div class="plh"><span>Factory costs</span><b>${inrShort(s.direct)}</b><small>wages, power, fuel…</small></div>
      <div class="plh-op">=</div>
      <div class="plh good"><span>Gross profit</span><b>${inrShort(s.gross)}</b><small>${fmt(s.grossPct)}% margin</small></div>
      <div class="plh-op">−</div>
      <div class="plh"><span>Office costs</span><b>${inrShort(s.indirect)}</b><small>salaries, admin</small></div>
      <div class="plh-op">=</div>
      <div class="plh good strong"><span>Operating profit</span><b>${inrShort(s.ebitda)}</b><small>${fmt(s.ebitdaPct)}% · before dep. & tax</small></div>
    </div>
    <div class="card mt"><div class="card-h"><div><h3>Statement of profit and loss</h3><div class="sub">Schedule III format · monthly · ₹</div></div><div class="right"><button class="btn sm" id="plCsv">${ic('download', 'sm')} Export CSV</button><button class="btn sm" data-print>${ic('printer', 'sm')} Print</button></div></div>
      <div class="table-wrap"><table class="t pl-t"><thead><tr><th>Particulars</th>${d.months.map((m) => html`<th class="num">${monthLabel(m)}</th>`)}<th class="num">Total</th><th class="num">% of sales</th></tr></thead><tbody>
      ${d.lines.map((l) => (l.section ? html`<tr class="pl-sec"><td colspan="${cols.length + 2}">${l.section}</td></tr>`
        : html`<tr class="${l.total ? 'pl-total' : l.subtotal ? 'pl-sub' : l.strong ? 'pl-strong' : ''}"><td class="${l.indent ? 'pl-ind' : ''}">${l.label}</td>${cols.map((k) => html`<td class="num ${l.values[k] < 0 ? 'neg' : ''}">${inr(l.values[k])}</td>`)}<td class="num muted">${fmt(pct(l.values.total, s.revenue))}%</td></tr>
          ${l.margin ? html`<tr class="pl-margin"><td>${l.label.startsWith('Gross') ? 'Gross margin' : 'Operating margin'}</td>${cols.map((k) => html`<td class="num">${fmt(l.margin[k])}%</td>`)}<td></td></tr>` : ''}`))}
      </tbody></table></div>
      <div class="card-b small muted">${d.notes.map((n) => html`<div class="pl-note">${ic('info', 'sm')}<span>${n}</span></div>`)}</div></div>
    <div class="grid g-main mt">
      ${card('Profit month by month', 'Sales, gross profit and operating profit', html`<div class="card-b chart">${raw(barChart({ data: d.months.map((m) => ({ label: monthLabel(m), values: [rev[m] || 0, gp[m] || 0, eb[m] || 0] })), series: bars, format: inrShort, height: 250 }))}</div>`, { right: raw(legend(bars)) })}
      ${card('Closing stock for valuation', 'AS-2 · lower of cost and net realisable value', html`<div class="card-b"><dl class="kv-list cs-list">
        <dt>Logs in yard <span class="muted">(${fmt(cs.logCft)} CFT, at purchase cost)</span></dt><dd class="num">${inr(cs.logs)}</dd>
        <dt>Plywood in godown <span class="muted">(at list price)</span></dt><dd class="num">${inr(cs.plywoodAtList)}</dd>
        <dt>Plywood at estimated cost <span class="muted">(${fmt(cs.costRatio)}% cost ratio)</span></dt><dd class="num">${inr(cs.plywoodAtCost)}</dd>
        <dt><b>Closing stock (est.)</b></dt><dd class="num"><b>${inr(cs.total)}</b></dd></dl>
        <div class="notice plain small mt">${ic('info', 'sm')}<span>Cost ratio = (materials + factory costs) ÷ sales for the period. Final valuation is done by the CA from the physical stock count.</span></div></div>`)}
    </div>`);
  el.querySelector('#plCsv').onclick = () => csvDownload('profit-and-loss', [['Particulars', ...d.months.map(monthLabel), 'Total'], ...d.lines.map((l) => (l.section ? [l.section] : [l.label, ...cols.map((k) => l.values[k])]))]);
}

// ---------- 3. Trial balance ----------
async function trialBalance(el) {
  const t = await get('/api/finance/statements/trial-balance');
  const groups = [];
  for (const r of t.rows) { let g = groups.find((x) => x.name === r.group); if (!g) groups.push(g = { name: r.group, rows: [] }); g.rows.push(r); }
  const ok = t.difference === 0;
  el.innerHTML = String(html`
    <div class="tb-check ${ok ? 'good' : 'bad'}"><span class="tb-ic">${ic(ok ? 'checkCircle' : 'alert')}</span><div><b>${ok ? 'Debits equal credits — the books tie' : `Difference of ${inr(t.difference, 2)}`}</b><span>Built from every invoice, receipt, bill, payment and expense between ${date(t.from)} and ${date(t.to)}. Opening cash & bank are taken as capital.</span></div>
      <div class="tb-tot"><div><small>Total debit</small><b>${inr(t.totalDr, 2)}</b></div><div><small>Total credit</small><b>${inr(t.totalCr, 2)}</b></div></div></div>
    <div class="card mt"><div class="card-h"><div><h3>Trial balance</h3><div class="sub">As on ${date(t.to)} · grouped like Tally</div></div><div class="right"><button class="btn sm" id="tbCsv">${ic('download', 'sm')} Export CSV</button><button class="btn sm" data-print>${ic('printer', 'sm')} Print</button></div></div>
      <div class="table-wrap"><table class="t tb-t"><thead><tr><th>Ledger</th><th class="num">Debit (₹)</th><th class="num">Credit (₹)</th></tr></thead><tbody>
      ${groups.map((g) => html`<tr class="pl-sec"><td colspan="3">${g.name}</td></tr>${g.rows.map((r) => html`<tr><td class="pl-ind">${r.name}</td><td class="num">${r.dr ? inr(r.dr, 2) : ''}</td><td class="num">${r.cr ? inr(r.cr, 2) : ''}</td></tr>`)}`)}
      </tbody><tfoot><tr><td>Total</td><td class="num">${inr(t.totalDr, 2)}</td><td class="num">${inr(t.totalCr, 2)}</td></tr></tfoot></table></div></div>`);
  el.querySelector('#tbCsv').onclick = () => csvDownload('trial-balance', [['Group', 'Ledger', 'Debit', 'Credit'], ...t.rows.map((r) => [r.group, r.name, r.dr || '', r.cr || '']), ['', 'Total', t.totalDr, t.totalCr]]);
}

// ---------- 4. GST ----------
async function gst(el, month) {
  const [g, h] = await Promise.all([get(`/api/finance/statements/gstr3b${month ? `?month=${month}` : ''}`), get('/api/finance/gst')]);
  const o = g.outward, i = g.itc;
  const usedItc = g.totalItc - g.carryForward.total;
  const split = [{ label: 'Paid from input credit', value: usedItc, color: COL.green }, { label: 'Paid in cash', value: g.cash.total, color: COL.brand }].filter((x) => x.value > 0);
  const tr = [{ name: 'Output tax', color: COL.soft }, { name: 'Input credit', color: COL.green }, { name: 'Cash paid', color: COL.brand }];
  const row = (sec, label, a, b, c, d, cls = '') => html`<tr class="${cls}"><td class="g-sec">${sec}</td><td>${label}</td><td class="num">${a === null ? '' : inr(a)}</td><td class="num">${b === null ? '' : inr(b)}</td><td class="num">${c === null ? '' : inr(c)}</td><td class="num">${d === null ? '' : inr(d)}</td></tr>`;
  el.innerHTML = String(html`
    <div class="seg-row"><span class="small muted">Return period</span><div class="seg" id="gm">${g.months.map((m) => html`<button type="button" class="${m === g.month ? 'on' : ''}" data-m="${m}">${monthLabel(m)}</button>`)}</div></div>
    ${statStrip([
      { label: 'Outward taxable value', value: o.taxable, unit: '₹', sub: `${o.invoices} B2B invoices · HSN 4412`, icon: 'file' },
      { label: 'Output tax', value: g.totalTax, unit: '₹', sub: `CGST ${inrShort(o.cgst)} · SGST ${inrShort(o.sgst)}${o.igst ? ` · IGST ${inrShort(o.igst)}` : ''}`, icon: 'trend' },
      { label: 'Input tax credit', value: g.totalItc, unit: '₹', sub: `Imports ${inrShort(i.importIgst)} · stores ${inrShort(i.otherCgst + i.otherSgst)}`, icon: 'receipt' },
      { label: 'Cash to pay', value: g.cash.total, unit: '₹', sub: `GSTR-1 by ${dateShort(g.due.gstr1)} · 3B by ${dateShort(g.due.gstr3b)}`, icon: 'bank', bad: g.cash.total > 0 },
    ])}
    <div class="card mt"><div class="card-h"><div><h3>GSTR-3B working — ${monthLabel(g.month)}</h3><div class="sub">Table 3.1, 4 and 6.1 · ITC set-off as per rule 88A</div></div><div class="right"><button class="btn sm" data-print>${ic('printer', 'sm')} Print</button></div></div>
        <div class="table-wrap"><table class="t g3b"><thead><tr><th>Table</th><th>Nature</th><th class="num">Taxable / total</th><th class="num">IGST</th><th class="num">CGST</th><th class="num">SGST</th></tr></thead><tbody>
          ${row('3.1(a)', 'Outward taxable supplies (plywood)', o.taxable, o.igst, o.cgst, o.sgst)}
          ${row('3.1(c)', html`Purchases from farmers (unregistered, no GST) <span class="muted small">· ${i.farmerBills} bills</span>`, i.farmerValue, null, null, null, 'muted-row')}
          ${row('4(A)(1)', html`Import of goods — IGST on Bill of Entry (IMPG) <span class="muted small">· ${i.importBills} BoE</span>`, i.importIgst, i.importIgst, 0, 0)}
          ${row('4(A)(5)', html`All other ITC — stores & consumables <span class="muted small">· ${i.otherBills} bills</span>`, i.otherCgst + i.otherSgst, i.otherIgst, i.otherCgst, i.otherSgst)}
          ${row('4(C)', 'Net ITC available', g.totalItc, i.importIgst + i.otherIgst, i.otherCgst, i.otherSgst, 'pl-sub')}
          ${row('6.1', 'Tax payable', g.totalTax, o.igst, o.cgst, o.sgst)}
          ${row('6.1', 'Paid through ITC', usedItc, null, null, null)}
          ${row('6.1', 'Paid in cash (electronic cash ledger)', g.cash.total, g.cash.igst, g.cash.cgst, g.cash.sgst, 'pl-total')}
          ${g.carryForward.total ? row('—', 'ITC carried forward', g.carryForward.total, g.carryForward.igst, g.carryForward.cgst, g.carryForward.sgst) : ''}
        </tbody></table></div>
        <div class="card-b small muted"><div class="pl-note">${ic('info', 'sm')}<span>IGST credit is used first against IGST, then CGST, then SGST. Import IGST is claimed from the Bill of Entry as it appears in GSTR-2B (IMPG). Confirm with GSTR-2B before filing.</span></div></div></div>
    <div class="grid g-main mt">
      ${card('GST over 6 months', 'Output tax, input credit and cash paid', html`<div class="card-b chart">${raw(barChart({ data: g.trend.map((m) => ({ label: monthLabel(m.month), values: [m.output, m.itc, m.cash] })), series: tr, format: inrShort, height: 240 }))}</div>`, { right: raw(legend(tr)) })}
      ${mixCard(`How ${monthLabel(g.month)} tax is paid`, 'Input credit vs cash', split, { center: inrShort(g.totalTax), centerSub: 'output tax', stack: true })}
    </div>
    <div class="mt">
      ${card('HSN summary', 'This month — for GSTR-1 Table 12', html`<div class="table-wrap"><table class="t"><thead><tr><th>HSN</th><th class="num">Rate</th><th class="num">Taxable</th><th class="num">CGST</th><th class="num">SGST</th><th class="num">IGST</th></tr></thead><tbody>
        ${h.hsnThisMonth.map((x) => html`<tr><td class="mono"><b>${x.hsn}</b></td><td class="num">${x.gstRate}%</td><td class="num">${inr(x.taxable)}</td><td class="num">${inr(x.cgst)}</td><td class="num">${inr(x.sgst)}</td><td class="num">${inr(x.igst)}</td></tr>`)}
      </tbody></table></div>`)}
    </div>`);
  el.querySelector('#gm').addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (b && b.dataset.m !== g.month) { el.style.opacity = '.5'; gst(el, b.dataset.m).finally(() => { el.style.opacity = ''; }); } });
}

// ---------- 5. TDS & due dates ----------
async function tds(el) {
  const [t, c] = await Promise.all([get('/api/finance/statements/tds'), get('/api/finance/statements/compliance')]);
  const deduct = t.rows.filter((r) => r.tds > 0);
  el.innerHTML = String(html`
    ${statStrip([
      { label: `TDS to deduct (${t.fy})`, value: t.total, unit: '₹', sub: `${deduct.length} part${deduct.length === 1 ? 'y' : 'ies'} above the limit`, icon: 'receipt', bad: t.total > 0 },
      { label: 'Purchases checked (194Q)', value: t.rows.filter((r) => r.section === '194Q').length, unit: 'parties', sub: 'Limit ₹50 L per seller per year', icon: 'log' },
      { label: 'Next deadline', value: c[0] ? c[0].daysLeft : 0, unit: 'days', sub: c[0] ? `${c[0].title} · ${date(c[0].date)}` : 'Nothing due', icon: 'clock', bad: c[0] && c[0].daysLeft <= 7 },
    ])}
    <div class="grid g-main mt">
      <div class="card" id="tdsT"></div>
      ${card('Due dates', 'Next 10 weeks', html`<div class="card-b" style="padding-top:10px">${dueList(c)}</div>`)}
    </div>
    <div class="card mt"><div class="card-b small muted">${t.notes.map((n) => html`<div class="pl-note">${ic('info', 'sm')}<span>${n}</span></div>`)}</div></div>`);
  mountTable(el.querySelector('#tdsT'), {
    rows: t.rows, exportName: 'tds-working', pageSize: 20, search: false,
    filters: [{ id: 'd', label: 'To deduct', test: (r) => r.tds > 0 }, { id: '194Q', label: '194Q', test: (r) => r.section === '194Q' }, { id: '194C', label: '194C', test: (r) => r.section === '194C' }],
    columns: [
      { key: 'party', label: 'Party', render: (r) => html`<b>${r.party}</b><div class="small muted">${r.type} · ${r.bills} bills</div>` },
      { key: 'section', label: 'Section', render: (r) => html`<span class="tag">${r.section}</span><div class="small muted">${r.nature}</div>` },
      { key: 'base', label: 'Paid this year', num: true, render: (r) => inr(r.base) },
      { key: 'rate', label: 'Rate', num: true, render: (r) => `${r.rate}%` },
      { key: 'tds', label: 'TDS', num: true, render: (r) => (r.tds ? html`<b>${inr(r.tds)}</b>` : '—') },
      { key: 'status', label: 'What to do', render: (r) => html`<span class="pill ${r.tds ? 'warn' : /Not applicable/.test(r.status) ? 'neutral' : 'good'}">${r.status}</span>`, sort: false },
    ],
    footer: (rs) => ['Total', '', inr(rs.reduce((a, r) => a + r.base, 0)), '', inr(rs.reduce((a, r) => a + r.tds, 0)), ''],
  });
}

// ---------- 6. Receivables & payables ----------
async function ageing(el) {
  const a = await get('/api/finance/statements/ageing');
  const B = [['b0', '0–30 days', COL.brand], ['b30', '31–60 days', COL.amber], ['b60', '61–90 days', COL.orange], ['b90', '90+ days', COL.red]];
  const parts = (r) => B.map(([k, name, color]) => ({ name, value: r[k], color }));
  const msme = a.msme;
  el.innerHTML = String(html`
    ${statStrip([
      { label: 'Receivables (we will get)', value: a.receivables, unit: '₹', sub: `Distributors pay in ~${a.dso} days`, icon: 'wallet' },
      { label: 'Overdue from distributors', value: a.debtors.reduce((s, d) => s + d.overdue, 0), unit: '₹', sub: `${a.debtors.filter((d) => d.overdue > 0).length} distributors past credit days`, icon: 'alert', bad: true },
      { label: 'Payables (we must pay)', value: a.payables, unit: '₹', sub: `We pay suppliers in ~${a.dpo} days`, icon: 'send' },
      { label: 'MSME past 45 days', value: msme.atRisk, unit: '₹', sub: msme.atRisk ? `${msme.bills.length} bills — pay before 31 March` : 'None — all within 45 days', icon: 'shield', bad: msme.atRisk > 0, good: !msme.atRisk },
    ])}
    <div class="msme ${msme.atRisk ? 'bad' : msme.soon.length ? 'warn' : 'good'} mt">
      <div class="msme-h"><span class="msme-ic">${ic('shield')}</span><div><b>MSME payments — Income-tax s.43B(h)</b><span>Bills from Udyam-registered suppliers must be paid within 45 days (written agreement) or the expense is disallowed for the year until paid.</span></div></div>
      ${msme.bills.length || msme.soon.length ? html`<div class="msme-list">${[...msme.bills.map((b) => ({ ...b, late: true })), ...msme.soon].map((b) => html`<div class="msme-r ${b.late ? 'late' : ''}"><b>${b.party}</b><span>${b.no} · ${date(b.date)} · ${b.age} days old</span><span class="msme-pay">${b.late ? 'Overdue — pay now' : `Pay by ${date(b.payBy)}`}</span><b class="num">${inr(b.balance)}</b></div>`)}</div>`
        : html`<div class="small" style="padding:0 16px 14px">All MSME bills are within 45 days. Nothing at risk.</div>`}
    </div>
    <div class="grid g2 mt">
      ${card('Money owed by distributors', 'Split by how old the invoice is', html`<div class="card-b chart">${raw(stackedHbar({ rows: a.debtors.filter((d) => d.outstanding > 0).map((d) => ({ label: d.name, parts: parts(d) })), format: inrShort, width: isPhone() ? 380 : 560 }))}<div class="mt">${raw(legend(B.map(([, name, color]) => ({ name, color }))))}</div></div>`)}
      ${card('Money we owe suppliers', 'Split by how old the bill is', html`<div class="card-b chart">${raw(stackedHbar({ rows: a.creditors.slice(0, 8).map((c) => ({ label: c.name.replace(' (sample)', ''), parts: parts(c) })), format: inrShort, width: isPhone() ? 380 : 560 }))}<div class="mt">${raw(legend(B.map(([, name, color]) => ({ name, color }))))}</div></div>`)}
    </div>
    <div class="section-title"><h2>Debtors ageing</h2><span class="sub">Sundry debtors · FIFO allocation of receipts</span></div>
    <div class="card" id="dT"></div>
    <div class="section-title"><h2>Creditors ageing</h2><span class="sub">Sundry creditors · bills with a balance</span></div>
    <div class="card" id="cT"></div>`);
  const bucketCols = B.map(([k, label]) => ({ key: k, label, num: true, render: (r) => (r[k] ? inr(r[k]) : html`<span class="muted">—</span>`) }));
  mountTable(el.querySelector('#dT'), {
    rows: a.debtors, exportName: 'debtors-ageing', search: false, pageSize: 20, onRow: (r) => go(`#/distributors/${r.id}`),
    columns: [
      { key: 'name', label: 'Distributor', render: (r) => html`<b>${r.name}</b><div class="small muted">${r.city} · ${r.creditDays} days credit</div>` },
      ...bucketCols,
      { key: 'outstanding', label: 'Total', num: true, render: (r) => html`<b>${inr(r.outstanding)}</b>` },
      { key: 'overdue', label: 'Overdue', num: true, render: (r) => (r.overdue ? html`<span style="color:var(--bad);font-weight:600">${inr(r.overdue)}</span>` : '—') },
      { key: 'avgDaysToPay', label: 'Pays in', num: true, render: (r) => (r.avgDaysToPay == null ? '—' : `${r.avgDaysToPay} d`) },
    ],
    footer: (rs) => ['Total', ...B.map(([k]) => inr(rs.reduce((s, r) => s + r[k], 0))), inr(rs.reduce((s, r) => s + r.outstanding, 0)), inr(rs.reduce((s, r) => s + r.overdue, 0)), ''],
  });
  mountTable(el.querySelector('#cT'), {
    rows: a.creditors, exportName: 'creditors-ageing', search: false, pageSize: 20,
    filters: [{ id: 'msme', label: 'MSME', test: (r) => r.msme }, { id: 'Import', label: 'Imports', test: (r) => r.type === 'Import' }, { id: 'Farmer', label: 'Farmers', test: (r) => r.type === 'Farmer' }],
    columns: [
      { key: 'name', label: 'Supplier', render: (r) => html`<b>${r.name}</b><div class="small muted">${r.type}${r.msme ? html` · <span class="tag msme-tag">MSME</span>` : ''}</div>` },
      ...bucketCols,
      { key: 'outstanding', label: 'Total', num: true, render: (r) => html`<b>${inr(r.outstanding)}</b>` },
      { key: 'beyond45', label: 'MSME > 45 d', num: true, render: (r) => (r.beyond45 ? html`<span style="color:var(--bad);font-weight:600">${inr(r.beyond45)}</span>` : '—') },
    ],
    footer: (rs) => ['Total', ...B.map(([k]) => inr(rs.reduce((s, r) => s + r[k], 0))), inr(rs.reduce((s, r) => s + r.outstanding, 0)), inr(rs.reduce((s, r) => s + r.beyond45, 0))],
  });
}

// ---------- 7. Cash & bank ----------
async function cashbank(el, kind = 'bank') {
  const c = await get('/api/finance/statements/cashflow');
  const m = c.months;
  const fl = [{ name: 'Money in', color: COL.green }, { name: 'Money out', color: COL.red }];
  el.innerHTML = String(html`
    ${statStrip([
      { label: 'Bank balance', value: c.bank, unit: '₹', sub: 'Current account', icon: 'bank' },
      { label: 'Cash in hand', value: c.cash, unit: '₹', sub: 'Petty cash', icon: 'rupee' },
      { label: 'Total', value: c.bank + c.cash, unit: '₹', sub: `In ${inrShort(m.reduce((a, x) => a + x.inflow, 0))} · out ${inrShort(m.reduce((a, x) => a + x.outflow, 0))} (6 months)`, icon: 'wallet' },
    ])}
    <div class="grid g2 mt">
      ${card('Month-end balances', 'Bank and cash', html`<div class="card-b chart">${raw(lineChart({ labels: m.map((x) => monthLabel(x.month)), series: [{ name: 'Bank', color: COL.brand, values: m.map((x) => x.bank) }, { name: 'Cash', color: COL.green, values: m.map((x) => x.cash), dash: true }], format: inrShort, height: 230 }))}</div>`, { right: raw(legend([{ name: 'Bank', color: COL.brand }, { name: 'Cash', color: COL.green }])) })}
      ${card('Money in vs money out', 'Receipts vs payments & expenses', html`<div class="card-b chart">${raw(barChart({ data: m.map((x) => ({ label: monthLabel(x.month), values: [x.inflow, x.outflow] })), series: fl, format: inrShort, height: 230 }))}</div>`, { right: raw(legend(fl)) })}
    </div>
    <div class="seg-row mt"><div class="seg" id="bk"><button type="button" data-k="bank" class="${kind === 'bank' ? 'on' : ''}">${ic('bank', 'sm')} Bank book</button><button type="button" data-k="cash" class="${kind === 'cash' ? 'on' : ''}">${ic('rupee', 'sm')} Cash book</button></div></div>
    <div id="bookBox" class="mt"></div>`);
  const box = el.querySelector('#bookBox');
  await bookTable(box, kind);
  el.querySelector('#bk').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-k]'); if (!b || b.classList.contains('on')) return;
    el.querySelectorAll('#bk button').forEach((x) => x.classList.toggle('on', x === b));
    box.style.opacity = '.5'; await bookTable(box, b.dataset.k); box.style.opacity = '';
  });
}
async function bookTable(el, kind) {
  const b = await get(`/api/finance/book/${kind}`);
  el.innerHTML = '<div class="card" id="t"></div>';
  mountTable(el.querySelector('#t'), {
    rows: b.rows, exportName: `${kind}-book`, pageSize: 25, placeholder: 'Search particulars, reference…',
    columns: [
      { key: 'date', label: 'Date', render: (r) => date(r.date) }, { key: 'ref', label: 'Voucher', render: (r) => html`<span class="mono small">${r.ref}</span>` },
      { key: 'particulars', label: 'Particulars' }, { key: 'mode', label: 'Mode', render: (r) => r.mode || '' },
      { key: 'in', label: 'Receipts (in)', num: true, render: (r) => (r.in ? html`<span style="color:var(--good)">${inr(r.in)}</span>` : '') },
      { key: 'out', label: 'Payments (out)', num: true, render: (r) => (r.out ? html`<span style="color:var(--bad)">${inr(r.out)}</span>` : '') },
      { key: 'balance', label: 'Balance', num: true, render: (r) => html`<b>${inr(r.balance)}</b>` },
    ],
  });
}

// ---------- 9. Send to Tally ----------
async function tally(el) {
  const t = await get('/api/tally');
  const n = t.pending.sales + t.pending.receipts + t.pending.purchases;
  const today = new Date().toISOString().slice(0, 10);
  el.innerHTML = String(html`
    <div class="grid g-main">
      <div class="card"><div class="card-h"><div><h3>Send entries to Tally</h3><div class="sub">Makes a file that Tally can import — sales, receipts and purchase vouchers with GST already split</div></div></div><div class="card-b">
        <div class="tally-steps">
          <div class="ts"><span>1</span><div><b>Choose what to send</b><small>New entries only, so nothing goes twice</small></div></div>
          <div class="ts"><span>2</span><div><b>Download the file</b><small>Raajply-Tally-….xml</small></div></div>
          <div class="ts"><span>3</span><div><b>Import in Tally</b><small>Gateway of Tally → Import → Vouchers → choose the file</small></div></div>
        </div>
        <form id="tf" class="form mt">
          <div class="f2"><div class="field"><label>From</label><input class="input" type="date" name="from" value="${t.pending.oldest || today}"></div><div class="field"><label>To</label><input class="input" type="date" name="to" value="${today}" max="${today}"></div></div>
          <div class="checks">
            <label class="check"><input type="checkbox" name="sales" checked><span><b>Sales invoices</b><small>${t.pending.sales} new · ${inrShort(t.pending.salesValue)}</small></span></label>
            <label class="check"><input type="checkbox" name="receipts" checked><span><b>Money received</b><small>${t.pending.receipts} new</small></span></label>
            <label class="check"><input type="checkbox" name="purchases" checked><span><b>Purchase bills</b><small>${t.pending.purchases} new · logs & stores</small></span></label>
          </div>
          <label class="check slim"><input type="checkbox" name="onlyNew" checked><span>Only entries not sent before</span></label>
          <button class="btn primary" type="submit" ${n ? '' : 'disabled'}>${ic('download', 'sm')} ${n ? `Download Tally file (${n} entries)` : 'Everything is already in Tally'}</button>
        </form>
      </div></div>
      <div class="card"><div class="card-h"><div><h3>Ledger names used</h3><div class="sub">Must match the ledgers in your Tally company</div></div></div><div class="card-b"><dl class="kv-list small">
        ${[['Sales', t.ledgers.sales], ['Output CGST / SGST', `${t.ledgers.cgstOut} · ${t.ledgers.sgstOut}`], ['Purchase — farmer logs', t.ledgers.purchaseLogs], ['Purchase — imported logs', t.ledgers.purchaseImport], ['Purchase — stores', t.ledgers.purchaseStores], ['Input GST', `${t.ledgers.cgstIn} · ${t.ledgers.sgstIn} · ${t.ledgers.igstIn}`], ['Bank', t.ledgers.bank], ['Round off', t.ledgers.roundOff]].map(([k, v]) => html`<dt>${k}</dt><dd class="mono">${v}</dd>`)}
        </dl><div class="small muted mt">Distributors and suppliers are matched by name. These names can be changed to match Raajply's Tally after the visit.</div></div></div>
    </div>
    <div class="card mt" id="hist"></div>`);
  const f = el.querySelector('#tf');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const types = ['sales', 'receipts', 'purchases'].filter((k) => f[k].checked);
    if (!types.length) { toast('Tick at least one type', 'bad'); return; }
    try {
      const r = await post('/api/tally/export', { from: f.from.value, to: f.to.value, types, onlyNew: f.onlyNew.checked });
      download(r.filename, r.xml);
      toast(`${r.id}: ${r.sales} sales, ${r.receipts} receipts, ${r.purchases} purchases — file downloaded`);
      rerender();
    } catch (ex) { toast(ex.message, 'bad'); }
  });
  mountTable(el.querySelector('#hist'), {
    rows: t.exports, exportName: 'tally-exports', pageSize: 10, search: false,
    columns: [
      { key: 'no', label: 'Export', render: (r) => html`<b>${r.no}</b><div class="small muted">${date(r.ts.slice(0, 10))} ${r.ts.slice(11)}</div>` },
      { key: 'from', label: 'Dates', render: (r) => html`${date(r.from)} → ${date(r.to)}` },
      { key: 'sales', label: 'Sales', num: true }, { key: 'receipts', label: 'Receipts', num: true }, { key: 'purchases', label: 'Purchases', num: true },
      { key: 'user', label: 'By' },
      { key: 'dl', label: '', render: (r) => html`<button class="btn sm" data-dl="${r.id}">${ic('download', 'sm')} File again</button>` },
    ],
  });
  el.querySelector('#hist').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-dl]'); if (!b) return;
    e.stopPropagation();
    try { const r = await get(`/api/tally/export/${b.dataset.dl}`); download(r.filename, r.xml); } catch (ex) { toast(ex.message, 'bad'); }
  });
}

function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/xml' }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}


// ---------- 8. Registers ----------
async function invoices(el) {
  const rows = await get('/api/finance/invoices');
  el.innerHTML = '<div class="card" id="t"></div>';
  mountTable(el.querySelector('#t'), {
    rows, exportName: 'sales-invoices', pageSize: 20, onRow: (r) => go(`#/invoice/${encodeURIComponent(r.id)}`), placeholder: 'Search invoice, distributor, e-way bill…',
    filters: ['Unpaid', 'Part paid', 'Overdue', 'Paid'].map((s) => ({ id: s, label: s, test: (r) => r.status === s })),
    columns: [
      { key: 'no', label: 'Invoice', render: (r) => html`<b class="nowrap">${r.no}</b><div class="small muted">${date(r.date)}</div>` },
      { key: 'distributor', label: 'Distributor', render: (r) => html`${r.distributor}<div class="small muted">${r.state}</div>` },
      { key: 'taxable', label: 'Taxable', num: true, render: (r) => inr(r.taxable) },
      { key: 'gst', label: 'GST', num: true, render: (r) => inr(r.gst) },
      { key: 'total', label: 'Total', num: true, render: (r) => html`<b>${inr(r.total)}</b>` },
      { key: 'balance', label: 'Balance', num: true, render: (r) => (r.balance ? inr(r.balance) : '—') },
      { key: 'dueDate', label: 'Due', render: (r) => date(r.dueDate) },
      { key: 'ewayBill', label: 'E-way bill', render: (r) => (r.ewayBill ? html`<span class="mono small">${r.ewayBill}</span>` : html`<span class="muted small">—</span>`) },
      { key: 'status', label: 'Status', render: (r) => html`${pill(r.status)}${r.overdueDays ? html`<div class="small muted">${r.overdueDays} d late</div>` : ''}` },
    ],
    footer: (rs) => ['Total', '', inr(rs.reduce((a, r) => a + r.taxable, 0)), inr(rs.reduce((a, r) => a + r.gst, 0)), inr(rs.reduce((a, r) => a + r.total, 0)), inr(rs.reduce((a, r) => a + r.balance, 0)), '', '', ''],
  });
}
async function receipts(el) {
  const rows = await get('/api/finance/receipts');
  el.innerHTML = '<div class="card" id="t"></div>';
  mountTable(el.querySelector('#t'), {
    rows, exportName: 'receipts', pageSize: 20, filters: ['NEFT', 'RTGS', 'UPI', 'Cheque', 'Cash'].map((s) => ({ id: s, label: s, test: (r) => r.mode === s })),
    columns: [
      { key: 'no', label: 'Receipt', render: (r) => html`<b>${r.no}</b>` }, { key: 'date', label: 'Date', render: (r) => date(r.date) },
      { key: 'distributor', label: 'From', render: (r) => html`<a href="#/distributors/${r.distributorId}">${r.distributor}</a>` },
      { key: 'mode', label: 'Mode', render: (r) => html`<span class="tag">${r.mode}</span>` }, { key: 'ref', label: 'Reference', render: (r) => html`<span class="mono small">${r.ref}</span>` },
      { key: 'note', label: 'Note', render: (r) => html`<span class="small muted">${r.note}</span>` }, { key: 'amount', label: 'Amount', num: true, render: (r) => html`<b>${inr(r.amount)}</b>` }, { key: 'user', label: 'By' },
    ],
    footer: (rs) => ['Total', '', '', '', '', '', inr(rs.reduce((a, r) => a + r.amount, 0)), ''],
  });
}
async function bills(el) {
  const rows = await get('/api/finance/purchase-bills');
  el.innerHTML = '<div class="card" id="t"></div>';
  mountTable(el.querySelector('#t'), {
    rows, exportName: 'purchase-bills', pageSize: 20, placeholder: 'Search bill, supplier…',
    filters: ['Due', 'Overdue', 'Part paid', 'Paid'].map((s) => ({ id: s, label: s, test: (r) => r.status === s })),
    columns: [
      { key: 'no', label: 'Bill', render: (r) => html`<b>${r.no}</b><div class="small muted">${date(r.date)}</div>` },
      { key: 'supplier', label: 'Supplier', render: (r) => html`${r.supplier}<div class="small muted">${r.supplierType}${r.supplierBillNo ? ` · ref ${r.supplierBillNo}` : ''}</div>` },
      { key: 'description', label: 'Description', render: (r) => html`<span class="small">${r.description}</span><div class="small"><a href="#/yard/${r.gateEntryId}">${r.gateEntryId}</a></div>` },
      { key: 'total', label: 'Total', num: true, render: (r) => inr(r.total) }, { key: 'balance', label: 'Balance', num: true, render: (r) => (r.balance ? html`<b>${inr(r.balance)}</b>` : '—') },
      { key: 'dueDate', label: 'Due', render: (r) => date(r.dueDate) }, { key: 'status', label: 'Status', render: (r) => pill(r.status) },
      { key: 'x', label: '', sort: false, render: (r) => (r.balance > 0 && can('finance.edit') ? html`<button class="btn sm" data-pay="${r.id}">Pay</button>` : '') },
    ],
    footer: (rs) => ['Total', '', '', inr(rs.reduce((a, r) => a + r.total, 0)), inr(rs.reduce((a, r) => a + r.balance, 0)), '', '', ''],
  });
  el.addEventListener('click', (e) => { const b = e.target.closest('[data-pay]'); if (b) payModal(rows.find((r) => r.id === b.dataset.pay)); });
}
function payModal(b) {
  openModal({
    title: `Pay ${b.supplier} — ${b.no}`, submit: 'Record payment',
    body: html`<div class="form"><dl class="kv-list"><dt>Bill total</dt><dd>${inr(b.total)}</dd><dt>Balance</dt><dd><b>${inr(b.balance)}</b></dd><dt>Due</dt><dd>${date(b.dueDate)}</dd></dl>
      <div class="f2"><div class="field"><label>Amount</label><input class="input" type="number" name="amount" min="1" max="${b.balance}" value="${b.balance}" required></div>
      <div class="field"><label>Mode</label><select class="input" name="mode"><option>Bank (RTGS)</option><option>Bank (NEFT)</option><option>UPI</option><option>Cheque</option><option>Cash</option></select></div></div>
      <div class="field"><label>UTR / cheque no.</label><input class="input" name="ref"></div>
      <div class="notice warn small">${ic('shield', 'sm')}<span>Payments above ₹5,00,000 need the MD. Cash above ₹10,000 is blocked (Income Tax s.40A(3)).</span></div></div>`,
    onSubmit: async (f) => { const p = await post('/api/finance/supplier-payments', { billId: b.id, amount: f.amount.value, mode: f.mode.value, ref: f.ref.value }); toast(`${p.no} recorded — ${inr(p.amount)}`); rerender(); },
  });
}
async function payments(el) {
  const rows = await get('/api/finance/supplier-payments');
  el.innerHTML = '<div class="card" id="t"></div>';
  mountTable(el.querySelector('#t'), {
    rows, exportName: 'supplier-payments', pageSize: 20, columns: [
      { key: 'no', label: 'Payment', render: (r) => html`<b>${r.no}</b>` }, { key: 'date', label: 'Date', render: (r) => date(r.date) }, { key: 'supplier', label: 'Supplier' },
      { key: 'billId', label: 'Against bill' }, { key: 'mode', label: 'Mode', render: (r) => html`<span class="tag">${r.mode}</span>` }, { key: 'ref', label: 'Reference', render: (r) => html`<span class="mono small">${r.ref}</span>` },
      { key: 'amount', label: 'Amount', num: true, render: (r) => html`<b>${inr(r.amount)}</b>` }, { key: 'user', label: 'By' },
    ],
    footer: (rs) => ['Total', '', '', '', '', '', inr(rs.reduce((a, r) => a + r.amount, 0)), ''],
  });
}
const EXP_CATS = ['Wages', 'Salaries', 'Electricity', 'Diesel', 'Boiler fuel', 'Consumables', 'Repairs & maintenance', 'Freight', 'Rent & lease', 'Office & admin'];
async function expenses(el) {
  const rows = await get('/api/finance/expenses');
  el.innerHTML = '<div class="card" id="t"></div>';
  mountTable(el.querySelector('#t'), {
    rows, exportName: 'expenses', pageSize: 20, placeholder: 'Search description, paid to…',
    toolbar: can('finance.edit') ? html`<button class="btn sm primary" type="button" data-addexp>${ic('plus', 'sm')} Add expense</button>` : '',
    filters: EXP_CATS.map((c) => ({ id: c, label: c, test: (r) => r.category === c })),
    columns: [
      { key: 'no', label: 'Voucher', render: (r) => html`<b>${r.no}</b>` }, { key: 'date', label: 'Date', render: (r) => date(r.date) },
      { key: 'category', label: 'Category', render: (r) => html`<span class="tag">${r.category}</span>` }, { key: 'description', label: 'Description' },
      { key: 'paidTo', label: 'Paid to' }, { key: 'mode', label: 'Mode' }, { key: 'amount', label: 'Amount', num: true, render: (r) => html`<b>${inr(r.amount)}</b>` },
    ],
    footer: (rs) => ['Total', '', '', '', '', '', inr(rs.reduce((a, r) => a + r.amount, 0))],
  });
  el.addEventListener('click', (e) => { if (e.target.closest('[data-addexp]')) expenseModal(); });
}
function expenseModal() {
  openModal({
    title: 'Add expense', submit: 'Save expense',
    body: html`<div class="form"><div class="f2"><div class="field"><label>Category</label><select class="input" name="category">${options(EXP_CATS.map((c) => ({ id: c, name: c })), '')}</select></div>
      <div class="field"><label>Amount (₹)</label><input class="input" type="number" min="1" name="amount" required></div></div>
      <div class="field"><label>Description</label><input class="input" name="description" placeholder="e.g. Bandsaw blade sharpening" required></div>
      <div class="f2"><div class="field"><label>Paid to</label><input class="input" name="paidTo"></div><div class="field"><label>Paid from</label><select class="input" name="mode"><option>Bank</option><option>Cash</option></select></div></div></div>`,
    onSubmit: async (f) => { const e = await post('/api/finance/expenses', { category: f.category.value, amount: f.amount.value, description: f.description.value, paidTo: f.paidTo.value, mode: f.mode.value }); toast(`${e.no} saved`); rerender(); },
  });
}
