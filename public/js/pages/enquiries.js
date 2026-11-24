import { get, post } from '../api.js';
import { html, ic, ts, pill, mountTable, toast, statStrip } from '../ui.js';
import { can, refreshBadges } from '../app.js';

const STATUS = ['New', 'Contacted', 'Converted', 'Not interested'];
const KIND = { New: 'warn', Contacted: 'info', Converted: 'good', 'Not interested': 'neutral' };

export async function render(el, { route }) {
  const rows = await get('/api/enquiries');
  el.innerHTML = String(html`
    <div class="page-head"><div><h1>Website enquiries</h1><div class="sub">People who asked to become a distributor on the company website</div></div>
      <div class="actions"><a class="btn" href="/" target="_blank" rel="noopener">${ic('arrowRight', 'sm')} Open website</a></div></div>
    ${statStrip([{ label: 'New — call them', value: rows.filter((r) => r.status === 'New').length, unit: '', icon: 'bell', bad: rows.some((r) => r.status === 'New') }, { label: 'Contacted', value: rows.filter((r) => r.status === 'Contacted').length, unit: '', icon: 'phone' }, { label: 'Became distributors', value: rows.filter((r) => r.status === 'Converted').length, unit: '', icon: 'checkCircle', good: true }, { label: 'All enquiries', value: rows.length, unit: '', icon: 'send' }])}
    <div class="card mt" id="tbl"></div>`);
  mountTable(el.querySelector('#tbl'), {
    rows, exportName: 'enquiries', placeholder: 'Search name, business, city…', filterValue: route.query.get('status'),
    filters: STATUS.map((s) => ({ id: s, label: s, test: (r) => r.status === s })),
    empty: 'No enquiries yet. They appear here as soon as someone fills the website form.',
    columns: [
      { key: 'id', label: 'Ref', render: (r) => html`<b class="nowrap">${r.id}</b><div class="small muted nowrap">${ts(r.ts)}</div>` },
      { key: 'business', label: 'Business', render: (r) => html`<b style="font-weight:500">${r.business}</b><div class="small muted">${r.name} · ${r.city}</div>` },
      { key: 'phone', label: 'Phone', render: (r) => html`<a class="nowrap" href="tel:${r.phone.replace(/\s/g, '')}">${ic('phone', 'sm')} ${r.phone}</a>` },
      { key: 'interest', label: 'Interested in' },
      { key: 'message', label: 'Message', render: (r) => html`<span class="small muted">${r.message || '—'}</span>` },
      { key: 'status', label: 'Status', render: (r) => (can('sales.edit') ? html`<select class="input sm" data-st="${r.id}" aria-label="Status for ${r.id}" style="width:150px">${STATUS.map((s) => html`<option ${s === r.status ? 'selected' : ''}>${s}</option>`)}</select>` : pill(r.status, KIND[r.status])) },
    ],
  });
  el.querySelector('#tbl').addEventListener('change', async (e) => {
    const s = e.target.closest('[data-st]');
    if (!s) return;
    try { await post(`/api/enquiries/${s.dataset.st}/status`, { status: s.value }); toast(`${s.dataset.st} marked ${s.value}`); refreshBadges(); } catch (ex) { toast(ex.message, 'bad'); }
  });
}
