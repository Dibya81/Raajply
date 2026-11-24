import { get, post } from '../api.js';
import { html, raw, ic, inr, inrShort, fmt, date, ts, pill, tabs, mountTable, openModal, toast, options, statStrip } from '../ui.js';
import { productArt, logArt } from '../art.js';
import { can, masters, speciesColor, refreshBadges, rerender } from '../app.js';

const TYPE = { OPENING: ['Opening stock', 'neutral'], GRN: ['Logs arrived', 'good'], ISSUE: ['Sent for peeling', 'warn'], PROD_OUT: ['Sheets made', 'good'], BYPRODUCT: ['Cores & waste', 'neutral'], DISPATCH: ['Dispatch', 'info'], TRANSFER_OUT: ['Transfer out', 'neutral'], TRANSFER_IN: ['Transfer in', 'neutral'], ADJUST: ['Adjustment', 'bad'] };

export async function render(el, { route }) {
  const tab = route.query.get('tab') || 'stock';
  const [st, m] = await Promise.all([get('/api/inventory/stock'), masters()]);
  const godowns = st.locations.filter((l) => l.kind === 'Godown');
  const cats = [...new Set(st.products.map((p) => p.category))];
  el.innerHTML = String(html`
    <div class="page-head"><div><h1>Plywood stock</h1><div class="sub">Sheets in the godown, live — every sheet made, sold or corrected is a recorded entry</div></div>
      <div class="actions">${can('inventory.edit') ? html`<button class="btn" id="adj">${ic('scale', 'sm')} Damaged / correction</button><button class="btn primary" id="cnt">${ic('boxes', 'sm')} Count stock now</button>` : ''}</div></div>
    ${statStrip([{ label: 'Sheets in godown', value: st.products.filter((p) => p.unit === 'Sheet').reduce((a, p) => a + p.total, 0), unit: 'sheets', sub: `${fmt(st.products.reduce((a, p) => a + (p.sqftPerSheet ? p.total * p.sqftPerSheet : 0), 0))} sq ft · ${inrShort(st.totals.value)} at list price`, icon: 'boxes' }, { label: 'Logs in yard', value: st.logs.reduce((a, b) => a + b.cft, 0), unit: 'CFT', sub: `${st.logs.reduce((a, b) => a + b.logs, 0)} logs · ${inrShort(st.logs.reduce((a, b) => a + b.value, 0))} at cost`, icon: 'log' }, { label: 'Low / out of stock', value: st.totals.low, unit: 'items', sub: 'Below reorder level', icon: 'alert', bad: st.totals.low > 0 }, { label: 'Promised to orders', value: st.products.reduce((a, p) => a + p.reserved, 0), unit: 'sheets', sub: 'Not yet loaded on a truck', icon: 'cart' }])}
    <div class="mt">${tabs([{ id: 'stock', label: 'Plywood', icon: 'boxes' }, { id: 'count', label: 'Stock counts (Mon & Thu)', icon: 'check' }, { id: 'logs', label: 'Logs in yard', icon: 'log' }, { id: 'ledger', label: 'All movements', icon: 'history' }], tab, '#/inventory')}</div>
    <div class="card" id="tbl"></div>`);
  if (can('inventory.edit')) { el.querySelector('#adj').onclick = () => adjust(st); el.querySelector('#cnt').onclick = () => countModal(); }
  if (route.query.get('new') && tab === 'count' && can('inventory.edit')) { history.replaceState(null, '', location.hash.replace(/([?&])new=[^&]*&?/, '$1').replace(/[?&]$/, '')); countModal(); }
  const box = el.querySelector('#tbl');
  if (tab === 'stock') {
    mountTable(box, {
      rows: st.products, exportName: 'stock', pageSize: 40, sort: 0, dir: 'asc', initialQuery: route.query.get('q') || '', placeholder: 'Search product, SKU, species…',
      searchText: (r) => `${r.name} ${r.sku} ${r.category} ${r.species || ''}`,
      filters: [...cats.map((c) => ({ id: c, label: c, test: (r) => r.category === c })), { id: 'low', label: 'Low / out', test: (r) => r.status !== 'OK' && r.reorder }],
      columns: [
        { key: 'name', label: 'Product', render: (r) => html`<span class="cell-main"><span class="thumb">${raw(productArt(r, speciesColor(r.species)))}</span><span><div class="n">${r.name}</div><div class="s">${r.sku} · ${r.category}</div></span></span>` },
        { key: 'total', label: 'In godown', num: true, render: (r) => html`<b>${fmt(r.total)}</b> <span class="small muted">${r.unit === 'Sheet' ? 'sheets' : r.unit}</span>` },
        { key: 'sqft', label: 'Sq ft', num: true, sort: (r) => (r.sqftPerSheet ? r.total * r.sqftPerSheet : 0), render: (r) => (r.sqftPerSheet ? fmt(r.total * r.sqftPerSheet) : '—'), csv: (r) => (r.sqftPerSheet ? r.total * r.sqftPerSheet : '') },
        { key: 'reserved', label: 'Reserved', num: true, render: (r) => (r.reserved ? fmt(r.reserved) : '—') },
        { key: 'available', label: 'Available', num: true, render: (r) => html`<span style="color:${r.available < 0 ? 'var(--bad)' : 'inherit'}">${fmt(r.available)}</span>` },
        { key: 'reorder', label: 'Reorder at', num: true, render: (r) => (r.reorder ? fmt(r.reorder) : '—') },
        { key: 'rate', label: 'List rate', num: true, render: (r) => (r.sqftPerSheet ? html`${inr(r.rate, 2)}<span class="small muted">/sq ft</span>` : html`${inr(r.rate)}<span class="small muted">/${r.unit}</span>`) },
        { key: 'value', label: 'Value', num: true, render: (r) => inr(r.value) },
        { key: 'status', label: 'Status', render: (r) => (r.reorder ? pill(r.status) : pill('OK')) },
      ],
      footer: (rs) => ['Total', fmt(rs.filter((r) => r.unit === 'Sheet').reduce((a, r) => a + r.total, 0)), fmt(rs.reduce((a, r) => a + (r.sqftPerSheet ? r.total * r.sqftPerSheet : 0), 0)), '', '', '', '', inr(rs.reduce((a, r) => a + r.value, 0)), ''],
    });
  } else if (tab === 'count') {
    await countTab(box);
  } else if (tab === 'logs') {
    mountTable(box, {
      rows: st.logs, search: false, paginate: false, columns: [
        { key: 'name', label: 'Species', render: (r) => html`<span class="cell-main"><span class="thumb" style="border-radius:50%">${raw(logArt(r.color, r.id))}</span><span><div class="n">${r.name}</div><div class="s"><i>${r.botanical}</i></div></span></span>` },
        { key: 'logs', label: 'Logs', num: true },
        { key: 'cft', label: 'Volume (CFT)', num: true, render: (r) => fmt(r.cft) },
        { key: 'logRate', label: 'Current rate', num: true, render: (r) => `${inr(r.logRate)}/CFT` },
        { key: 'value', label: 'Value at cost', num: true, render: (r) => inr(r.value) },
        { key: 'oldest', label: 'Oldest log', render: (r) => date(r.oldest) },
        { key: 'transitPass', label: 'Source', render: (r) => (r.transitPass ? html`<span class="tag">Farmers (permit)</span>` : html`<span class="tag">Mostly imported</span>`) },
      ],
      footer: (rs) => ['Total', fmt(rs.reduce((a, r) => a + r.logs, 0)), fmt(rs.reduce((a, r) => a + r.cft, 0)), '', inr(rs.reduce((a, r) => a + r.value, 0)), '', ''],
    });
  } else {
    const rows = await get('/api/inventory/ledger?limit=1500');
    box.insertAdjacentHTML('beforebegin', String(html`<div class="notice info" style="margin-bottom:12px">${ic('lock', 'sm')}<span>Movements can't be edited or deleted. Corrections go through a stock count or an adjustment approved by the MD, which adds a new entry.</span></div>`));
    mountTable(box, {
      rows, exportName: 'stock-ledger', pageSize: 25, placeholder: 'Search item, reference, user…',
      filters: Object.entries(TYPE).map(([k, v]) => ({ id: k, label: v[0], test: (r) => r.type === k })),
      columns: [
        { key: 'ts', label: 'Date & time', render: (r) => ts(r.ts) },
        { key: 'id', label: 'Entry', render: (r) => html`<span class="mono small">${r.id}</span>` },
        { key: 'type', label: 'Type', render: (r) => pill((TYPE[r.type] || [r.type])[0], (TYPE[r.type] || [])[1]) },
        { key: 'itemName', label: 'Item' },
        { key: 'qty', label: 'Qty', num: true, render: (r) => html`<b style="color:${r.qty < 0 ? 'var(--bad)' : 'var(--good)'}">${r.qty > 0 ? '+' : ''}${fmt(r.qty)}</b> <span class="small muted">${r.unit}</span>` },
        { key: 'locationName', label: 'Location' },
        { key: 'ref', label: 'Reference', render: (r) => refLink(r) },
        { key: 'user', label: 'By' },
        { key: 'note', label: 'Note', render: (r) => html`<span class="small muted">${r.note}</span>` },
      ],
    });
  }
}
function refLink(r) {
  if (r.refType === 'gateEntry') return html`<a href="#/yard/${r.ref}">${r.ref}</a>`;
  if (r.refType === 'workOrder') return html`<a href="#/production/${r.ref}">${r.ref}</a>`;
  if (r.refType === 'dispatch') return html`<a href="#/dispatch?q=${r.ref}">${r.ref}</a>`;
  if (r.refType === 'stockCount') return html`<a href="#/inventory?tab=count">${r.ref}</a>`;
  return r.ref;
}

function transfer(st, m) {
  const prods = st.products.filter((p) => p.total > 0);
  openModal({
    title: 'Transfer stock between locations', submit: 'Transfer',
    body: html`<div class="form">
      <div class="field"><label>Product</label><select class="input" name="productId" required>${options(prods, '', { placeholder: 'Choose product…', label: (p) => `${p.name} (${fmt(p.total)} ${p.unit})` })}</select></div>
      <div class="f2"><div class="field"><label>From</label><select class="input" name="from">${options(m.locations.filter((l) => l.kind === 'Godown'), '')}</select><span class="hint" data-have></span></div>
      <div class="field"><label>To</label><select class="input" name="to">${options(m.locations.filter((l) => l.kind === 'Godown'), 'GD2')}</select></div></div>
      <div class="f2"><div class="field"><label>Quantity</label><input class="input" type="number" name="qty" min="0" step="0.01" required></div><div class="field"><label>Note</label><input class="input" name="note" placeholder="Optional"></div></div>
    </div>`,
    onOpen: (f) => {
      const upd = () => { const p = prods.find((x) => x.id === f.productId.value); f.querySelector('[data-have]').textContent = p ? `Available here: ${fmt(p.byLocation[f.from.value] || 0)} ${p.unit}` : ''; if (p && !p.byLocation[f.from.value]) { const loc = Object.keys(p.byLocation)[0]; if (loc) { f.from.value = loc; upd(); } } };
      f.productId.addEventListener('change', upd); f.from.addEventListener('change', upd);
    },
    onSubmit: async (f) => { const r = await post('/api/inventory/transfer', { productId: f.productId.value, from: f.from.value, to: f.to.value, qty: f.qty.value, note: f.note.value }); toast(`Transfer ${r.ref} recorded`); rerender(); },
  });
}
function adjust(st) {
  openModal({
    title: 'Request a stock adjustment', submit: 'Send for approval',
    body: html`<div class="form">
      <div class="notice warn">${ic('shield', 'sm')}<span>Use this for damaged or broken sheets. Stock only changes after the MD approves it.</span></div>
      <div class="field"><label>Product</label><select class="input" name="productId" required>${options(st.products, '', { placeholder: 'Choose product…', label: (p) => `${p.name} — ${fmt(p.total)} ${p.unit}` })}</select></div>
      <div class="f2"><div class="field"><label>Location</label><select class="input" name="location">${options(st.locations.filter((l) => l.kind === 'Godown'), '')}</select></div>
      <div class="field"><label>Change (+ found / − short)</label><input class="input" type="number" step="0.01" name="qty" placeholder="e.g. -4" required></div></div>
      <div class="field"><label>Reason</label><input class="input" name="reason" placeholder="e.g. 4 sheets damaged while loading" required></div>
    </div>`,
    onOpen: (f) => f.productId.addEventListener('change', () => { const p = st.products.find((x) => x.id === f.productId.value); if (p) f.location.value = p.location; }),
    onSubmit: async (f) => { const a = await post('/api/inventory/adjust', { productId: f.productId.value, location: f.location.value, qty: f.qty.value, reason: f.reason.value }); toast(`${a.id} sent for approval`); refreshBadges(); },
  });
}

async function countTab(box) {
  const c = await get('/api/stock-counts');
  box.insertAdjacentHTML('beforebegin', String(html`<div class="notice ${c.dueToday ? 'warn' : 'info'}" style="margin-bottom:12px">${ic(c.dueToday ? 'alert' : 'clock', 'sm')}<span>${c.dueToday ? html`<b>Stock count is due today.</b> Count every stack in the godown and type the numbers in — the system shows any difference straight away.` : c.doneToday ? html`Today's count is done.` : html`Stock is counted every <b>Monday and Thursday</b>. Next count: <b>${c.nextDueDay}, ${date(c.nextDue)}</b>.`} Differences go to the MD to approve before stock changes.</span>${can('inventory.edit') ? html`<button class="btn sm ${c.dueToday ? 'primary' : ''}" style="margin-left:auto" data-count>${ic('plus', 'sm')} Count now</button>` : ''}</div>`));
  const btn = box.parentElement.querySelector('[data-count]');
  if (btn) btn.onclick = () => countModal(c);
  mountTable(box, {
    rows: c.counts, exportName: 'stock-counts', pageSize: 20, placeholder: 'Search count…', onRow: (r) => countDetail(r.id),
    filters: [{ id: 'diff', label: 'With differences', test: (r) => r.differences > 0 }, { id: 'wait', label: 'Waiting for MD', test: (r) => r.status === 'Waiting for MD' }],
    columns: [
      { key: 'no', label: 'Count', render: (r) => html`<b>${r.no}</b><div class="small muted">${date(r.date)} · ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(r.date).getDay()]}</div>` },
      { key: 'products', label: 'Products counted', num: true },
      { key: 'differences', label: 'Differences', num: true, render: (r) => (r.differences ? html`<b style="color:var(--warn)">${r.differences}</b>` : html`<span class="muted">0</span>`) },
      { key: 'net', label: 'Net sheets', num: true, render: (r) => (r.net ? html`<b style="color:${r.net < 0 ? 'var(--bad)' : 'var(--good)'}">${r.net > 0 ? '+' : ''}${fmt(r.net)}</b>` : '—') },
      { key: 'countedBy', label: 'Counted by' },
      { key: 'status', label: 'Status', render: (r) => pill(r.status, r.status === 'Matched' || r.status === 'Approved' ? 'good' : r.status === 'Rejected' ? 'bad' : 'warn') },
      { key: 'decidedBy', label: 'Approved by', render: (r) => r.decidedBy || '—' },
    ],
  });
}

async function countDetail(id) {
  const c = await get(`/api/stock-counts/${encodeURIComponent(id)}`);
  openModal({
    title: `${c.no} · ${date(c.date)}`, wide: true, submit: null, cancel: 'Close',
    body: html`<div class="small muted" style="margin-bottom:10px">Counted by ${c.countedByName} at ${ts(c.ts)} · ${pill(c.status)}${c.decidedByName ? html` · decided by ${c.decidedByName}` : ''}</div>
      <div class="table-wrap" style="max-height:440px;overflow:auto"><table class="t count-t view"><thead><tr><th>Product</th><th class="num">System</th><th class="num">Counted</th><th class="num">Difference</th></tr></thead><tbody>
      ${c.lines.map((l) => html`<tr><td>${l.name}</td><td class="num">${fmt(l.system)}</td><td class="num"><b>${fmt(l.counted)}</b></td><td class="num">${l.diff ? html`<b style="color:${l.diff < 0 ? 'var(--bad)' : 'var(--good)'}">${l.diff > 0 ? '+' : ''}${fmt(l.diff)}</b>` : html`<span class="muted">—</span>`}</td></tr>`)}
      </tbody></table></div>`,
  });
}

async function countModal(pre) {
  const c = pre || (await get('/api/stock-counts'));
  const cats = [...new Set(c.products.map((p) => p.category))];
  openModal({
    title: `Stock count — ${date(new Date().toISOString().slice(0, 10))}`, wide: true, submit: 'Save count',
    body: html`<div class="form">
      <div class="notice info">${ic('info', 'sm')}<span>Count each stack and type the number of sheets. Leave a box empty if it matches the system. Any difference goes to the MD.</span></div>
      <div class="table-wrap" style="max-height:440px;overflow:auto"><table class="t count-t"><thead><tr><th>Product</th><th class="num">System says</th><th style="width:130px">Counted</th><th class="num" style="width:100px">Difference</th></tr></thead><tbody>
      ${cats.map((g) => html`<tr class="grp"><td colspan="4">${g}</td></tr>${c.products.filter((p) => p.category === g).map((p) => html`<tr><td><div class="n">${p.name}</div><div class="s small muted">${p.size}</div></td><td class="num">${fmt(p.system)}</td><td><input class="input sm" type="number" min="0" step="1" inputmode="numeric" name="c_${p.id}" data-sys="${p.system}" placeholder="${fmt(p.system)}" aria-label="${p.name} counted"></td><td class="num" data-d="${p.id}">—</td></tr>`)}`)}
      </tbody></table></div>
      <div class="field"><label>Note (optional)</label><input class="input" name="note" placeholder="e.g. Godown 2 stacks re-arranged"></div>
    </div>`,
    footLeft: 'All matching so far',
    onOpen: (f, modal) => {
      f.addEventListener('input', () => {
        let n = 0, net = 0;
        f.querySelectorAll('input[name^=c_]').forEach((i) => {
          const cell = f.querySelector(`[data-d="${i.name.slice(2)}"]`);
          if (i.value === '') { cell.innerHTML = '—'; return; }
          const d = Number(i.value) - Number(i.dataset.sys);
          if (d) { n++; net += d; }
          cell.innerHTML = d ? `<b style="color:${d < 0 ? 'var(--bad)' : 'var(--good)'}">${d > 0 ? '+' : ''}${fmt(d)}</b>` : '<span style="color:var(--good)">✓</span>';
        });
        modal.setFoot(n ? html`<b>${n}</b> difference(s) · net <b>${net > 0 ? '+' : ''}${fmt(net)}</b> sheets — will go to the MD` : 'All matching so far');
      });
    },
    onSubmit: async (f) => {
      const lines = [...f.querySelectorAll('input[name^=c_]')].map((i) => ({ productId: i.name.slice(2), counted: i.value === '' ? i.dataset.sys : i.value }));
      const r = await post('/api/stock-counts', { lines, note: f.note.value });
      toast(r.differences ? `${r.no} saved — ${r.differences} difference(s) sent to the MD` : `${r.no} saved — everything matched`, r.differences ? 'bad' : 'good');
      refreshBadges();
      location.hash = '#/inventory?tab=count';
      rerender();
    },
  });
}
