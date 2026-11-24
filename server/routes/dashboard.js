'use strict';
const store = require('../db');
const stock = require('../services/stock');
const fin = require('../services/finance');
const { today, round0, round2, sum, addDays, daysBetween, stockValue } = require('../util');
const plant = require('./plant');
const { can } = require('../permissions');
const { maps, userName } = require('./helpers');

const pct = (a, b) => (b ? round2(((a - b) / Math.abs(b)) * 100) : null);
function days(t, n) { const out = []; for (let i = n - 1; i >= 0; i--) out.push(addDays(t, -i)); return out; }

module.exports = function register(r) {
  r.get('/api/dashboard', 'dashboard', ({ user }) => {
    const db = store.get();
    const t = today();
    const { SP, U } = maps();
    const d14 = days(t, 14);
    const out = { today: t, kpis: [], strip: [] };
    const cand = [];

    // ---- Finance ----
    if (can(user, 'finance.view')) {
      const month = t.slice(0, 7);
      const dayOfMonth = Number(t.slice(8));
      const prevStart = (() => { const [y, m] = t.split('-').map(Number); const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();
      const mtd = sum(db.invoices.filter((i) => i.date.startsWith(month)), (i) => i.taxable);
      const prevMtd = sum(db.invoices.filter((i) => i.date.startsWith(prevStart) && Number(i.date.slice(8)) <= dayOfMonth), (i) => i.taxable);
      const byDay = {}; db.invoices.forEach((i) => { byDay[i.date] = (byDay[i.date] || 0) + i.taxable; });
      cand.push({ key: 'sales', label: 'Sales this month', value: round0(mtd), unit: '₹', delta: pct(mtd, prevMtd), deltaLabel: 'vs same days last month', trend: d14.map((d) => round0(byDay[d] || 0)), icon: 'trend', href: '#/reports?tab=sales' });
      const ds = fin.distributorSummaries();
      const recv = sum(ds, (x) => x.outstanding), overdue = sum(ds, (x) => x.overdue);
      cand.push({ key: 'recv', label: 'Receivables', value: round0(recv), unit: '₹', sub: `${(overdue / 100000).toFixed(1)} L overdue · ${ds.filter((x) => x.overdue > 0).length} distributors`, progress: recv ? round2((overdue / recv) * 100) : 0, progressLabel: 'overdue share', bad: overdue > recv * 0.25, icon: 'wallet', href: '#/distributors' });
      const notInTally = db.invoices.filter((i) => !i.tally).length + db.receipts.filter((x) => !x.tally).length + db.purchaseBills.filter((x) => !x.tally).length;
      out.strip.push({ label: 'Not yet in Tally', value: notInTally, unit: 'entries', href: '#/finance?tab=tally' });
      // weekly sales vs collections, last 12 weeks
      const weeks = [];
      for (let w = 11; w >= 0; w--) {
        const end = addDays(t, -7 * w), start = addDays(end, -6);
        weeks.push({ label: end, sales: round0(sum(db.invoices.filter((i) => i.date >= start && i.date <= end), (i) => i.taxable)), collections: round0(sum(db.receipts.filter((x) => x.date >= start && x.date <= end), (x) => x.amount)) });
      }
      out.salesWeeks = weeks;
      out.topOutstanding = ds.sort((a, b) => b.outstanding - a.outstanding).slice(0, 5).map((x) => ({ id: x.id, name: x.name, city: x.city, outstanding: x.outstanding, overdue: x.overdue, creditUsedPct: x.creditUsedPct, creditLimit: x.creditLimit }));
    }

    // ---- Production (sheets per day + veneer recovery) ----
    if (can(user, ['production.view'])) {
      const closed = db.workOrders.filter((w) => w.status === 'Closed');
      const shBy = {}; closed.forEach((w) => { shBy[w.date] = (shBy[w.date] || 0) + (w.sheets || 0); });
      const yday = [...closed].reverse().find((w) => w.date < t)?.date;
      const last7 = sum(days(t, 7), (d) => shBy[d] || 0), prev7 = sum(days(addDays(t, -7), 7), (d) => shBy[d] || 0);
      cand.push({ key: 'sheets', label: 'Sheets made, last 7 days', value: last7, unit: 'sheets', delta: pct(last7, prev7), deltaLabel: 'vs previous 7 days', sub: yday ? `${shBy[t] || 0} today · ${shBy[yday] || 0} on ${yday.slice(8)}/${yday.slice(5, 7)}` : '', trend: d14.map((d) => shBy[d] || 0), icon: 'factory', href: '#/production' });
      const yieldFor = (from, to) => { const ws = closed.filter((w) => w.date > from && w.date <= to); const i = sum(ws, (w) => w.inputCft); return i ? (sum(ws, (w) => w.veneerCft || 0) / i) * 100 : 0; };
      const y30 = yieldFor(addDays(t, -30), t), yPrev = yieldFor(addDays(t, -60), addDays(t, -30));
      const wk = []; for (let w = 7; w >= 0; w--) wk.push(round2(yieldFor(addDays(t, -7 * w - 7), addDays(t, -7 * w))));
      cand.push({ key: 'yield', label: 'Recovery, last 30 days', value: round2(y30), unit: '%', delta: round2(y30 - yPrev), deltaUnit: 'pts', deltaLabel: 'target 75%', trend: wk, good: y30 >= 75, bad: y30 < 70, icon: 'gauge', href: '#/production' });
      const since = addDays(t, -30);
      const c30 = closed.filter((w) => w.date >= since);
      out.yieldBySpecies = db.species.map((s) => { const ws = c30.filter((w) => w.species === s.id); const i = sum(ws, (w) => w.inputCft), o = sum(ws, (w) => w.veneerCft || 0); return { name: s.name, color: s.color, value: i ? round2((o / i) * 100) : 0, input: round2(i) }; }).filter((x) => x.value).sort((a, b) => b.value - a.value);
      out.production14 = d14.map((d) => { const ws = db.workOrders.filter((w) => w.date === d); return { date: d, input: round2(sum(ws, (w) => w.inputCft)), output: round2(sum(ws.filter((w) => w.status === 'Closed'), (w) => w.outputCft)), sheets: shBy[d] || 0 }; });
    }

    // ---- Yard ----
    if (can(user, ['yard.view', 'inventory.view'])) {
      const inBy = {}; db.gateEntries.forEach((g) => { inBy[g.date] = (inBy[g.date] || 0) + g.totalCft; });
      const todayG = db.gateEntries.filter((g) => g.date === t);
      const ls = stock.logSummary();
      const yardCft = round2(sum(ls, (s) => s.cft));
      cand.push({ key: 'intake', label: 'Logs received today', value: round2(inBy[t] || 0), unit: 'CFT', sub: `${sum(todayG, (g) => g.logCount)} logs · ${todayG.length} truck(s)`, trend: d14.map((d) => round2(inBy[d] || 0)), icon: 'truck', href: '#/yard' });
      out.strip.push({ label: 'Logs in yard', value: yardCft, unit: 'CFT', href: '#/yard?tab=logs' });
      out.yard = { cft: yardCft, logs: sum(ls, (s) => s.logs), value: round0(sum(ls, (s) => s.value)), species: ls.filter((s) => s.cft).map((s) => ({ name: s.name, cft: s.cft, color: s.color })) };
    }

    // ---- Inventory ----
    if (can(user, 'inventory.view')) {
      const ps = stock.productSummary();
      const value = round0(sum(ps, (p) => p.value));
      const low = ps.filter((p) => p.status !== 'OK' && p.reorder);
      cand.push({ key: 'stock', label: 'Plywood in godown', value, unit: '₹', sub: `${low.length} items low or out of stock`, icon: 'boxes', href: '#/inventory', bad: low.length > 5 });
      out.strip.push({ label: 'Stock value', value, unit: '₹', href: '#/inventory' });
      const byLoc = {};
      ps.forEach((p) => { for (const [loc, q] of Object.entries(p.byLocation)) byLoc[loc] = (byLoc[loc] || 0) + stockValue(p, q); });
      out.stockByLocation = db.locations.filter((l) => byLoc[l.id] > 0).map((l) => ({ name: l.name.replace(/ —.*/, ''), full: l.name, value: round0(byLoc[l.id]) }));
    }

    // ---- Sales / dispatch ----
    if (can(user, ['sales.view', 'dispatch.view'])) {
      const open = db.orders.filter((o) => ['Pending approval', 'Approved', 'On hold (credit)'].includes(o.status));
      const openVal = round0(sum(open, (o) => o.grandTotal));
      cand.push({ key: 'orders', label: 'Open orders', value: open.length, unit: '', sub: `₹${(openVal / 100000).toFixed(1)} L · ${open.filter((o) => o.status === 'Pending approval').length} awaiting approval`, icon: 'cart', href: '#/orders' });
      out.strip.push({ label: 'Open orders', value: open.length, unit: '', href: '#/orders' });
      out.strip.push({ label: 'Dispatched today', value: db.dispatches.filter((x) => x.date === t).length, unit: 'trucks', href: '#/dispatch' });
    }

    out.kpis = cand.slice(0, 4);

    // ---- Alerts ----
    const alerts = [];
    const AP = { stock_adjustment: 'inventory.approve', stock_count: 'inventory.approve', credit_override: 'finance.approve' };
    const LBL = { stock_adjustment: 'Stock adjustment', stock_count: 'Stock count', credit_override: 'Credit limit' };
    const pend = db.approvals.filter((a) => a.status === 'Pending' && can(user, AP[a.type]));
    if (pend.length) alerts.push({ level: 'warn', title: `${pend.length} approval${pend.length > 1 ? 's' : ''} waiting for you`, sub: pend.map((a) => LBL[a.type]).join(' · '), href: '#/approvals' });
    if (can(user, 'inventory.edit')) { const ci = plant.countInfo(); if (ci.dueToday) alerts.push({ level: 'warn', title: 'Stock count due today', sub: 'Count the plywood in the godown and enter it (Mon & Thu)', href: '#/inventory?tab=count' }); }
    if (can(user, 'stores.view')) { const low = plant.storeSummary().filter((i) => i.status !== 'OK'); if (low.length) alerts.push({ level: 'warn', title: `${low.length} store item${low.length > 1 ? 's' : ''} running low`, sub: low.slice(0, 3).map((i) => i.name.split(' (')[0]).join(', '), href: '#/stores' }); }
    if (can(user, 'tally.export')) { const n = db.invoices.filter((i) => !i.tally).length + db.receipts.filter((x) => !x.tally).length + db.purchaseBills.filter((x) => !x.tally).length; if (n) alerts.push({ level: 'info', title: `${n} entries not yet in Tally`, sub: 'Send this week\'s sales, receipts and purchases to Tally', href: '#/finance?tab=tally' }); }
    if (can(user, ['sales.view', 'finance.view'])) fin.distributorSummaries().filter((x) => x.overLimit).slice(0, 3).forEach((x) => alerts.push({ level: 'bad', title: `${x.name} is over credit limit`, sub: `${x.creditUsedPct}% of ₹${(x.creditLimit / 100000).toFixed(0)} L used`, href: `#/distributors/${x.id}` }));
    if (can(user, 'sales.approve')) { const n = db.orders.filter((o) => o.status === 'Pending approval').length; if (n) alerts.push({ level: 'info', title: `${n} order${n > 1 ? 's' : ''} to approve`, sub: 'Sales orders waiting for approval', href: '#/orders?status=Pending approval' }); }
    if (can(user, 'dispatch.view')) { const n = db.orders.filter((o) => o.status === 'Approved').length; if (n) alerts.push({ level: 'info', title: `${n} order${n > 1 ? 's' : ''} ready to dispatch`, sub: 'Approved and waiting for a truck', href: '#/dispatch' }); }
    if (can(user, 'inventory.view')) { const low = stock.productSummary().filter((p) => p.status !== 'OK' && p.reorder); if (low.length) alerts.push({ level: 'warn', title: `${low.length} products below reorder level`, sub: low.slice(0, 3).map((p) => p.name).join(', ') + (low.length > 3 ? '…' : ''), href: '#/inventory?tab=stock' }); }
    if (can(user, 'production.view')) db.workOrders.filter((w) => w.status === 'Closed' && w.yield < 68 && w.date >= addDays(t, -14)).slice(-2).forEach((w) => alerts.push({ level: 'warn', title: `Low recovery on ${w.no}`, sub: `${w.yield}% · ${SP[w.species]?.name} · ${w.date}`, href: `#/production/${w.id}` }));
    if (can(user, 'yard.view')) { const old = db.logs.filter((l) => l.status === 'In yard' && daysBetween(l.receivedOn, t) > 45).length; if (old) alerts.push({ level: 'info', title: `${old} logs older than 45 days`, sub: 'Use them first to avoid splits and fungus', href: '#/yard?tab=logs' }); }
    out.alerts = alerts.slice(0, 7);

    out.activity = db.audit.slice(-8).reverse().map((a) => ({ ts: a.ts, user: userName(U, a.userId), action: a.action, entity: a.entity, entityId: a.entityId, summary: a.summary }));
    return out;
  });
};
