import { get, post } from '../api.js';
import { html, ic, inr, inrShort, date, pill, mountTable, openModal, toast, statStrip, initials, avatarColor, options, todayStr } from '../ui.js';
import { can, go, rerender } from '../app.js';
import { newOrder } from './orders.js';

export async function render(el, { route }) {
  if (route.id) return detail(el, route.id, route.query.get('tab') || 'ledger');
  const rows = await get('/api/distributors');
  const tot = (f) => rows.reduce((a, r) => a + r[f], 0);
  el.innerHTML = String(html`
    <div class="page-head"><div><h1>Distributors</h1><div class="sub">${rows.length} distributors · credit limits, outstanding and payment behaviour</div></div></div>
    ${statStrip([{ label: 'Total outstanding', value: tot('outstanding'), unit: '₹', sub: `Across ${rows.filter((r) => r.outstanding > 0).length} distributors`, icon: 'wallet' }, { label: 'Overdue', value: tot('overdue'), unit: '₹', sub: `${rows.filter((r) => r.overdue > 0).length} distributors past due date`, icon: 'alert', bad: tot('overdue') > 0 }, { label: 'Over credit limit', value: rows.filter((r) => r.overLimit).length, unit: '', sub: 'New orders go on hold', icon: 'shield', bad: rows.some((r) => r.overLimit) }, { label: 'Sales, 6 months', value: tot('sales6m'), unit: '₹', sub: 'Taxable value invoiced', icon: 'cart' }])}
    <div class="card mt" id="tbl"></div>`);
  const states = [...new Set(rows.map((r) => r.state))];
  mountTable(el.querySelector('#tbl'), {
    rows, exportName: 'distributors', onRow: (r) => go(`#/distributors/${r.id}`), pageSize: 25, sort: 4, placeholder: 'Search name, city, code…',
    filters: [...states.map((s) => ({ id: s, label: s, test: (r) => r.state === s })), { id: 'over', label: 'Over limit', test: (r) => r.overLimit }, { id: 'overdue', label: 'Has overdue', test: (r) => r.overdue > 0 }],
    columns: [
      { key: 'name', label: 'Distributor', render: (r) => html`<span class="cell-main"><span class="avatar" style="background:${avatarColor(r.name)}">${initials(r.name)}</span><span><div class="n">${r.name}</div><div class="s">${r.code} · ${r.city}, ${r.state}</div></span></span>` },
      { key: 'creditLimit', label: 'Credit limit', num: true, render: (r) => inrShort(r.creditLimit) },
      { key: 'creditDays', label: 'Terms', num: true, render: (r) => `${r.creditDays} d` },
      { key: 'creditUsedPct', label: 'Credit used', num: true, render: (r) => html`<div style="min-width:120px"><div class="bar ${r.creditUsedPct > 100 ? 'bad' : r.creditUsedPct > 80 ? 'warn' : ''}"><span style="width:${Math.min(100, r.creditUsedPct)}%"></span></div><div class="small muted mt-s">${r.creditUsedPct}%</div></div>` },
      { key: 'outstanding', label: 'Outstanding', num: true, render: (r) => inr(r.outstanding) },
      { key: 'overdue', label: 'Overdue', num: true, render: (r) => (r.overdue > 0 ? html`<b style="color:var(--bad)">${inr(r.overdue)}</b>` : '—') },
      { key: 'avgDaysToPay', label: 'Avg. days to pay', num: true, render: (r) => (r.avgDaysToPay === null ? '—' : html`<span style="color:${r.avgDaysToPay > r.creditDays ? 'var(--bad)' : 'inherit'}">${r.avgDaysToPay} d</span>`), sort: (r) => r.avgDaysToPay ?? 0 },
      { key: 'lastOrder', label: 'Last order', render: (r) => date(r.lastOrder) },
    ],
    footer: (rs) => [`${rs.length} distributors`, inrShort(rs.reduce((a, r) => a + r.creditLimit, 0)), '', '', inr(rs.reduce((a, r) => a + r.outstanding, 0)), inr(rs.reduce((a, r) => a + r.overdue, 0)), '', ''],
  });
}

async function detail(el, id, tab) {
  const d = await get(`/api/distributors/${encodeURIComponent(id)}`);
  const ag = d.ageing, agTot = ag.b0 + ag.b30 + ag.b60 + ag.b90 || 1;
  const buckets = [['0–30 days', ag.b0, '#4f46e5'], ['31–60 days', ag.b30, '#f59e0b'], ['61–90 days', ag.b60, '#f97316'], ['90+ days', ag.b90, '#ef4444']];
  el.innerHTML = String(html`
    <div class="crumbs"><a href="#/distributors">Distributors</a>${ic('chevronRight', 'sm')}${d.name}</div>
    <div class="page-head">
      <div class="cell-main"><span class="avatar" style="width:52px;height:52px;border-radius:14px;font-size:18px;background:${avatarColor(d.name)}">${initials(d.name)}</span>
        <div><h1>${d.name}</h1><div class="sub">${d.code} · ${d.city}, ${d.state} · ${d.contact} · ${d.phone} · GSTIN <span class="mono">${d.gstin}</span></div></div></div>
      <div class="actions">${can('finance.edit') ? html`<button class="btn" id="rcpt">${ic('receipt', 'sm')} Record receipt</button>` : ''}${can('sales.edit') ? html`<button class="btn primary" id="order">${ic('plus', 'sm')} New order</button>` : ''}</div>
    </div>
    ${d.overLimit ? html`<div class="notice bad" style="margin-bottom:16px">${ic('alert', 'sm')}<span><b>Over credit limit.</b> Exposure ${inr(d.exposure)} vs limit ${inr(d.creditLimit)}. New orders will be held for Finance approval.</span></div>` : ''}
    ${statStrip([{ label: 'Outstanding', value: d.outstanding, unit: '₹', icon: 'wallet', sub: `${d.invoices.filter((i) => i.balance > 0).length} unpaid invoice(s)` }, { label: 'Overdue', value: d.overdue, unit: '₹', icon: 'alert', bad: d.overdue > 0, sub: `Terms: ${d.creditDays} days` }, { label: 'Credit available', value: d.creditAvailable, unit: '₹', icon: 'shield', bad: d.creditAvailable < 0, sub: `Limit ${inrShort(d.creditLimit)} · ${d.creditUsedPct}% used` }, { label: 'Avg. days to pay', value: d.avgDaysToPay ?? 0, unit: 'days', icon: 'clock', bad: d.avgDaysToPay > d.creditDays, sub: `Sales 6 months ${inrShort(d.sales6m)}` }])}
    <div class="grid g-main mt">
      <div class="card"><div class="card-h"><div><h3>Outstanding by age</h3><div class="sub">Days since invoice date</div></div></div><div class="card-b">
        <div style="display:flex;height:16px;border-radius:99px;overflow:hidden;background:#ece9e1">${buckets.map(([l, v, c]) => (v > 0 ? html`<span style="width:${(v / agTot) * 100}%;background:${c}" data-tip="${l}: ${inr(v)}"></span>` : ''))}</div>
        <div class="grid g4 mt">${buckets.map(([l, v, c]) => html`<div><div class="small muted" style="display:flex;gap:6px;align-items:center"><i style="width:9px;height:9px;border-radius:3px;background:${c};display:inline-block"></i>${l}</div><div style="font-weight:700;font-size:16px">${inr(v)}</div></div>`)}</div>
      </div></div>
      <div class="card"><div class="card-h"><h3>Account</h3></div><div class="card-b"><dl class="kv-list">
        <dt>Territory</dt><dd>${d.territory}</dd><dt>Discount</dt><dd>${d.discount}% off list</dd><dt>Customer since</dt><dd>${date(d.since)}</dd><dt>Open orders</dt><dd>${inr(d.pendingOrders)}</dd>
      </dl></div></div>
    </div>
    <div class="mt">${html`<div class="tabs">${[['ledger', 'Ledger'], ['invoices', `Invoices (${d.invoices.length})`], ['orders', `Orders (${d.orders.length})`]].map(([k, l]) => html`<a class="tab ${tab === k ? 'on' : ''}" href="#/distributors/${d.id}?tab=${k}">${l}</a>`)}</div>`}</div>
    <div class="card" id="tbl"></div>`);
  const box = el.querySelector('#tbl');
  if (tab === 'ledger') {
    mountTable(box, {
      rows: d.ledger.slice().reverse(), exportName: `ledger-${d.code}`, pageSize: 20, search: true, placeholder: 'Search ref, mode…',
      columns: [
        { key: 'date', label: 'Date', render: (r) => date(r.date) },
        { key: 'type', label: 'Type', render: (r) => pill(r.type, r.type === 'Invoice' ? 'info' : 'good') },
        { key: 'ref', label: 'Reference', render: (r) => (r.type === 'Invoice' && can('finance.view') ? html`<a href="#/invoice/${encodeURIComponent(r.ref)}">${r.ref}</a>` : r.ref) },
        { key: 'particulars', label: 'Particulars', render: (r) => html`<span class="small">${r.particulars}</span>` },
        { key: 'debit', label: 'Debit', num: true, render: (r) => (r.debit ? inr(r.debit) : '') },
        { key: 'credit', label: 'Credit', num: true, render: (r) => (r.credit ? inr(r.credit) : '') },
        { key: 'balance', label: 'Balance', num: true, render: (r) => html`<b>${inr(r.balance)}</b> <span class="small muted">Dr</span>` },
      ],
    });
  } else if (tab === 'invoices') {
    mountTable(box, {
      rows: d.invoices, exportName: `invoices-${d.code}`, onRow: (r) => can('finance.view') && go(`#/invoice/${encodeURIComponent(r.id)}`),
      filters: ['Unpaid', 'Part paid', 'Overdue', 'Paid'].map((s) => ({ id: s, label: s, test: (r) => r.status === s })),
      columns: [
        { key: 'no', label: 'Invoice', render: (r) => html`<b>${r.no}</b>` }, { key: 'date', label: 'Date', render: (r) => date(r.date) }, { key: 'dueDate', label: 'Due', render: (r) => date(r.dueDate) },
        { key: 'total', label: 'Amount', num: true, render: (r) => inr(r.total) }, { key: 'paid', label: 'Paid', num: true, render: (r) => inr(r.paid) }, { key: 'balance', label: 'Balance', num: true, render: (r) => (r.balance ? html`<b>${inr(r.balance)}</b>` : '—') },
        { key: 'status', label: 'Status', render: (r) => html`${pill(r.status)}${r.overdueDays ? html` <span class="small muted">${r.overdueDays} d late</span>` : ''}` },
      ],
    });
  } else {
    mountTable(box, {
      rows: d.orders, onRow: (r) => go(`#/orders/${r.id}`), columns: [
        { key: 'no', label: 'Order', render: (r) => html`<b>${r.no}</b>` }, { key: 'date', label: 'Date', render: (r) => date(r.date) }, { key: 'items', label: 'Items', num: true },
        { key: 'grandTotal', label: 'Total', num: true, render: (r) => inr(r.grandTotal) }, { key: 'status', label: 'Status', render: (r) => pill(r.status) },
      ],
    });
  }
  const o = el.querySelector('#order'); if (o) o.onclick = () => newOrder(d.id);
  const rc = el.querySelector('#rcpt'); if (rc) rc.onclick = () => receiptModal([d], d.id, () => detail(el, id, tab));
}

export function receiptModal(dists, pre, after) {
  openModal({
    title: 'Record payment received', submit: 'Save receipt',
    body: html`<div class="form">
      <div class="field"><label>Distributor</label><select class="input" name="distributorId" required>${options(dists, pre || '', { placeholder: 'Choose distributor…', label: (d) => `${d.name}${d.outstanding !== undefined ? ` — outstanding ${inr(d.outstanding)}` : ''}` })}</select></div>
      <div class="f2"><div class="field"><label>Amount (₹)</label><input class="input" type="number" min="1" name="amount" required></div><div class="field"><label>Date</label><input class="input" type="date" name="date" value="${todayStr()}" max="${todayStr()}"></div></div>
      <div class="f2"><div class="field"><label>Mode</label><select class="input" name="mode"><option>NEFT</option><option>RTGS</option><option>UPI</option><option>Cheque</option><option>Cash</option></select></div><div class="field"><label>UTR / cheque no.</label><input class="input" name="ref" placeholder="UTR or cheque number"></div></div>
      <div class="notice info small">${ic('info', 'sm')}<span>Receipts are applied to the oldest unpaid invoices first. Cash receipts of ₹2,00,000 or more are blocked (Income Tax s.269ST).</span></div>
    </div>`,
    onOpen: (f) => { const set = () => { const d = dists.find((x) => x.id === f.distributorId.value); if (d && d.outstanding && !f.amount.value) f.amount.value = Math.round(d.overdue || d.outstanding); }; f.distributorId.addEventListener('change', set); set(); },
    onSubmit: async (f) => {
      const r = await post('/api/finance/receipts', { distributorId: f.distributorId.value, amount: f.amount.value, mode: f.mode.value, ref: f.ref.value, date: f.date.value });
      toast(`${r.no} saved — ${inr(r.amount)}`);
      if (after) after(); else rerender();
    },
  });
}
