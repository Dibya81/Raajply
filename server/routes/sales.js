'use strict';
const crypto = require('crypto');
const store = require('../db');
const audit = require('../services/audit');
const stock = require('../services/stock');
const fin = require('../services/finance');
const { HttpError, nowTs, today, round2, round0, addDays, fyLabel, sum, lineSqft, lineAmount } = require('../util');
const { can } = require('../permissions');
const { num, str, find, maps, userName } = require('./helpers');

function visibleDistributor() { return true; }

module.exports = function register(r) {
  // ======================= ORDERS =======================
  r.get('/api/sales/orders', 'sales.view', ({ user }) => {
    const db = store.get();
    const { D, U } = maps();
    return db.orders.filter((o) => visibleDistributor(user, D[o.distributorId])).slice().reverse().map((o) => ({
      id: o.id, no: o.no, date: o.date, distributor: D[o.distributorId]?.name, distributorId: o.distributorId, city: D[o.distributorId]?.city,
      items: o.lines.length, sheets: sum(o.lines.filter((l) => l.unit === 'Sheet'), (l) => l.qty), subtotal: o.subtotal, grandTotal: o.grandTotal, status: o.status, createdBy: userName(U, o.createdBy), dispatchId: o.dispatchId,
    }));
  });

  r.get('/api/sales/orders/:id', 'sales.view', ({ params, user }) => {
    const db = store.get();
    const o = find('orders', params.id, 'Order');
    const { D, P, U } = maps();
    if (!visibleDistributor(user, D[o.distributorId])) throw new HttpError(403, 'Not your distributor');
    const dsp = o.dispatchId ? db.dispatches.find((x) => x.id === o.dispatchId) : null;
    const inv = dsp ? db.invoices.find((x) => x.id === dsp.invoiceId) : null;
    const summary = fin.distributorSummaries().find((x) => x.id === o.distributorId);
    return {
      ...o, distributor: { ...D[o.distributorId], ...summary }, createdByName: userName(U, o.createdBy), approvedByName: o.approvedBy ? userName(U, o.approvedBy) : null,
      lines: o.lines.map((l) => ({ ...l, name: P[l.productId]?.name, gst: P[l.productId]?.gst, hsn: P[l.productId]?.hsn })), dispatch: dsp, invoice: inv ? { id: inv.id, no: inv.no, total: inv.total } : null,
      canApprove: can(user, 'sales.approve') && o.status === 'Pending approval', canCancel: can(user, 'sales.approve') && ['Pending approval', 'Approved'].includes(o.status),
    };
  });

  r.post('/api/sales/orders', 'sales.edit', ({ body, user }) => {
    const db = store.get();
    const d = find('distributors', body.distributorId, 'Distributor');
    if (!d.active) throw new HttpError(400, 'Distributor is inactive');
    if (!visibleDistributor(user, d)) throw new HttpError(403, 'This distributor is not assigned to you');
    if (!Array.isArray(body.lines) || !body.lines.length) throw new HttpError(400, 'Add at least one product');
    const summary = stock.productSummary();
    const seen = new Set();
    const lines = body.lines.map((l, i) => {
      const p = find('products', l.productId, `Line ${i + 1} product`);
      if (seen.has(p.id)) throw new HttpError(400, `${p.name} is added twice`);
      seen.add(p.id);
      const qty = num(l.qty, `${p.name} quantity`, { min: 0.01, int: p.unit === 'Sheet' });
      const av = summary.find((x) => x.id === p.id).available;
      if (qty > av) throw new HttpError(409, `Only ${Math.max(0, av)} ${p.unit} of ${p.name} available`);
      const rate = l.rate !== undefined && l.rate !== '' ? num(l.rate, `${p.name} rate`, { min: 0 }) : round2(p.rate * (1 - (d.discount || 0) / 100));
      if (rate < p.rate * 0.85 && !can(user, 'finance.approve')) throw new HttpError(403, `Rate for ${p.name} is more than 15% below list — needs the MD`);
      return { productId: p.id, qty, unit: p.unit, sqft: p.sqftPerSheet ? lineSqft(p, qty) : undefined, rate, amount: lineAmount(p, qty, rate) };
    });
    const subtotal = sum(lines, (l) => l.amount);
    const P = Object.fromEntries(db.products.map((p) => [p.id, p]));
    const grandTotal = round0(sum(lines, (l) => l.amount * (1 + P[l.productId].gst / 100)));
    const ds = fin.distributorSummaries().find((x) => x.id === d.id);
    const over = ds.exposure + grandTotal > d.creditLimit;
    const no = store.nextNo('SO', 'SO');
    const o = { id: no, no, date: today(), ts: nowTs(), distributorId: d.id, lines, subtotal, grandTotal, status: over ? 'On hold (credit)' : 'Pending approval', createdBy: user.id, approvedBy: null, dispatchId: null, note: str(body.note, 'Note', { required: false, max: 300 }) };
    db.orders.push(o);
    audit.log(user, 'create', 'Sales order', no, `${d.name} — ₹${grandTotal.toLocaleString('en-IN')} (${lines.length} items)${over ? ' — credit hold' : ''}`);
    if (over) {
      const aid = store.nextNo('APR', 'APR');
      db.approvals.push({ id: aid, type: 'credit_override', status: 'Pending', ts: nowTs(), requestedBy: user.id, summary: `${d.name}: order ${no} (₹${grandTotal.toLocaleString('en-IN')}) exceeds credit limit — exposure would be ₹${round0(ds.exposure + grandTotal).toLocaleString('en-IN')} vs limit ₹${d.creditLimit.toLocaleString('en-IN')}`, payload: { orderId: no, distributorId: d.id } });
    }
    store.save();
    return { ...o, creditHold: over };
  });

  r.post('/api/sales/orders/:id/approve', 'sales.approve', ({ params, user }) => {
    const o = find('orders', params.id, 'Order');
    if (o.status !== 'Pending approval') throw new HttpError(409, `Order is ${o.status}`);
    o.status = 'Approved'; o.approvedBy = user.id; o.approvedAt = nowTs();
    audit.log(user, 'approve', 'Sales order', o.no, 'Order approved');
    store.save();
    return o;
  });
  r.post('/api/sales/orders/:id/cancel', 'sales.approve', ({ params, body, user }) => {
    const o = find('orders', params.id, 'Order');
    if (!['Pending approval', 'Approved', 'On hold (credit)'].includes(o.status)) throw new HttpError(409, `Order is ${o.status}`);
    o.status = 'Cancelled'; o.note = str(body.reason, 'Reason', { required: false }) || 'Cancelled';
    const db = store.get();
    db.approvals.filter((a) => a.status === 'Pending' && a.payload?.orderId === o.id).forEach((a) => { a.status = 'Rejected'; a.decidedBy = user.id; a.decidedAt = nowTs(); });
    audit.log(user, 'cancel', 'Sales order', o.no, `Order cancelled: ${o.note}`);
    store.save();
    return o;
  });

  // ======================= DISTRIBUTORS =======================
  r.get('/api/distributors', ['sales.view', 'finance.view'], ({ user }) => {
    return fin.distributorSummaries().filter((d) => visibleDistributor(user, d)).map(({ behaviour, ...d }) => d);
  });
  r.get('/api/distributors/:id', ['sales.view', 'finance.view'], ({ params, user }) => {
    const db = store.get();
    const s = fin.distributorSummaries().find((x) => x.id === params.id);
    if (!s) throw new HttpError(404, 'Distributor not found');
    if (!visibleDistributor(user, s)) throw new HttpError(403, 'Not your distributor');
    const st = fin.invoiceStatuses();
    const { U } = maps();
    const { behaviour, ...rest } = s;
    return {
      ...rest, salesExecName: userName(U, s.salesExec), ledger: fin.distributorLedger(s.id),
      orders: db.orders.filter((o) => o.distributorId === s.id).slice().reverse().map((o) => ({ id: o.id, no: o.no, date: o.date, items: o.lines.length, grandTotal: o.grandTotal, status: o.status })),
      invoices: db.invoices.filter((i) => i.distributorId === s.id).slice().reverse().map((i) => ({ id: i.id, no: i.no, date: i.date, dueDate: i.dueDate, total: i.total, ...st[i.id] })),
    };
  });

  // ======================= DISPATCH =======================
  r.get('/api/dispatch', 'dispatch.view', () => {
    const db = store.get();
    const { D, U } = maps();
    const ready = db.orders.filter((o) => o.status === 'Approved').map((o) => ({ id: o.id, no: o.no, date: o.date, distributor: D[o.distributorId]?.name, city: D[o.distributorId]?.city, state: D[o.distributorId]?.state, items: o.lines.length, grandTotal: o.grandTotal, approvedBy: userName(U, o.approvedBy) }));
    const list = db.dispatches.slice().reverse().map((x) => ({ ...x, distributor: D[x.distributorId]?.name, city: D[x.distributorId]?.city, order: x.orderId, total: db.invoices.find((i) => i.id === x.invoiceId)?.total }));
    const t = today();
    return { vehicles: db.vehicles || [], ready, dispatches: list, today: list.filter((x) => x.date === t).length, inTransit: list.filter((x) => x.status === 'In transit').length };
  });

  r.get('/api/dispatch/:id', 'dispatch.view', ({ params }) => {
    const db = store.get();
    const x = find('dispatches', params.id, 'Dispatch');
    const { D, P, U } = maps();
    const o = db.orders.find((y) => y.id === x.orderId);
    return { ...x, distributor: D[x.distributorId], order: { ...o, lines: o.lines.map((l) => ({ ...l, name: P[l.productId]?.name })) }, invoice: db.invoices.find((i) => i.id === x.invoiceId), company: db.company, userName: userName(U, x.userId) };
  });

  r.post('/api/dispatch', 'dispatch.edit', ({ body, user }) => {
    const db = store.get();
    const o = find('orders', body.orderId, 'Order');
    if (o.status !== 'Approved') throw new HttpError(409, `Order is ${o.status}, only approved orders can be dispatched`);
    const d = find('distributors', o.distributorId, 'Distributor');
    const vehicle = str(body.vehicle, 'Vehicle number', { max: 20 }).toUpperCase();
    const driver = str(body.driver, 'Driver name & phone', { max: 80 });
    const transporter = str(body.transporter, 'Transporter', { required: false, max: 80 }) || 'Own truck';
    const P = Object.fromEntries(db.products.map((p) => [p.id, p]));
    for (const l of o.lines) {
      const have = stock.productQty(l.productId, P[l.productId].location);
      if (have < l.qty) throw new HttpError(409, `Only ${have} ${l.unit} of ${P[l.productId].name} in ${P[l.productId].location}`);
    }
    const t = today(), ts = nowTs();
    const dno = store.nextNo('DSP', 'DSP');
    const intra = d.state === db.company.state;
    const lines = o.lines.map((l) => { const p = P[l.productId]; const g = round2(l.amount * p.gst / 100); return { productId: p.id, name: p.name, hsn: p.hsn, qty: l.qty, unit: l.unit, sqft: l.sqft, rate: l.rate, taxable: l.amount, gstRate: p.gst, gst: g }; });
    const taxable = sum(lines, (l) => l.taxable);
    const gst = round2(sum(lines, (l) => l.gst));
    const total = round0(taxable + gst);
    const fy = fyLabel(t);
    db.counters['INV' + fy] = (db.counters['INV' + fy] || 0) + 1;
    const ino = `RP/${fy}/${String(db.counters['INV' + fy]).padStart(4, '0')}`;
    const ewb = total > 50000 ? String(Math.floor(100000000000 + Math.random() * 899999999999)) : '';
    const inv = { id: ino, no: ino, date: t, distributorId: d.id, orderId: o.id, dispatchId: dno, lines, taxable, cgst: intra ? round2(gst / 2) : 0, sgst: intra ? round2(gst / 2) : 0, igst: intra ? 0 : gst, total, roundOff: round2(total - taxable - gst), irn: db.company.eInvoice ? crypto.randomBytes(32).toString('hex') : '', ackNo: db.company.eInvoice ? String(Date.now()).padEnd(15, '0') : '', ewayBill: ewb, dueDate: addDays(t, d.creditDays), placeOfSupply: d.state };
    db.invoices.push(inv);
    db.dispatches.push({ id: dno, no: dno, date: t, ts, orderId: o.id, distributorId: d.id, vehicle, driver, transporter, ewayBill: ewb, invoiceId: ino, status: 'In transit', deliveredOn: null, userId: user.id });
    for (const l of o.lines) stock.post({ ts, date: t, type: 'DISPATCH', itemType: 'product', itemId: l.productId, qty: -l.qty, unit: l.unit, location: P[l.productId].location, ref: dno, refType: 'dispatch', userId: user.id, note: `${o.no} → ${d.name}` });
    o.status = 'Dispatched'; o.dispatchId = dno;
    audit.log(user, 'create', 'Dispatch', dno, `${o.no} dispatched in ${vehicle}${ewb ? `, e-way bill ${ewb}` : ''}`);
    audit.log(user, 'create', 'Invoice', ino, `₹${total.toLocaleString('en-IN')} to ${d.name}${inv.irn ? ' · IRN generated (demo)' : ''}`);
    store.save();
    return { dispatchId: dno, invoiceId: ino, ewayBill: ewb, total };
  });

  r.post('/api/dispatch/:id/deliver', 'dispatch.edit', ({ params, user }) => {
    const x = find('dispatches', params.id, 'Dispatch');
    if (x.status === 'Delivered') throw new HttpError(409, 'Already delivered');
    x.status = 'Delivered'; x.deliveredOn = today();
    audit.log(user, 'update', 'Dispatch', x.no, 'Marked delivered');
    store.save();
    return x;
  });
};
