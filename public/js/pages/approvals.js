import { get, post } from '../api.js';
import { html, ic, ts, pill, fmt, toast, initials, avatarColor } from '../ui.js';
import { refreshBadges } from '../app.js';

// Plain-language consequences, so whoever decides knows exactly what each button does.
const KIND = {
  credit_override: { icon: 'shield', approve: 'the order is released for dispatch even though the distributor is over the credit limit.', reject: 'the order stays on hold until money comes in.' },
  stock_adjustment: { icon: 'scale', approve: 'stock is corrected by the quantity shown.', reject: 'stock stays as it is in the system.' },
  stock_count: { icon: 'boxes', approve: 'system stock is set to what was counted.', reject: 'the count is kept on record, stock is not changed.' },
};
function detail(a) {
  if (a.type === 'stock_adjustment' && a.detail) return html`<div class="small muted">${a.detail.product} · ${a.detail.location} · <b style="color:${a.detail.qty < 0 ? 'var(--bad)' : 'var(--good)'}">${a.detail.qty > 0 ? '+' : ''}${fmt(a.detail.qty)} ${a.detail.unit}</b> · ${a.detail.reason}</div>`;
  if (a.type === 'credit_override') return html`<div class="small muted">${a.detail?.distributor || ''}${a.detail?.distributor ? ' · ' : ''}<a href="#/orders/${a.detail?.orderId || a.payload?.orderId}">Open order ${a.detail?.orderId || a.payload?.orderId}</a> · <a href="#/distributors/${a.payload?.distributorId}">Distributor account</a></div>`;
  if (a.type === 'stock_count') return html`<div class="small"><a href="#/inventory?tab=count">${ic('boxes', 'sm')} See stock counts</a></div>`;
  return '';
}

export async function render(el, { route }) {
  const status = route.query.get('status') || 'Pending';
  const list = await get(`/api/approvals?status=${status === 'all' ? 'all' : status}`);
  el.innerHTML = String(html`
    <div class="page-head"><div><h1>Approvals</h1><div class="sub">Stock adjustments and credit-limit overrides wait here for the right person</div></div></div>
    <div class="tabs">${[['Pending', 'Pending'], ['Approved', 'Approved'], ['Rejected', 'Rejected'], ['all', 'All']].map(([k, l]) => html`<a class="tab ${status === k ? 'on' : ''}" href="#/approvals?status=${k}">${l}</a>`)}</div>
    ${list.length ? html`<div class="stack">${list.map((a, i) => html`
      <div class="card apr-card apr-${a.type}" data-card="${a.id}" style="--i:${i}"><div class="card-b apr-b">
        <span class="apr-ic">${ic(KIND[a.type]?.icon || 'scale')}</span>
        <div class="apr-main">
          <div class="row" style="gap:8px"><b>${a.typeLabel}</b><span class="tag mono">${a.id}</span>${pill(a.status)}</div>
          <div class="apr-sum">${a.summary}</div>
          ${detail(a)}
          ${a.status === 'Pending' && KIND[a.type] ? html`<div class="apr-if">${ic('info', 'sm')}<span><b>If you approve:</b> ${KIND[a.type].approve} <b>If you reject:</b> ${KIND[a.type].reject}</span></div>` : ''}
          <div class="small muted mt-s" style="display:flex;gap:6px;align-items:flex-start"><span class="avatar" style="width:20px;height:20px;font-size:9px;border-radius:6px;background:${avatarColor(a.requestedByName)}">${initials(a.requestedByName)}</span><span style="flex:1;min-width:0">Requested by ${a.requestedByName} · ${ts(a.ts)}${a.decidedByName ? html` · ${a.status} by ${a.decidedByName} · ${ts(a.decidedAt)}` : ''}</span></div>
        </div>
        ${a.canDecide ? html`<div class="apr-act"><button class="btn danger" data-dec="reject" data-id="${a.id}">${ic('x', 'sm')} Reject</button><button class="btn primary" data-dec="approve" data-id="${a.id}">${ic('check', 'sm')} Approve</button></div>` : ''}
      </div></div>`)}</div>` : html`<div class="card"><div class="empty">${ic('checkCircle', 'lg')}<h3 style="margin:8px 0 2px">${status === 'Pending' ? 'All caught up' : 'Nothing here'}</h3><div>${status === 'Pending' ? 'Nothing is waiting for a decision right now.' : `No ${status === 'all' ? '' : status.toLowerCase()} approvals.`}</div></div></div>`}`);
  el.onclick = async (e) => {
    const b = e.target.closest('[data-dec]');
    if (!b) return;
    const card = b.closest('[data-card]');
    card.querySelectorAll('[data-dec]').forEach((x) => { x.disabled = true; });
    try {
      await post(`/api/approvals/${b.dataset.id}/decide`, { decision: b.dataset.dec });
      toast(`${b.dataset.id} ${b.dataset.dec === 'approve' ? 'approved' : 'rejected'}`);
      refreshBadges();
      card.classList.add(b.dataset.dec === 'approve' ? 'apr-out-ok' : 'apr-out-no');
      setTimeout(() => render(el, { route }), 380);
    } catch (ex) { toast(ex.message, 'bad'); card.querySelectorAll('[data-dec]').forEach((x) => { x.disabled = false; }); }
  };
}
