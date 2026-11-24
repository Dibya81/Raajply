import { get, post } from '../api.js';
import { html, ic, inr, fmt, date, ts, pill, tabs, mountTable, openModal, toast, options, statStrip, esc } from '../ui.js';
import { can, refreshBadges, rerender } from '../app.js';

const CAT_ICON = { 'Glue & chemicals': 'sparkle', 'Machine spares': 'settings', Safety: 'shield', Consumables: 'tag' };

export async function render(el, { route }) {
  const tab = route.query.get('tab') || 'items';
  const d = await get('/api/stores');
  const cats = [...new Set(d.items.map((i) => i.category))];
  el.innerHTML = String(html`
    <div class="page-head"><div><h1>Stores</h1><div class="sub">Glue, rollers, motors, saw blades, gloves and other items bought regularly — what's in stock and where it went</div></div>
      <div class="actions">${can('stores.edit') ? html`<button class="btn" id="issue">${ic('arrowRight', 'sm')} Issue to section</button><button class="btn primary" id="buy">${ic('plus', 'sm')} Items received</button>` : ''}</div></div>
    ${statStrip([{ label: 'Running low', value: d.low, unit: 'items', sub: 'Below reorder level — buy soon', icon: 'alert', bad: d.low > 0 }, { label: 'Stores value', value: d.value, unit: '₹', sub: 'At last purchase rate', icon: 'boxes' }, { label: 'Bought this month', value: d.boughtThisMonth, unit: '₹', sub: 'Before GST', icon: 'cart' }, { label: 'Used this month', value: d.usedThisMonth, unit: '₹', sub: 'Issued to production & maintenance', icon: 'factory' }])}
    ${d.low ? html`<div class="low-strip mt">${d.items.filter((i) => i.status !== 'OK').map((i) => html`<div class="low-card"><span class="lc-ic">${ic(CAT_ICON[i.category] || 'tag', 'sm')}</span><div><b>${i.name.split(' (')[0]}</b><small>${fmt(i.qty)} ${i.unit} left · reorder at ${fmt(i.reorder)}${i.daysLeft !== null ? ` · about ${i.daysLeft} day${i.daysLeft === 1 ? '' : 's'} left` : ''}</small></div>${can('stores.edit') ? html`<button class="btn sm" data-buy="${i.id}">Order</button>` : ''}</div>`)}</div>` : ''}
    <div class="mt">${tabs([{ id: 'items', label: 'Items', icon: 'tag', count: d.items.length }, { id: 'moves', label: 'Received & issued', icon: 'history' }], tab, '#/stores')}</div>
    <div class="card" id="tbl"></div>`);
  if (can('stores.edit')) {
    el.querySelector('#buy').onclick = () => purchase(d);
    el.querySelector('#issue').onclick = () => issue(d);
    el.querySelectorAll('[data-buy]').forEach((b) => { b.onclick = () => purchase(d, b.dataset.buy); });
    const nw = route.query.get('new');
    if (nw) { history.replaceState(null, '', location.hash.replace(/([?&])new=[^&]*&?/, '$1').replace(/[?&]$/, '')); if (nw === 'issue') issue(d); else purchase(d); }
  }
  const box = el.querySelector('#tbl');
  if (tab === 'items') {
    mountTable(box, {
      rows: d.items, exportName: 'stores', pageSize: 40, placeholder: 'Search item…', onRow: can('stores.edit') ? (r) => issue(d, r.id) : null,
      filters: [...cats.map((c) => ({ id: c, label: c, test: (r) => r.category === c })), { id: 'low', label: 'Running low', test: (r) => r.status !== 'OK' }],
      columns: [
        { key: 'name', label: 'Item', render: (r) => html`<span class="cell-main"><span class="thumb st-ic">${ic(CAT_ICON[r.category] || 'tag', 'sm')}</span><span><div class="n">${r.name}</div><div class="s">${r.category}</div></span></span>` },
        { key: 'qty', label: 'In stores', num: true, render: (r) => html`<b>${fmt(r.qty)}</b> <span class="small muted">${r.unit}</span>` },
        { key: 'reorder', label: 'Reorder at', num: true, render: (r) => fmt(r.reorder) },
        { key: 'level', label: 'Level', sort: (r) => (r.reorder ? r.qty / r.reorder : 9), render: (r) => { const p = r.reorder ? Math.min(100, (r.qty / (r.reorder * 2)) * 100) : 100; return html`<div class="bar ${r.status !== 'OK' ? 'bad' : p < 70 ? 'warn' : ''}" style="width:110px"><span style="width:${p}%"></span></div>`; } },
        { key: 'used30', label: 'Used, 30 days', num: true, render: (r) => (r.used30 ? `${fmt(r.used30)} ${r.unit}` : '—') },
        { key: 'daysLeft', label: 'Lasts about', num: true, sort: (r) => r.daysLeft ?? 9999, render: (r) => (r.daysLeft === null ? '—' : html`<span style="color:${r.daysLeft < 7 ? 'var(--bad)' : 'inherit'}">${r.daysLeft} days</span>`) },
        { key: 'rate', label: 'Last rate', num: true, render: (r) => html`${inr(r.rate)}<span class="small muted">/${r.unit}</span>` },
        { key: 'value', label: 'Value', num: true, render: (r) => inr(r.value) },
        { key: 'status', label: 'Status', render: (r) => pill(r.status) },
      ],
      footer: (rs) => ['Total', '', '', '', '', '', '', inr(rs.reduce((a, r) => a + r.value, 0)), ''],
    });
  } else {
    mountTable(box, {
      rows: d.txns, exportName: 'stores-movements', pageSize: 25, placeholder: 'Search item, supplier, section…',
      filters: [{ id: 'IN', label: 'Received', test: (r) => r.type === 'IN' }, { id: 'OUT', label: 'Issued', test: (r) => r.type === 'OUT' }],
      columns: [
        { key: 'ts', label: 'When', render: (r) => ts(r.ts) },
        { key: 'type', label: '', render: (r) => pill(r.type === 'IN' ? 'Received' : 'Issued', r.type === 'IN' ? 'good' : 'info') },
        { key: 'item', label: 'Item' },
        { key: 'qty', label: 'Qty', num: true, render: (r) => html`<b style="color:${r.type === 'IN' ? 'var(--good)' : 'inherit'}">${r.type === 'IN' ? '+' : '−'}${fmt(r.qty)}</b> <span class="small muted">${r.unit}</span>` },
        { key: 'party', label: 'From / to', render: (r) => html`${r.party}${r.billNo && r.billNo !== 'OPENING' ? html`<div class="small muted mono">${r.billNo}</div>` : ''}` },
        { key: 'amount', label: 'Value', num: true, render: (r) => inr(r.amount) },
        { key: 'user', label: 'By' },
        { key: 'note', label: 'Note', render: (r) => html`<span class="small muted">${r.note}</span>` },
      ],
    });
  }
}

function purchase(d, preItem) {
  const line = (sel = '') => `<tr data-line><td data-label="Item"><select class="input sm" name="itemId" aria-label="Item"><option value="">Choose item…</option>${d.items.map((i) => `<option value="${i.id}" ${i.id === sel ? 'selected' : ''} data-rate="${i.rate}" data-unit="${esc(i.unit)}">${esc(i.name)}</option>`).join('')}</select></td><td data-label="Quantity" style="width:110px"><input class="input sm" type="number" min="0" step="0.01" inputmode="decimal" name="qty" aria-label="Quantity"></td><td style="width:70px" class="small muted ln-unit" data-label="Unit" data-unit></td><td data-label="Rate ₹" style="width:120px"><input class="input sm" type="number" min="0" step="0.01" inputmode="decimal" name="rate" aria-label="Rate"></td><td class="num" data-label="Amount" data-amt style="width:110px">—</td><td class="ln-x" style="width:40px"><button type="button" class="btn ghost sm" data-del aria-label="Remove">${String(ic('x', 'sm'))}</button></td></tr>`;
  openModal({
    title: 'Store items received', wide: true, submit: 'Save purchase',
    body: html`<div class="form">
      <div class="f2"><div class="field"><label>Supplier</label><input class="input" name="vendor" list="vendors" required placeholder="e.g. Bharath Resins"><datalist id="vendors">${d.vendors.map((v) => html`<option value="${v}">`)}</datalist></div>
        <div class="field"><label>Their bill number</label><input class="input" name="billNo" required></div></div>
      <div class="card" style="box-shadow:none"><div class="table-wrap"><table class="t lines-t stores-lines"><thead><tr><th>Item</th><th>Qty</th><th></th><th>Rate ₹</th><th class="num">Amount</th><th></th></tr></thead><tbody data-lines></tbody></table></div>
        <div style="padding:10px 12px"><button type="button" class="btn sm" data-add>${ic('plus', 'sm')} Add item</button></div></div>
      <div class="small muted">GST at 18% is added to the purchase bill. The bill goes to Accounts and to Tally with the next export.</div>
    </div>`,
    footLeft: 'Total ₹0',
    onOpen: (f, modal) => {
      const tb = f.querySelector('[data-lines]');
      tb.innerHTML = line(preItem || '') + (preItem ? '' : line());
      const recalc = () => {
        let t = 0;
        tb.querySelectorAll('[data-line]').forEach((tr) => {
          const sel = tr.querySelector('[name=itemId]'); const o = sel.selectedOptions[0];
          tr.querySelector('[data-unit]').textContent = o && o.value ? o.dataset.unit : '';
          const a = (Number(tr.querySelector('[name=qty]').value) || 0) * (Number(tr.querySelector('[name=rate]').value) || 0);
          tr.querySelector('[data-amt]').textContent = a ? inr(a) : '—'; t += a;
        });
        modal.setFoot(html`Taxable <b>${inr(t)}</b> · with GST <b>${inr(t * 1.18)}</b>`);
      };
      const setRate = (tr) => { const o = tr.querySelector('[name=itemId]').selectedOptions[0]; if (o && o.value) tr.querySelector('[name=rate]').value = o.dataset.rate; };
      tb.querySelectorAll('[data-line]').forEach(setRate);
      tb.addEventListener('change', (e) => { if (e.target.name === 'itemId') setRate(e.target.closest('tr')); recalc(); });
      tb.addEventListener('input', recalc);
      tb.addEventListener('click', (e) => { const b = e.target.closest('[data-del]'); if (b) { b.closest('tr').remove(); recalc(); } });
      f.querySelector('[data-add]').onclick = () => tb.insertAdjacentHTML('beforeend', line());
      recalc();
    },
    onSubmit: async (f) => {
      const lines = [...f.querySelectorAll('[data-line]')].map((tr) => ({ itemId: tr.querySelector('[name=itemId]').value, qty: tr.querySelector('[name=qty]').value, rate: tr.querySelector('[name=rate]').value })).filter((l) => l.itemId);
      const r = await post('/api/stores/purchase', { vendor: f.vendor.value, billNo: f.billNo.value, lines });
      toast(`Saved — purchase bill ${r.billId} (${inr(r.total)} with GST)`);
      refreshBadges(); rerender();
    },
  });
}

function issue(d, preItem) {
  openModal({
    title: 'Issue from stores', submit: 'Issue',
    body: html`<div class="form">
      <div class="field"><label>Item</label><select class="input" name="itemId" required>${options(d.items, preItem || '', { placeholder: 'Choose item…', label: (i) => `${i.name} — ${fmt(i.qty)} ${i.unit} in stores` })}</select></div>
      <div class="f2"><div class="field"><label>Quantity</label><input class="input" type="number" name="qty" min="0" step="0.01" required inputmode="decimal"><span class="hint" data-have></span></div>
        <div class="field"><label>Given to</label><select class="input" name="issuedTo">${options([...new Set(d.sections)].map((x) => ({ id: x, name: x })), '')}</select></div></div>
      <div class="field"><label>Note (optional)</label><input class="input" name="note" placeholder="e.g. Knife changed on lathe 1"></div>
    </div>`,
    onOpen: (f) => { const upd = () => { const i = d.items.find((x) => x.id === f.itemId.value); f.querySelector('[data-have]').textContent = i ? `${fmt(i.qty)} ${i.unit} available` : ''; }; f.itemId.addEventListener('change', upd); upd(); },
    onSubmit: async (f) => {
      const r = await post('/api/stores/issue', { itemId: f.itemId.value, qty: f.qty.value, issuedTo: f.issuedTo.value, note: f.note.value });
      toast(`Issued — ${fmt(r.left)} left in stores`);
      refreshBadges(); rerender();
    },
  });
}
