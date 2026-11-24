import { get, post } from '../api.js';
import { html, raw, ic, inr, inrShort, fmt, date, ts, tabs, mountTable, openModal, toast, options, statStrip } from '../ui.js';
import { hbar } from '../charts.js';
import { logArt, rings } from '../art.js';
import { can, masters, speciesColor, go, refreshBadges } from '../app.js';
// Charts are drawn on a narrower canvas on phones so their labels stay readable.
const W = (wide = 680) => (innerWidth < 640 ? 360 : innerWidth < 1100 ? Math.min(wide, 620) : wide);

export const hoppus = (g, l) => (g > 0 && l > 0 ? Math.round(((g / 4) ** 2 * l / 144) * 100) / 100 : 0);

export async function render(el, { route }) {
  if (route.id) return detail(el, route.id);
  const tab = route.query.get('tab') || 'entries';
  const [sum, m] = await Promise.all([get('/api/yard/summary'), masters()]);
  el.innerHTML = String(html`
    <div class="page-head"><div><h1>Log yard — Magadi</h1><div class="sub">Teak from farmers and imported logs (Canada, Vietnam, USA) · every log measured and numbered on arrival</div></div>
      <div class="actions">${can('yard.edit') ? html`<button class="btn primary" id="newGe">${ic('plus', 'sm')} Logs arrived</button>` : ''}</div></div>
    ${statStrip([{ label: 'Logs in yard', value: sum.inYard.logs, unit: 'logs', sub: `${fmt(sum.inYard.cft)} CFT · ${inrShort(sum.inYard.value)} at cost`, icon: 'log' }, { label: 'Received today', value: sum.today.cft, unit: 'CFT', sub: `${sum.today.logs} logs · ${sum.today.trucks} truck(s)`, icon: 'truck' }, { label: 'Received this month', value: sum.month.cft, unit: 'CFT', sub: `${sum.month.trucks} trucks · ${inrShort(sum.month.amount)}`, icon: 'calc' }])}
    <div class="card mt"><div class="card-h"><div><h3>Yard stock by species</h3><div class="sub">Round logs waiting for production · volume by Hoppus rule: (girth ÷ 4)² × length ÷ 144</div></div></div>
      <div class="card-b chart">${raw(hbar({ width: W(), items: sum.species.map((s) => ({ label: s.name, value: s.cft, color: s.color })), format: (v) => `${fmt(v)} CFT`, rowH: 30, width: W(1100) }))}</div></div>
    <div class="mt-l">${tabs([{ id: 'entries', label: 'Arrivals', icon: 'truck' }, { id: 'logs', label: 'Logs in yard', icon: 'log' }, { id: 'suppliers', label: 'Farmers & importers', icon: 'users' }], tab, '#/yard')}</div>
    <div class="card" id="tbl"></div>`);
  if (can('yard.edit')) el.querySelector('#newGe').onclick = () => newGateEntry(m);
  if (route.query.get('new') && can('yard.edit')) { history.replaceState(null, '', location.hash.replace(/([?&])new=[^&]*&?/, '$1').replace(/[?&]$/, '')); newGateEntry(m); }
  const box = el.querySelector('#tbl');
  if (tab === 'entries') {
    const rows = await get('/api/yard/gate-entries');
    mountTable(box, {
      rows, exportName: 'gate-entries', placeholder: 'Search supplier, vehicle, GE no…', onRow: (r) => go(`#/yard/${r.id}`),
      filters: [{ id: 'farmer', label: 'From farmers', test: (r) => r.source !== 'Import' }, { id: 'import', label: 'Imported', test: (r) => r.source === 'Import' }, ...m.species.map((s) => ({ id: s.id, label: s.name, test: (r) => r.speciesId === s.id }))],
      columns: [
        { key: 'no', label: 'Arrival', render: (r) => html`<b>${r.no}</b><div class="small muted">${ts(r.ts)}</div>` },
        { key: 'supplier', label: 'From', render: (r) => html`<div style="font-weight:500">${r.supplier}</div><div class="small muted">${r.source === 'Import' ? html`Import · ${r.country}` : 'Farmer'}</div>` },
        { key: 'species', label: 'Species', render: (r) => html`<span class="cell-main"><span class="thumb" style="width:26px;height:26px">${raw(logArt(speciesColor(r.speciesId), r.no))}</span>${r.species}</span>` },
        { key: 'vehicle', label: 'Vehicle', render: (r) => html`<span class="mono">${r.vehicle}</span>` },
        { key: 'transitPass', label: 'Permit / bill of entry', render: (r) => (r.source === 'Import' ? html`<span class="mono small">${r.billOfEntry}</span><div class="small muted mono">${r.container}</div>` : html`<span class="mono small">${r.transitPass}</span>`) },
        { key: 'logCount', label: 'Logs', num: true },
        { key: 'totalCft', label: 'CFT', num: true, render: (r) => fmt(r.totalCft) },
        { key: 'rate', label: '₹/CFT', num: true, render: (r) => inr(r.rate) },
        { key: 'amount', label: 'Amount', num: true, render: (r) => inr(r.amount) },
      ],
      footer: (rs) => ['Total', '', '', '', '', fmt(rs.reduce((a, r) => a + r.logCount, 0)), fmt(rs.reduce((a, r) => a + r.totalCft, 0)), '', inr(rs.reduce((a, r) => a + r.amount, 0))],
    });
  } else if (tab === 'logs') {
    const rows = await get('/api/yard/logs?status=In%20yard');
    mountTable(box, {
      rows, exportName: 'logs-in-yard', placeholder: 'Search tag, species, supplier…', pageSize: 20,
      filters: m.species.map((s) => ({ id: s.id, label: s.name, test: (r) => r.species === s.id })),
      columns: [
        { key: 'tag', label: 'Log tag', render: (r) => html`<span class="cell-main"><span class="thumb" style="width:28px;height:28px;border-radius:50%">${raw(logArt(speciesColor(r.species), r.tag))}</span><span class="mono"><b>${r.tag}</b></span></span>` },
        { key: 'speciesName', label: 'Species' },
        { key: 'girth', label: 'Girth (in)', num: true },
        { key: 'length', label: 'Length (ft)', num: true },
        { key: 'cft', label: 'CFT', num: true, render: (r) => fmt(r.cft) },
        { key: 'supplier', label: 'Supplier' },
        { key: 'receivedOn', label: 'Received', render: (r) => date(r.receivedOn) },
        { key: 'ageDays', label: 'Age', num: true, render: (r) => html`<span style="color:${r.ageDays > 45 ? 'var(--bad)' : 'inherit'}">${r.ageDays} d</span>` },
        { key: 'gateEntryId', label: 'Arrival', render: (r) => html`<a href="#/yard/${r.gateEntryId}">${r.gateEntryId}</a>` },
      ],
      footer: (rs) => [`${rs.length} logs`, '', '', '', fmt(rs.reduce((a, r) => a + r.cft, 0)), '', '', '', ''],
    });
  } else {
    const rows = m.suppliers;
    mountTable(box, {
      rows, exportName: 'suppliers', columns: [
        { key: 'code', label: 'Code', render: (r) => html`<span class="mono">${r.code}</span>` },
        { key: 'name', label: 'Supplier', render: (r) => html`<b>${r.name}</b>` },
        { key: 'type', label: 'Type', render: (r) => html`<span class="tag">${r.type}</span>` },
        { key: 'place', label: 'Place' },
        { key: 'species', label: 'Supplies', render: (r) => r.species.map((s) => m.species.find((x) => x.id === s)?.name).join(', ') },
        { key: 'country', label: 'Country', render: (r) => r.country || 'India' },
        { key: 'paymentDays', label: 'Pay in', num: true, render: (r) => `${r.paymentDays} days` },
        { key: 'phone', label: 'Phone' },
      ],
    });
  }
}

function newGateEntry(m) {
  const logRow = (i) => `<tr data-row><td class="muted">${i}</td><td><input class="input sm" name="girth" type="number" min="6" max="240" step="0.5" inputmode="decimal" aria-label="Girth inches"></td><td><input class="input sm" name="length" type="number" min="1" max="60" step="0.5" inputmode="decimal" aria-label="Length feet"></td><td class="num" data-cft>—</td><td><button type="button" class="btn ghost sm" data-del aria-label="Remove log">${ic('x', 'sm')}</button></td></tr>`;
  const body = html`
    <div class="form">
      <div class="f3">
        <div class="field"><label>Supplier</label><select class="input" name="supplierId" required>${options(m.suppliers.filter((s) => s.active), '', { placeholder: 'Choose supplier…' })}</select></div>
        <div class="field"><label>Species</label><select class="input" name="species" required>${options(m.species, '', { placeholder: 'Choose species…' })}</select></div>
        <div class="field"><label>Rate (₹ per CFT)</label><input class="input" name="rate" type="number" min="1" required></div>
      </div>
      <div class="f3">
        <div class="field"><label>Vehicle number</label><input class="input" name="vehicle" placeholder="KA-42-A-1234" required></div>
        <div class="field" data-farm><label>Tree-cutting / transit permit no.</label><input class="input" name="transitPass" placeholder="TP/KA/RMN/2026/…"><span class="hint" data-tphint></span></div>
        <div class="field" data-imp hidden><label>Bill of entry no.</label><input class="input" name="billOfEntry" placeholder="BE 1234567"></div>
        <div class="field"><label>Supplier bill no. (optional)</label><input class="input" name="supplierBillNo"></div>
      </div>
      <div class="f3" data-imp hidden>
        <div class="field"><label>Container no.</label><input class="input" name="container" placeholder="MSKU1234567"></div>
        <div class="field"><label>Country of origin</label><input class="input" name="country" readonly></div>
        <div class="field"><label>Port</label><input class="input" name="port" value="Chennai port"></div>
      </div>
      <div class="card" style="box-shadow:none">
        <div class="card-h"><h3>${ic('calc', 'sm')} Log measurement</h3><div class="right"><button type="button" class="btn sm" data-add>${ic('plus', 'sm')} Add log</button><button type="button" class="btn sm" data-add5>+5 rows</button></div></div>
        <div class="table-wrap" style="max-height:300px;overflow:auto;margin-top:10px"><table class="t logs-t"><thead><tr><th style="width:40px">#</th><th>Girth (inches)</th><th>Length (feet)</th><th class="num">CFT (Hoppus)</th><th></th></tr></thead><tbody data-logs>${raw([1, 2, 3, 4, 5].map(logRow).join(''))}</tbody></table></div>
      </div>
    </div>`;
  openModal({
    title: 'Logs arrived at the yard', wide: true, submit: 'Save & number the logs', body,
    footLeft: html`<span data-total>0 logs · 0 CFT · ₹0</span>`,
    onOpen: (f, modal) => {
      const tb = f.querySelector('[data-logs]');
      const recalc = () => {
        let n = 0, cft = 0;
        tb.querySelectorAll('[data-row]').forEach((tr, i) => {
          tr.children[0].textContent = i + 1;
          const g = Number(tr.querySelector('[name=girth]').value), l = Number(tr.querySelector('[name=length]').value);
          const c = hoppus(g, l);
          tr.querySelector('[data-cft]').textContent = c ? fmt(c) : '—';
          if (c) { n++; cft += c; }
        });
        const rate = Number(f.rate.value) || 0;
        modal.setFoot(html`<b>${n}</b> logs · <b>${fmt(cft)}</b> CFT · <b>${inr(cft * rate)}</b>`);
      };
      tb.addEventListener('input', recalc);
      f.rate.addEventListener('input', recalc);
      tb.addEventListener('click', (e) => { const d = e.target.closest('[data-del]'); if (d) { d.closest('tr').remove(); recalc(); } });
      tb.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.name === 'length') { e.preventDefault(); const tr = e.target.closest('tr'); if (!tr.nextElementSibling) tb.insertAdjacentHTML('beforeend', logRow(0)); tr.nextElementSibling.querySelector('[name=girth]').focus(); recalc(); } });
      f.querySelector('[data-add]').onclick = () => { tb.insertAdjacentHTML('beforeend', logRow(0)); recalc(); tb.lastElementChild.querySelector('input').focus(); };
      f.querySelector('[data-add5]').onclick = () => { for (let i = 0; i < 5; i++) tb.insertAdjacentHTML('beforeend', logRow(0)); recalc(); };
      const onSp = () => {
        const s = m.species.find((x) => x.id === f.species.value);
        if (s) { if (!f.rate.value) f.rate.value = s.logRate; f.querySelector('[data-tphint]').textContent = s.transitPass ? 'Required for teak' : 'Optional'; }
        recalc();
      };
      f.species.addEventListener('change', onSp);
      f.supplierId.addEventListener('change', () => {
        const s = m.suppliers.find((x) => x.id === f.supplierId.value);
        const imp = s && s.type === 'Import';
        f.querySelectorAll('[data-imp]').forEach((x) => { x.hidden = !imp; });
        f.querySelectorAll('[data-farm]').forEach((x) => { x.hidden = !!imp; });
        if (imp) f.country.value = s.country || '';
        if (s && s.species.length) { f.species.value = s.species[0]; f.rate.value = ''; onSp(); }
      });
    },
    onSubmit: async (f) => {
      const logs = [...f.querySelectorAll('[data-row]')].map((tr) => ({ girth: tr.querySelector('[name=girth]').value, length: tr.querySelector('[name=length]').value })).filter((l) => l.girth || l.length);
      if (!logs.length) throw new Error('Enter girth and length for at least one log');
      const res = await post('/api/yard/gate-entries', { supplierId: f.supplierId.value, species: f.species.value, rate: f.rate.value, vehicle: f.vehicle.value, transitPass: f.transitPass.value, billOfEntry: f.billOfEntry.value, container: f.container.value, supplierBillNo: f.supplierBillNo.value, logs });
      toast(`${res.no} saved — ${res.logCount} logs numbered, ${fmt(res.totalCft)} CFT. Tags are ready to print.`);
      refreshBadges();
      go(`#/yard/${res.id}`);
    },
  });
}

async function detail(el, id) {
  const g = await get(`/api/yard/gate-entries/${encodeURIComponent(id)}`);
  const color = g.speciesInfo.color;
  el.innerHTML = String(html`
    <div class="crumbs"><a href="#/yard">Log yard</a>${ic('chevronRight', 'sm')}${g.no}</div>
    <div class="page-head"><div><h1>${g.no} · ${g.logCount} ${g.speciesInfo.name} logs</h1><div class="sub">Received ${ts(g.ts)} from ${g.supplier.name}${g.source === 'Import' ? ` (${g.country})` : ''} · entered by ${g.createdByName}</div></div>
      <div class="actions"><button class="btn" data-print>${ic('printer', 'sm')} Print log tags</button></div></div>
    <div class="grid g-main">
      <div class="card"><div class="card-h"><h3>Log tags</h3><div class="sub">Stick one tag on each log end — the ID follows the log into production</div></div>
        <div class="card-b"><div class="tags-grid">${g.logs.map((l) => html`<div class="log-tag"><svg class="rings" viewBox="0 0 100 100" aria-hidden="true">${raw(rings(color, l.tag))}</svg>
          <div class="lt-sp">${g.speciesInfo.name} · ${g.no}</div><div class="lt-id">${l.tag}</div>
          <div class="lt-m"><div>Girth<b>${l.girth}″</b></div><div>Length<b>${l.length}′</b></div><div>Volume<b>${fmt(l.cft)}</b></div></div>
          <div class="small muted" style="margin-top:6px">${date(l.receivedOn)} · ${l.status === 'In yard' ? 'In yard' : html`Peeled in <a href="#/production/${l.workOrderId}">${l.workOrderId}</a>`}</div></div>`)}</div></div></div>
      <div class="stack">
        <div class="card"><div class="card-h"><h3>Entry details</h3></div><div class="card-b"><dl class="kv-list">
          <dt>Supplier</dt><dd>${g.supplier.name}<div class="small muted">${g.supplier.type} · ${g.supplier.place}</div></dd>
          <dt>Vehicle</dt><dd class="mono">${g.vehicle}</dd>
          ${g.source === 'Import' ? html`<dt>Bill of entry</dt><dd class="mono">${g.billOfEntry}</dd><dt>Container</dt><dd class="mono">${g.container || '—'}</dd><dt>Origin</dt><dd>${g.country}</dd>` : html`<dt>Permit</dt><dd class="mono">${g.transitPass}</dd>`}
          ${g.weighbridgeKg ? html`<dt>Weighbridge</dt><dd>${fmt(g.weighbridgeKg)} kg</dd>` : ''}
          <dt>Total volume</dt><dd><b>${fmt(g.totalCft)} CFT</b> (Hoppus)</dd>
          <dt>Rate</dt><dd>${inr(g.rate)} per CFT</dd>
          <dt>Amount</dt><dd><b>${inr(g.amount)}</b>${g.source === 'Import' ? ' + IGST' : ' (farmer — no GST)'}</dd>
        </dl></div></div>
        ${g.bill ? html`<div class="card"><div class="card-h"><h3>Purchase bill</h3></div><div class="card-b"><dl class="kv-list">
          <dt>Bill</dt><dd>${g.bill.no}${g.bill.supplierBillNo ? html` <span class="muted small">(supplier ref ${g.bill.supplierBillNo})</span>` : ''}</dd>
          <dt>Taxable</dt><dd>${inr(g.bill.taxable)}</dd><dt>GST</dt><dd>${g.bill.gst ? inr(g.bill.gst) : 'Nil'}</dd><dt>Total</dt><dd><b>${inr(g.bill.total)}</b></dd><dt>Due</dt><dd>${date(g.bill.dueDate)}</dd>
        </dl>${can('finance.view') ? html`<a class="btn sm mt" href="#/finance?tab=bills">Open in Accounts</a>` : ''}</div></div>` : ''}
        <div class="card"><div class="card-h"><h3>Stock ledger entry</h3></div><div class="card-b small">
          <div class="notice good">${ic('checkCircle', 'sm')}<span>GRN posted: <b>+${fmt(g.totalCft)} CFT</b> ${g.speciesInfo.name} logs into the Magadi log yard. Ledger rows can't be edited or deleted.</span></div>
        </div></div>
      </div>
    </div>`);
}
