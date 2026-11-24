'use strict';
const store = require('../db');
const { round2, nowTs, today, stockValue } = require('../util');

/** Append a row to the stock ledger. Rows are never edited or deleted. */
function post(row) {
  const db = store.get();
  const id = store.nextNo('STK', 'STK', 6);
  const r = { id, ts: row.ts || nowTs(), date: row.date || today(), ...row };
  r.qty = round2(r.qty);
  db.stockLedger.push(r);
  return r;
}

/** Balances by item and location: { 'product|PLY-MR-12|GD2': 57, 'log|TEAK|YARD': 374.6 } */
function balances() {
  const m = {};
  for (const r of store.get().stockLedger) {
    if (r.itemType === 'note') continue;
    const k = `${r.itemType}|${r.itemId}|${r.location}`;
    m[k] = round2((m[k] || 0) + r.qty);
  }
  return m;
}

function productQty(productId, location) {
  const b = balances();
  if (location) return b[`product|${productId}|${location}`] || 0;
  return round2(Object.entries(b).filter(([k]) => k.startsWith(`product|${productId}|`)).reduce((a, [, v]) => a + v, 0));
}

/** Quantity promised to orders that are not yet dispatched. */
function reserved() {
  const m = {};
  for (const o of store.get().orders) {
    if (!['Pending approval', 'Approved', 'On hold (credit)'].includes(o.status)) continue;
    for (const l of o.lines) m[l.productId] = round2((m[l.productId] || 0) + l.qty);
  }
  return m;
}

function productSummary() {
  const db = store.get();
  const b = balances();
  const res = reserved();
  return db.products.map((p) => {
    const byLoc = {};
    let total = 0;
    for (const loc of db.locations) {
      const q = b[`product|${p.id}|${loc.id}`] || 0;
      if (q) byLoc[loc.id] = q;
      total += q;
    }
    total = round2(total);
    const r = res[p.id] || 0;
    const available = round2(total - r);
    const status = total <= 0 ? 'Out of stock' : p.reorder && available < p.reorder ? 'Low' : 'OK';
    return { ...p, byLocation: byLoc, total, reserved: r, available, value: stockValue(p, total), status };
  });
}

function logSummary() {
  const db = store.get();
  const yard = db.logs.filter((l) => l.status === 'In yard');
  return db.species.map((s) => {
    const logs = yard.filter((l) => l.species === s.id);
    const cft = round2(logs.reduce((a, l) => a + l.cft, 0));
    const value = Math.round(logs.reduce((a, l) => a + l.cft * l.rate, 0));
    const oldest = logs.reduce((a, l) => (!a || l.receivedOn < a ? l.receivedOn : a), null);
    return { ...s, logs: logs.length, cft, value, oldest };
  });
}

module.exports = { post, balances, productQty, reserved, productSummary, logSummary };
