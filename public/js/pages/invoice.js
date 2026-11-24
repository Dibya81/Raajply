import { get } from '../api.js';
import { html, ic, inr, fmt, date, pill } from '../ui.js';
import { can } from '../app.js';

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function two(n) { return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`; }
function three(n) { const h = Math.floor(n / 100), r = n % 100; return `${h ? ONES[h] + ' Hundred' : ''}${h && r ? ' ' : ''}${r ? two(r) : ''}`; }
/** Indian-system amount in words: 1,23,45,678 → One Crore Twenty Three Lakh … */
export function inWords(num) {
  let n = Math.round(Number(num));
  if (!n) return 'Zero';
  const parts = [];
  const cr = Math.floor(n / 1e7); n %= 1e7;
  const lk = Math.floor(n / 1e5); n %= 1e5;
  const th = Math.floor(n / 1e3); n %= 1e3;
  if (cr) parts.push(`${cr > 99 ? inWords(cr) : two(cr)} Crore`);
  if (lk) parts.push(`${two(lk)} Lakh`);
  if (th) parts.push(`${two(th)} Thousand`);
  if (n) parts.push(three(n));
  return parts.join(' ');
}

export async function render(el, { route }) {
  const i = await get(`/api/finance/invoices/${encodeURIComponent(route.id)}`);
  const c = i.company, d = i.distributor;
  const intra = i.igst === 0;
  el.innerHTML = String(html`
    <div class="crumbs no-print">${can('finance.view') ? html`<a href="#/finance?tab=invoices">Sales invoices</a>` : html`<a href="#/orders">Orders</a>`}${ic('chevronRight', 'sm')}${i.no}</div>
    <div class="page-head no-print"><div><h1>Tax invoice ${i.no}</h1><div class="sub">${d.name} · ${date(i.date)} · ${pill(i.status)} ${i.balance ? html`· balance ${inr(i.balance)}` : ''}</div></div>
      <div class="actions"><button class="btn primary" data-print>${ic('printer', 'sm')} Print / save PDF</button></div></div>
    <div class="doc">
      <div class="doc-head">
        <div style="display:flex;gap:12px;align-items:flex-start"><img src="/img/logo.svg" alt="" width="46" height="46"><div><h2>${c.name}</h2><div class="small">${c.address}</div><div class="small">GSTIN <b>${c.gstin}</b>${c.demo ? ' (sample)' : ''} · PAN ${c.pan} · ${c.phone}</div></div></div>
        <div style="text-align:right"><h2>TAX INVOICE</h2><div class="small">Original for recipient</div>${c.demo ? html`<div class="watermark">DEMO — NOT A VALID TAX DOCUMENT</div>` : ''}</div>
      </div>
      <div class="parties">
        <div><h4>Bill to / Ship to</h4><b>${d.name}</b><br>${d.city}, ${d.state}<br>GSTIN <b class="mono">${d.gstin}</b><br>Place of supply: ${i.placeOfSupply}</div>
        <div><table><tbody>
          <tr><th>Invoice no.</th><td><b>${i.no}</b></td></tr><tr><th>Invoice date</th><td>${date(i.date)}</td></tr><tr><th>Due date</th><td>${date(i.dueDate)}</td></tr>
          <tr><th>Order</th><td>${i.orderId}</td></tr><tr><th>E-way bill</th><td class="mono">${i.ewayBill || '—'}</td></tr><tr><th>Vehicle</th><td class="mono">${i.dispatch?.vehicle || '—'}${i.dispatch?.transporter === 'Own truck' ? ' (own)' : ''}</td></tr>
        </tbody></table></div>
      </div>
      <table><thead><tr><th>#</th><th>Description</th><th>HSN</th><th style="text-align:right">Sheets</th><th style="text-align:right">Sq ft</th><th style="text-align:right">Rate / sq ft</th><th style="text-align:right">Taxable</th><th style="text-align:right">GST</th>${intra ? html`<th style="text-align:right">CGST</th><th style="text-align:right">SGST</th>` : html`<th style="text-align:right">IGST</th>`}</tr></thead><tbody>
        ${i.lines.map((l, k) => html`<tr><td>${k + 1}</td><td>${l.name}${l.sqft ? html`<div class="small muted">${fmt(l.sqft / l.qty)} sq ft per sheet</div>` : ''}</td><td class="mono">${l.hsn}</td><td style="text-align:right">${fmt(l.qty)}${l.unit === 'Sheet' ? '' : ` ${l.unit}`}</td><td style="text-align:right">${l.sqft ? fmt(l.sqft) : '—'}</td><td style="text-align:right">${inr(l.rate, 2)}</td><td style="text-align:right">${inr(l.taxable)}</td><td style="text-align:right">${l.gstRate}%</td>${intra ? html`<td style="text-align:right">${inr(l.gst / 2)}</td><td style="text-align:right">${inr(l.gst / 2)}</td>` : html`<td style="text-align:right">${inr(l.gst)}</td>`}</tr>`)}
      </tbody></table>
      <div style="display:grid;grid-template-columns:1.3fr 1fr;gap:18px;margin-top:14px">
        <div class="small"><b>Total:</b> ${fmt(i.lines.reduce((a, l) => a + l.qty, 0))} sheets · ${fmt(i.lines.reduce((a, l) => a + (l.sqft || 0), 0))} sq ft<br><b>Amount in words:</b> Rupees ${inWords(i.total)} only<br><br><b>Bank:</b> ${c.bank}<br><br>
          ${i.irn ? html`<b>IRN</b> <span class="irn">${i.irn}</span><br><b>Ack no.</b> <span class="mono">${i.ackNo}</span> <span class="muted">(demo values)</span>` : ''}</div>
        <table class="tot"><tbody>
          <tr><td>Taxable value</td><td style="text-align:right">${inr(i.taxable)}</td></tr>
          ${intra ? html`<tr><td>CGST</td><td style="text-align:right">${inr(i.cgst)}</td></tr><tr><td>SGST</td><td style="text-align:right">${inr(i.sgst)}</td></tr>` : html`<tr><td>IGST</td><td style="text-align:right">${inr(i.igst)}</td></tr>`}
          <tr><td>Round off</td><td style="text-align:right">${fmt(i.roundOff)}</td></tr>
          <tr><td style="font-size:15px">Invoice total</td><td style="text-align:right;font-size:15px">${inr(i.total)}</td></tr>
        </tbody></table>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:40px;font-size:12.5px"><div class="muted">Payment due within ${d.creditDays} days. Interest may apply on overdue amounts.<br>Subject to local jurisdiction.</div><div style="text-align:right">For ${c.name}<br><br><br>Authorised signatory</div></div>
    </div>`);
}
