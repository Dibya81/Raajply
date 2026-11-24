'use strict';
/**
 * Demo data generator: ~6 months of a mid-size wood manufacturing company.
 * Deterministic (seeded PRNG) so every run produces consistent figures, dated relative to "today".
 * Usage: node server/seed.js            (writes data/db.json)
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { hoppusCft, sheetCft, round2, round0, addDays, today, dow, fyLabel, hashPassword, daysBetween } = require('./util');

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generate(opts = {}) {
  const END = opts.today || today();
  const DAYS = opts.days || 182;
  const START = addDays(END, -DAYS);
  const rnd = mulberry32(opts.seed || 20261121);
  const ri = (a, b) => Math.floor(a + rnd() * (b - a + 1));
  const rf = (a, b) => a + rnd() * (b - a);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const wpick = (arr, w) => { const t = w.reduce((a, b) => a + b, 0); let r = rnd() * t; for (let i = 0; i < arr.length; i++) { r -= w[i]; if (r <= 0) return arr[i]; } return arr[arr.length - 1]; };
  const hhmm = (h1 = 8, h2 = 18) => `${String(ri(h1, h2)).padStart(2, '0')}:${String(ri(0, 59)).padStart(2, '0')}`;
  // On the last day, keep times at or before the current hour so nothing appears to be in the future.
  const realToday = today();
  const maxH = END === realToday && !opts.today ? Math.max(8, new Date().getHours()) : 19;
  const hhT = (h1, h2) => { const b = Math.min(h2, maxH); return hhmm(Math.min(h1, b), b); };
  const hex = (n) => Array.from({ length: n }, () => '0123456789abcdef'[ri(0, 15)]).join('');
  const digits = (n) => Array.from({ length: n }, () => ri(0, 9)).join('');

  const db = {
    meta: { version: 2, generatedAt: new Date().toISOString(), dataFrom: START, dataTo: END, demo: true },
    company: {
      name: 'Raajply', short: 'Raajply', legalName: 'Raajply (sample legal name)', gstin: '29AAACR1234R1Z5', state: 'Karnataka',
      address: 'Manufacturing unit & log yard, Magadi, Ramanagara district, Karnataka 562120', phone: '+91 80 0000 0000', email: 'accounts@raajply.example',
      pan: 'AAACR1234R', bank: 'Demo Bank · A/c 0000 1234 5678 · IFSC DEMO0001234', eInvoice: true, demo: true, booksIn: 'Tally',
    },
    locations: [
      { id: 'YARD', name: 'Log yard — Magadi', kind: 'Log yard' },
      { id: 'PEEL', name: 'Peeling & veneer drying', kind: 'Plant' },
      { id: 'PRESS', name: 'Glue spreading & hot press', kind: 'Plant' },
      { id: 'FG', name: 'Finished plywood godown', kind: 'Godown' },
      { id: 'STORE', name: 'Stores', kind: 'Stores' },
      { id: 'BYP', name: 'Cores & waste shed', kind: 'Godown' },
    ],
    species: [
      { id: 'TEAK', name: 'Teak', botanical: 'Tectona grandis', color: '#9a6436', logRate: 1350, transitPass: true },
      { id: 'PINE', name: 'Pine', botanical: 'Pinus spp.', color: '#d9b77e', logRate: 490, transitPass: false },
    ],
    vehicles: [
      { id: 'KA-42-B-4471', name: 'Tata 1613 · 9 t', driver: 'Ramesh · +91 98450 11223' },
      { id: 'KA-42-A-2208', name: 'Ashok Leyland 1616 · 10 t', driver: 'Basavaraj · +91 99000 44556' },
      { id: 'KA-42-C-0915', name: 'Eicher Pro 2049 · 5 t', driver: 'Yusuf · +91 97411 77889' },
    ],
    products: [], suppliers: [], distributors: [], users: [],
    gateEntries: [], logs: [], purchaseBills: [], supplierPayments: [],
    workOrders: [], stockLedger: [], orders: [], dispatches: [], invoices: [], receipts: [], expenses: [],
    storeItems: [], storeTxns: [], stockCounts: [], tallyExports: [],
    approvals: [], audit: [], contra: [], enquiries: [], counters: {},
  };
  const SP = Object.fromEntries(db.species.map((s) => [s.id, s]));
  // Peeler logs. Farm teak is smaller; imported pine logs are long and straight.
  const LOGSPEC = {
    TEAK: { girth: [30, 54], len: [6, 12], yield: [71, 78] },
    PINE: { girth: [38, 72], len: [8, 16], yield: [73, 80] },
  };

  const next = (key, prefix, pad = 5) => { db.counters[key] = (db.counters[key] || 0) + 1; return `${prefix}-${String(db.counters[key]).padStart(pad, '0')}`; };
  const invNo = (date) => { const fy = fyLabel(date); const k = 'INV' + fy; db.counters[k] = (db.counters[k] || 0) + 1; return `INV/${fy}/${String(db.counters[k]).padStart(5, '0')}`; };

  // ---------- Products: plywood, sold per square foot ----------
  const PLY = [
    // id, name, category, mm, sq ft per sheet, ₹ per sq ft, face species, size label
    ['MR-04', 'Commercial MR plywood 4 mm', 'Commercial MR', 4, 32, 26, 'PINE'],
    ['MR-06', 'Commercial MR plywood 6 mm', 'Commercial MR', 6, 32, 34, 'PINE'],
    ['MR-09', 'Commercial MR plywood 9 mm', 'Commercial MR', 9, 32, 46, 'PINE'],
    ['MR-12', 'Commercial MR plywood 12 mm', 'Commercial MR', 12, 32, 58, 'PINE'],
    ['MR-18', 'Commercial MR plywood 18 mm', 'Commercial MR', 18, 32, 79, 'PINE'],
    ['MR-12-7', 'Commercial MR plywood 12 mm · 7×4', 'Commercial MR', 12, 28, 58, 'PINE'],
    ['MR-18-7', 'Commercial MR plywood 18 mm · 7×4', 'Commercial MR', 18, 28, 79, 'PINE'],
    ['BWR-12', 'BWR plywood 12 mm', 'BWR', 12, 32, 70, 'PINE'],
    ['BWR-18', 'BWR plywood 18 mm', 'BWR', 18, 32, 94, 'PINE'],
    ['BWP-12', 'BWP marine plywood 12 mm', 'BWP Marine', 12, 32, 86, 'PINE'],
    ['BWP-18', 'BWP marine plywood 18 mm', 'BWP Marine', 18, 32, 114, 'PINE'],
    ['BWP-19', 'BWP marine plywood 19 mm', 'BWP Marine', 19, 32, 120, 'PINE'],
    ['TK-04', 'Teak decorative plywood 4 mm', 'Teak decorative', 4, 32, 98, 'TEAK'],
    ['TK-06', 'Teak decorative plywood 6 mm', 'Teak decorative', 6, 32, 122, 'TEAK'],
    ['SH-12', 'Shuttering plywood 12 mm (film faced)', 'Shuttering', 12, 32, 49, 'PINE'],
    ['SH-18', 'Shuttering plywood 18 mm (film faced)', 'Shuttering', 18, 32, 67, 'PINE'],
    ['BB-19', 'Block board 19 mm', 'Block board', 19, 32, 84, 'PINE'],
  ];
  for (const [id, name, category, mm, sqft, rate, sp] of PLY) {
    const dims = sqft === 28 ? '7 ft × 4 ft' : '8 ft × 4 ft';
    db.products.push({ id, sku: `RP-${id}`, name, category, species: sp, size: `${dims} × ${mm} mm`, grade: category, unit: 'Sheet', sqftPerSheet: sqft, priceUnit: 'sq ft', rate, hsn: '4412', gst: 18, location: 'FG', reorder: mm >= 12 && sqft === 32 ? 60 : 30, plant: 'PLY', cftPerUnit: sheetCft(mm, sqft), thicknessMm: mm, active: true });
  }
  db.products.push(
    { id: 'BYP-CORE', sku: 'BYP-CORE', name: 'Peeler cores (left after peeling)', category: 'By-products', species: null, size: 'Round, 4–5 inch', grade: '—', unit: 'Nos', rate: 45, hsn: '4403', gst: 18, location: 'BYP', reorder: 0, plant: null, cftPerUnit: 0, active: true },
    { id: 'BYP-WASTE', sku: 'BYP-WASTE', name: 'Veneer waste & trimmings', category: 'By-products', species: null, size: 'Loose', grade: '—', unit: 'Kg', rate: 3, hsn: '4401', gst: 5, location: 'BYP', reorder: 0, plant: null, cftPerUnit: 0, active: true },
  );
  const PROD = Object.fromEntries(db.products.map((p) => [p.id, p]));
  const amt = (p, qty, rate) => Math.round((p.sqftPerSheet ? qty * p.sqftPerSheet : qty) * rate);

  // ---------- Users: three logins ----------
  const pw = hashPassword('demo123', 'demo-salt-0001');
  const users = [
    ['u-owner', 'Suresh Raj (MD)', 'md', 'owner'],
    ['u-acc', 'Lavanya H', 'accounts', 'accounts'],
    ['u-prod', 'Manjunath B', 'production', 'production'],
  ];
  for (const [id, name, username, role] of users) {
    db.users.push({ id, name, username, role, phone: `+91 9${digits(9)}`, email: `${username}@raajply.example`, active: true, passwordHash: pw, createdAt: START });
  }

  // ---------- Suppliers: local farmers + importers ----------
  const suppliers = [
    ['Farmer — Ramaiah', 'Farmer', 'Magadi, KA', ['TEAK'], null],
    ['Farmer — Siddaraju', 'Farmer', 'Kunigal, KA', ['TEAK'], null],
    ['Farmer — Nagaraj K', 'Farmer', 'Channapatna, KA', ['TEAK'], null],
    ['Farmer — Lakshmamma', 'Farmer', 'Ramanagara, KA', ['TEAK'], null],
    ['Farmer — Chikkanna', 'Farmer', 'Kudur, KA', ['TEAK'], null],
    ['Northern Pine Exports (sample)', 'Import', 'British Columbia, Canada', ['PINE'], 'Canada'],
    ['Mekong Timber Co. (sample)', 'Import', 'Ho Chi Minh City, Vietnam', ['PINE', 'TEAK'], 'Vietnam'],
    ['Southern Pine Traders (sample)', 'Import', 'Georgia, USA', ['PINE'], 'USA'],
  ];
  suppliers.forEach(([name, type, place, species, country], i) => {
    db.suppliers.push({ id: `S${String(i + 1).padStart(3, '0')}`, code: `SUP-${String(i + 1).padStart(3, '0')}`, name, type, place, species, country, phone: country ? '' : `+91 9${digits(9)}`, gstin: '', paymentDays: type === 'Farmer' ? 7 : 45, active: true });
  });
  const FARMERS = db.suppliers.filter((x) => x.type === 'Farmer');
  const IMPORTERS = db.suppliers.filter((x) => x.type === 'Import');

  // ---------- Distributors: 6 across Karnataka ----------
  const dists = [
    ['Sri Lakshmi Plywoods', 'Bengaluru', 12000000, 45], ['Mysore Ply House', 'Mysuru', 8000000, 45], ['Tumkur Timber & Ply', 'Tumakuru', 6000000, 30],
    ['Hassan Hardware & Plywood', 'Hassan', 5000000, 30], ['Shivamogga Ply Centre', 'Shivamogga', 6000000, 45], ['Hubli Plywood Traders', 'Hubballi', 7500000, 60],
  ];
  const behaviours = ['good', 'good', 'avg', 'slow', 'avg', 'avg'];
  dists.forEach(([name, city, limit, days], i) => {
    db.distributors.push({
      id: `D${String(i + 1).padStart(3, '0')}`, code: `DST-${String(i + 1).padStart(3, '0')}`, name, city, state: 'Karnataka',
      gstin: `29AAB${String.fromCharCode(65 + i)}D${digits(4)}R1Z${ri(1, 9)}`,
      contact: pick(['Mr. ', 'Ms. ']) + ['Ramesh', 'Venkatesh', 'Imran', 'Kavitha', 'Anand', 'Prakash'][i],
      phone: `+91 9${digits(9)}`, creditLimit: limit, creditDays: days, discount: [3, 2, 0, 0, 2, 3][i],
      behaviour: behaviours[i], salesExec: null, territory: 'Karnataka', since: addDays(START, -ri(400, 3000)), active: true,
    });
  });
  const DIST = Object.fromEntries(db.distributors.map((d) => [d.id, d]));

  // ---------- Stores (consumables & spares) ----------
  const STORE = [
    ['UF', 'Urea formaldehyde resin (MR glue)', 'Glue & chemicals', 'Kg', 1500, 42],
    ['PF', 'Phenol formaldehyde resin (BWP glue)', 'Glue & chemicals', 'Kg', 600, 96],
    ['HRD', 'Hardener', 'Glue & chemicals', 'Kg', 120, 64],
    ['FLR', 'Wheat flour (glue extender)', 'Glue & chemicals', 'Kg', 400, 31],
    ['ROL', 'Glue spreader rollers', 'Machine spares', 'Nos', 2, 18500],
    ['MOT', 'Electric motor 5 HP', 'Machine spares', 'Nos', 1, 24500],
    ['KNF', 'Peeling lathe knife', 'Machine spares', 'Nos', 6, 9800],
    ['BLD', 'Saw blades (edge trimming)', 'Machine spares', 'Nos', 6, 3200],
    ['BLT', 'V-belts', 'Machine spares', 'Nos', 8, 650],
    ['OIL', 'Hydraulic oil (press)', 'Machine spares', 'Litres', 60, 185],
    ['GLV', 'Safety gloves', 'Safety', 'Pairs', 100, 48],
    ['TAP', 'Gum tape (veneer joining)', 'Consumables', 'Rolls', 40, 85],
  ];
  for (const [id, name, category, unit, reorder, rate] of STORE) db.storeItems.push({ id, name, category, unit, reorder, rate, active: true });
  const SI = Object.fromEntries(db.storeItems.map((x) => [x.id, x]));
  const storeQty = Object.fromEntries(db.storeItems.map((x) => [x.id, 0]));
  const STORE_VENDORS = ['Bharath Resins (sample)', 'Peenya Industrial Spares (sample)', 'Sri Sai Safety Supplies (sample)', 'Magadi Hardware (sample)'];
  const storeIn = (day, ts, id, qty, vendor, billNo) => {
    const it = SI[id]; const rate = Math.round(it.rate * rf(0.96, 1.05)); const amount = Math.round(qty * rate);
    const no = next('STI', 'STI');
    db.storeTxns.push({ id: no, no, date: day, ts, itemId: id, type: 'IN', qty, rate, amount, party: vendor, billNo, userId: 'u-acc', note: 'Purchase' });
    storeQty[id] += qty;
    return amount;
  };
  const storeOut = (day, ts, id, qty, to, note) => {
    qty = Math.min(qty, storeQty[id]); if (qty <= 0) return;
    const no = next('STO', 'STO');
    db.storeTxns.push({ id: no, no, date: day, ts, itemId: id, type: 'OUT', qty: Math.round(qty * 100) / 100, rate: SI[id].rate, amount: Math.round(qty * SI[id].rate), party: to, userId: 'u-prod', note: note || `Issued to ${to}` });
    storeQty[id] = Math.round((storeQty[id] - qty) * 100) / 100;
  };
  const storeBill = (day, vendor, desc, taxable) => {
    const no = next('PB', 'PB'); const gst = round0(taxable * 0.18);
    db.purchaseBills.push({ id: no, no, date: day, supplierId: null, party: vendor, kind: 'Stores', gateEntryId: null, supplierBillNo: `${vendor.slice(0, 3).toUpperCase()}/${ri(100, 999)}`, description: desc, taxable, gst, total: taxable + gst, dueDate: addDays(day, 30) });
    return no;
  };
  // Opening stock in stores
  { const ts = `${START} 09:30`; let t = 0; const lines = [];
    for (const it of db.storeItems) { const q = it.unit === 'Kg' ? it.reorder * 3 : it.unit === 'Nos' ? it.reorder * 2 + 1 : it.reorder * 2; t += storeIn(START, ts, it.id, q, 'Opening stock', 'OPENING'); lines.push(it.name); }
    db.storeTxns.forEach((x) => { x.note = 'Opening stock'; }); }

  // ---------- Helpers ----------
  const stock = {}; // `${productId}|${loc}` → qty
  const yardLogs = Object.fromEntries(db.species.map((s) => [s.id, []])); // FIFO queues of log objects
  const outstanding = Object.fromEntries(db.distributors.map((d) => [d.id, 0]));
  const scheduledReceipts = []; // {date, distributorId, amount, invoiceNo}
  const audit = (ts, userId, action, entity, entityId, summary) => db.audit.push({ id: crypto.randomUUID(), ts, userId, action, entity, entityId, summary });
  const ledger = (row) => db.stockLedger.push({ id: next('STK', 'STK', 6), ...row });
  const addStock = (pid, loc, q) => { const k = `${pid}|${loc}`; stock[k] = round2((stock[k] || 0) + q); };
  const getStock = (pid, loc) => stock[`${pid}|${loc}`] || 0;

  const onHand = {}; // ledger balance of products by id (all locations) — used for stock counts
  const ledgerP = (row) => { ledger(row); if (row.itemType === 'product') onHand[row.itemId] = round2((onHand[row.itemId] || 0) + row.qty); };
  ledger({ ts: `${START} 09:00`, date: START, type: 'OPENING', itemType: 'note', itemId: '-', qty: 0, unit: '-', location: '-', ref: 'Opening', refType: 'system', userId: 'u-owner', note: 'System start — opening balances' });
  audit(`${START} 09:00`, 'u-owner', 'setup', 'System', '-', 'Opening balances entered');
  // Opening plywood stock so sales can start on day one
  for (const p of db.products.filter((x) => x.unit === 'Sheet')) {
    const q = ri(60, 160);
    addStock(p.id, p.location, q);
    ledgerP({ ts: `${START} 09:05`, date: START, type: 'OPENING', itemType: 'product', itemId: p.id, qty: q, unit: 'Sheet', location: p.location, ref: 'Opening', refType: 'system', userId: 'u-owner', note: 'Opening stock (counted)' });
  }

  const pendingCount = { v: null };
  // ---------- Day loop ----------
  for (let day = START; day <= END; day = addDays(day, 1)) {
    const wd = dow(day);
    const isToday = day === END;
    const sunday = wd === 0;

    // ----- Inward logs: farmer trucks most days, an import container about once a week -----
    const arrivals = [];
    if (!sunday && rnd() < 0.9) arrivals.push({ sup: pick(FARMERS), sp: 'TEAK', count: ri(14, 26) });
    if (!sunday && (wd === 2 || wd === 5) && rnd() < 0.85) { const sup = pick(IMPORTERS); arrivals.push({ sup, sp: wpick(sup.species, sup.species.map((x) => (x === 'PINE' ? 4 : 1))), count: ri(58, 78) }); }
    for (const { sup, sp, count } of arrivals) {
      const cfg = LOGSPEC[sp];
      const imp = sup.type === 'Import';
      const ts = `${day} ${isToday ? hhT(7, 11) : hhmm(7, 17)}`;
      const geNo = next('GE', 'GE');
      const ge = { id: geNo, no: geNo, date: day, ts, supplierId: sup.id, species: sp, source: imp ? 'Import' : 'Farmer', country: sup.country || 'India',
        vehicle: imp ? `KA-${ri(1, 70)}-${String.fromCharCode(65 + ri(0, 25))}-${ri(1000, 9999)} (from Chennai port)` : `KA-42-${String.fromCharCode(65 + ri(0, 25))}-${ri(1000, 9999)}`,
        container: imp ? `${pick(['MSKU', 'CMAU', 'TGHU', 'OOLU'])}${digits(7)}` : '', billOfEntry: imp ? `BE ${digits(7)}` : '',
        transitPass: imp ? 'Imported — customs cleared' : `TP/KA/RMN/${day.slice(0, 4)}/${digits(5)}`, rate: Math.round(SP[sp].logRate * (imp ? rf(1.0, 1.08) : rf(0.94, 1.04)) / 10) * 10,
        supplierBillNo: imp ? `INV-${digits(5)}` : '', logIds: [], createdBy: 'u-prod' };
      let tot = 0;
      for (let i = 0; i < count; i++) {
        const girth = ri(cfg.girth[0], cfg.girth[1]); const length = ri(cfg.len[0], cfg.len[1]);
        const cft = hoppusCft(girth, length);
        const tag = next('LOG', `L${day.slice(2, 4)}`, 6);
        const log = { id: tag, tag, gateEntryId: ge.id, species: sp, girth, length, cft, rate: ge.rate, status: 'In yard', location: 'YARD', receivedOn: day, workOrderId: null };
        db.logs.push(log); yardLogs[sp].push(log); ge.logIds.push(tag); tot += cft;
      }
      ge.logCount = count; ge.totalCft = round2(tot); ge.amount = round0(tot * ge.rate);
      ge.weighbridgeKg = round0(tot * rf(19, 23));
      const taxable = ge.amount, gst = imp ? round0(taxable * 0.18) : 0; // farmers are unregistered
      const billNo = next('PB', 'PB');
      ge.billId = billNo;
      db.gateEntries.push(ge);
      db.purchaseBills.push({ id: billNo, no: billNo, date: day, supplierId: sup.id, kind: imp ? 'Logs — import' : 'Logs — farmer', gateEntryId: ge.id, supplierBillNo: ge.supplierBillNo, description: `${count} ${SP[sp].name} logs · ${ge.totalCft} CFT @ ₹${ge.rate}${imp ? ` · ${sup.country} · ${ge.billOfEntry}` : ''}`, taxable, gst, total: taxable + gst, dueDate: addDays(day, sup.paymentDays) });
      ledger({ ts, date: day, type: 'GRN', itemType: 'log', itemId: sp, qty: ge.totalCft, unit: 'CFT', location: 'YARD', ref: ge.no, refType: 'gateEntry', userId: ge.createdBy, note: `${count} logs from ${sup.name}` });
      audit(ts, ge.createdBy, 'create', 'Log arrival', ge.no, `${count} ${SP[sp].name} logs, ${ge.totalCft} CFT from ${sup.name}${imp ? ` (${sup.country}, container ${ge.container})` : ''}`);
      const payOn = addDays(day, sup.paymentDays + ri(-3, 6));
      if (payOn < END) {
        const pno = next('PAY', 'PAY');
        db.supplierPayments.push({ id: pno, no: pno, date: payOn, supplierId: sup.id, billId: billNo, amount: taxable + gst, mode: imp ? 'Bank (LC / wire)' : pick(['Bank (NEFT)', 'UPI']), ref: `UTR${digits(10)}`, userId: 'u-acc' });
      }
    }

    // ----- Production: peel logs → veneer → glue & press → sheets -----
    if (!sunday) {
      const runs = isToday ? 1 : (rnd() < 0.55 ? 2 : 1);
      for (let r = 0; r < runs; r++) {
        const sp = r === 0 ? (yardLogs.PINE.reduce((a, l) => a + l.cft, 0) > 300 ? 'PINE' : 'TEAK') : 'TEAK';
        if (yardLogs[sp].length < 8) continue;
        const target = sp === 'PINE' ? ri(360, 500) : ri(110, 170);
        const issued = []; let inCft = 0;
        while (yardLogs[sp].length && inCft < target) { const l = yardLogs[sp].shift(); issued.push(l); inCft += l.cft; }
        inCft = round2(inCft);
        const woNo = next('WO', 'BATCH');
        const ts = `${day} ${isToday ? hhT(7, 9) : hhmm(7, 9)}`;
        const shift = pick(['Day shift (8am–8pm)', 'Day shift (8am–8pm)', 'Night shift (8pm–8am)']);
        const wo = { id: woNo, no: woNo, date: day, ts, plant: 'PLY', species: sp, shift, supervisorId: 'u-prod', logIds: issued.map((l) => l.id), inputCft: inCft, veneerCft: null, outputs: [], byproducts: [], outputCft: 0, yield: null, sheets: 0, status: 'In progress', note: '' };
        issued.forEach((l) => { l.status = 'Peeled'; l.workOrderId = woNo; l.location = 'PEEL'; l.issuedOn = day; });
        ledger({ ts, date: day, type: 'ISSUE', itemType: 'log', itemId: sp, qty: -inCft, unit: 'CFT', location: 'YARD', ref: woNo, refType: 'workOrder', userId: 'u-prod', note: `${issued.length} logs sent for peeling` });
        audit(ts, 'u-prod', 'create', 'Production batch', woNo, `${issued.length} ${SP[sp].name} logs (${inCft} CFT) sent for peeling`);
        const closeIt = !(isToday || (day === addDays(END, -1) && r === 0));
        if (closeIt) {
          let y = rf(LOGSPEC[sp].yield[0], LOGSPEC[sp].yield[1]);
          if (rnd() < 0.06) y = rf(63, 69); // occasional poor batch (knife blunt / bent logs)
          const veneer = round2(inCft * y / 100);
          const sheetCftTotal = veneer * rf(0.9, 0.95);
          const pool = db.products.filter((p) => p.plant === 'PLY' && (sp === 'TEAK' ? p.species === 'TEAK' || p.category === 'Commercial MR' : p.species === 'PINE'));
          // make what is running low: weight products by how far below ~200 sheets they are
          const chosen = pool.filter((p) => getStock(p.id, p.location) < 220).sort((a, b) => (getStock(a.id, a.location) + rnd() * 120) - (getStock(b.id, b.location) + rnd() * 120)).slice(0, ri(3, 4));
          if (!chosen.length) chosen.push(pool[ri(0, pool.length - 1)]);
          const shares = chosen.map(() => rf(0.6, 1.4)); const ssum = shares.reduce((a, b) => a + b, 0);
          let real = 0, sheets = 0;
          const cts = `${day} ${hhmm(17, 21)}`;
          chosen.forEach((p, i) => {
            const qty = Math.floor((sheetCftTotal * shares[i] / ssum) / p.cftPerUnit);
            if (qty <= 0) return;
            const qcft = round2(qty * p.cftPerUnit);
            real += qcft; sheets += qty;
            wo.outputs.push({ productId: p.id, qty, unit: 'Sheet', cft: qcft });
            addStock(p.id, p.location, qty);
            ledgerP({ ts: cts, date: day, type: 'PROD_OUT', itemType: 'product', itemId: p.id, qty, unit: 'Sheet', location: p.location, ref: woNo, refType: 'workOrder', userId: 'u-prod', note: 'Sheets pressed & finished' });
            // glue used
            const glue = p.category === 'BWP Marine' ? 'PF' : 'UF';
            storeOut(day, cts, glue, round2(qty * (p.thicknessMm / 18) * rf(1.6, 2.0)), 'Glue & press section', `Glue for ${qty} × ${p.name}`);
          });
          const cores = Math.round(issued.length * rf(0.9, 1.0));
          const waste = round0((inCft - veneer) * rf(6, 8));
          wo.byproducts = [{ productId: 'BYP-CORE', qty: cores, unit: 'Nos' }, { productId: 'BYP-WASTE', qty: waste, unit: 'Kg' }];
          addStock('BYP-CORE', 'BYP', cores); addStock('BYP-WASTE', 'BYP', waste);
          ledgerP({ ts: cts, date: day, type: 'BYPRODUCT', itemType: 'product', itemId: 'BYP-CORE', qty: cores, unit: 'Nos', location: 'BYP', ref: woNo, refType: 'workOrder', userId: 'u-prod', note: 'Peeler cores' });
          ledgerP({ ts: cts, date: day, type: 'BYPRODUCT', itemType: 'product', itemId: 'BYP-WASTE', qty: waste, unit: 'Kg', location: 'BYP', ref: woNo, refType: 'workOrder', userId: 'u-prod', note: 'Veneer waste' });
          wo.veneerCft = veneer; wo.outputCft = round2(real); wo.sheets = sheets; wo.yield = round2(veneer / inCft * 100); wo.status = 'Closed'; wo.closedAt = cts;
          audit(cts, 'u-prod', 'close', 'Production batch', woNo, `${sheets} sheets made · veneer ${veneer} CFT · recovery ${wo.yield}%`);
        }
        db.workOrders.push(wo);
      }
      // hardener / extender / tape / gloves follow production
      storeOut(day, `${day} 08:15`, 'HRD', round2(rf(3, 6)), 'Glue & press section');
      storeOut(day, `${day} 08:15`, 'FLR', round2(rf(12, 22)), 'Glue & press section');
      if (rnd() < 0.5) storeOut(day, `${day} 08:20`, 'TAP', ri(1, 3), 'Peeling & veneer drying');
      if (wd === 1) storeOut(day, `${day} 08:30`, 'GLV', ri(18, 26), 'All sections', 'Weekly glove issue');
      if (rnd() < 0.06) storeOut(day, `${day} 11:00`, 'BLD', 1, 'Edge trimming', 'Blade replaced');
      if (rnd() < 0.035) storeOut(day, `${day} 12:00`, 'KNF', 1, 'Peeling lathe', 'Knife changed');
      if (rnd() < 0.05) storeOut(day, `${day} 12:30`, 'BLT', ri(1, 2), 'Maintenance');
      if (rnd() < 0.06) storeOut(day, `${day} 15:00`, 'OIL', ri(10, 20), 'Hot press', 'Hydraulic oil top-up');
      if (rnd() < 0.012) storeOut(day, `${day} 10:00`, 'ROL', 1, 'Glue spreader', 'Roller replaced');
      if (rnd() < 0.008) storeOut(day, `${day} 10:00`, 'MOT', 1, 'Maintenance', 'Motor replaced');
    }

    // ----- Store purchases: top up items below reorder level (not on the last 4 days, so some alerts remain) -----
    if ((wd === 3 || wd === 6) && daysBetween(day, END) > 9) {
      const low = db.storeItems.filter((it) => storeQty[it.id] < it.reorder * 1.3);
      if (low.length) {
        const vendor = low.some((it) => it.category === 'Glue & chemicals') ? STORE_VENDORS[0] : pick(STORE_VENDORS.slice(1));
        const ts = `${day} ${hhmm(10, 16)}`; const billNo = `${vendor.slice(0, 3).toUpperCase()}/${ri(1000, 9999)}`;
        let tot = 0;
        for (const it of low) { const q = it.unit === 'Kg' ? Math.round(it.reorder * rf(1.6, 2.4) / 50) * 50 : it.unit === 'Litres' ? 100 : Math.max(1, Math.round(it.reorder * rf(1.2, 2))); tot += storeIn(day, ts, it.id, q, vendor, billNo); }
        const pb = storeBill(day, vendor, `Stores: ${low.map((it) => it.name.split(' (')[0]).join(', ')}`, tot);
        audit(ts, 'u-acc', 'create', 'Store purchase', pb, `${low.length} item(s) from ${vendor} — ₹${tot.toLocaleString('en-IN')}`);
        const payOn = addDays(day, ri(20, 35));
        if (payOn < END) { const pno = next('PAY', 'PAY'); db.supplierPayments.push({ id: pno, no: pno, date: payOn, supplierId: null, party: vendor, billId: pb, amount: round0(tot * 1.18), mode: 'Bank (NEFT)', ref: `UTR${digits(10)}`, userId: 'u-acc' }); }
      }
    }

    // ----- Receipts due today -----
    for (const s of scheduledReceipts.filter((x) => x.date === day)) {
      const rno = next('RCT', 'RCT');
      const mode = wpick(['NEFT', 'RTGS', 'UPI', 'Cheque'], [5, 4, 1, 2]);
      db.receipts.push({ id: rno, no: rno, date: day, distributorId: s.distributorId, amount: s.amount, mode, ref: mode === 'Cheque' ? `CHQ ${digits(6)}` : `UTR${digits(10)}`, note: `Against ${s.invoiceNo}`, userId: 'u-acc' });
      outstanding[s.distributorId] = round2(outstanding[s.distributorId] - s.amount);
      audit(`${day} ${hhmm(10, 17)}`, 'u-acc', 'create', 'Receipt', rno, `₹${s.amount.toLocaleString('en-IN')} from ${DIST[s.distributorId].name} (${mode})`);
    }

    // ----- Distributor orders (sheets, priced per sq ft) -----
    if (!sunday) {
      const n = wpick([1, 2, 3], [3, 5, 2]);
      for (let k = 0; k < n; k++) {
        const d = pick(db.distributors);
        const lines = [];
        const avail = db.products.filter((p) => p.unit === 'Sheet' && getStock(p.id, p.location) > 40).sort((a, b) => getStock(b.id, b.location) * (0.6 + rnd()) - getStock(a.id, a.location) * (0.6 + rnd()));
        const nl = ri(2, 4);
        for (let j = 0; j < nl && avail.length; j++) {
          const p = avail.splice(Math.min(avail.length - 1, Math.floor(rnd() * rnd() * avail.length)), 1)[0];
          let qty = Math.round(ri(30, 160) / 5) * 5;
          qty = Math.min(qty, Math.floor(getStock(p.id, p.location) * 0.4 / 5) * 5);
          if (qty <= 0) continue;
          const rate = round2(p.rate * (1 - d.discount / 100));
          lines.push({ productId: p.id, qty, unit: 'Sheet', sqft: qty * p.sqftPerSheet, rate, amount: amt(p, qty, rate) });
        }
        if (!lines.length) continue;
        const subtotal = lines.reduce((a, l) => a + l.amount, 0);
        const gross = round0(lines.reduce((a, l) => a + l.amount * (1 + PROD[l.productId].gst / 100), 0));
        const slack = d.behaviour === 'slow' ? 1.1 : 1.0;
        if (outstanding[d.id] + gross > d.creditLimit * slack) continue;
        const oNo = next('SO', 'SO');
        const ts = `${day} ${isToday ? hhT(9, 12) : hhmm(9, 18)}`;
        const order = { id: oNo, no: oNo, date: day, ts, distributorId: d.id, lines, subtotal, grandTotal: gross, status: 'Pending approval', createdBy: 'u-acc', approvedBy: null, dispatchId: null, note: '' };
        db.orders.push(order);
        audit(ts, 'u-acc', 'create', 'Sales order', oNo, `${d.name} — ₹${gross.toLocaleString('en-IN')} (${lines.reduce((a, l) => a + l.qty, 0)} sheets)`);
        lines.forEach((l) => addStock(l.productId, PROD[l.productId].location, -l.qty));
        outstanding[d.id] += gross;
        const age = daysBetween(day, END);
        if (age <= 0) { lines.forEach((l) => addStock(l.productId, PROD[l.productId].location, l.qty)); outstanding[d.id] -= gross; continue; }
        order.status = 'Approved'; order.approvedBy = 'u-acc'; order.approvedAt = `${day} ${day === END ? hhT(10, 13) : hhmm(12, 19)}`;
        audit(order.approvedAt, 'u-acc', 'approve', 'Sales order', oNo, 'Order approved');
        if (age <= 1 && rnd() < 0.8) { lines.forEach((l) => addStock(l.productId, PROD[l.productId].location, l.qty)); outstanding[d.id] -= gross; continue; }
        const dDay = addDays(day, ri(0, Math.min(2, age)));
        const dts = `${dDay} ${dDay === END ? hhT(9, 13) : hhmm(9, 18)}`;
        const dspNo = next('DSP', 'DSP');
        const invLines = lines.map((l) => { const p = PROD[l.productId]; const taxable = l.amount; const g = round2(taxable * p.gst / 100); return { productId: p.id, name: p.name, hsn: p.hsn, qty: l.qty, unit: l.unit, sqft: l.sqft, rate: l.rate, taxable, gstRate: p.gst, gst: g }; });
        const taxable = invLines.reduce((a, l) => a + l.taxable, 0);
        const gstTot = round2(invLines.reduce((a, l) => a + l.gst, 0));
        const total = round0(taxable + gstTot);
        const ino = invNo(dDay);
        const ewb = total > 50000 ? `${ri(1, 9)}${digits(11)}` : '';
        const truck = pick(db.vehicles);
        const inv = { id: ino, no: ino, date: dDay, distributorId: d.id, orderId: oNo, dispatchId: dspNo, lines: invLines, taxable, cgst: round2(gstTot / 2), sgst: round2(gstTot / 2), igst: 0, total, roundOff: round2(total - taxable - gstTot), irn: hex(64), ackNo: digits(15), ewayBill: ewb, dueDate: addDays(dDay, d.creditDays), placeOfSupply: d.state };
        db.invoices.push(inv);
        const delivered = daysBetween(dDay, END) >= 1;
        db.dispatches.push({ id: dspNo, no: dspNo, date: dDay, ts: dts, orderId: oNo, distributorId: d.id, vehicle: truck.id, driver: truck.driver, transporter: 'Own truck', ewayBill: ewb, invoiceId: ino, status: delivered ? 'Delivered' : 'In transit', deliveredOn: delivered ? addDays(dDay, 1) : null, userId: 'u-prod' });
        order.status = 'Dispatched'; order.dispatchId = dspNo;
        lines.forEach((l) => ledgerP({ ts: dts, date: dDay, type: 'DISPATCH', itemType: 'product', itemId: l.productId, qty: -l.qty, unit: l.unit, location: PROD[l.productId].location, ref: dspNo, refType: 'dispatch', userId: 'u-prod', note: `${oNo} → ${d.name}` }));
        audit(dts, 'u-prod', 'create', 'Dispatch', dspNo, `${oNo} loaded on own truck ${truck.id}${ewb ? `, e-way bill ${ewb}` : ''}`);
        audit(dts, 'u-acc', 'create', 'Invoice', ino, `₹${total.toLocaleString('en-IN')} to ${d.name} · IRN generated`);
        outstanding[d.id] += total - gross;
        const factor = d.behaviour === 'good' ? rf(0.5, 0.95) : d.behaviour === 'avg' ? rf(0.8, 1.2) : rf(1.15, 1.7);
        const payDay = addDays(dDay, Math.round(d.creditDays * factor));
        if (rnd() < 0.15) { const half = round0(total / 2); scheduledReceipts.push({ date: payDay, distributorId: d.id, amount: half, invoiceNo: ino }); scheduledReceipts.push({ date: addDays(payDay, ri(10, 25)), distributorId: d.id, amount: total - half, invoiceNo: ino }); }
        else scheduledReceipts.push({ date: payDay, distributorId: d.id, amount: total, invoiceNo: ino });
      }
    }

    // ----- Stock count, twice a week (Monday & Thursday evening) -----
    if ((wd === 1 || wd === 4) && day > START) {
      const cno = next('CNT', 'CNT');
      const cts = `${day} ${isToday ? hhT(17, 18) : '18:10'}`;
      const lines = db.products.filter((p) => p.unit === 'Sheet').map((p) => {
        const system = onHand[p.id] || 0;
        let diff = 0;
        if (rnd() < 0.12) diff = -ri(1, 3); // damaged / miscounted earlier
        else if (rnd() < 0.03) diff = ri(1, 2);
        return { productId: p.id, system, counted: Math.max(0, system + diff), diff: Math.max(0, system + diff) - system };
      });
      const diffs = lines.filter((l) => l.diff !== 0);
      const recent = daysBetween(day, END) <= 3;
      const cnt = { id: cno, no: cno, date: day, ts: cts, countedBy: 'u-prod', location: 'FG', lines, differences: diffs.length, status: diffs.length ? (recent ? 'Waiting for MD' : 'Approved') : 'Matched', decidedBy: null, decidedAt: null };
      if (diffs.length && !recent) {
        cnt.decidedBy = 'u-owner'; cnt.decidedAt = `${day} 19:${String(ri(10, 55))}`;
        for (const l of diffs) { const p = PROD[l.productId]; addStock(p.id, p.location, l.diff); ledgerP({ ts: cnt.decidedAt, date: day, type: 'ADJUST', itemType: 'product', itemId: p.id, qty: l.diff, unit: 'Sheet', location: p.location, ref: cno, refType: 'stockCount', userId: 'u-owner', note: `Stock count difference approved` }); }
        audit(cnt.decidedAt, 'u-owner', 'approve', 'Stock count', cno, `${diffs.length} difference(s) approved and posted`);
      }
      if (diffs.length && recent) pendingCount.v = cnt;
      audit(cts, 'u-prod', 'create', 'Stock count', cno, diffs.length ? `Counted ${lines.length} products — ${diffs.length} difference(s)` : `Counted ${lines.length} products — all matched`);
      db.stockCounts.push(cnt);
    }

    // ----- Expenses (books are in Tally; kept here only for the cash/bank picture) -----
    const exp = (category, description, amount, mode, paidTo) => { const no = next('EXP', 'EXP'); db.expenses.push({ id: no, no, date: day, category, description, amount: round0(amount), mode, paidTo, userId: 'u-acc' }); };
    if (wd === 1) { const cno = next('CTR', 'CTR'); db.contra.push({ id: cno, no: cno, date: day, from: 'bank', to: 'cash', amount: round0(rf(20000, 35000) / 1000) * 1000, note: 'Cash withdrawn for petty expenses', userId: 'u-acc' }); }
    if (wd === 6) exp('Wages', 'Weekly wages — peeling, press & yard', rf(160000, 190000), 'Bank', 'Labour contractor (sample)');
    if (day.slice(8) === '05') { exp('Electricity', 'Factory electricity bill (BESCOM)', rf(240000, 290000), 'Bank', 'BESCOM'); exp('Salaries', 'Monthly staff salaries', rf(280000, 310000), 'Bank', 'Staff'); }
    if (wd === 1 || wd === 4) exp('Diesel', 'Diesel — own trucks & loader', rf(14000, 26000), rnd() < 0.7 ? 'Bank' : 'Cash', 'Fuel station (sample)');
    if (wd === 2) exp('Boiler fuel', 'Firewood & briquettes for dryer and hot press', rf(18000, 30000), 'Bank', 'Fuel supplier (sample)');
    if (!sunday && rnd() < 0.12) exp('Repairs & maintenance', pick(['Peeling lathe bearing', 'Hot press hydraulic seal', 'Dryer conveyor repair', 'Loader service', 'Truck tyre replacement']), rf(6000, 45000), rnd() < 0.5 ? 'Cash' : 'Bank', 'Workshop (sample)');
    if (!sunday && rnd() < 0.2) exp('Office & admin', pick(['Stationery & printing', 'Internet & phone', 'Tea & canteen', 'Courier']), rf(800, 7000), 'Cash', 'Misc (sample)');
  }

  // ---------- Finishing touches ----------
  if (pendingCount.v) {
    const c = pendingCount.v;
    db.approvals.push({ id: next('APR', 'APR'), type: 'stock_count', status: 'Pending', ts: c.ts, requestedBy: 'u-prod', summary: `Stock count ${c.no} (${c.date}): ${c.differences} product(s) differ from the system — approve to correct stock`, payload: { countId: c.id } });
  }
  db.approvals.push({ id: next('APR', 'APR'), type: 'stock_adjustment', status: 'Pending', ts: `${addDays(END, -1)} 17:40`, requestedBy: 'u-prod', summary: 'Commercial MR plywood 12 mm: 4 sheets damaged by forklift in godown', payload: { productId: 'MR-12', location: 'FG', qty: -4, reason: 'Damaged while loading' } });

  // A credit-hold order: the distributor closest to their limit orders more than the headroom left
  const slow = db.distributors.slice().sort((a, b) => outstanding[b.id] / b.creditLimit - outstanding[a.id] / a.creditLimit)[0];
  const headroom = slow.creditLimit - outstanding[slow.id];
  const holdLines = [];
  let holdSum = 0;
  const resNow = (pid) => db.orders.filter((o) => ['Pending approval', 'Approved'].includes(o.status)).reduce((a, o) => a + o.lines.filter((l) => l.productId === pid).reduce((x, l) => x + l.qty, 0), 0);
  const freeQty = (p) => Math.max(0, getStock(p.id, p.location) - resNow(p.id));
  for (const p of db.products.filter((x) => x.unit === 'Sheet').sort((a, b) => freeQty(b) * b.rate - freeQty(a) * a.rate)) {
    if (holdSum * 1.18 > headroom * 1.08 + 50000) break;
    const q = Math.floor(freeQty(p) * 0.5 / 5) * 5;
    if (q <= 0) continue;
    const rate = round2(p.rate * (1 - slow.discount / 100));
    holdLines.push({ productId: p.id, qty: q, unit: 'Sheet', sqft: q * p.sqftPerSheet, rate, amount: amt(p, q, rate) });
    holdSum += amt(p, q, rate);
  }
  const holdNo = next('SO', 'SO');
  const HOLD = hhT(9, 11);
  const holdGross = round0(holdLines.reduce((a, l) => a + l.amount * (1 + PROD[l.productId].gst / 100), 0));
  db.orders.push({ id: holdNo, no: holdNo, date: END, ts: `${END} ${HOLD}`, distributorId: slow.id, lines: holdLines, subtotal: holdSum, grandTotal: holdGross, status: 'On hold (credit)', createdBy: 'u-acc', approvedBy: null, dispatchId: null, note: 'Exceeds credit limit' });
  db.approvals.push({ id: next('APR', 'APR'), type: 'credit_override', status: 'Pending', ts: `${END} ${HOLD}`, requestedBy: 'u-acc', summary: `${slow.name}: order ${holdNo} (₹${holdGross.toLocaleString('en-IN')}) exceeds credit limit`, payload: { orderId: holdNo, distributorId: slow.id } });
  audit(`${END} ${HOLD}`, 'u-acc', 'hold', 'Sales order', holdNo, 'Order placed on credit hold — needs MD approval');

  // Two approved orders waiting for a truck, so Dispatch has work to show in a demo
  const ready = db.distributors.filter((x) => x.id !== slow.id && x.behaviour === 'good').slice(0, 2);
  ready.forEach((d, k) => {
    const lines = [];
    for (const p of db.products.filter((x) => x.unit === 'Sheet').sort((a, b) => freeQty(b) - freeQty(a)).slice(k * 2, k * 2 + 2)) {
      const q = Math.min(40, Math.floor(freeQty(p) * 0.25 / 5) * 5);
      if (q <= 0) continue;
      const rate = round2(p.rate * (1 - d.discount / 100));
      lines.push({ productId: p.id, qty: q, unit: 'Sheet', sqft: q * p.sqftPerSheet, rate, amount: amt(p, q, rate) });
    }
    if (!lines.length) return;
    const no = next('SO', 'SO');
    const tsx = `${END} ${hhT(10, 12)}`;
    const sub = lines.reduce((a, l) => a + l.amount, 0);
    const gross = round0(lines.reduce((a, l) => a + l.amount * (1 + PROD[l.productId].gst / 100), 0));
    db.orders.push({ id: no, no, date: END, ts: tsx, distributorId: d.id, lines, subtotal: sub, grandTotal: gross, status: 'Approved', createdBy: 'u-acc', approvedBy: 'u-acc', approvedAt: tsx, dispatchId: null, note: '' });
    audit(tsx, 'u-acc', 'approve', 'Sales order', no, 'Approved — ready to load');
  });

  // Number documents in date order (dispatch can happen a day or two after the order)
  const dspSorted = db.dispatches.slice().sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  const dspMap = {}, invMap = {};
  const fyCount = {};
  dspSorted.forEach((d, i) => { dspMap[d.id] = `DSP-${String(i + 1).padStart(5, '0')}`; });
  dspSorted.forEach((d) => { const fy = fyLabel(d.date); fyCount[fy] = (fyCount[fy] || 0) + 1; invMap[d.invoiceId] = `RP/${fy}/${String(fyCount[fy]).padStart(4, '0')}`; });
  for (const k of Object.keys(db.counters)) if (k.startsWith('INV')) db.counters[k] = fyCount[k.slice(3)] || 0;
  const fixRef = (s) => (s ? s.replace(/DSP-\d{5}/g, (m) => dspMap[m] || m).replace(/INV\/\d\d-\d\d\/\d{5}/g, (m) => invMap[m] || m) : s);
  db.dispatches.forEach((d) => { d.id = d.no = dspMap[d.id]; d.invoiceId = invMap[d.invoiceId]; });
  db.dispatches.sort((a, b) => (a.no < b.no ? -1 : 1));
  db.invoices.forEach((v) => { v.id = v.no = invMap[v.id]; v.dispatchId = dspMap[v.dispatchId]; });
  db.invoices.sort((a, b) => (a.no < b.no ? -1 : 1));
  db.orders.forEach((o) => { if (o.dispatchId) o.dispatchId = dspMap[o.dispatchId]; });
  db.receipts.forEach((r) => { r.note = fixRef(r.note); });
  db.stockLedger.forEach((r) => { r.ref = fixRef(r.ref); });
  db.audit.forEach((a) => { a.entityId = fixRef(a.entityId); a.summary = fixRef(a.summary); });

  db.stockLedger.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  db.stockLedger.forEach((r, i) => { r.id = `STK-${String(i + 1).padStart(6, '0')}`; });
  db.counters.STK = db.stockLedger.length;

  // Weekly Tally exports every Saturday up to last week
  for (let d = addDays(START, 7); d <= addDays(END, -2); d = addDays(d, 1)) {
    if (dow(d) !== 6) continue;
    const from = addDays(d, -6);
    const inv = db.invoices.filter((x) => x.date >= from && x.date <= d);
    const rc = db.receipts.filter((x) => x.date >= from && x.date <= d);
    const pb = db.purchaseBills.filter((x) => x.date >= from && x.date <= d);
    const id = next('TLY', 'TLY');
    const ts = `${d} 17:${String(ri(10, 50))}`;
    db.tallyExports.push({ id, no: id, ts, from, to: d, sales: inv.length, receipts: rc.length, purchases: pb.length, userId: 'u-acc' });
    inv.forEach((x) => { x.tally = id; }); rc.forEach((x) => { x.tally = id; }); pb.forEach((x) => { x.tally = id; });
    audit(ts, 'u-acc', 'export', 'Tally export', id, `${inv.length} sales, ${rc.length} receipts, ${pb.length} purchases sent to Tally (${from} → ${d})`);
  }
  // Website enquiries
  [['Vinay Shetty', 'Shetty Ply & Hardware', 'Karwar', 'BWP marine plywood', 'Need BWP 18mm, around 300 sheets a month.', 1, 'New'], ['Meena R', 'Sree Durga Interiors', 'Chitradurga', 'Commercial MR plywood', 'Want to become distributor for Chitradurga district.', 3, 'Contacted'], ['Abdul Rahim', 'AR Interiors Supply', 'Mandya', 'All kinds', '', 6, 'Converted']].forEach(([name, business, city, interest, message, ago, status]) => {
    const id = next('ENQ', 'ENQ');
    db.enquiries.push({ id, no: id, ts: `${addDays(END, -ago)} ${hhmm(10, 18)}`, name, business, city, phone: `+91 9${digits(9)}`, interest, message, status, source: 'Website' });
  });
  db.audit.sort((a, b) => (a.ts < b.ts ? -1 : 1));
  return db;
}

function seed(file, opts) {
  const db = generate(opts);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(db));
  return db;
}

if (require.main === module) {
  const file = process.env.ERP_DATA_DIR ? path.join(process.env.ERP_DATA_DIR, 'db.json') : path.join(__dirname, '..', 'data', 'db.json');
  const db = seed(file);
  console.log(`Demo data written to ${file}`);
  console.log(`  ${db.gateEntries.length} gate entries · ${db.logs.length} logs · ${db.workOrders.length} work orders · ${db.orders.length} orders · ${db.invoices.length} invoices · ${db.receipts.length} receipts`);
  console.log(`  Period ${db.meta.dataFrom} → ${db.meta.dataTo}. Login: md / demo123`);
}

module.exports = { generate, seed };
