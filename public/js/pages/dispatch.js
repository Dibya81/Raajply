import { get, post } from '../api.js';
import { html, ic, inr, fmt, date, ts, pill, mountTable, openModal, toast, statStrip, confirmBox } from '../ui.js';
import { can, go, refreshBadges } from '../app.js';

export async function render(el, { route }) {
  if (route.id) return slip(el, route.id);
  const d = await get('/api/dispatch');
  el.innerHTML = String(html`
    <div class="page-head"><div><h1>Dispatch</h1><div class="sub">Load approved orders, generate the GST invoice and e-way bill, track delivery</div></div></div>
    ${statStrip([{ label: 'Ready to dispatch', value: d.ready.length, unit: 'orders', sub: `${inr(d.ready.reduce((a, r) => a + r.grandTotal, 0))} incl. GST`, icon: 'boxes' }, { label: 'Dispatched today', value: d.today, unit: 'trucks', icon: 'truck' }, { label: 'In transit', value: d.inTransit, unit: 'trucks', sub: 'Waiting for delivery confirmation', icon: 'send' }, { label: 'Dispatches (6 months)', value: d.dispatches.length, unit: '', icon: 'history' }])}
    <div class="card mt"><div class="card-h"><div><h3>Ready to dispatch</h3><div class="sub">Approved orders waiting for a truck</div></div></div><div id="ready" style="margin-top:12px"></div></div>
    <div class="card mt" id="tbl"></div>`);
  mountTable(el.querySelector('#ready'), {
    rows: d.ready, search: false, noTools: true, empty: 'No approved orders waiting — all caught up.', columns: [
      { key: 'no', label: 'Order', render: (r) => html`<a href="#/orders/${r.id}"><b>${r.no}</b></a><div class="small muted">${date(r.date)}</div>` },
      { key: 'distributor', label: 'Distributor', render: (r) => html`<b>${r.distributor}</b><div class="small muted">${r.city}, ${r.state}</div>` },
      { key: 'items', label: 'Items', num: true },
      { key: 'grandTotal', label: 'Value', num: true, render: (r) => inr(r.grandTotal) },
      { key: 'approvedBy', label: 'Approved by' },
      { key: 'x', label: '', sort: false, render: (r) => (can('dispatch.edit') ? html`<button class="btn primary sm" data-dispatch="${r.id}">${ic('truck', 'sm')} Dispatch</button>` : '') },
    ],
  });
  el.querySelector('#ready').addEventListener('click', (e) => { const b = e.target.closest('[data-dispatch]'); if (b) dispatchModal(d.ready.find((r) => r.id === b.dataset.dispatch), d.vehicles); });
  mountTable(el.querySelector('#tbl'), {
    rows: d.dispatches, exportName: 'dispatches', onRow: (r) => go(`#/dispatch/${r.id}`), initialQuery: route.query.get('q') || '', placeholder: 'Search dispatch, vehicle, e-way bill, distributor…',
    filters: [{ id: 'In transit', label: 'In transit', test: (r) => r.status === 'In transit' }, { id: 'Delivered', label: 'Delivered', test: (r) => r.status === 'Delivered' }],
    columns: [
      { key: 'no', label: 'Dispatch', render: (r) => html`<b class="nowrap">${r.no}</b><div class="small muted nowrap">${ts(r.ts)}</div>` },
      { key: 'distributor', label: 'Distributor', render: (r) => html`${r.distributor}<div class="small muted">${r.city}</div>` },
      { key: 'order', label: 'Order', render: (r) => html`<a class="nowrap" href="#/orders/${r.orderId}">${r.orderId}</a>` },
      { key: 'vehicle', label: 'Vehicle', render: (r) => html`<span class="mono">${r.vehicle}</span><div class="small muted">${r.transporter}</div>` },
      { key: 'ewayBill', label: 'E-way bill', render: (r) => (r.ewayBill ? html`<span class="mono small">${r.ewayBill}</span>` : html`<span class="muted small">Not needed</span>`) },
      { key: 'invoiceId', label: 'Invoice', render: (r) => (can(['finance.view', 'sales.view']) ? html`<a class="nowrap" href="#/invoice/${encodeURIComponent(r.invoiceId)}">${r.invoiceId}</a>` : r.invoiceId) },
      { key: 'total', label: 'Value', num: true, render: (r) => inr(r.total) },
      { key: 'status', label: 'Status', render: (r) => html`${pill(r.status)}${r.status === 'In transit' && can('dispatch.edit') ? html` <button class="btn sm" data-deliver="${r.id}">Mark delivered</button>` : ''}` },
    ],
  });
  el.querySelector('#tbl').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-deliver]');
    if (!b) return;
    e.stopPropagation();
    if (!(await confirmBox('Mark as delivered?', `Confirm that ${b.dataset.deliver} has reached the distributor.`, { submit: 'Mark delivered' }))) return;
    try { await post(`/api/dispatch/${b.dataset.deliver}/deliver`); toast(`${b.dataset.deliver} delivered`); render(el, { route }); } catch (ex) { toast(ex.message, 'bad'); }
  });
}

function dispatchModal(o, vehicles) {
  openModal({
    title: `Dispatch ${o.no} — ${o.distributor}`, submit: 'Dispatch & create invoice',
    body: html`<div class="form">
      <div class="notice info">${ic('info', 'sm')}<span>Saving will deduct stock, create the GST tax invoice${o.grandTotal > 50000 ? html`, and generate an <b>e-way bill</b> (value above ₹50,000)` : ''}. IRN / e-way numbers are demo values in this prototype.</span></div>
      <div class="field"><label>Which of our trucks?</label><div class="truck-pick">${(vehicles || []).map((v, i) => html`<label class="truck-opt"><input type="radio" name="truck" value="${v.id}" data-driver="${v.driver}" ${i === 0 ? 'checked' : ''}><span><b class="mono">${v.id}</b><small>${v.name}</small><small>${v.driver}</small></span></label>`)}<label class="truck-opt"><input type="radio" name="truck" value="other"><span><b>Other / hired truck</b><small>Type the number below</small></span></label></div></div>
      <div class="f2"><div class="field"><label>Vehicle number</label><input class="input" name="vehicle" placeholder="KA-42-A-1234" required></div>
        <div class="field"><label>Driver name & phone</label><input class="input" name="driver" placeholder="Ramu · +91 98xxxxxx" required></div></div>
      <dl class="kv-list"><dt>Deliver to</dt><dd>${o.distributor}, ${o.city}, ${o.state}</dd><dt>Value</dt><dd><b>${inr(o.grandTotal)}</b> incl. GST · ${o.items} item(s)</dd></dl>
    </div>`,
    onOpen: (f) => {
      const sync = () => { const r = f.querySelector('input[name=truck]:checked'); if (r && r.value !== 'other') { f.vehicle.value = r.value; f.driver.value = r.dataset.driver; } else { f.vehicle.value = ''; f.driver.value = ''; f.vehicle.focus(); } };
      f.addEventListener('change', (e) => { if (e.target.name === 'truck') sync(); });
      sync();
    },
    onSubmit: async (f) => {
      const own = f.querySelector('input[name=truck]:checked')?.value !== 'other';
      const r = await post('/api/dispatch', { orderId: o.id, vehicle: f.vehicle.value, driver: f.driver.value, transporter: own ? 'Own truck' : 'Hired truck' });
      toast(`${r.dispatchId} dispatched · invoice ${r.invoiceId}${r.ewayBill ? ` · e-way bill ${r.ewayBill}` : ''}`);
      refreshBadges();
      go(`#/dispatch/${r.dispatchId}`);
    },
  });
}

async function slip(el, id) {
  const x = await get(`/api/dispatch/${encodeURIComponent(id)}`);
  const c = x.company, d = x.distributor;
  el.innerHTML = String(html`
    <div class="crumbs no-print"><a href="#/dispatch">Dispatch</a>${ic('chevronRight', 'sm')}${x.no}</div>
    <div class="page-head no-print"><div><h1>Loading slip · ${x.no}</h1><div class="sub">${ts(x.ts)} · ${pill(x.status)}</div></div>
      <div class="actions"><button class="btn" data-print>${ic('printer', 'sm')} Print</button>${x.invoice && can(['finance.view', 'sales.view']) ? html`<a class="btn primary" href="#/invoice/${encodeURIComponent(x.invoiceId)}">${ic('file', 'sm')} View invoice</a>` : ''}</div></div>
    <div class="doc">
      <div class="doc-head"><div><h2>${c.name}</h2><div class="small muted">${c.address} · GSTIN ${c.gstin}</div></div><div style="text-align:right"><h2>LOADING SLIP / GATE PASS</h2><div class="small">${x.no} · ${date(x.date)}</div>${c.demo ? html`<div class="watermark">DEMO DOCUMENT</div>` : ''}</div></div>
      <div class="parties"><div><h4>Deliver to</h4><b>${d.name}</b><br>${d.city}, ${d.state}<br>GSTIN ${d.gstin}<br>${d.contact} · ${d.phone}</div>
        <div><h4>Transport</h4>Vehicle <b class="mono">${x.vehicle}</b><br>Driver ${x.driver}<br>Transporter ${x.transporter}<br>E-way bill <span class="mono">${x.ewayBill || 'Not required'}</span><br>Order ${x.orderId} · Invoice ${x.invoiceId}</div></div>
      <table><thead><tr><th>#</th><th>Product</th><th style="text-align:right">Quantity</th><th>Checked</th></tr></thead><tbody>
        ${x.order.lines.map((l, i) => html`<tr><td>${i + 1}</td><td>${l.name}</td><td style="text-align:right">${fmt(l.qty)} ${l.unit}</td><td style="width:90px"></td></tr>`)}
      </tbody></table>
      <div class="parties" style="margin-top:40px"><div>Loaded by: ______________________</div><div>Security / gate: ______________________</div></div>
    </div>`);
}
