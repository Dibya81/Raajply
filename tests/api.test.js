'use strict';
// End-to-end API tests: run with `npm test` (uses a temporary copy of the demo data).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'raajply-erp-test-'));
process.env.ERP_DATA_DIR = dir;
process.env.ERP_SECRET = 'test-secret';
process.env.ERP_NO_BACKUP = '1';
const { start } = require('../server/server');

let server, base;
const tokens = {};
async function call(method, p, body, who = 'md') {
  const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', ...(tokens[who] ? { Authorization: `Bearer ${tokens[who]}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}
const get = (p, who) => call('GET', p, null, who);
const post = (p, b, who) => call('POST', p, b, who);

test.before(async () => {
  server = await start(0);
  base = `http://127.0.0.1:${server.address().port}`;
  for (const who of ['md', 'accounts', 'production']) {
    const r = await post('/api/auth/login', { username: who, password: 'demo123' });
    assert.equal(r.status, 200, `login ${who}`);
    tokens[who] = r.data.token;
  }
});
test.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('three logins only; wrong password and missing token rejected', async () => {
  const roles = (await get('/api/demo/roles')).data;
  assert.deepEqual(roles.map((r) => r.role).sort(), ['accounts', 'owner', 'production']);
  assert.equal((await post('/api/auth/login', { username: 'md', password: 'nope' })).status, 401);
  assert.equal((await call('GET', '/api/dashboard', null, 'nobody')).status, 401);
  const forged = await fetch(base + '/api/me', { headers: { Authorization: 'Bearer abc.def' } });
  assert.equal(forged.status, 401);
});

test('role permissions are enforced on the server', async () => {
  assert.equal((await get('/api/finance/overview', 'production')).status, 403, 'production cannot see accounts');
  assert.equal((await get('/api/tally', 'production')).status, 403, 'production cannot export to Tally');
  assert.equal((await post('/api/yard/gate-entries', {}, 'accounts')).status, 403, 'accounts does not record log arrivals');
  assert.equal((await post('/api/production/work-orders', {}, 'accounts')).status, 403);
  assert.equal((await get('/api/admin/users', 'accounts')).status, 403);
  assert.equal((await get('/api/stores', 'accounts')).status, 200, 'accounts can see stores');
  assert.equal((await get('/api/tally', 'accounts')).status, 200);
});

test('company is Raajply, plywood only, priced per sq ft', async () => {
  const m = (await get('/api/masters')).data;
  assert.match(m.company?.name || (await get('/api/admin/settings')).data.name, /Raajply/);
  const sheets = m.products.filter((p) => p.unit === 'Sheet');
  assert.ok(sheets.length >= 12);
  assert.ok(sheets.every((p) => p.sqftPerSheet > 0 && p.priceUnit === 'sq ft' && p.hsn === '4412'));
  assert.deepEqual(m.species.map((s) => s.id).sort(), ['PINE', 'TEAK']);
  assert.ok(m.suppliers.some((s) => s.type === 'Import' && s.country === 'Canada'));
  assert.ok(m.suppliers.some((s) => s.type === 'Farmer'));
  assert.equal(m.distributors.length, 6);
});

test('dashboard: sheets per day and 75% recovery for production; no money for production', async () => {
  const o = await get('/api/dashboard');
  assert.equal(o.status, 200);
  assert.equal(o.data.kpis.length, 4);
  assert.ok(o.data.kpis.some((k) => k.key === 'recv'));
  const p = (await get('/api/dashboard', 'production')).data;
  assert.ok(p.kpis.some((k) => k.key === 'sheets'));
  const y = p.kpis.find((k) => k.key === 'yield');
  assert.ok(y.value > 70 && y.value < 80, `recovery ${y.value}`);
  assert.ok(!p.kpis.some((k) => k.key === 'recv'), 'no finance KPIs for production');
});

test('log arrival from a farmer: Hoppus CFT, numbered logs, no GST, audit', async () => {
  const before = (await get('/api/yard/summary', 'production')).data.inYard;
  const r = await post('/api/yard/gate-entries', { supplierId: 'S001', species: 'TEAK', rate: 1400, vehicle: 'ka-42-ab-1234', transitPass: 'TP/KA/RMN/2026/1', logs: [{ girth: 48, length: 12 }, { girth: 40, length: 10 }] }, 'production');
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.logCount, 2);
  assert.equal(r.data.totalCft, 12 + 6.94); // 48″×12′ = 12 CFT; 40″×10′ = 6.94
  assert.equal(r.data.vehicle, 'KA-42-AB-1234');
  assert.equal(r.data.source, 'Farmer');
  const after = (await get('/api/yard/summary', 'production')).data.inYard;
  assert.equal(after.logs, before.logs + 2);
  const ge = await get(`/api/yard/gate-entries/${r.data.id}`, 'production');
  assert.equal(ge.data.logs.length, 2);
  assert.equal(ge.data.bill.taxable, Math.round(18.94 * 1400));
  assert.equal(ge.data.bill.gst, 0, 'farmers are unregistered');
  const audit = (await get('/api/admin/audit?limit=5')).data.rows;
  assert.ok(audit.some((a) => a.entityId === r.data.no));
});

test('imported logs need a bill of entry and carry IGST', async () => {
  const imp = (await get('/api/masters')).data.suppliers.find((s) => s.type === 'Import' && s.species.includes('PINE'));
  assert.equal((await post('/api/yard/gate-entries', { supplierId: imp.id, species: 'PINE', rate: 500, vehicle: 'KA01', logs: [{ girth: 60, length: 12 }] }, 'production')).status, 400);
  const r = await post('/api/yard/gate-entries', { supplierId: imp.id, species: 'PINE', rate: 500, vehicle: 'KA01', billOfEntry: 'BE 1234567', container: 'mscu1234567', logs: [{ girth: 60, length: 12 }] }, 'production');
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.source, 'Import');
  assert.equal(r.data.container, 'MSCU1234567');
  const ge = (await get(`/api/yard/gate-entries/${r.data.id}`, 'production')).data;
  assert.ok(ge.bill.gst > 0);
  assert.equal((await post('/api/yard/gate-entries', { supplierId: 'S001', species: 'TEAK', rate: 1700, vehicle: 'X1', logs: [{ girth: 'abc', length: 10 }] }, 'production')).status, 400);
});

test('production: peel logs, record veneer & sheets, recovery from veneer', async () => {
  const logs = (await get('/api/yard/logs?status=In%20yard&species=PINE', 'production')).data.slice(0, 6);
  assert.equal(logs.length, 6);
  const input = Math.round(logs.reduce((a, l) => a + l.cft, 0) * 100) / 100;
  const wo = await post('/api/production/work-orders', { species: 'PINE', logIds: logs.map((l) => l.id) }, 'production');
  assert.equal(wo.status, 200, JSON.stringify(wo.data));
  assert.match(wo.data.no, /^BATCH-/);
  assert.equal(wo.data.inputCft, input);
  assert.equal((await post('/api/production/work-orders', { species: 'PINE', logIds: [logs[0].id] }, 'production')).status, 409, 'a log cannot be peeled twice');
  const veneer = Math.round(input * 0.75 * 100) / 100;
  const P = (await get('/api/inventory/stock', 'production')).data.products.find((p) => p.id === 'MR-18');
  assert.equal((await post(`/api/production/work-orders/${wo.data.id}/output`, { veneerCft: input + 1, outputs: [{ productId: 'MR-18', qty: 1 }] }, 'production')).status, 400, 'veneer cannot exceed logs');
  assert.equal((await post(`/api/production/work-orders/${wo.data.id}/output`, { outputs: [{ productId: 'MR-18', qty: 1 }] }, 'production')).status, 400, 'veneer is required');
  const sheets = Math.floor((veneer * 0.9) / P.cftPerUnit);
  const closed = await post(`/api/production/work-orders/${wo.data.id}/output`, { veneerCft: veneer, outputs: [{ productId: 'MR-18', qty: sheets }], byproducts: [{ productId: 'BYP-CORE', qty: 6 }] }, 'production');
  assert.equal(closed.status, 200, JSON.stringify(closed.data));
  assert.equal(closed.data.status, 'Closed');
  assert.equal(closed.data.sheets, sheets);
  assert.ok(Math.abs(closed.data.yield - 75) < 0.2);
  const after = (await get('/api/inventory/stock', 'production')).data.products.find((p) => p.id === 'MR-18').total;
  assert.equal(after - P.total, sheets);
});

test('order in sheets → billed per sq ft → own truck → GST invoice → receipt', async () => {
  const stock = (await get('/api/inventory/stock')).data.products;
  const p = stock.filter((x) => x.unit === 'Sheet').sort((a, b) => b.available - a.available)[0];
  const d = (await get('/api/distributors', 'accounts')).data.sort((a, b) => b.creditAvailable - a.creditAvailable)[0];
  assert.equal((await post('/api/sales/orders', { distributorId: d.id, lines: [{ productId: p.id, qty: p.available + 1000 }] }, 'accounts')).status, 409);
  const rate = Math.round(p.rate * (1 - d.discount / 100) * 100) / 100;
  const o = await post('/api/sales/orders', { distributorId: d.id, lines: [{ productId: p.id, qty: 10 }] }, 'accounts');
  assert.equal(o.status, 200, JSON.stringify(o.data));
  assert.equal(o.data.status, 'Pending approval');
  assert.equal(o.data.lines[0].sqft, 10 * p.sqftPerSheet);
  assert.equal(o.data.lines[0].rate, rate);
  assert.equal(o.data.lines[0].amount, Math.round(10 * p.sqftPerSheet * rate));
  assert.equal((await post('/api/dispatch', { orderId: o.data.id, vehicle: 'KA01', driver: 'Ramu' }, 'production')).status, 409, 'not before approval');
  assert.equal((await post(`/api/sales/orders/${o.data.id}/approve`, {}, 'production')).status, 403, 'production cannot approve');
  assert.equal((await post(`/api/sales/orders/${o.data.id}/approve`, {}, 'accounts')).status, 200);
  const truck = (await get('/api/dispatch', 'production')).data.vehicles[0];
  const before = (await get('/api/inventory/stock')).data.products.find((x) => x.id === p.id).total;
  const dsp = await post('/api/dispatch', { orderId: o.data.id, vehicle: truck.id, driver: truck.driver, transporter: 'Own truck' }, 'production');
  assert.equal(dsp.status, 200, JSON.stringify(dsp.data));
  const after = (await get('/api/inventory/stock')).data.products.find((x) => x.id === p.id).total;
  assert.equal(before - after, 10);
  const inv = (await get(`/api/finance/invoices/${encodeURIComponent(dsp.data.invoiceId)}`, 'accounts')).data;
  assert.match(inv.no, /^RP\//);
  assert.equal(inv.lines[0].sqft, 10 * p.sqftPerSheet);
  assert.ok(inv.cgst > 0 && inv.igst === 0, 'within Karnataka → CGST + SGST');
  assert.equal(inv.total, Math.round(inv.taxable + inv.cgst + inv.sgst));
  const out1 = (await get(`/api/distributors/${d.id}`, 'accounts')).data.outstanding;
  assert.equal((await post('/api/finance/receipts', { distributorId: d.id, amount: 10000, mode: 'NEFT', ref: 'UTR123' }, 'accounts')).status, 200);
  const out2 = (await get(`/api/distributors/${d.id}`, 'accounts')).data.outstanding;
  assert.equal(Math.round(out1 - out2), 10000);
  assert.equal((await post('/api/finance/receipts', { distributorId: d.id, amount: 250000, mode: 'Cash' }, 'accounts')).status, 400, 's.269ST');
});

test('credit limit: order beyond limit goes on hold; only the MD can release it', async () => {
  const dists = (await get('/api/distributors', 'accounts')).data;
  const stock = (await get('/api/inventory/stock')).data.products;
  const d = dists.find((x) => !x.overLimit);
  const p = stock.filter((x) => x.available > 2 && x.unit === 'Sheet')[0];
  assert.equal((await call('PUT', `/api/masters/distributors/${d.id}`, { creditLimit: Math.round(d.exposure + 100) })).status, 200);
  const o = await post('/api/sales/orders', { distributorId: d.id, lines: [{ productId: p.id, qty: 2 }] }, 'accounts');
  assert.equal(o.data.status, 'On hold (credit)');
  const ap = (await get('/api/approvals')).data.find((a) => a.payload.orderId === o.data.id);
  assert.ok(ap && ap.canDecide);
  assert.equal((await post(`/api/approvals/${ap.id}/decide`, { decision: 'approve' }, 'accounts')).status, 403, 'accounts cannot override credit');
  assert.equal((await post(`/api/approvals/${ap.id}/decide`, { decision: 'approve' })).status, 200);
  assert.equal((await get(`/api/sales/orders/${o.data.id}`, 'accounts')).data.status, 'Approved');
  await post(`/api/sales/orders/${o.data.id}/cancel`, { reason: 'test cleanup' }, 'accounts');
});

test('stock count: differences wait for the MD, then correct the stock', async () => {
  const c = (await get('/api/stock-counts', 'production')).data;
  assert.ok(c.counts.length > 40, 'twice-weekly history');
  assert.ok(['Monday', 'Thursday'].includes(c.nextDueDay));
  const p = c.products.find((x) => x.system > 5);
  const lines = c.products.map((x) => ({ productId: x.id, counted: x.id === p.id ? x.system - 3 : x.system }));
  const r = await post('/api/stock-counts', { lines }, 'production');
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.differences, 1);
  assert.equal(r.data.status, 'Waiting for MD');
  const ap = (await get('/api/approvals')).data.find((a) => a.payload.countId === r.data.id);
  assert.ok(ap);
  assert.equal((await post(`/api/approvals/${ap.id}/decide`, { decision: 'approve' }, 'production')).status, 403);
  const before = (await get('/api/inventory/stock')).data.products.find((x) => x.id === p.id).total;
  assert.equal((await post(`/api/approvals/${ap.id}/decide`, { decision: 'approve' })).status, 200);
  const after = (await get('/api/inventory/stock')).data.products.find((x) => x.id === p.id).total;
  assert.equal(before - after, 3);
  assert.equal((await get(`/api/stock-counts/${r.data.id}`, 'production')).data.status, 'Approved');
  const ok = await post('/api/stock-counts', { lines: (await get('/api/stock-counts', 'production')).data.products.map((x) => ({ productId: x.id, counted: x.system })) }, 'production');
  assert.equal(ok.data.status, 'Matched');
  assert.equal((await call('PUT', '/api/inventory/ledger', {})).status, 405, 'ledger has no edit');
});

test('stores: purchase adds stock and a purchase bill; issue reduces it', async () => {
  const s = (await get('/api/stores', 'production')).data;
  const it = s.items.find((i) => i.id === 'BLD');
  const buy = await post('/api/stores/purchase', { vendor: 'Test Spares', billNo: 'T/1', lines: [{ itemId: 'BLD', qty: 4, rate: 3000 }] }, 'accounts');
  assert.equal(buy.status, 200, JSON.stringify(buy.data));
  assert.equal(buy.data.taxable, 12000);
  assert.equal(buy.data.gst, 2160);
  const bills = (await get('/api/finance/purchase-bills', 'accounts')).data;
  assert.equal(bills[0].id, buy.data.billId);
  assert.equal(bills[0].supplier, 'Test Spares');
  const iss = await post('/api/stores/issue', { itemId: 'BLD', qty: 2, issuedTo: 'Edge trimming' }, 'production');
  assert.equal(iss.status, 200);
  assert.equal(iss.data.left, it.qty + 2);
  assert.equal((await post('/api/stores/issue', { itemId: 'BLD', qty: 9999, issuedTo: 'x' }, 'production')).status, 409);
  assert.ok(s.items.some((i) => i.status !== 'OK'), 'demo data has something running low');
});

test('Tally export: XML vouchers, only new entries, not twice', async () => {
  const t = (await get('/api/tally', 'accounts')).data;
  assert.ok(t.pending.sales > 0);
  assert.ok(t.exports.length > 10, 'weekly exports in history');
  const r = await post('/api/tally/export', { types: ['sales', 'receipts', 'purchases'] }, 'accounts');
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.match(r.data.xml, /<ENVELOPE>/);
  assert.match(r.data.xml, /VCHTYPE="Sales"/);
  assert.match(r.data.xml, /VCHTYPE="Receipt"/);
  assert.match(r.data.xml, /VCHTYPE="Purchase"/);
  assert.match(r.data.xml, /<SVCURRENTCOMPANY>Raajply<\/SVCURRENTCOMPANY>/);
  assert.match(r.data.filename, /\.xml$/);
  // Each voucher balances: sum of amounts is zero
  for (const v of r.data.xml.split('<VOUCHER ').slice(1, 30)) {
    const amts = [...v.matchAll(/<AMOUNT>(-?[\d.]+)<\/AMOUNT>/g)].map((x) => Number(x[1]));
    assert.ok(Math.abs(amts.reduce((a, b) => a + b, 0)) < 0.05, 'voucher balances');
  }
  assert.equal((await post('/api/tally/export', {}, 'accounts')).status, 400, 'nothing new the second time');
  const again = await get(`/api/tally/export/${r.data.id}`, 'accounts');
  assert.equal(again.data.xml.length, r.data.xml.length, 'same file can be downloaded again');
});

test('GST, search and books respond', async () => {
  const g = (await get('/api/finance/gst', 'accounts')).data;
  assert.equal(g.months.length, 6);
  const s = (await get('/api/search?q=SO-0001')).data;
  assert.ok(s.length > 0);
  const cash = (await get('/api/finance/book/cash', 'accounts')).data;
  assert.ok(cash.balance > 0, 'cash should not go negative in demo data');
});

test('static files and SPA fallback', async () => {
  const r = await fetch(base + '/');
  assert.equal(r.status, 200);
  assert.match(await r.text(), /Raajply/, 'company website at /');
  const app = await fetch(base + '/app');
  assert.match(await app.text(), /Raajply/, 'software at /app');
  const js = await fetch(base + '/js/app.js');
  assert.match(js.headers.get('content-type'), /javascript/);
  const trav = await fetch(base + '/%2e%2e/data/secret.key');
  assert.notEqual(trav.status, 200);
});

test('reports and dashboard trends', async () => {
  const d = (await get('/api/dashboard')).data;
  assert.ok(d.kpis.find((k) => k.key === 'sales').trend.length === 14);
  for (const p of ['sales', 'production', 'purchases', 'stock']) assert.equal((await get(`/api/reports/${p}?from=2026-01-01`)).status, 200, p);
  const pr = (await get('/api/reports/production?from=2026-01-01', 'production')).data;
  assert.ok(pr.sheets > 1000 && pr.yield > 70);
  assert.equal((await get('/api/reports/sales', 'production')).status, 403);
  assert.equal((await get('/api/reports/sales?from=2026-12-01&to=2026-01-01')).status, 400);
});

test('older demo data is replaced automatically', async () => {
  const db = require('../server/db');
  assert.equal(db.get().meta.version, 2);
});

test('security headers, gzip and login throttling', async () => {
  const r = await fetch(base + '/', { headers: { 'Accept-Encoding': 'gzip' } });
  assert.match(r.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  for (let i = 0; i < 5; i++) assert.equal((await post('/api/auth/login', { username: 'production', password: 'bad' })).status, 401);
  assert.equal((await post('/api/auth/login', { username: 'production', password: 'demo123' })).status, 429, 'locked after 5 failures');
});

test('website enquiry reaches accounts', async () => {
  assert.equal((await post('/api/public/enquiry', { name: 'A', business: 'B', city: 'C', phone: '12' })).status, 400);
  const ok = await post('/api/public/enquiry', { name: 'Ravi', business: 'Ravi Ply', city: 'Hassan', phone: '9876543210', interest: 'BWP marine plywood' });
  assert.equal(ok.status, 200);
  assert.match(ok.data.ref, /^ENQ-/);
  assert.equal((await get('/api/enquiries', 'accounts')).data[0].business, 'Ravi Ply');
  assert.equal((await get('/api/enquiries', 'production')).status, 200, 'production has sales.view');
  assert.equal((await post(`/api/enquiries/${ok.data.ref}/status`, { status: 'Contacted' }, 'accounts')).status, 200);
});
