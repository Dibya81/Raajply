'use strict';
const store = require('../db');
const audit = require('../services/audit');
const stock = require('../services/stock');
const { HttpError, nowTs, today, round2, round0, hoppusCft, addDays, daysBetween, sum } = require('../util');
const { num, str, find, maps, userName } = require('./helpers');

const RECOVERY_TARGET = 75; // Raajply: about 75% of each log becomes usable veneer
const RECOVERY_LOW = 68;

module.exports = function register(r) {
  // ======================= LOG YARD =======================
  r.get('/api/yard/summary', 'yard.view', () => {
    const db = store.get();
    const t = today();
    const month = t.slice(0, 7);
    const ges = db.gateEntries;
    const todays = ges.filter((g) => g.date === t);
    const monthG = ges.filter((g) => g.date.startsWith(month));
    const species = stock.logSummary();
    return {
      inYard: { logs: sum(species, (s) => s.logs), cft: round2(sum(species, (s) => s.cft)), value: round0(sum(species, (s) => s.value)) },
      today: { trucks: todays.length, logs: sum(todays, (g) => g.logCount), cft: round2(sum(todays, (g) => g.totalCft)) },
      month: { trucks: monthG.length, logs: sum(monthG, (g) => g.logCount), cft: round2(sum(monthG, (g) => g.totalCft)), amount: round0(sum(monthG, (g) => g.amount)) },
      species,
    };
  });

  r.get('/api/yard/gate-entries', 'yard.view', () => {
    const { S, SP, U } = maps();
    return store.get().gateEntries.slice().reverse().map((g) => ({
      id: g.id, no: g.no, date: g.date, ts: g.ts, supplier: S[g.supplierId]?.name, supplierId: g.supplierId, species: SP[g.species]?.name, speciesId: g.species,
      vehicle: g.vehicle, transitPass: g.transitPass, source: g.source || 'Farmer', country: g.country || 'India', billOfEntry: g.billOfEntry, container: g.container, logCount: g.logCount, totalCft: g.totalCft, rate: g.rate, amount: g.amount, createdBy: userName(U, g.createdBy),
    }));
  });

  r.get('/api/yard/gate-entries/:id', 'yard.view', ({ params }) => {
    const db = store.get();
    const g = find('gateEntries', params.id, 'Gate entry');
    const { S, SP, U } = maps();
    const bill = db.purchaseBills.find((b) => b.id === g.billId);
    const logs = db.logs.filter((l) => l.gateEntryId === g.id);
    return { ...g, supplier: S[g.supplierId], speciesInfo: SP[g.species], createdByName: userName(U, g.createdBy), bill, logs };
  });

  r.post('/api/yard/gate-entries', 'yard.edit', ({ body, user }) => {
    const db = store.get();
    const sup = find('suppliers', body.supplierId, 'Supplier');
    const sp = find('species', body.species, 'Species');
    const vehicle = str(body.vehicle, 'Vehicle number', { max: 20 }).toUpperCase();
    const rate = num(body.rate, 'Rate per CFT', { min: 1, max: 100000 });
    const imp = sup.type === 'Import';
    const transitPass = imp ? 'Imported — customs cleared' : str(body.transitPass, 'Transit pass number', { required: !!sp.transitPass, max: 40 }) || 'Not required';
    const billOfEntry = imp ? str(body.billOfEntry, 'Bill of entry number', { max: 30 }) : '';
    const container = imp ? str(body.container, 'Container number', { required: false, max: 20 }).toUpperCase() : '';
    if (!Array.isArray(body.logs) || !body.logs.length) throw new HttpError(400, 'Add at least one log');
    if (body.logs.length > 200) throw new HttpError(400, 'Too many logs in one entry (max 200)');
    const t = today(), ts = nowTs();
    const no = store.nextNo('GE', 'GE');
    const ge = { id: no, no, date: t, ts, supplierId: sup.id, species: sp.id, source: imp ? 'Import' : 'Farmer', country: sup.country || 'India', container, billOfEntry, vehicle, transitPass, rate, supplierBillNo: str(body.supplierBillNo, 'Supplier bill no', { required: false, max: 40 }), logIds: [], createdBy: user.id, weighbridgeKg: body.weighbridgeKg ? num(body.weighbridgeKg, 'Weighbridge kg', { min: 0 }) : null };
    let total = 0;
    body.logs.forEach((l, i) => {
      const girth = num(l.girth, `Log ${i + 1} girth`, { min: 6, max: 240 });
      const length = num(l.length, `Log ${i + 1} length`, { min: 1, max: 60 });
      const cft = hoppusCft(girth, length);
      const tag = store.nextNo('LOG', `L${t.slice(2, 4)}`, 6);
      db.logs.push({ id: tag, tag, gateEntryId: no, species: sp.id, girth, length, cft, rate, status: 'In yard', location: 'YARD', receivedOn: t, workOrderId: null });
      ge.logIds.push(tag); total += cft;
    });
    ge.logCount = ge.logIds.length; ge.totalCft = round2(total); ge.amount = round0(total * rate);
    const billNo = store.nextNo('PB', 'PB');
    ge.billId = billNo;
    db.gateEntries.push(ge);
    const gst = imp ? round0(ge.amount * 0.18) : 0;
    db.purchaseBills.push({ id: billNo, no: billNo, date: t, supplierId: sup.id, kind: imp ? 'Logs — import' : 'Logs — farmer', gateEntryId: no, supplierBillNo: ge.supplierBillNo, description: `${ge.logCount} ${sp.name} logs · ${ge.totalCft} CFT @ ₹${rate}${imp ? ` · ${sup.country} · ${billOfEntry}` : ''}`, taxable: ge.amount, gst, total: ge.amount + gst, dueDate: addDays(t, sup.paymentDays || 15) });
    stock.post({ ts, date: t, type: 'GRN', itemType: 'log', itemId: sp.id, qty: ge.totalCft, unit: 'CFT', location: 'YARD', ref: no, refType: 'gateEntry', userId: user.id, note: `${ge.logCount} logs from ${sup.name}` });
    audit.log(user, 'create', 'Log arrival', no, `${ge.logCount} ${sp.name} logs, ${ge.totalCft} CFT from ${sup.name}${imp ? ` (${sup.country}${container ? `, container ${container}` : ''})` : ` (vehicle ${vehicle})`}`);
    store.save();
    return ge;
  });

  r.get('/api/yard/logs', ['yard.view', 'production.view'], ({ query }) => {
    const db = store.get();
    const { SP, S } = maps();
    const ge = Object.fromEntries(db.gateEntries.map((g) => [g.id, g]));
    const t = today();
    let logs = db.logs;
    if (query.status) logs = logs.filter((l) => l.status === query.status);
    if (query.species) logs = logs.filter((l) => l.species === query.species);
    if (!query.status) logs = logs.slice(-1500);
    return logs.map((l) => ({ ...l, speciesName: SP[l.species]?.name, supplier: S[ge[l.gateEntryId]?.supplierId]?.name, ageDays: daysBetween(l.receivedOn, t) })).reverse();
  });

  // ======================= PRODUCTION =======================
  r.get('/api/production/summary', 'production.view', () => {
    const db = store.get();
    const t = today();
    const since = addDays(t, -30);
    const closed = db.workOrders.filter((w) => w.status === 'Closed' && w.date >= since);
    const bySpecies = db.species.map((s) => {
      const ws = closed.filter((w) => w.species === s.id);
      const inC = sum(ws, (w) => w.inputCft), outC = sum(ws, (w) => w.outputCft);
      const vC = sum(ws, (w) => w.veneerCft || 0);
      return { id: s.id, name: s.name, color: s.color, workOrders: ws.length, inputCft: round2(inC), outputCft: round2(outC), sheets: sum(ws, (w) => w.sheets || 0), yield: inC ? round2((vC / inC) * 100) : null };
    }).filter((x) => x.workOrders);
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = addDays(t, -i);
      const ws = db.workOrders.filter((w) => w.date === d);
      const cl = ws.filter((w) => w.status === 'Closed');
      days.push({ date: d, input: round2(sum(ws, (w) => w.inputCft)), veneer: round2(sum(cl, (w) => w.veneerCft || 0)), output: round2(sum(cl, (w) => w.outputCft)), sheets: sum(cl, (w) => w.sheets || 0) });
    }
    const inC = sum(closed, (w) => w.inputCft), vC = sum(closed, (w) => w.veneerCft || 0);
    const month = t.slice(0, 7);
    const monthClosed = db.workOrders.filter((w) => w.status === 'Closed' && w.date.startsWith(month));
    const workDays = new Set(closed.map((w) => w.date)).size || 1;
    return {
      inProgress: db.workOrders.filter((w) => w.status === 'In progress').length, target: RECOVERY_TARGET, low: RECOVERY_LOW,
      monthOutputCft: round2(sum(monthClosed, (w) => w.outputCft)), monthSheets: sum(monthClosed, (w) => w.sheets || 0),
      sheetsPerDay: Math.round(sum(closed, (w) => w.sheets || 0) / workDays),
      yield30: inC ? round2((vC / inC) * 100) : null, lowYield30: closed.filter((w) => w.yield < RECOVERY_LOW).length,
      bySpecies, days,
    };
  });

  r.get('/api/production/work-orders', 'production.view', () => {
    const { SP, U } = maps();
    return store.get().workOrders.slice().reverse().map((w) => ({
      id: w.id, no: w.no, date: w.date, plant: 'Peeling → press', species: SP[w.species]?.name, speciesId: w.species, logs: w.logIds.length,
      inputCft: w.inputCft, veneerCft: w.veneerCft, sheets: w.sheets || 0, outputCft: w.outputCft, yield: w.yield, status: w.status, shift: w.shift, supervisor: userName(U, w.supervisorId),
    }));
  });

  r.get('/api/production/work-orders/:id', 'production.view', ({ params }) => {
    const db = store.get();
    const w = find('workOrders', params.id, 'Work order');
    const { P, SP, U } = maps();
    const logs = db.logs.filter((l) => l.workOrderId === w.id);
    const products = db.products.filter((p) => p.plant === 'PLY');
    return {
      ...w, plantName: 'Peeling → press', target: RECOVERY_TARGET, low: RECOVERY_LOW, speciesInfo: SP[w.species], supervisor: userName(U, w.supervisorId), logs,
      outputs: w.outputs.map((o) => ({ ...o, name: P[o.productId]?.name })), byproducts: w.byproducts.map((o) => ({ ...o, name: P[o.productId]?.name })),
      products: products.map((p) => ({ id: p.id, name: p.name, unit: p.unit, cftPerUnit: p.cftPerUnit, category: p.category, size: p.size })),
    };
  });

  r.post('/api/production/work-orders', 'production.edit', ({ body, user }) => {
    const db = store.get();
    const sp = find('species', body.species, 'Species');
    const plant = 'PLY';
    if (!Array.isArray(body.logIds) || !body.logIds.length) throw new HttpError(400, 'Select at least one log');
    const logs = body.logIds.map((id) => {
      const l = db.logs.find((x) => x.id === id);
      if (!l) throw new HttpError(404, `Log ${id} not found`);
      if (l.status !== 'In yard') throw new HttpError(409, `Log ${id} is not in the yard`);
      if (l.species !== sp.id) throw new HttpError(400, `Log ${id} is ${l.species}, not ${sp.name}`);
      return l;
    });
    const t = today(), ts = nowTs();
    const no = store.nextNo('WO', 'BATCH');
    const input = round2(sum(logs, (l) => l.cft));
    logs.forEach((l) => { l.status = 'Peeled'; l.workOrderId = no; l.location = 'PEEL'; l.issuedOn = t; });
    const wo = { id: no, no, date: t, ts, plant, species: sp.id, shift: str(body.shift, 'Shift', { required: false }) || 'Day shift (8am–8pm)', supervisorId: user.id, logIds: logs.map((l) => l.id), inputCft: input, veneerCft: null, sheets: 0, outputs: [], byproducts: [], outputCft: 0, yield: null, status: 'In progress', note: str(body.note, 'Note', { required: false, max: 300 }) };
    db.workOrders.push(wo);
    stock.post({ ts, date: t, type: 'ISSUE', itemType: 'log', itemId: sp.id, qty: -input, unit: 'CFT', location: 'YARD', ref: no, refType: 'workOrder', userId: user.id, note: `${logs.length} logs sent for peeling` });
    audit.log(user, 'create', 'Production batch', no, `${logs.length} ${sp.name} logs (${input} CFT) sent for peeling`);
    store.save();
    return wo;
  });

  r.post('/api/production/work-orders/:id/output', 'production.edit', ({ params, body, user }) => {
    const db = store.get();
    const w = find('workOrders', params.id, 'Production batch');
    if (w.status !== 'In progress') throw new HttpError(409, 'This batch is already closed');
    const ts = nowTs(), t = today();
    const veneer = num(body.veneerCft, 'Veneer produced (CFT)', { min: 0.01 });
    if (veneer > w.inputCft) throw new HttpError(400, `Veneer (${veneer} CFT) can't be more than the logs peeled (${w.inputCft} CFT)`);
    const outs = (body.outputs || []).filter((o) => Number(o.qty) > 0);
    if (!outs.length) throw new HttpError(400, 'Enter the number of sheets made for at least one product');
    let outCft = 0;
    const rows = outs.map((o) => {
      const p = find('products', o.productId, 'Product');
      if (p.plant !== 'PLY') throw new HttpError(400, `${p.name} is not made in production`);
      const qty = num(o.qty, `${p.name} quantity`, { min: 0, int: p.unit === 'Sheet' });
      const cft = p.unit === 'Sheet' ? round2(qty * p.cftPerUnit) : qty;
      outCft += cft;
      return { p, qty, cft };
    });
    if (outCft > veneer * 1.05) throw new HttpError(400, `Sheets made (${round2(outCft)} CFT) can't be more than the veneer produced (${veneer} CFT)`);
    for (const { p, qty, cft } of rows) {
      w.outputs.push({ productId: p.id, qty, unit: p.unit, cft });
      stock.post({ ts, date: t, type: 'PROD_OUT', itemType: 'product', itemId: p.id, qty, unit: p.unit, location: p.location, ref: w.no, refType: 'workOrder', userId: user.id, note: 'Sheets pressed & finished' });
    }
    for (const b of (body.byproducts || []).filter((x) => Number(x.qty) > 0)) {
      const p = find('products', b.productId, 'By-product');
      const qty = num(b.qty, `${p.name} quantity`, { min: 0 });
      w.byproducts.push({ productId: p.id, qty, unit: p.unit });
      stock.post({ ts, date: t, type: 'BYPRODUCT', itemType: 'product', itemId: p.id, qty, unit: p.unit, location: p.location, ref: w.no, refType: 'workOrder', userId: user.id, note: 'By-product' });
    }
    w.veneerCft = round2(veneer);
    w.outputCft = round2(sum(w.outputs, (o) => o.cft));
    w.sheets = sum(w.outputs.filter((o) => o.unit === 'Sheet'), (o) => o.qty);
    w.yield = round2((veneer / w.inputCft) * 100);
    w.status = 'Closed'; w.closedAt = ts;
    audit.log(user, 'close', 'Production batch', w.no, `${w.sheets} sheets made · veneer ${w.veneerCft} CFT · recovery ${w.yield}%${w.yield < RECOVERY_LOW ? ' — LOW' : ''}`);
    store.save();
    return w;
  });

  // ======================= INVENTORY =======================
  r.get('/api/inventory/stock', 'inventory.view', () => {
    const db = store.get();
    const products = stock.productSummary();
    return { locations: db.locations, products, logs: stock.logSummary(), totals: { value: round0(sum(products, (p) => p.value)), low: products.filter((p) => p.status !== 'OK' && p.reorder).length } };
  });

  r.get('/api/inventory/ledger', 'inventory.view', ({ query }) => {
    const db = store.get();
    const { P, SP, U, L } = maps();
    let rows = db.stockLedger.filter((x) => x.itemType !== 'note');
    if (query.type) rows = rows.filter((x) => x.type === query.type);
    if (query.item) rows = rows.filter((x) => x.itemId === query.item);
    if (query.location) rows = rows.filter((x) => x.location === query.location);
    if (query.from) rows = rows.filter((x) => x.date >= query.from);
    if (query.to) rows = rows.filter((x) => x.date <= query.to);
    const limit = Math.min(Number(query.limit) || 800, 3000);
    return rows.slice(-limit).reverse().map((x) => ({ ...x, itemName: x.itemType === 'log' ? `${SP[x.itemId]?.name} logs` : P[x.itemId]?.name || x.itemId, locationName: L[x.location]?.name || x.location, user: userName(U, x.userId) }));
  });

  r.post('/api/inventory/transfer', 'inventory.edit', ({ body, user }) => {
    const p = find('products', body.productId, 'Product');
    const from = find('locations', body.from, 'From location');
    const to = find('locations', body.to, 'To location');
    if (from.id === to.id) throw new HttpError(400, 'From and To must be different');
    const qty = num(body.qty, 'Quantity', { min: 0.01 });
    const have = stock.productQty(p.id, from.id);
    if (qty > have) throw new HttpError(409, `Only ${have} ${p.unit} available in ${from.name}`);
    const ref = store.nextNo('TRF', 'TRF');
    const ts = nowTs();
    const note = str(body.note, 'Note', { required: false, max: 200 }) || `Transfer ${from.name} → ${to.name}`;
    stock.post({ ts, type: 'TRANSFER_OUT', itemType: 'product', itemId: p.id, qty: -qty, unit: p.unit, location: from.id, ref, refType: 'transfer', userId: user.id, note });
    stock.post({ ts, type: 'TRANSFER_IN', itemType: 'product', itemId: p.id, qty, unit: p.unit, location: to.id, ref, refType: 'transfer', userId: user.id, note });
    audit.log(user, 'create', 'Stock transfer', ref, `${qty} ${p.unit} ${p.name}: ${from.name} → ${to.name}`);
    store.save();
    return { ok: true, ref };
  });

  r.post('/api/inventory/adjust', 'inventory.edit', ({ body, user }) => {
    const db = store.get();
    const p = find('products', body.productId, 'Product');
    const loc = find('locations', body.location, 'Location');
    const qty = num(body.qty, 'Adjustment quantity');
    if (qty === 0) throw new HttpError(400, 'Adjustment cannot be zero');
    const reason = str(body.reason, 'Reason', { max: 200 });
    const id = store.nextNo('APR', 'APR');
    const a = { id, type: 'stock_adjustment', status: 'Pending', ts: nowTs(), requestedBy: user.id, summary: `${qty > 0 ? '+' : ''}${qty} ${p.unit} ${p.name} in ${loc.name} — ${reason}`, payload: { productId: p.id, location: loc.id, qty, reason } };
    db.approvals.push(a);
    audit.log(user, 'request', 'Stock adjustment', id, a.summary);
    store.save();
    return a;
  });
};
