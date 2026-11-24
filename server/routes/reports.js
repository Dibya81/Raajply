'use strict';
const store = require('../db');
const stock = require('../services/stock');
const { today, round0, round2, sum, addDays, daysBetween, monthKey } = require('../util');
const { HttpError } = require('../util');
const { maps } = require('./helpers');

function range(query) {
  const t = today();
  const to = /^\d{4}-\d{2}-\d{2}$/.test(query.to || '') ? query.to : t;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(query.from || '') ? query.from : addDays(to, -89);
  if (from > to) throw new HttpError(400, 'From date must be before To date');
  return { from, to };
}
const inRange = (d, { from, to }) => d >= from && d <= to;
function group(rows, keyFn, valFns) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!m.has(k)) m.set(k, Object.fromEntries(Object.keys(valFns).map((f) => [f, 0])));
    const o = m.get(k);
    for (const [f, fn] of Object.entries(valFns)) o[f] += Number(fn(r)) || 0;
  }
  return m;
}

module.exports = function register(r) {
  r.get('/api/reports/sales', 'finance.view', ({ query }) => {
    const db = store.get();
    const rg = range(query);
    const { P, D } = maps();
    const invs = db.invoices.filter((i) => inRange(i.date, rg));
    const lines = invs.flatMap((i) => i.lines.map((l) => ({ ...l, distributorId: i.distributorId, state: D[i.distributorId]?.state, date: i.date })));
    const byProduct = [...group(lines, (l) => l.productId, { qty: (l) => l.qty, taxable: (l) => l.taxable })].map(([id, v]) => ({ id, name: P[id]?.name, category: P[id]?.category, unit: P[id]?.unit, qty: round2(v.qty), taxable: round0(v.taxable) })).sort((a, b) => b.taxable - a.taxable);
    const byCategory = [...group(lines, (l) => P[l.productId]?.category, { taxable: (l) => l.taxable })].map(([name, v]) => ({ name, taxable: round0(v.taxable) })).sort((a, b) => b.taxable - a.taxable);
    const byDistributor = [...group(invs, (i) => i.distributorId, { taxable: (i) => i.taxable, invoices: () => 1 })].map(([id, v]) => ({ id, name: D[id]?.name, city: D[id]?.city, state: D[id]?.state, invoices: v.invoices, taxable: round0(v.taxable) })).sort((a, b) => b.taxable - a.taxable);
    const byState = [...group(lines, (l) => l.state, { taxable: (l) => l.taxable })].map(([name, v]) => ({ name, taxable: round0(v.taxable) })).sort((a, b) => b.taxable - a.taxable);
    const byMonth = [...group(invs, (i) => monthKey(i.date), { taxable: (i) => i.taxable, gst: (i) => i.cgst + i.sgst + i.igst })].map(([month, v]) => ({ month, taxable: round0(v.taxable), gst: round0(v.gst) })).sort((a, b) => (a.month < b.month ? -1 : 1));
    const total = round0(sum(invs, (i) => i.taxable));
    return { ...rg, total, gst: round0(sum(invs, (i) => i.cgst + i.sgst + i.igst)), invoices: invs.length, avgInvoice: invs.length ? round0(total / invs.length) : 0, distributors: byDistributor.length, byProduct, byCategory, byDistributor, byState, byMonth };
  });

  r.get('/api/reports/production', 'production.view', ({ query }) => {
    const db = store.get();
    const rg = range(query);
    const { SP } = maps();
    const ws = db.workOrders.filter((w) => w.status === 'Closed' && inRange(w.date, rg));
    const agg = (m) => [...m].map(([k, v]) => ({ key: k, workOrders: v.n, inputCft: round2(v.inp), veneerCft: round2(v.ven), outputCft: round2(v.out), sheets: v.sh, yield: v.inp ? round2((v.ven / v.inp) * 100) : null }));
    const vf = { n: () => 1, inp: (w) => w.inputCft, ven: (w) => w.veneerCft || 0, out: (w) => w.outputCft, sh: (w) => w.sheets || 0 };
    const bySpecies = agg(group(ws, (w) => w.species, vf)).map((x) => ({ ...x, name: SP[x.key]?.name, color: SP[x.key]?.color })).sort((a, b) => b.outputCft - a.outputCft);
    const byPlant = agg(group(ws, (w) => (w.shift || '').split(' (')[0] || 'Day shift', vf)).map((x) => ({ ...x, name: x.key }));
    const byMonth = agg(group(ws, (w) => monthKey(w.date), vf)).map((x) => ({ ...x, month: x.key })).sort((a, b) => (a.month < b.month ? -1 : 1));
    const byShift = agg(group(ws, (w) => w.shift.replace(/ \(.*/, ''), vf)).map((x) => ({ ...x, name: x.key }));
    const worst = ws.slice().sort((a, b) => a.yield - b.yield).slice(0, 8).map((w) => ({ id: w.id, no: w.no, date: w.date, species: SP[w.species]?.name, inputCft: w.inputCft, veneerCft: w.veneerCft, outputCft: w.outputCft, sheets: w.sheets, yield: w.yield }));
    const inp = sum(ws, (w) => w.inputCft), out = sum(ws, (w) => w.outputCft), ven = sum(ws, (w) => w.veneerCft || 0);
    const byp = {}; ws.forEach((w) => w.byproducts.forEach((b) => { byp[b.productId] = (byp[b.productId] || 0) + b.qty; }));
    return { ...rg, workOrders: ws.length, inputCft: round2(inp), veneerCft: round2(ven), outputCft: round2(out), sheets: sum(ws, (w) => w.sheets || 0), yield: inp ? round2((ven / inp) * 100) : null, sawdustKg: round0(byp['BYP-WASTE'] || 0), offcutKg: round0(byp['BYP-CORE'] || 0), bySpecies, byPlant, byMonth, byShift, worst };
  });

  r.get('/api/reports/purchases', ['yard.view', 'finance.view'], ({ query }) => {
    const db = store.get();
    const rg = range(query);
    const { S, SP } = maps();
    const ges = db.gateEntries.filter((g) => inRange(g.date, rg));
    const vf = { trucks: () => 1, logs: (g) => g.logCount, cft: (g) => g.totalCft, amount: (g) => g.amount };
    const fmt = (m, nameFn) => [...m].map(([k, v]) => ({ id: k, name: nameFn(k), trucks: v.trucks, logs: v.logs, cft: round2(v.cft), amount: round0(v.amount), avgRate: v.cft ? round0(v.amount / v.cft) : 0 })).sort((a, b) => b.amount - a.amount);
    const bySupplier = fmt(group(ges, (g) => g.supplierId, vf), (k) => S[k]?.name);
    const bySpecies = fmt(group(ges, (g) => g.species, vf), (k) => SP[k]?.name).map((x) => ({ ...x, color: SP[x.id]?.color }));
    const byMonth = fmt(group(ges, (g) => monthKey(g.date), vf), (k) => k).sort((a, b) => (a.id < b.id ? -1 : 1));
    return { ...rg, trucks: ges.length, logs: sum(ges, (g) => g.logCount), cft: round2(sum(ges, (g) => g.totalCft)), amount: round0(sum(ges, (g) => g.amount)), bySupplier, bySpecies, byMonth };
  });

  r.get('/api/reports/stock', 'inventory.view', () => {
    const db = store.get();
    const t = today();
    const ps = stock.productSummary();
    const byCategory = [...group(ps, (p) => p.category, { value: (p) => p.value, items: () => 1 })].map(([name, v]) => ({ name, value: round0(v.value), items: v.items })).sort((a, b) => b.value - a.value);
    const yard = db.logs.filter((l) => l.status === 'In yard');
    const buckets = [['0–15 days', 0, 15], ['16–30 days', 16, 30], ['31–45 days', 31, 45], ['Over 45 days', 46, 99999]];
    const logAgeing = buckets.map(([label, a, b]) => { const ls = yard.filter((l) => { const d = daysBetween(l.receivedOn, t); return d >= a && d <= b; }); return { label, logs: ls.length, cft: round2(sum(ls, (l) => l.cft)), value: round0(sum(ls, (l) => l.cft * l.rate)) }; });
    // slow movers: no dispatch in 30 days but stock on hand
    const since = addDays(t, -30);
    const moved = new Set(db.stockLedger.filter((x) => x.type === 'DISPATCH' && x.date >= since).map((x) => x.itemId));
    const slow = ps.filter((p) => p.total > 0 && !moved.has(p.id) && p.category !== 'By-products').map((p) => ({ id: p.id, name: p.name, total: p.total, unit: p.unit, value: p.value })).sort((a, b) => b.value - a.value);
    return { value: round0(sum(ps, (p) => p.value)), byCategory, logAgeing, slow, top: ps.slice().sort((a, b) => b.value - a.value).slice(0, 10).map((p) => ({ id: p.id, name: p.name, total: p.total, unit: p.unit, value: p.value, category: p.category, species: p.species })) };
  });
};
