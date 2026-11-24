import { get, post } from '../api.js';
import { html, raw, ic, fmt, date, ts, pill, mountTable, openModal, toast, options, statStrip, dateShort } from '../ui.js';
import { hbar, lineChart, legend, barChart } from '../charts.js';
import { logArt, productArt } from '../art.js';
import { can, masters, speciesColor, go } from '../app.js';
// Charts are drawn on a narrower canvas on phones so their labels stay readable.
// Short day labels on phones so 14 bars don't collide.
const dayLabel = (d) => (innerWidth < 640 ? String(Number(d.slice(8, 10))) : dateShort(d));
const W = (wide = 680) => (innerWidth < 640 ? 360 : innerWidth < 1100 ? Math.min(wide, 620) : wide);

const recColor = (y, target, low) => (y === null || y === undefined ? 'inherit' : y < low ? 'var(--bad)' : y >= target ? 'var(--good)' : 'var(--warn)');

export async function render(el, { route }) {
  if (route.id) return detail(el, route.id);
  const [s, rows, m] = await Promise.all([get('/api/production/summary'), get('/api/production/work-orders'), masters()]);
  const series = [{ name: 'Logs peeled (CFT)', color: '#f59e0b', values: s.days.map((d) => d.input) }, { name: 'Veneer (CFT)', color: '#4f46e5', values: s.days.map((d) => d.veneer) }];
  el.innerHTML = String(html`
    <div class="page-head"><div><h1>Production</h1><div class="sub">Logs are peeled into veneer, glued and pressed into sheets, then finished · recorded as sheets made each day</div></div>
      <div class="actions">${can('production.edit') ? html`<button class="btn primary" id="newWo">${ic('plus', 'sm')} Start peeling</button>` : ''}</div></div>
    <div class="flow">${[['log', 'Logs from yard', 'Numbered & measured'], ['refresh', 'Peeling', 'Logs → thin veneer'], ['layers', 'Glue & hot press', 'Veneers → plywood'], ['sparkle', 'Finishing', 'Trim, sand, grade'], ['boxes', 'Godown', 'Ready to sell']].map(([i, t, sub], k) => html`<div class="flow-step" style="--i:${k}"><span>${ic(i, 'sm')}</span><b>${t}</b><small>${sub}</small></div>`)}</div>
    ${statStrip([{ label: 'Sheets made per day', value: s.sheetsPerDay, unit: 'sheets', sub: 'Average, last 30 working days', icon: 'factory' }, { label: 'Sheets this month', value: s.monthSheets, unit: 'sheets', sub: `${fmt(s.monthOutputCft)} CFT of plywood`, icon: 'boxes' }, { label: 'Recovery, last 30 days', value: s.yield30, unit: '%', sub: `Veneer ÷ log volume · target ${s.target}%`, icon: 'gauge', good: s.yield30 >= s.target, bad: s.yield30 < s.low }, { label: 'Batches below ' + s.low + '%', value: s.lowYield30, unit: '', sub: s.inProgress ? `${s.inProgress} batch(es) still running` : 'Check knife, log quality, operator', icon: 'alert', bad: s.lowYield30 > 0 }])}
    <div class="grid g2 mt">
      <div class="card"><div class="card-h"><div><h3>Sheets made per day</h3><div class="sub">Last 14 days</div></div></div><div class="card-b chart">${raw(barChart({ width: W(), data: s.days.map((d) => ({ label: dayLabel(d.date), values: [d.sheets] })), series: [{ name: 'Sheets', color: '#4f46e5' }], format: (v) => `${fmt(v)}` }))}</div></div>
      <div class="card"><div class="card-h"><div><h3>Logs peeled vs veneer produced</h3><div class="sub">Last 14 days, CFT</div></div><div class="right">${raw(legend(series))}</div></div><div class="card-b chart">${raw(lineChart({ width: W(), labels: s.days.map((d) => dateShort(d.date)), series, format: (v) => `${fmt(v)} CFT` }))}</div></div>
    </div>
    <div class="card mt"><div class="card-h"><div><h3>Recovery by wood</h3><div class="sub">Last 30 days · how much of each log became usable veneer</div></div></div><div class="card-b chart">${raw(hbar({ width: W(), items: s.bySpecies.map((x) => ({ label: `${x.name} · ${fmt(x.sheets)} sheets`, value: x.yield, color: x.color })), max: 100, target: s.target, format: (v) => `${fmt(v)}%`, rowH: 34, width: W(1100) }))}</div></div>
    <div class="card mt" id="tbl"></div>`);
  if (can('production.edit')) el.querySelector('#newWo').onclick = () => newBatch(m);
  if (route.query.get('new') && can('production.edit')) { history.replaceState(null, '', location.hash.replace(/([?&])new=[^&]*&?/, '$1').replace(/[?&]$/, '')); newBatch(m); }
  mountTable(el.querySelector('#tbl'), {
    rows, exportName: 'production-batches', onRow: (r) => go(`#/production/${r.id}`), placeholder: 'Search batch, wood…',
    filters: [{ id: 'In progress', label: 'Running', test: (r) => r.status === 'In progress' }, { id: 'Closed', label: 'Finished', test: (r) => r.status === 'Closed' }, { id: 'low', label: `Below ${s.low}%`, test: (r) => r.yield !== null && r.yield < s.low }],
    columns: [
      { key: 'no', label: 'Batch', render: (r) => html`<b>${r.no}</b><div class="small muted">${date(r.date)}</div>` },
      { key: 'species', label: 'Wood', render: (r) => html`<span class="cell-main"><span class="thumb" style="width:26px;height:26px;border-radius:50%">${raw(logArt(speciesColor(r.speciesId), r.no))}</span>${r.species}</span>` },
      { key: 'logs', label: 'Logs', num: true },
      { key: 'inputCft', label: 'Log CFT', num: true, render: (r) => fmt(r.inputCft) },
      { key: 'veneerCft', label: 'Veneer CFT', num: true, render: (r) => (r.veneerCft ? fmt(r.veneerCft) : '—') },
      { key: 'yield', label: 'Recovery', num: true, render: (r) => (r.yield === null ? '—' : html`<b style="color:${recColor(r.yield, s.target, s.low)}">${fmt(r.yield)}%</b>`) },
      { key: 'sheets', label: 'Sheets made', num: true, render: (r) => (r.status === 'Closed' ? html`<b>${fmt(r.sheets)}</b>` : '—') },
      { key: 'shift', label: 'Shift' },
      { key: 'status', label: 'Status', render: (r) => pill(r.status === 'Closed' ? 'Finished' : 'Running') },
    ],
    footer: (rs) => ['Total', '', fmt(rs.reduce((a, r) => a + r.logs, 0)), fmt(rs.reduce((a, r) => a + r.inputCft, 0)), fmt(rs.reduce((a, r) => a + (r.veneerCft || 0), 0)), '', fmt(rs.reduce((a, r) => a + r.sheets, 0)), '', ''],
  });
}

async function newBatch(m) {
  const logs = await get('/api/yard/logs?status=In%20yard');
  const body = html`<div class="form">
    <div class="f2">
      <div class="field"><label>Wood</label><select class="input" name="species" required>${options(m.species, '', { placeholder: 'Teak or pine…' })}</select></div>
      <div class="field"><label>Shift</label><select class="input" name="shift"><option>Day shift (8am–8pm)</option><option>Night shift (8pm–8am)</option></select></div>
    </div>
    <div class="row"><span class="muted small">Tick the logs going to the peeling lathe (oldest first is best):</span><div style="margin-left:auto" class="row"><input class="input sm" name="target" type="number" placeholder="How many CFT?" style="width:140px"><button type="button" class="btn sm" data-auto>${ic('sparkle', 'sm')} Pick oldest</button></div></div>
    <div class="card" style="box-shadow:none"><div class="table-wrap" style="max-height:320px;overflow:auto"><table class="t pick-t"><thead><tr><th style="width:34px"><input type="checkbox" data-all aria-label="Select all"></th><th>Log no.</th><th class="num">Girth</th><th class="num">Length</th><th class="num">CFT</th><th>Arrived</th></tr></thead><tbody data-list><tr><td colspan="6"><div class="empty">Choose teak or pine to see logs in the yard</div></td></tr></tbody></table></div></div>
    <div class="field"><label>Note (optional)</label><input class="input" name="note" placeholder="e.g. For BWP 18 mm order"></div>
  </div>`;
  openModal({
    title: 'Start peeling — send logs to production', wide: true, submit: 'Start batch', body, footLeft: '0 logs · 0 CFT selected',
    onOpen: (f, modal) => {
      const list = f.querySelector('[data-list]');
      const upd = () => { const sel = [...list.querySelectorAll('input:checked')]; const c = sel.reduce((a, i) => a + Number(i.dataset.cft), 0); modal.setFoot(html`<b>${sel.length}</b> logs · <b>${fmt(c)}</b> CFT · expect about <b>${fmt(c * 0.75)}</b> CFT veneer`); };
      const draw = () => {
        const sp = f.species.value;
        const ls = logs.filter((l) => l.species === sp).sort((a, b) => (a.receivedOn < b.receivedOn ? -1 : 1));
        list.innerHTML = ls.length ? ls.map((l) => `<tr><td><input type="checkbox" value="${l.id}" data-cft="${l.cft}" aria-label="Select ${l.tag}"></td><td class="mono"><b>${l.tag}</b></td><td class="num">${l.girth}″</td><td class="num">${l.length}′</td><td class="num">${fmt(l.cft)}</td><td>${date(l.receivedOn)} <span class="muted small">(${l.ageDays} d)</span></td></tr>`).join('') : '<tr><td colspan="6"><div class="empty">No logs of this wood in the yard</div></td></tr>';
        upd();
      };
      f.species.addEventListener('change', draw);
      list.addEventListener('change', upd);
      f.querySelector('[data-all]').addEventListener('change', (e) => { list.querySelectorAll('input[type=checkbox]').forEach((c) => { c.checked = e.target.checked; }); upd(); });
      f.querySelector('[data-auto]').onclick = () => { const t = Number(f.target.value) || 300; let s = 0; list.querySelectorAll('input[type=checkbox]').forEach((c) => { c.checked = s < t; if (c.checked) s += Number(c.dataset.cft); }); upd(); };
    },
    onSubmit: async (f) => {
      const ids = [...f.querySelectorAll('[data-list] input:checked')].map((i) => i.value);
      if (!f.species.value) throw new Error('Choose teak or pine');
      if (!ids.length) throw new Error('Tick at least one log');
      const wo = await post('/api/production/work-orders', { species: f.species.value, shift: f.shift.value, note: f.note.value, logIds: ids });
      toast(`${wo.no} started — ${ids.length} logs (${fmt(wo.inputCft)} CFT) sent for peeling`);
      go(`#/production/${wo.id}`);
    },
  });
}

async function detail(el, id) {
  const w = await get(`/api/production/work-orders/${encodeURIComponent(id)}`);
  const m = await masters();
  const open = w.status === 'In progress';
  const sp = m.species.find((x) => x.id === w.species);
  const T = w.target, LOW = w.low;
  el.innerHTML = String(html`
    <div class="crumbs"><a href="#/production">Production</a>${ic('chevronRight', 'sm')}${w.no}</div>
    <div class="page-head"><div><h1>${w.no} · ${w.speciesInfo.name}</h1><div class="sub">Started ${ts(w.ts)} · ${w.shift} · ${w.supervisor}${w.note ? ` · ${w.note}` : ''}</div></div><div class="actions">${pill(open ? 'Running' : 'Finished')}</div></div>
    ${statStrip([{ label: 'Logs peeled', value: w.logs.length, unit: 'logs', icon: 'log', sub: `${fmt(w.inputCft)} CFT from the yard` }, { label: 'Veneer produced', value: w.veneerCft || 0, unit: 'CFT', icon: 'layers', sub: open ? 'Enter when peeling is done' : 'From the peeling lathe' }, { label: 'Recovery', value: w.yield ?? 0, unit: '%', icon: 'gauge', sub: open ? `Target ${T}%` : w.yield < LOW ? `Below ${LOW}% — check knife & logs` : w.yield >= T ? 'On target' : `A little under the ${T}% target`, good: w.yield >= T, bad: w.yield !== null && w.yield < LOW }, { label: 'Sheets made', value: w.sheets || 0, unit: 'sheets', icon: 'boxes', sub: open ? 'Not recorded yet' : `${w.outputs.length} product(s)` }])}
    <div class="grid g-main mt">
      <div class="card"><div class="card-h"><h3>${open ? 'Record veneer & sheets made' : 'Sheets made'}</h3></div><div class="card-b" id="out"></div></div>
      <div class="card"><div class="card-h"><h3>Logs peeled</h3><div class="right"><span class="tag">${fmt(w.inputCft)} CFT</span></div></div>
        <div class="table-wrap" style="max-height:440px;overflow:auto"><table class="t"><thead><tr><th>Log no.</th><th class="num">Girth</th><th class="num">Length</th><th class="num">CFT</th></tr></thead><tbody>
        ${w.logs.map((l) => html`<tr><td><span class="cell-main"><span class="thumb" style="width:24px;height:24px;border-radius:50%">${raw(logArt(sp.color, l.tag))}</span><a class="mono" href="#/yard/${l.gateEntryId}">${l.tag}</a></span></td><td class="num">${l.girth}″</td><td class="num">${l.length}′</td><td class="num">${fmt(l.cft)}</td></tr>`)}
        </tbody></table></div></div>
    </div>`);
  const out = el.querySelector('#out');
  if (!open) {
    out.innerHTML = String(html`<table class="t"><thead><tr><th>Product</th><th class="num">Sheets</th><th class="num">CFT</th></tr></thead><tbody>
      ${w.outputs.map((o) => html`<tr><td><span class="cell-main"><span class="thumb">${raw(productArt(m.products.find((p) => p.id === o.productId) || {}, sp.color))}</span><span class="n">${o.name}</span></span></td><td class="num"><b>${fmt(o.qty)}</b></td><td class="num">${fmt(o.cft)}</td></tr>`)}
      ${w.byproducts.map((o) => html`<tr><td class="muted">${o.name}</td><td class="num">${fmt(o.qty)} ${o.unit}</td><td class="num">—</td></tr>`)}
      </tbody><tfoot><tr><td>Total sheets</td><td class="num">${fmt(w.sheets)}</td><td class="num">${fmt(w.outputCft)}</td></tr></tfoot></table>
      <div class="notice ${w.yield < LOW ? 'bad' : 'good'} mt">${ic(w.yield < LOW ? 'alert' : 'checkCircle', 'sm')}<span>Finished ${ts(w.closedAt)}. Recovery <b>${fmt(w.yield)}%</b> — ${fmt(w.veneerCft)} CFT veneer from ${fmt(w.inputCft)} CFT of logs. Sheets added to the godown stock.</span></div>`);
    return;
  }
  if (!can('production.edit')) { out.innerHTML = String(html`<div class="empty">Not recorded yet.</div>`); return; }
  const groups = [...new Set(w.products.map((p) => p.category))];
  out.innerHTML = String(html`<form id="outForm" class="form">
    <div class="step-h"><span>1</span><b>Veneer produced at the peeling lathe</b></div>
    <div class="row" style="align-items:flex-end;gap:16px">
      <div class="field" style="width:220px"><label>Veneer (CFT)</label><input class="input" type="number" min="0" step="0.01" name="veneerCft" inputmode="decimal" required placeholder="${fmt(w.inputCft * 0.75)}"></div>
      <div style="flex:1;min-width:220px"><div class="small muted">Recovery</div><div style="font-size:28px;font-weight:700;line-height:1.1" data-y>—</div><div class="bar mt-s" data-bar><span style="width:0%"></span></div><div class="small muted mt-s">${fmt(w.inputCft)} CFT of logs · target ${T}%</div></div>
    </div>
    <div class="step-h mt"><span>2</span><b>Sheets pressed and finished</b><small class="muted">Enter only the ones you made</small></div>
    <div class="table-wrap" style="max-height:360px;overflow:auto"><table class="t"><thead><tr><th>Product</th><th style="width:130px">Sheets</th></tr></thead><tbody>
    ${groups.map((g) => html`<tr class="grp"><td colspan="2">${g}</td></tr>${w.products.filter((p) => p.category === g).map((p) => html`<tr><td><div class="n">${p.name}</div><div class="s small muted">${p.size}</div></td>
      <td><input class="input sm" type="number" min="0" step="1" name="p_${p.id}" data-cpu="${p.cftPerUnit}" aria-label="${p.name} sheets" inputmode="numeric"></td></tr>`)}`)}
    </tbody></table></div>
    <div class="step-h mt"><span>3</span><b>Left over</b></div>
    <div class="f2"><div class="field"><label>Peeler cores (count)</label><input class="input" type="number" min="0" name="b_BYP-CORE" value="${w.logs.length}"></div><div class="field"><label>Veneer waste (kg, optional)</label><input class="input" type="number" min="0" name="b_BYP-WASTE"></div></div>
    <div class="row mt"><div class="small muted"><b data-sh>0</b> sheets · <span data-o>0</span> CFT of plywood</div><button class="btn primary" type="submit" style="margin-left:auto">${ic('checkCircle', 'sm')} Save & finish batch</button></div>
  </form>`);
  const f = out.querySelector('#outForm');
  f.addEventListener('input', () => {
    const v = Number(f.veneerCft.value) || 0;
    const y = (v / w.inputCft) * 100;
    const yy = f.querySelector('[data-y]');
    yy.textContent = v ? `${fmt(y)}%` : '—';
    yy.style.color = y > 100 ? 'var(--bad)' : recColor(y, T, LOW);
    const bar = f.querySelector('[data-bar]'); bar.className = `bar mt-s ${y < LOW ? 'bad' : y < T ? 'warn' : ''}`; bar.firstElementChild.style.width = `${Math.min(100, y)}%`;
    let o = 0, n = 0;
    f.querySelectorAll('input[name^=p_]').forEach((i) => { const q = Number(i.value) || 0; n += q; o += q * Number(i.dataset.cpu); });
    f.querySelector('[data-sh]').textContent = fmt(n);
    f.querySelector('[data-o]').textContent = fmt(o);
  });
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const outputs = [...f.querySelectorAll('input[name^=p_]')].map((i) => ({ productId: i.name.slice(2), qty: i.value })).filter((x) => Number(x.qty) > 0);
    const byproducts = [...f.querySelectorAll('input[name^=b_]')].map((i) => ({ productId: i.name.slice(2), qty: i.value })).filter((x) => Number(x.qty) > 0);
    try {
      const r = await post(`/api/production/work-orders/${encodeURIComponent(w.id)}/output`, { veneerCft: f.veneerCft.value, outputs, byproducts });
      toast(`${r.no} finished — ${fmt(r.sheets)} sheets, recovery ${fmt(r.yield)}%`, r.yield < LOW ? 'bad' : 'good');
      detail(el, id);
    } catch (ex) { toast(ex.message, 'bad'); }
  });
}
