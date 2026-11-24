'use strict';
/** Stores (glue, spares, safety items), twice-weekly stock counts, and Tally export. */
const store = require('../db');
const audit = require('../services/audit');
const stock = require('../services/stock');
const { HttpError, nowTs, today, round2, round0, addDays, dow, sum } = require('../util');
const { num, str, find, maps, userName } = require('./helpers');

const COUNT_DAYS = [1, 4]; // Monday & Thursday
const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function storeBalances() {
  const db = store.get();
  const q = {};
  for (const t of db.storeTxns || []) q[t.itemId] = round2((q[t.itemId] || 0) + (t.type === 'IN' ? t.qty : -t.qty));
  return q;
}
function storeSummary() {
  const db = store.get();
  const q = storeBalances();
  const since = addDays(today(), -30);
  return (db.storeItems || []).map((it) => {
    const qty = q[it.id] || 0;
    const txns = db.storeTxns.filter((t) => t.itemId === it.id);
    const used30 = round2(sum(txns.filter((t) => t.type === 'OUT' && t.date >= since), (t) => t.qty));
    const last = txns.filter((t) => t.type === 'IN').slice(-1)[0];
    const daysLeft = used30 > 0 ? Math.floor(qty / (used30 / 30)) : null;
    return { ...it, qty, value: round0(qty * it.rate), used30, daysLeft, lastPurchase: last ? { date: last.date, party: last.party, rate: last.rate } : null, status: qty <= 0 ? 'Out of stock' : qty < it.reorder ? 'Low' : 'OK' };
  });
}

function countInfo() {
  const db = store.get();
  const t = today();
  const counts = db.stockCounts || [];
  const last = counts.slice(-1)[0] || null;
  let due = null;
  for (let i = 0; i < 7; i++) { const d = addDays(t, i); if (COUNT_DAYS.includes(dow(d))) { due = d; break; } }
  const doneToday = counts.some((c) => c.date === t);
  return { last, nextDue: due, nextDueDay: due ? DAY[dow(due)] : null, dueToday: due === t && !doneToday, doneToday };
}

// ---------- Tally XML ----------
const xe = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const td = (d) => d.replace(/-/g, '');
const amt = (n) => (Math.round(n * 100) / 100).toFixed(2);
const DEFAULT_LEDGERS = {
  sales: 'Sales - Plywood (GST 18%)', cgstOut: 'Output CGST 9%', sgstOut: 'Output SGST 9%', igstOut: 'Output IGST 18%', roundOff: 'Round Off',
  bank: 'Bank Account', cash: 'Cash', purchaseLogs: 'Purchase - Logs', purchaseImport: 'Purchase - Imported Logs', purchaseStores: 'Purchase - Stores & Consumables',
  cgstIn: 'Input CGST 9%', sgstIn: 'Input SGST 9%', igstIn: 'Input IGST 18%',
};
function entry(ledger, amount) {
  // Tally convention: debit = negative amount with ISDEEMEDPOSITIVE Yes; credit = positive with No.
  const debit = amount < 0;
  return `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${xe(ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>${debit ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE><AMOUNT>${amt(amount)}</AMOUNT></ALLLEDGERENTRIES.LIST>`;
}
function voucher(type, date, no, party, narration, entries) {
  return `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="${type}" ACTION="Create" OBJVIEW="Accounting Voucher View"><DATE>${td(date)}</DATE><VOUCHERTYPENAME>${type}</VOUCHERTYPENAME><VOUCHERNUMBER>${xe(no)}</VOUCHERNUMBER><PARTYLEDGERNAME>${xe(party)}</PARTYLEDGERNAME><NARRATION>${xe(narration)}</NARRATION><PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>${entries.join('')}</VOUCHER></TALLYMESSAGE>`;
}
function buildXml(company, L, { invoices, receipts, bills }) {
  const { D, S } = maps();
  const out = [];
  for (const i of invoices) {
    const party = D[i.distributorId]?.name || i.distributorId;
    const e = [entry(party, -i.total), entry(L.sales, i.taxable)];
    if (i.cgst) e.push(entry(L.cgstOut, i.cgst));
    if (i.sgst) e.push(entry(L.sgstOut, i.sgst));
    if (i.igst) e.push(entry(L.igstOut, i.igst));
    if (Math.abs(i.roundOff) >= 0.01) e.push(entry(L.roundOff, i.roundOff));
    const sheets = sum(i.lines, (l) => l.qty), sqft = sum(i.lines, (l) => l.sqft || 0);
    out.push(voucher('Sales', i.date, i.no, party, `${sheets} sheets (${round0(sqft)} sq ft)${i.ewayBill ? ` · EWB ${i.ewayBill}` : ''} · IRN ${String(i.irn).slice(0, 12)}…`, e));
  }
  for (const r of receipts) {
    const party = D[r.distributorId]?.name || r.distributorId;
    out.push(voucher('Receipt', r.date, r.no, party, `${r.mode} ${r.ref} · ${r.note || ''}`, [entry(/cash/i.test(r.mode) ? L.cash : L.bank, -r.amount), entry(party, r.amount)]));
  }
  for (const b of bills) {
    const party = b.supplierId ? S[b.supplierId]?.name : b.party;
    const imp = /import/i.test(b.kind || '');
    const ledger = b.kind === 'Stores' ? L.purchaseStores : imp ? L.purchaseImport : L.purchaseLogs;
    const e = [entry(ledger, -b.taxable)];
    if (b.gst) { if (imp) e.push(entry(L.igstIn, -b.gst)); else { e.push(entry(L.cgstIn, -round2(b.gst / 2))); e.push(entry(L.sgstIn, -round2(b.gst - round2(b.gst / 2)))); } }
    e.push(entry(party, b.total));
    out.push(voucher('Purchase', b.date, b.no, party, `${b.description}${b.supplierBillNo ? ` · supplier bill ${b.supplierBillNo}` : ''}`, e));
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${xe(company.name)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA>\n${out.join('\n')}\n</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>\n`;
}

module.exports = function register(r) {
  // ======================= STORES =======================
  r.get('/api/stores', 'stores.view', () => {
    const db = store.get();
    const items = storeSummary();
    const { U } = maps();
    const SI = Object.fromEntries(items.map((i) => [i.id, i]));
    const month = today().slice(0, 7);
    const txns = db.storeTxns.slice(-400).reverse().map((t) => ({ ...t, item: SI[t.itemId]?.name, unit: SI[t.itemId]?.unit, user: userName(U, t.userId) }));
    return {
      items, txns, low: items.filter((i) => i.status !== 'OK').length, value: round0(sum(items, (i) => i.value)),
      boughtThisMonth: round0(sum(db.storeTxns.filter((t) => t.type === 'IN' && t.date.startsWith(month) && t.billNo !== 'OPENING'), (t) => t.amount)),
      usedThisMonth: round0(sum(db.storeTxns.filter((t) => t.type === 'OUT' && t.date.startsWith(month)), (t) => t.amount)),
      vendors: [...new Set(db.storeTxns.filter((t) => t.type === 'IN' && t.billNo !== 'OPENING').map((t) => t.party))],
      sections: db.locations.filter((l) => l.kind === 'Plant').map((l) => l.name).concat(['Maintenance', 'Edge trimming', 'Peeling lathe', 'Hot press', 'All sections']),
    };
  });

  r.post('/api/stores/purchase', 'stores.edit', ({ body, user }) => {
    const db = store.get();
    const vendor = str(body.vendor, 'Supplier name', { max: 80 });
    const billNo = str(body.billNo, 'Bill number', { max: 40 });
    if (!Array.isArray(body.lines) || !body.lines.filter((l) => l.itemId).length) throw new HttpError(400, 'Add at least one item');
    const t = today(), ts = nowTs();
    let taxable = 0;
    const names = [];
    for (const [i, l] of body.lines.filter((x) => x.itemId).entries()) {
      const it = find('storeItems', l.itemId, `Line ${i + 1} item`);
      const qty = num(l.qty, `${it.name} quantity`, { min: 0.01 });
      const rate = num(l.rate === '' || l.rate === undefined ? it.rate : l.rate, `${it.name} rate`, { min: 0 });
      const no = store.nextNo('STI', 'STI');
      db.storeTxns.push({ id: no, no, date: t, ts, itemId: it.id, type: 'IN', qty, rate, amount: round0(qty * rate), party: vendor, billNo, userId: user.id, note: 'Purchase' });
      it.rate = rate;
      taxable += round0(qty * rate); names.push(it.name.split(' (')[0]);
    }
    const gst = round0(taxable * 0.18);
    const pb = store.nextNo('PB', 'PB');
    db.purchaseBills.push({ id: pb, no: pb, date: t, supplierId: null, party: vendor, kind: 'Stores', gateEntryId: null, supplierBillNo: billNo, description: `Stores: ${names.join(', ')}`, taxable, gst, total: taxable + gst, dueDate: addDays(t, 30) });
    audit.log(user, 'create', 'Store purchase', pb, `${names.length} item(s) from ${vendor} — ₹${taxable.toLocaleString('en-IN')} + GST`);
    store.save();
    return { billId: pb, taxable, gst, total: taxable + gst };
  });

  r.post('/api/stores/issue', 'stores.edit', ({ body, user }) => {
    const db = store.get();
    const it = find('storeItems', body.itemId, 'Item');
    const qty = num(body.qty, 'Quantity', { min: 0.01 });
    const have = storeBalances()[it.id] || 0;
    if (qty > have) throw new HttpError(409, `Only ${have} ${it.unit} of ${it.name} in stores`);
    const to = str(body.issuedTo, 'Issued to (section)', { max: 60 });
    const no = store.nextNo('STO', 'STO');
    const row = { id: no, no, date: today(), ts: nowTs(), itemId: it.id, type: 'OUT', qty, rate: it.rate, amount: round0(qty * it.rate), party: to, userId: user.id, note: str(body.note, 'Note', { required: false, max: 160 }) || `Issued to ${to}` };
    db.storeTxns.push(row);
    audit.log(user, 'create', 'Store issue', no, `${qty} ${it.unit} ${it.name} → ${to}`);
    store.save();
    return { ...row, left: round2(have - qty) };
  });

  r.post('/api/stores/items', 'stores.edit', ({ body, user }) => {
    const db = store.get();
    const name = str(body.name, 'Item name', { max: 80 });
    const id = str(body.id, 'Short code', { required: false, max: 8 }).toUpperCase().replace(/[^A-Z0-9]/g, '') || name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() + String(db.storeItems.length + 1);
    if (db.storeItems.some((x) => x.id === id)) throw new HttpError(409, 'An item with this code already exists');
    const it = { id, name, category: str(body.category, 'Category', { required: false, max: 40 }) || 'Consumables', unit: str(body.unit, 'Unit', { max: 12 }), reorder: num(body.reorder || 0, 'Reorder level', { min: 0 }), rate: num(body.rate || 0, 'Rate', { min: 0 }), active: true };
    db.storeItems.push(it);
    audit.log(user, 'create', 'Store item', id, `Added ${name}`);
    store.save();
    return it;
  });

  // ======================= STOCK COUNT (twice a week) =======================
  r.get('/api/stock-counts', 'inventory.view', () => {
    const db = store.get();
    const { U } = maps();
    const products = stock.productSummary().filter((p) => p.unit === 'Sheet').map((p) => ({ id: p.id, name: p.name, category: p.category, size: p.size, system: p.total }));
    return {
      ...countInfo(), products,
      counts: (db.stockCounts || []).slice().reverse().map((c) => ({ id: c.id, no: c.no, date: c.date, ts: c.ts, products: c.lines.length, differences: c.differences, net: sum(c.lines, (l) => l.diff), status: c.status, countedBy: userName(U, c.countedBy), decidedBy: c.decidedBy ? userName(U, c.decidedBy) : null })),
    };
  });
  r.get('/api/stock-counts/:id', 'inventory.view', ({ params }) => {
    const c = find('stockCounts', params.id, 'Stock count');
    const { P, U } = maps();
    return { ...c, countedByName: userName(U, c.countedBy), decidedByName: c.decidedBy ? userName(U, c.decidedBy) : null, lines: c.lines.map((l) => ({ ...l, name: P[l.productId]?.name, category: P[l.productId]?.category, sqft: P[l.productId]?.sqftPerSheet, rate: P[l.productId]?.rate })) };
  });
  r.post('/api/stock-counts', 'inventory.edit', ({ body, user }) => {
    const db = store.get();
    if (!Array.isArray(body.lines) || !body.lines.length) throw new HttpError(400, 'Enter the counted sheets');
    const sys = Object.fromEntries(stock.productSummary().map((p) => [p.id, p.total]));
    const lines = body.lines.map((l) => {
      const p = find('products', l.productId, 'Product');
      const counted = num(l.counted, `${p.name} — counted sheets`, { min: 0, int: true });
      const system = sys[p.id] || 0;
      return { productId: p.id, system, counted, diff: round2(counted - system) };
    });
    const diffs = lines.filter((l) => l.diff !== 0);
    const no = store.nextNo('CNT', 'CNT');
    const c = { id: no, no, date: today(), ts: nowTs(), countedBy: user.id, location: 'FG', lines, differences: diffs.length, status: diffs.length ? 'Waiting for MD' : 'Matched', decidedBy: null, decidedAt: null, note: str(body.note, 'Note', { required: false, max: 200 }) };
    db.stockCounts.push(c);
    if (diffs.length) {
      const aid = store.nextNo('APR', 'APR');
      db.approvals.push({ id: aid, type: 'stock_count', status: 'Pending', ts: c.ts, requestedBy: user.id, summary: `Stock count ${no}: ${diffs.length} product(s) differ from the system (net ${sum(diffs, (l) => l.diff) > 0 ? '+' : ''}${sum(diffs, (l) => l.diff)} sheets) — approve to correct stock`, payload: { countId: no } });
    }
    audit.log(user, 'create', 'Stock count', no, diffs.length ? `Counted ${lines.length} products — ${diffs.length} difference(s) sent to MD` : `Counted ${lines.length} products — all matched`);
    store.save();
    return c;
  });

  // ======================= TALLY =======================
  const ledgers = () => ({ ...DEFAULT_LEDGERS, ...(store.get().company.tallyLedgers || {}) });
  r.get('/api/tally', 'tally.export', () => {
    const db = store.get();
    const { U } = maps();
    const pend = (arr) => arr.filter((x) => !x.tally);
    const p = { sales: pend(db.invoices), receipts: pend(db.receipts), purchases: pend(db.purchaseBills) };
    const oldest = [...p.sales, ...p.receipts, ...p.purchases].reduce((a, x) => (!a || x.date < a ? x.date : a), null);
    return {
      ledgers: ledgers(), pending: { sales: p.sales.length, receipts: p.receipts.length, purchases: p.purchases.length, salesValue: round0(sum(p.sales, (x) => x.total)), oldest },
      exports: (db.tallyExports || []).slice().reverse().map((x) => ({ ...x, user: userName(U, x.userId) })),
    };
  });
  r.post('/api/tally/export', 'tally.export', ({ body, user }) => {
    const db = store.get();
    const t = today();
    const from = str(body.from, 'From date', { required: false }) || '0000-00-00';
    const to = str(body.to, 'To date', { required: false }) || t;
    const types = Array.isArray(body.types) && body.types.length ? body.types : ['sales', 'receipts', 'purchases'];
    const onlyNew = body.onlyNew !== false;
    const pick = (arr) => arr.filter((x) => x.date >= from && x.date <= to && (!onlyNew || !x.tally));
    const sel = { invoices: types.includes('sales') ? pick(db.invoices) : [], receipts: types.includes('receipts') ? pick(db.receipts) : [], bills: types.includes('purchases') ? pick(db.purchaseBills) : [] };
    const n = sel.invoices.length + sel.receipts.length + sel.bills.length;
    if (!n) throw new HttpError(400, onlyNew ? 'Nothing new to send to Tally for these dates' : 'No vouchers in these dates');
    const id = store.nextNo('TLY', 'TLY');
    const xml = buildXml(db.company, ledgers(), sel);
    [...sel.invoices, ...sel.receipts, ...sel.bills].forEach((x) => { x.tally = id; });
    const rec = { id, no: id, ts: nowTs(), from: from === '0000-00-00' ? [...sel.invoices, ...sel.receipts, ...sel.bills].reduce((a, x) => (!a || x.date < a ? x.date : a), null) : from, to, sales: sel.invoices.length, receipts: sel.receipts.length, purchases: sel.bills.length, userId: user.id };
    db.tallyExports.push(rec);
    audit.log(user, 'export', 'Tally export', id, `${rec.sales} sales, ${rec.receipts} receipts, ${rec.purchases} purchases sent to Tally (${rec.from} → ${to})`);
    store.save();
    return { ...rec, filename: `Raajply-Tally-${id}-${rec.from}-to-${to}.xml`, xml };
  });
  r.get('/api/tally/export/:id', 'tally.export', ({ params }) => {
    const db = store.get();
    const rec = find('tallyExports', params.id, 'Tally export');
    const by = (arr) => arr.filter((x) => x.tally === rec.id);
    const xml = buildXml(db.company, ledgers(), { invoices: by(db.invoices), receipts: by(db.receipts), bills: by(db.purchaseBills) });
    return { ...rec, filename: `Raajply-Tally-${rec.id}-${rec.from}-to-${rec.to}.xml`, xml };
  });
};

module.exports.storeSummary = storeSummary;
module.exports.countInfo = countInfo;
