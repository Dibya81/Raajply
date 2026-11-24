'use strict';
const store = require('../db');
const { round2, today, daysBetween, monthKey, sum } = require('../util');

const OPENING = { bank: 12000000, cash: 300000 };

/** Allocate each distributor's receipts to their invoices oldest-first (FIFO). */
function invoiceStatuses() {
  const db = store.get();
  const t = today();
  const paidPool = {};
  for (const r of db.receipts) paidPool[r.distributorId] = (paidPool[r.distributorId] || 0) + r.amount;
  const out = {};
  const sorted = db.invoices.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.no < b.no ? -1 : 1));
  for (const inv of sorted) {
    const pool = paidPool[inv.distributorId] || 0;
    const paid = Math.min(pool, inv.total);
    paidPool[inv.distributorId] = round2(pool - paid);
    const balance = round2(inv.total - paid);
    const overdueDays = balance > 0 ? Math.max(0, daysBetween(inv.dueDate, t)) : 0;
    const status = balance <= 0.5 ? 'Paid' : overdueDays > 0 ? 'Overdue' : paid > 0 ? 'Part paid' : 'Unpaid';
    out[inv.id] = { paid: round2(paid), balance: balance <= 0.5 ? 0 : balance, status, overdueDays, age: daysBetween(inv.date, t) };
  }
  return out;
}

function bucketOf(age) { return age <= 30 ? 'b0' : age <= 60 ? 'b30' : age <= 90 ? 'b60' : 'b90'; }

function distributorSummaries() {
  const db = store.get();
  const st = invoiceStatuses();
  const t = today();
  const pendingOrders = {};
  for (const o of db.orders) if (['Pending approval', 'Approved', 'On hold (credit)'].includes(o.status)) pendingOrders[o.distributorId] = (pendingOrders[o.distributorId] || 0) + o.grandTotal;
  return db.distributors.map((d) => {
    const invs = db.invoices.filter((i) => i.distributorId === d.id);
    const ageing = { b0: 0, b30: 0, b60: 0, b90: 0 };
    let outstanding = 0, overdue = 0;
    for (const i of invs) {
      const s = st[i.id];
      if (s.balance > 0) { outstanding += s.balance; ageing[bucketOf(s.age)] += s.balance; if (s.status === 'Overdue') overdue += s.balance; }
    }
    const rcpts = db.receipts.filter((r) => r.distributorId === d.id);
    const lastOrder = db.orders.filter((o) => o.distributorId === d.id).reduce((a, o) => (!a || o.date > a ? o.date : a), null);
    const sales6m = sum(invs, (i) => i.taxable);
    const exposure = outstanding + (pendingOrders[d.id] || 0);
    // average days to pay = weighted gap between invoice date and FIFO-paid date (approx via receipts)
    let avgDays = null;
    if (rcpts.length && invs.length) {
      const paidInv = invs.filter((i) => st[i.id].status === 'Paid');
      if (paidInv.length) {
        const r2 = rcpts.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
        const gaps = paidInv.map((i) => { const r = r2.find((x) => x.date >= i.date); return r ? daysBetween(i.date, r.date) : null; }).filter((x) => x !== null);
        if (gaps.length) avgDays = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
      }
    }
    for (const k in ageing) ageing[k] = round2(ageing[k]);
    return {
      ...d, outstanding: round2(outstanding), overdue: round2(overdue), pendingOrders: round2(pendingOrders[d.id] || 0), exposure: round2(exposure),
      creditAvailable: round2(d.creditLimit - exposure), creditUsedPct: Math.round((exposure / d.creditLimit) * 100), ageing, lastOrder,
      sales6m: round2(sales6m), invoices: invs.length, avgDaysToPay: avgDays, overLimit: exposure > d.creditLimit, today: t,
    };
  });
}

function distributorLedger(id) {
  const db = store.get();
  const rows = [];
  for (const i of db.invoices.filter((x) => x.distributorId === id)) rows.push({ date: i.date, type: 'Invoice', ref: i.no, particulars: `Sales — ${i.lines.length} item(s)${i.ewayBill ? ` · EWB ${i.ewayBill}` : ''}`, debit: i.total, credit: 0 });
  for (const r of db.receipts.filter((x) => x.distributorId === id)) rows.push({ date: r.date, type: 'Receipt', ref: r.no, particulars: `${r.mode} · ${r.ref}`, debit: 0, credit: r.amount });
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.type === 'Invoice' ? -1 : 1));
  let bal = 0;
  for (const r of rows) { bal = round2(bal + r.debit - r.credit); r.balance = bal; }
  return rows;
}

function billStatuses() {
  const db = store.get();
  const paid = {};
  for (const p of db.supplierPayments) paid[p.billId] = (paid[p.billId] || 0) + p.amount;
  const t = today();
  const out = {};
  for (const b of db.purchaseBills) {
    const pd = round2(paid[b.id] || 0);
    const bal = round2(b.total - pd);
    out[b.id] = { paid: pd, balance: bal <= 0.5 ? 0 : bal, status: bal <= 0.5 ? 'Paid' : t > b.dueDate ? 'Overdue' : pd > 0 ? 'Part paid' : 'Due' };
  }
  return out;
}

function isCash(mode) { return /cash/i.test(mode || ''); }

/** Cash book or bank book with running balance. */
function book(kind) {
  const db = store.get();
  const rows = [];
  const start = db.meta.dataFrom;
  rows.push({ date: start, particulars: 'Opening balance', ref: '—', in: OPENING[kind], out: 0 });
  const want = (mode) => (kind === 'cash' ? isCash(mode) : !isCash(mode));
  const dist = Object.fromEntries(db.distributors.map((d) => [d.id, d.name]));
  const sup = Object.fromEntries(db.suppliers.map((d) => [d.id, d.name]));
  for (const r of db.receipts) if (want(r.mode)) rows.push({ date: r.date, particulars: `Receipt — ${dist[r.distributorId]}`, ref: r.no, mode: r.mode, in: r.amount, out: 0 });
  for (const p of db.supplierPayments) if (want(p.mode)) rows.push({ date: p.date, particulars: `Payment — ${sup[p.supplierId] || p.party}`, ref: p.no, mode: p.mode, in: 0, out: p.amount });
  for (const e of db.expenses) if (want(e.mode)) rows.push({ date: e.date, particulars: `${e.category} — ${e.description}`, ref: e.no, mode: e.mode, in: 0, out: e.amount });
  for (const c of db.contra || []) {
    if (c.from === kind) rows.push({ date: c.date, particulars: `Contra — transfer to ${c.to} (${c.note})`, ref: c.no, mode: 'Contra', in: 0, out: c.amount });
    if (c.to === kind) rows.push({ date: c.date, particulars: `Contra — received from ${c.from} (${c.note})`, ref: c.no, mode: 'Contra', in: c.amount, out: 0 });
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.ref < b.ref ? -1 : 1)));
  let bal = 0;
  for (const r of rows) { bal = round2(bal + r.in - r.out); r.balance = bal; }
  return { rows, balance: bal };
}

function monthly(months = 6) {
  const db = store.get();
  const t = today();
  const keys = [];
  const [y, m] = t.split('-').map(Number);
  for (let i = months - 1; i >= 0; i--) { const d = new Date(y, m - 1 - i, 1); keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }
  const blank = () => ({ revenue: 0, gstOut: 0, purchases: 0, gstIn: 0, expenses: 0, collections: 0, payments: 0 });
  const map = Object.fromEntries(keys.map((k) => [k, blank()]));
  for (const i of db.invoices) { const k = monthKey(i.date); if (map[k]) { map[k].revenue += i.taxable; map[k].gstOut += i.cgst + i.sgst + i.igst; } }
  for (const b of db.purchaseBills) { const k = monthKey(b.date); if (map[k]) { map[k].purchases += b.taxable; map[k].gstIn += b.gst; } }
  for (const e of db.expenses) { const k = monthKey(e.date); if (map[k]) map[k].expenses += e.amount; }
  for (const r of db.receipts) { const k = monthKey(r.date); if (map[k]) map[k].collections += r.amount; }
  for (const p of db.supplierPayments) { const k = monthKey(p.date); if (map[k]) map[k].payments += p.amount; }
  return keys.map((k) => {
    const v = map[k];
    for (const f in v) v[f] = Math.round(v[f]);
    return { month: k, ...v, grossMargin: v.revenue - v.purchases, netResult: v.revenue - v.purchases - v.expenses, gstNet: v.gstOut - v.gstIn };
  });
}

function hsnSummary(from, to) {
  const db = store.get();
  const m = {};
  for (const i of db.invoices) {
    if ((from && i.date < from) || (to && i.date > to)) continue;
    const intra = i.igst === 0;
    for (const l of i.lines) {
      const k = `${l.hsn}|${l.gstRate}`;
      if (!m[k]) m[k] = { hsn: l.hsn, gstRate: l.gstRate, taxable: 0, cgst: 0, sgst: 0, igst: 0, lines: 0 };
      m[k].taxable += l.taxable; m[k].lines += 1;
      if (intra) { m[k].cgst += l.gst / 2; m[k].sgst += l.gst / 2; } else m[k].igst += l.gst;
    }
  }
  return Object.values(m).map((r) => ({ ...r, taxable: Math.round(r.taxable), cgst: Math.round(r.cgst), sgst: Math.round(r.sgst), igst: Math.round(r.igst) })).sort((a, b) => b.taxable - a.taxable);
}

module.exports = { OPENING, invoiceStatuses, distributorSummaries, distributorLedger, billStatuses, book, monthly, hsnSummary, bucketOf };
