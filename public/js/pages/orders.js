import { get, post } from '../api.js';
import { html, raw, ic, inr, inrShort, fmt, date, ts, pill, mountTable, openModal, toast, options, statStrip, confirmBox, esc, todayStr } from '../ui.js';
import { productArt } from '../art.js';
import { can, masters, speciesColor, go, refreshBadges } from '../app.js';

const STATUSES = ['Pending approval', 'On hold (credit)', 'Approved', 'Dispatched', 'Cancelled'];

export async function render(el, { route }) {
  if (route.id) return detail(el, route.id);
  const rows = await get('/api/sales/orders');
  const month = todayStr().slice(0, 7);
  const mRows = rows.filter((r) => r.date.startsWith(month) && r.status !== 'Cancelled');
  el.innerHTML = String(html`
    <div class="page-head"><div><h1>Sales Orders</h1><div class="sub">Distributor orders in sheets, billed per square foot · stock and credit checked automatically</div></div>
      <div class="actions">${can('sales.edit') ? html`<button class="btn primary" id="newOrder">${ic('plus', 'sm')} New order</button>` : ''}</div></div>
    ${statStrip([{ label: 'Awaiting approval', value: rows.filter((r) => r.status === 'Pending approval').length, unit: '', sub: 'Accounts to approve', icon: 'clock' }, { label: 'On credit hold', value: rows.filter((r) => r.status === 'On hold (credit)').length, unit: '', sub: 'Over credit limit — MD to decide', icon: 'alert', bad: rows.some((r) => r.status === 'On hold (credit)') }, { label: 'Ready to dispatch', value: rows.filter((r) => r.status === 'Approved').length, unit: '', sub: 'Approved orders', icon: 'truck' }, { label: 'Orders this month', value: mRows.reduce((a, r) => a + r.grandTotal, 0), unit: '₹', sub: `${mRows.length} orders incl. GST`, icon: 'cart' }])}
    <div class="card mt" id="tbl"></div>`);
  if (can('sales.edit')) el.querySelector('#newOrder').onclick = () => newOrder();
  if (route.query.get('new') && can('sales.edit')) { history.replaceState(null, '', location.hash.replace(/([?&])new=[^&]*&?/, '$1').replace(/[?&]$/, '')); newOrder(); }
  mountTable(el.querySelector('#tbl'), {
    rows, exportName: 'sales-orders', onRow: (r) => go(`#/orders/${r.id}`), placeholder: 'Search order, distributor, city…',
    filterValue: route.query.get('status'),
    filters: STATUSES.map((s) => ({ id: s, label: s, test: (r) => r.status === s })),
    columns: [
      { key: 'no', label: 'Order', render: (r) => html`<b>${r.no}</b><div class="small muted">${date(r.date)}</div>` },
      { key: 'distributor', label: 'Distributor', render: (r) => html`<div style="font-weight:600">${r.distributor}</div><div class="small muted">${r.city}</div>` },
      { key: 'sheets', label: 'Sheets', num: true, render: (r) => fmt(r.sheets) },
      { key: 'subtotal', label: 'Taxable', num: true, render: (r) => inr(r.subtotal) },
      { key: 'grandTotal', label: 'Total incl. GST', num: true, render: (r) => html`<b>${inr(r.grandTotal)}</b>` },
      { key: 'createdBy', label: 'Taken by' },
      { key: 'status', label: 'Status', render: (r) => pill(r.status) },
    ],
  });
}

export async function newOrder(preDistributor) {
  const [m, dists, stock] = await Promise.all([masters(), get('/api/distributors'), can('inventory.view') ? get('/api/inventory/stock') : Promise.resolve(null)]);
  const avail = Object.fromEntries((stock?.products || []).map((p) => [p.id, p.available]));
  const prods = m.products.filter((p) => p.active);
  const line = () => `<tr data-line><td data-label="Product"><select class="input sm" name="productId" aria-label="Product"><option value="">Choose product…</option>${prods.map((p) => `<option value="${p.id}">${esc(p.name)}${stock ? ` — ${fmt(Math.max(0, avail[p.id] ?? 0))} ${p.unit} avail.` : ''}</option>`).join('')}</select></td><td data-label="Sheets" style="width:100px"><input class="input sm" type="number" min="0" step="1" inputmode="numeric" name="qty" aria-label="Sheets"></td><td class="num small muted" data-label="Sq ft" data-sqft style="width:90px">—</td><td data-label="₹ per sq ft" style="width:110px"><input class="input sm" type="number" min="0" step="0.01" inputmode="decimal" name="rate" aria-label="Rate per sq ft"></td><td class="num" data-label="Amount" data-amt style="width:120px">—</td><td class="ln-x" style="width:40px"><button type="button" class="btn ghost sm" data-del aria-label="Remove">${String(ic('x', 'sm'))}</button></td></tr>`;
  openModal({
    title: 'New sales order', wide: true, submit: 'Place order',
    body: html`<div class="form">
      <div class="f2"><div class="field"><label>Distributor</label><select class="input" name="distributorId" required>${options(dists.filter((d) => d.active), preDistributor || '', { placeholder: 'Choose distributor…', label: (d) => `${d.name} — ${d.city}` })}</select></div>
        <div class="field"><label>Note (optional)</label><input class="input" name="note" placeholder="Delivery instructions…"></div></div>
      <div data-credit></div>
      <div class="card" style="box-shadow:none"><div class="table-wrap"><table class="t lines-t"><thead><tr><th>Product</th><th>Sheets</th><th class="num">Sq ft</th><th>₹ / sq ft</th><th class="num">Amount</th><th></th></tr></thead><tbody data-lines>${raw(line() + line())}</tbody></table></div>
        <div style="padding:10px 12px"><button type="button" class="btn sm" data-add>${ic('plus', 'sm')} Add product</button></div></div>
    </div>`,
    footLeft: 'Total ₹0',
    onOpen: (f, modal) => {
      const tb = f.querySelector('[data-lines]');
      const dist = () => dists.find((d) => d.id === f.distributorId.value);
      const recalc = () => {
        const d = dist();
        let sub = 0, gross = 0;
        tb.querySelectorAll('[data-line]').forEach((tr) => {
          const p = prods.find((x) => x.id === tr.querySelector('[name=productId]').value);
          const q = Number(tr.querySelector('[name=qty]').value) || 0;
          const rate = Number(tr.querySelector('[name=rate]').value) || 0;
          const sqft = p && p.sqftPerSheet ? q * p.sqftPerSheet : q;
          const amt = Math.round(sqft * rate);
          tr.querySelector('[data-sqft]').textContent = p && q ? fmt(sqft) : '—';
          tr.querySelector('[data-amt]').textContent = amt ? inr(amt) : '—';
          if (p) { sub += amt; gross += amt * (1 + p.gst / 100); }
          const qi = tr.querySelector('[name=qty]');
          qi.style.borderColor = p && stock && q > (avail[p.id] ?? 0) ? 'var(--bad)' : '';
        });
        modal.setFoot(html`Taxable <b>${inr(sub)}</b> · Total incl. GST <b>${inr(gross)}</b>`);
        const box = f.querySelector('[data-credit]');
        if (!d) { box.innerHTML = ''; return; }
        const after = d.exposure + gross;
        const over = after > d.creditLimit;
        box.innerHTML = String(html`<div class="notice ${over ? 'bad' : d.overdue > 0 ? 'warn' : 'good'}">${ic(over ? 'alert' : 'shield', 'sm')}<span>Credit limit <b>${inrShort(d.creditLimit)}</b> · outstanding <b>${inrShort(d.outstanding)}</b>${d.pendingOrders ? html` · open orders <b>${inrShort(d.pendingOrders)}</b>` : ''} · after this order <b>${inrShort(after)}</b> (${Math.round((after / d.creditLimit) * 100)}%)${d.overdue > 0 ? html` · <b>${inrShort(d.overdue)} overdue</b>` : ''}.
          ${over ? html`<br><b>This order will go on credit hold</b> until the MD approves it.` : ''}</span></div>`);
      };
      const setRate = (tr) => { const d = dist(); const p = prods.find((x) => x.id === tr.querySelector('[name=productId]').value); if (p) tr.querySelector('[name=rate]').value = Math.round(p.rate * (1 - ((d && d.discount) || 0) / 100) * 100) / 100; };
      tb.addEventListener('change', (e) => { if (e.target.name === 'productId') setRate(e.target.closest('tr')); recalc(); });
      tb.addEventListener('input', recalc);
      tb.addEventListener('click', (e) => { const b = e.target.closest('[data-del]'); if (b) { b.closest('tr').remove(); recalc(); } });
      f.querySelector('[data-add]').onclick = () => { tb.insertAdjacentHTML('beforeend', line()); };
      f.distributorId.addEventListener('change', () => { tb.querySelectorAll('[data-line]').forEach(setRate); recalc(); });
      recalc();
    },
    onSubmit: async (f) => {
      const lines = [...f.querySelectorAll('[data-line]')].map((tr) => ({ productId: tr.querySelector('[name=productId]').value, qty: tr.querySelector('[name=qty]').value, rate: tr.querySelector('[name=rate]').value })).filter((l) => l.productId);
      if (!f.distributorId.value) throw new Error('Choose a distributor');
      if (!lines.length) throw new Error('Add at least one product');
      const o = await post('/api/sales/orders', { distributorId: f.distributorId.value, note: f.note.value, lines });
      toast(o.creditHold ? `${o.no} placed — on credit hold for Finance approval` : `${o.no} placed — waiting for approval`, o.creditHold ? 'bad' : 'good');
      refreshBadges();
      go(`#/orders/${o.id}`);
    },
  });
}

async function detail(el, id) {
  const [o, m] = await Promise.all([get(`/api/sales/orders/${encodeURIComponent(id)}`), masters()]);
  const d = o.distributor;
  const steps = [['Order placed', o.ts, o.createdByName], ['Approved', o.approvedAt, o.approvedByName], ['Dispatched', o.dispatch?.ts, o.dispatch ? `${o.dispatch.vehicle}` : null], ['Delivered', o.dispatch?.deliveredOn, null]];
  el.innerHTML = String(html`
    <div class="crumbs"><a href="#/orders">Sales Orders</a>${ic('chevronRight', 'sm')}${o.no}</div>
    <div class="page-head"><div><h1>${o.no} · ${d.name}</h1><div class="sub">${date(o.date)} · ${d.city}, ${d.state} · taken by ${o.createdByName}${o.note ? ` · ${o.note}` : ''}</div></div>
      <div class="actions">${pill(o.status)}
        ${o.canApprove ? html`<button class="btn primary" id="approve">${ic('check', 'sm')} Approve</button>` : ''}
        ${o.canCancel ? html`<button class="btn danger" id="cancel">${ic('x', 'sm')} Cancel</button>` : ''}
        ${o.invoice && can(['finance.view', 'sales.view']) ? html`<a class="btn" href="#/invoice/${encodeURIComponent(o.invoice.id)}">${ic('file', 'sm')} Invoice ${o.invoice.no}</a>` : ''}</div></div>
    ${o.status === 'On hold (credit)' ? html`<div class="notice bad" style="margin-bottom:16px">${ic('alert', 'sm')}<span>This order exceeds ${d.name}'s credit limit. It is waiting in <a href="#/approvals">Approvals</a> for the MD.</span></div>` : ''}
    <div class="grid g-main">
      <div class="card"><div class="card-h"><h3>Items</h3></div><div class="table-wrap"><table class="t"><thead><tr><th>Product</th><th class="num">Sheets</th><th class="num">Sq ft</th><th class="num">₹ / sq ft</th><th class="num">Taxable</th><th class="num">GST</th><th class="num">Total</th></tr></thead><tbody>
        ${o.lines.map((l) => { const p = m.products.find((x) => x.id === l.productId) || {}; return html`<tr><td><span class="cell-main"><span class="thumb">${raw(productArt(p, speciesColor(p.species)))}</span><span><div class="n">${l.name}</div><div class="s">HSN ${l.hsn}</div></span></span></td><td class="num">${fmt(l.qty)}${l.unit === 'Sheet' ? '' : ` ${l.unit}`}</td><td class="num">${l.sqft ? fmt(l.sqft) : '—'}</td><td class="num">${inr(l.rate, 2)}</td><td class="num">${inr(l.amount)}</td><td class="num">${l.gst}%</td><td class="num">${inr(l.amount * (1 + l.gst / 100))}</td></tr>`; })}
        </tbody><tfoot><tr><td>Total</td><td class="num">${fmt(o.lines.reduce((a, l) => a + l.qty, 0))}</td><td class="num">${fmt(o.lines.reduce((a, l) => a + (l.sqft || 0), 0))}</td><td></td><td class="num">${inr(o.subtotal)}</td><td></td><td class="num">${inr(o.grandTotal)}</td></tr></tfoot></table></div></div>
      <div class="stack">
        <div class="card"><div class="card-h"><h3>Progress</h3></div><div class="card-b"><div class="timeline">${steps.map(([label, t, by]) => html`<div class="tl"><span class="dot" style="${t ? '' : 'background:#fff;border-color:var(--border-strong)'}"></span><div><div class="tt" style="${t ? 'font-weight:600' : 'color:var(--text-3)'}">${label}</div><div class="tm">${t ? html`${t.length > 10 ? ts(t) : date(t)}${by ? ` · ${by}` : ''}` : 'Not yet'}</div></div></div>`)}</div></div></div>
        <div class="card"><div class="card-h"><h3>Distributor credit</h3><div class="right"><a class="btn sm" href="#/distributors/${d.id}">Profile</a></div></div><div class="card-b"><dl class="kv-list">
          <dt>Credit limit</dt><dd>${inr(d.creditLimit)} · ${d.creditDays} days</dd><dt>Outstanding</dt><dd>${inr(d.outstanding)}</dd><dt>Overdue</dt><dd style="color:${d.overdue ? 'var(--bad)' : 'inherit'}">${inr(d.overdue)}</dd><dt>Credit used</dt><dd>${d.creditUsedPct}%</dd></dl>
          <div class="bar mt ${d.creditUsedPct > 100 ? 'bad' : d.creditUsedPct > 80 ? 'warn' : ''}"><span style="width:${Math.min(100, d.creditUsedPct)}%"></span></div></div></div>
        ${o.dispatch ? html`<div class="card"><div class="card-h"><h3>Dispatch</h3></div><div class="card-b"><dl class="kv-list"><dt>Dispatch</dt><dd>${o.dispatch.no}</dd><dt>Vehicle</dt><dd class="mono">${o.dispatch.vehicle}</dd><dt>Transporter</dt><dd>${o.dispatch.transporter}</dd><dt>E-way bill</dt><dd class="mono">${o.dispatch.ewayBill || 'Not required (< ₹50,000)'}</dd><dt>Status</dt><dd>${pill(o.dispatch.status)}</dd></dl></div></div>` : ''}
      </div>
    </div>`);
  const ap = el.querySelector('#approve');
  if (ap) ap.onclick = async () => { try { await post(`/api/sales/orders/${encodeURIComponent(o.id)}/approve`); toast(`${o.no} approved — ready for dispatch`); refreshBadges(); detail(el, id); } catch (e) { toast(e.message, 'bad'); } };
  const cn = el.querySelector('#cancel');
  if (cn) cn.onclick = async () => { if (!(await confirmBox('Cancel this order?', `${o.no} for ${d.name} will be cancelled and its stock released.`, { submit: 'Cancel order', danger: true }))) return; try { await post(`/api/sales/orders/${encodeURIComponent(o.id)}/cancel`, { reason: 'Cancelled by sales' }); toast(`${o.no} cancelled`); refreshBadges(); detail(el, id); } catch (e) { toast(e.message, 'bad'); } };
}
