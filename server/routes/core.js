'use strict';
const store = require('../db');
const auth = require('../auth');
const audit = require('../services/audit');
const stock = require('../services/stock');
const { HttpError, nowTs } = require('../util');
const { can, ROLES } = require('../permissions');
const { num, str, find, maps, userName } = require('./helpers');

// Slow down password guessing: 5 failed attempts per username+IP → 10-minute lock.
const FAILS = new Map();
const LOCK_MS = 10 * 60 * 1000, MAX_FAILS = 5;

module.exports = function register(r) {
  // ---------- Auth ----------
  r.post('/api/auth/login', null, ({ body, req }) => {
    const key = `${String(body.username || '').toLowerCase()}|${req.socket.remoteAddress}`;
    const f = FAILS.get(key);
    if (f && f.count >= MAX_FAILS && Date.now() - f.last < LOCK_MS) throw new HttpError(429, `Too many failed attempts. Try again in ${Math.ceil((LOCK_MS - (Date.now() - f.last)) / 60000)} minute(s).`);
    let res;
    try { res = auth.login(body.username, body.password); } catch (e) {
      if (e.status === 401) { const n = f && Date.now() - f.last < LOCK_MS ? f.count + 1 : 1; FAILS.set(key, { count: n, last: Date.now() }); }
      throw e;
    }
    FAILS.delete(key);
    audit.log({ id: res.user.id }, 'login', 'User', res.user.username, `${res.user.name} signed in`);
    store.save();
    return res;
  });
  r.post('/api/auth/demo-login', null, ({ body }) => {
    const db = store.get();
    if (!db.company.demo) throw new HttpError(403, 'Demo login is turned off');
    const u = db.users.find((x) => x.role === body.role && x.active);
    if (!u) throw new HttpError(404, 'No user for that role');
    return { token: auth.issue(u), user: auth.publicUser(u) };
  });
  r.get('/api/me', 'auth', ({ user }) => {
    const db = store.get();
    return { user: auth.publicUser(user), company: db.company, meta: db.meta, roles: Object.fromEntries(Object.entries(ROLES).map(([k, v]) => [k, v.name])) };
  });
  r.get('/api/demo/roles', null, () => {
    const db = store.get();
    if (!db.company.demo) return [];
    return Object.entries(ROLES).map(([id, v]) => { const u = db.users.find((x) => x.role === id && x.active); return u ? { role: id, roleName: v.name, name: u.name, username: u.username, desc: v.desc } : null; }).filter(Boolean);
  });

  // ---------- Masters (read for any signed-in user, edit for masters.edit) ----------
  r.get('/api/masters', 'auth', () => {
    const db = store.get();
    return {
      company: db.company, locations: db.locations, species: db.species, products: db.products,
      suppliers: db.suppliers, distributors: db.distributors.map(({ behaviour, ...d }) => d),
      users: db.users.map((u) => ({ id: u.id, name: u.name, role: u.role })),
    };
  });

  const EDITABLE = {
    products: ['name', 'category', 'species', 'size', 'grade', 'unit', 'rate', 'hsn', 'gst', 'location', 'reorder', 'active', 'sqftPerSheet', 'thicknessMm'],
    suppliers: ['name', 'type', 'place', 'phone', 'gstin', 'paymentDays', 'active', 'species', 'country'],
    distributors: ['name', 'city', 'state', 'gstin', 'contact', 'phone', 'creditLimit', 'creditDays', 'discount', 'salesExec', 'territory', 'active'],
    species: ['name', 'botanical', 'logRate', 'transitPass', 'color'],
  };
  const NUMERIC = new Set(['rate', 'gst', 'reorder', 'paymentDays', 'creditLimit', 'creditDays', 'discount', 'logRate', 'sqftPerSheet', 'thicknessMm']);
  const clean = (kind, body) => {
    const o = {};
    for (const f of EDITABLE[kind]) {
      if (body[f] === undefined) continue;
      if (NUMERIC.has(f)) o[f] = num(body[f], f, { min: 0 });
      else if (f === 'active' || f === 'transitPass') o[f] = body[f] === true || body[f] === 'true';
      else if (f === 'species' && kind === 'suppliers') o[f] = Array.isArray(body[f]) ? body[f] : String(body[f]).split(',').map((s) => s.trim()).filter(Boolean);
      else o[f] = str(body[f], f, { required: f === 'name' });
    }
    return o;
  };
  r.post('/api/masters/:kind', 'masters.edit', ({ params, body, user }) => {
    const { kind } = params;
    if (!EDITABLE[kind]) throw new HttpError(404, 'Unknown master');
    const db = store.get();
    const data = clean(kind, body);
    if (!data.name) throw new HttpError(400, 'name is required');
    const prefix = { products: 'PRD', suppliers: 'S', distributors: 'D', species: 'SP' }[kind];
    const id = kind === 'species' ? str(body.id || data.name.slice(0, 4).toUpperCase(), 'id') : store.nextNo('M' + kind, prefix, 3) + '-N';
    if (db[kind].some((x) => x.id === id)) throw new HttpError(409, 'That ID already exists');
    const rec = { id, active: true, ...data };
    if (kind === 'products') { rec.sku = rec.sku || id; rec.plant = rec.unit === 'Sheet' ? 'PLY' : null; rec.priceUnit = rec.sqftPerSheet ? 'sq ft' : rec.unit; rec.cftPerUnit = rec.unit === 'Sheet' && rec.thicknessMm ? Math.round(((rec.sqftPerSheet || 32) * rec.thicknessMm / 304.8) * 100) / 100 : rec.unit === 'CFT' ? 1 : 0; }
    if (kind === 'distributors') { rec.code = id; rec.since = nowTs().slice(0, 10); rec.behaviour = 'avg'; }
    if (kind === 'suppliers') rec.code = id;
    db[kind].push(rec);
    audit.log(user, 'create', kindLabel(kind), id, `Created ${rec.name}`, { after: rec });
    store.save();
    return rec;
  });
  r.put('/api/masters/:kind/:id', 'masters.edit', ({ params, body, user }) => {
    const { kind, id } = params;
    if (!EDITABLE[kind]) throw new HttpError(404, 'Unknown master');
    const rec = find(kind, id, kindLabel(kind));
    const data = clean(kind, body);
    const before = {}, after = {};
    for (const [k, v] of Object.entries(data)) if (JSON.stringify(rec[k]) !== JSON.stringify(v)) { before[k] = rec[k]; after[k] = v; rec[k] = v; }
    if (Object.keys(after).length) {
      audit.log(user, 'update', kindLabel(kind), id, `Updated ${rec.name}: ${Object.keys(after).join(', ')}`, { before, after });
      store.save();
    }
    return rec;
  });

  // ---------- Approvals ----------
  const APPROVE_PERM = { stock_adjustment: 'inventory.approve', stock_count: 'inventory.approve', credit_override: 'finance.approve' };
  const TYPE_LABEL = { stock_adjustment: 'Stock adjustment', stock_count: 'Stock count', credit_override: 'Credit limit' };
  r.get('/api/approvals', 'auth', ({ user, query }) => {
    const db = store.get();
    const { U, P, D, L } = maps();
    const list = db.approvals.filter((a) => query.status === 'all' || a.status === (query.status || 'Pending'))
      .filter((a) => can(user, APPROVE_PERM[a.type]) || can(user, 'audit.view') || a.requestedBy === user.id)
      .slice().sort((a, b) => (a.ts < b.ts ? 1 : -1))
      .map((a) => ({ ...a, requestedByName: userName(U, a.requestedBy), decidedByName: a.decidedBy ? userName(U, a.decidedBy) : null, canDecide: a.status === 'Pending' && can(user, APPROVE_PERM[a.type]),
        typeLabel: TYPE_LABEL[a.type] || a.type,
        detail: a.type === 'stock_adjustment' ? { product: P[a.payload.productId]?.name, location: L[a.payload.location]?.name, qty: a.payload.qty, unit: P[a.payload.productId]?.unit, reason: a.payload.reason }
          : a.type === 'stock_count' ? countDetail(a.payload.countId, P)
            : { distributor: D[a.payload.distributorId]?.name, orderId: a.payload.orderId } }));
    return list;
  });
  r.post('/api/approvals/:id/decide', 'auth', ({ params, body, user }) => {
    const a = find('approvals', params.id, 'Approval');
    if (!can(user, APPROVE_PERM[a.type])) throw new HttpError(403, 'Your role cannot decide this approval');
    if (a.status !== 'Pending') throw new HttpError(409, 'Already decided');
    const decision = body.decision === 'approve' ? 'Approved' : body.decision === 'reject' ? 'Rejected' : null;
    if (!decision) throw new HttpError(400, 'decision must be approve or reject');
    const db = store.get();
    if (decision === 'Approved' && a.type === 'stock_adjustment') {
      const { productId, location, qty, reason } = a.payload;
      const p = find('products', productId, 'Product');
      if (qty < 0 && stock.productQty(productId, location) + qty < 0) throw new HttpError(409, 'Not enough stock to apply this adjustment');
      stock.post({ type: 'ADJUST', itemType: 'product', itemId: productId, qty, unit: p.unit, location, ref: a.id, refType: 'approval', userId: user.id, note: `Approved adjustment — ${reason}` });
    }
    if (a.type === 'stock_count') {
      const c = find('stockCounts', a.payload.countId, 'Stock count');
      if (decision === 'Approved') {
        for (const l of c.lines.filter((x) => x.diff !== 0)) {
          const p = find('products', l.productId, 'Product');
          stock.post({ type: 'ADJUST', itemType: 'product', itemId: p.id, qty: l.diff, unit: p.unit, location: p.location, ref: c.no, refType: 'stockCount', userId: user.id, note: 'Stock count difference approved' });
        }
      }
      c.status = decision === 'Approved' ? 'Approved' : 'Rejected'; c.decidedBy = user.id; c.decidedAt = nowTs();
    }
    if (a.type === 'credit_override') {
      const o = db.orders.find((x) => x.id === a.payload.orderId);
      if (o && o.status === 'On hold (credit)') {
        o.status = decision === 'Approved' ? 'Approved' : 'Cancelled';
        if (decision === 'Approved') { o.approvedBy = user.id; o.approvedAt = nowTs(); o.note = 'Credit override approved by ' + user.name; }
        else o.note = 'Credit override rejected by ' + user.name;
      }
    }
    a.status = decision; a.decidedBy = user.id; a.decidedAt = nowTs(); a.decisionNote = str(body.note, 'note', { required: false });
    audit.log(user, decision === 'Approved' ? 'approve' : 'reject', 'Approval', a.id, `${decision}: ${a.summary}`);
    store.save();
    return a;
  });

  // ---------- Global search ----------
  r.get('/api/search', 'auth', ({ query, user }) => {
    const q = String(query.q || '').trim().toLowerCase();
    if (q.length < 2) return [];
    const db = store.get();
    const { D, S, SP } = maps();
    const out = [];
    const add = (perm, type, label, sub, href) => { if (can(user, perm) && out.length < 25) out.push({ type, label, sub, href }); };
    for (const d of db.distributors) if ((d.name + d.city + d.code).toLowerCase().includes(q)) add(['sales.view', 'finance.view'], 'Distributor', d.name, `${d.city}, ${d.state}`, `#/distributors/${d.id}`);
    for (const p of db.products) if ((p.name + p.sku).toLowerCase().includes(q)) add('inventory.view', 'Product', p.name, p.sku, `#/inventory?q=${encodeURIComponent(p.name)}`);
    for (const o of db.orders) if (o.no.toLowerCase().includes(q)) add('sales.view', 'Order', o.no, D[o.distributorId]?.name, `#/orders/${o.id}`);
    for (const i of db.invoices) if (i.no.toLowerCase().includes(q)) add('finance.view', 'Invoice', i.no, D[i.distributorId]?.name, `#/invoice/${encodeURIComponent(i.id)}`);
    for (const g of db.gateEntries) if ((g.no + g.vehicle).toLowerCase().includes(q)) add('yard.view', 'Gate entry', g.no, `${S[g.supplierId]?.name} · ${g.vehicle}`, `#/yard/${g.id}`);
    for (const w of db.workOrders) if (w.no.toLowerCase().includes(q)) add('production.view', 'Work order', w.no, `${SP[w.species]?.name} · ${w.status}`, `#/production/${w.id}`);
    if (/^l\d/.test(q)) for (const l of db.logs) if (l.tag.toLowerCase().includes(q)) add('yard.view', 'Log', l.tag, `${SP[l.species]?.name} · ${l.cft} CFT · ${l.status}`, `#/yard/${l.gateEntryId}`);
    for (const s of db.suppliers) if (s.name.toLowerCase().includes(q)) add('yard.view', 'Supplier', s.name, s.place, '#/yard?tab=suppliers');
    return out;
  });

  // ---------- Website enquiries (public form → sales team) ----------
  const ENQ_HITS = new Map();
  r.post('/api/public/enquiry', null, ({ body, req }) => {
    const db = store.get();
    if (body.website) return { ok: true, ref: 'ENQ-00000' }; // honeypot: bots fill hidden fields
    const ip = req.socket.remoteAddress || '';
    const hits = (ENQ_HITS.get(ip) || []).filter((t) => Date.now() - t < 3600000);
    if (hits.length >= 5) throw new HttpError(429, 'Too many enquiries from this connection. Please call us instead.');
    const phone = str(body.phone, 'Phone', { max: 20 });
    if (!/^[+\d][\d\s-]{8,15}$/.test(phone)) throw new HttpError(400, 'Please enter a valid phone number');
    const e = { id: store.nextNo('ENQ', 'ENQ'), ts: nowTs(), name: str(body.name, 'Name', { max: 80 }), business: str(body.business, 'Business name', { max: 120 }), city: str(body.city, 'City', { max: 60 }), phone, interest: str(body.interest, 'Interest', { required: false, max: 40 }) || 'All of these', message: str(body.message, 'Message', { required: false, max: 1000 }), status: 'New', source: 'Website' };
    e.no = e.id;
    db.enquiries = db.enquiries || [];
    db.enquiries.push(e);
    hits.push(Date.now()); ENQ_HITS.set(ip, hits);
    audit.log(null, 'create', 'Enquiry', e.id, `Website enquiry from ${e.business}, ${e.city}`);
    store.save();
    return { ok: true, ref: e.id };
  });
  r.get('/api/enquiries', 'sales.view', () => (store.get().enquiries || []).slice().reverse());
  r.post('/api/enquiries/:id/status', 'sales.edit', ({ params, body, user }) => {
    const e = (store.get().enquiries || []).find((x) => x.id === params.id);
    if (!e) throw new HttpError(404, 'Enquiry not found');
    if (!['New', 'Contacted', 'Converted', 'Not interested'].includes(body.status)) throw new HttpError(400, 'Unknown status');
    e.status = body.status; e.updatedBy = user.id; e.updatedAt = nowTs();
    if (body.note) e.note = str(body.note, 'Note', { required: false, max: 300 });
    audit.log(user, 'update', 'Enquiry', e.id, `Marked ${e.status}`);
    store.save();
    return e;
  });

  // ---------- Notifications (bell) ----------
  r.get('/api/notifications', 'auth', ({ user }) => {
    const db = store.get();
    const pending = db.approvals.filter((a) => a.status === 'Pending' && can(user, APPROVE_PERM[a.type])).length;
    const ordersToApprove = can(user, 'sales.approve') ? db.orders.filter((o) => o.status === 'Pending approval').length : 0;
    const toDispatch = can(user, 'dispatch.edit') ? db.orders.filter((o) => o.status === 'Approved').length : 0;
    const enquiries = can(user, 'sales.view') ? (db.enquiries || []).filter((e) => e.status === 'New').length : 0;
    const plant = require('./plant');
    const storesLow = can(user, 'stores.view') ? plant.storeSummary().filter((i) => i.status !== 'OK').length : 0;
    const countDue = can(user, 'inventory.edit') && plant.countInfo().dueToday ? 1 : 0;
    const tallyPending = can(user, 'tally.export') ? db.invoices.filter((i) => !i.tally).length + db.receipts.filter((x) => !x.tally).length : 0;
    return { approvals: pending, ordersToApprove, toDispatch, enquiries, storesLow, countDue, tallyPending, total: pending + ordersToApprove + toDispatch + enquiries + storesLow + countDue };
  });
};

function countDetail(id, P) {
  const c = store.get().stockCounts.find((x) => x.id === id);
  if (!c) return {};
  return { countId: c.id, date: c.date, lines: c.lines.filter((l) => l.diff !== 0).map((l) => ({ product: P[l.productId]?.name, system: l.system, counted: l.counted, diff: l.diff })) };
}
function kindLabel(k) { return { products: 'Product', suppliers: 'Supplier', distributors: 'Distributor', species: 'Species' }[k] || k; }
