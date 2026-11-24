'use strict';
/**
 * Accountant's views built from the same documents the software records (invoices, receipts,
 * purchase bills, supplier payments, expenses, contra). Everything here is derived — nothing is
 * stored — so the trial balance always ties back to the registers.
 * Indian financial year (April–March); GST rules as per CGST Act; TDS sections from the Income-tax Act.
 */
const store = require('../db');
const fin = require('./finance');
const stock = require('./stock');
const { round0, round2, today, daysBetween, monthKey, sum, addDays } = require('../util');

// Which expense heads are part of manufacturing (direct) vs office/admin (indirect)
const DIRECT = ['Wages', 'Electricity', 'Diesel', 'Boiler fuel', 'Repairs & maintenance', 'Consumables', 'Freight'];
const isDirect = (cat) => DIRECT.includes(cat);
// Small local store suppliers are registered under Udyam (MSME) in this sample — CA confirms the real list.
const isMsme = (bill) => bill.kind === 'Stores';
const MSME_DAYS = 45;

function fyOf(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return { start: `${start}-04-01`, end: `${start + 1}-03-31`, label: `FY ${start}-${String((start + 1) % 100).padStart(2, '0')}` };
}
/** Period the books cover: from the later of FY start and the first day of data, to today. */
function period() {
  const db = store.get();
  const t = today();
  const fy = fyOf(t);
  const from = db.meta.dataFrom > fy.start ? db.meta.dataFrom : fy.start;
  return { from, to: t, fy: fy.label, fyStart: fy.start, fyEnd: fy.end, days: daysBetween(from, t) + 1 };
}
const inP = (d, p) => d >= p.from && d <= p.to;
const partyOf = (b, S) => S[b.supplierId]?.name || b.party || 'Unknown';
function purchaseHead(b) { return b.kind === 'Logs — import' ? 'Purchase — imported logs' : b.kind === 'Logs — farmer' ? 'Purchase — logs from farmers' : 'Purchase — stores & consumables'; }
function monthKeys(n) {
  const t = today();
  const [y, m] = t.split('-').map(Number);
  const keys = [];
  for (let i = n - 1; i >= 0; i--) { const d = new Date(y, m - 1 - i, 1); keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); }
  return keys;
}

/** Closing stock for the accountant: logs at purchase cost, plywood at list price and at estimated cost. */
function closingStock(costRatio) {
  const logs = stock.logSummary();
  const prods = stock.productSummary();
  const logValue = round0(sum(logs, (l) => l.value));
  const fgList = round0(sum(prods.filter((p) => p.total > 0), (p) => p.value));
  return {
    logs: logValue, logCft: round2(sum(logs, (l) => l.cft)),
    plywoodAtList: fgList, plywoodAtCost: round0(fgList * costRatio), costRatio: round2(costRatio * 100),
    total: round0(logValue + fgList * costRatio),
  };
}

/** Profit & loss in the Schedule III shape, monthly columns + period total. */
function profitAndLoss(nMonths = 6) {
  const db = store.get();
  const p = period();
  const keys = monthKeys(nMonths).filter((k) => k >= p.from.slice(0, 7));
  const cols = [...keys, 'total'];
  const blank = () => Object.fromEntries(cols.map((k) => [k, 0]));
  const rows = {};
  const add = (line, k, v) => { if (!rows[line]) rows[line] = blank(); if (k in rows[line]) rows[line][k] += v; rows[line].total += v; };
  for (const i of db.invoices) if (inP(i.date, p)) add('Sales of plywood (net of GST)', monthKey(i.date), i.taxable);
  for (const b of db.purchaseBills) if (inP(b.date, p)) add(purchaseHead(b), monthKey(b.date), b.taxable);
  const expHeads = new Set();
  for (const e of db.expenses) if (inP(e.date, p)) { add(e.category, monthKey(e.date), e.amount); expHeads.add(e.category); }
  const val = (line) => rows[line] || blank();
  const col = (fn) => Object.fromEntries(cols.map((k) => [k, round0(fn(k))]));
  const revenue = col((k) => val('Sales of plywood (net of GST)')[k]);
  const purchHeads = ['Purchase — logs from farmers', 'Purchase — imported logs', 'Purchase — stores & consumables'];
  const purchases = col((k) => sum(purchHeads, (h) => val(h)[k]));
  const direct = [...expHeads].filter(isDirect).sort();
  const indirect = [...expHeads].filter((h) => !isDirect(h)).sort();
  const directTot = col((k) => sum(direct, (h) => val(h)[k]));
  const gross = col((k) => revenue[k] - purchases[k] - directTot[k]);
  const indirectTot = col((k) => sum(indirect, (h) => val(h)[k]));
  const ebitda = col((k) => gross[k] - indirectTot[k]);
  const pct = (a, b) => Object.fromEntries(cols.map((k) => [k, b[k] ? round2((a[k] / b[k]) * 100) : 0]));
  const line = (label, v, extra = {}) => ({ label, values: col((k) => v[k]), ...extra });
  const costRatio = revenue.total ? Math.min(0.95, (purchases.total + directTot.total) / revenue.total) : 0.7;
  return {
    period: p, months: keys,
    lines: [
      { section: 'I. Revenue from operations' },
      line('Sales of plywood (net of GST)', val('Sales of plywood (net of GST)'), { strong: true }),
      { section: 'II. Cost of materials consumed' },
      ...purchHeads.map((h) => line(h, val(h), { indent: true })),
      line('Total purchases', purchases, { subtotal: true }),
      { section: 'III. Manufacturing (direct) expenses' },
      ...direct.map((h) => line(h, val(h), { indent: true })),
      line('Total direct expenses', directTot, { subtotal: true }),
      line('Gross profit (I − II − III)', gross, { total: true, margin: pct(gross, revenue) }),
      { section: 'IV. Administrative (indirect) expenses' },
      ...indirect.map((h) => line(h, val(h), { indent: true })),
      line('Total indirect expenses', indirectTot, { subtotal: true }),
      line('Operating profit (EBITDA)', ebitda, { total: true, margin: pct(ebitda, revenue) }),
    ],
    summary: { revenue: revenue.total, purchases: purchases.total, direct: directTot.total, indirect: indirectTot.total, gross: gross.total, ebitda: ebitda.total, grossPct: revenue.total ? round2((gross.total / revenue.total) * 100) : 0, ebitdaPct: revenue.total ? round2((ebitda.total / revenue.total) * 100) : 0 },
    costStructure: [...purchHeads.map((h) => ({ label: h.replace('Purchase — ', ''), value: round0(val(h).total) })), ...direct.map((h) => ({ label: h, value: round0(val(h).total) })), ...indirect.map((h) => ({ label: h, value: round0(val(h).total) }))].filter((x) => x.value > 0).sort((a, b) => b.value - a.value),
    closingStock: closingStock(costRatio),
    notes: [
      'Stock is not adjusted above: closing stock (logs at cost, plywood at estimated cost) is shown separately for valuation (AS-2: lower of cost and net realisable value).',
      'Depreciation, finance cost and income tax are booked in Tally at year end and are not part of this operating view.',
    ],
  };
}

/** Trial balance from the registers. Debits and credits tie by construction. */
function trialBalance() {
  const db = store.get();
  const p = { from: db.meta.dataFrom, to: today() };
  const L = {};
  const dr = (name, group, v) => { L[name] = L[name] || { name, group, dr: 0, cr: 0 }; L[name].dr += v; };
  const cr = (name, group, v) => { L[name] = L[name] || { name, group, dr: 0, cr: 0 }; L[name].cr += v; };
  let roundOff = 0;
  for (const i of db.invoices) {
    if (!inP(i.date, p)) continue;
    cr('Sales — plywood', 'Sales accounts', i.taxable);
    if (i.cgst) cr('Output CGST', 'Duties & taxes', i.cgst);
    if (i.sgst) cr('Output SGST', 'Duties & taxes', i.sgst);
    if (i.igst) cr('Output IGST', 'Duties & taxes', i.igst);
    dr('Sundry debtors (distributors)', 'Current assets', i.total);
    roundOff += i.total - i.taxable - i.cgst - i.sgst - i.igst;
  }
  for (const b of db.purchaseBills) {
    if (!inP(b.date, p)) continue;
    dr(purchaseHead(b), 'Purchase accounts', b.taxable);
    if (b.gst) {
      if (b.kind === 'Logs — import') dr('Input IGST (imports, Bill of Entry)', 'Duties & taxes', b.gst);
      else { dr('Input CGST', 'Duties & taxes', b.gst / 2); dr('Input SGST', 'Duties & taxes', b.gst / 2); }
    }
    cr('Sundry creditors (suppliers)', 'Current liabilities', b.total);
    roundOff -= b.total - b.taxable - b.gst;
  }
  for (const e of db.expenses) if (inP(e.date, p)) dr(e.category, isDirect(e.category) ? 'Direct expenses' : 'Indirect expenses', e.amount);
  for (const r of db.receipts) if (inP(r.date, p)) cr('Sundry debtors (distributors)', 'Current assets', r.amount);
  for (const x of db.supplierPayments) if (inP(x.date, p)) dr('Sundry creditors (suppliers)', 'Current liabilities', x.amount);
  dr('Cash in hand', 'Current assets', fin.book('cash').balance);
  dr('Bank account', 'Current assets', fin.book('bank').balance);
  cr('Capital — opening balances', 'Capital account', fin.OPENING.bank + fin.OPENING.cash);
  if (Math.abs(roundOff) > 0.004) (roundOff > 0 ? cr : dr)('Round off', 'Indirect income / expenses', Math.abs(roundOff));
  const rows = Object.values(L).map((l) => { const n = round2(l.dr - l.cr); return { name: l.name, group: l.group, dr: n > 0 ? n : 0, cr: n < 0 ? -n : 0 }; }).filter((r) => r.dr || r.cr);
  const ORDER = ['Capital account', 'Current liabilities', 'Duties & taxes', 'Current assets', 'Sales accounts', 'Purchase accounts', 'Direct expenses', 'Indirect expenses', 'Indirect income / expenses'];
  rows.sort((a, b) => ORDER.indexOf(a.group) - ORDER.indexOf(b.group) || a.name.localeCompare(b.name));
  const totDr = round2(sum(rows, (r) => r.dr)), totCr = round2(sum(rows, (r) => r.cr));
  return { from: p.from, to: p.to, rows, totalDr: totDr, totalCr: totCr, difference: round2(totDr - totCr) };
}

/** GSTR-3B style working for a month, with ITC set-off in the order rule 88A requires. */
function gstr3b(month) {
  const db = store.get();
  const out = { taxable: 0, igst: 0, cgst: 0, sgst: 0, invoices: 0 };
  for (const i of db.invoices) if (i.date.startsWith(month)) { out.taxable += i.taxable; out.igst += i.igst; out.cgst += i.cgst; out.sgst += i.sgst; out.invoices++; }
  const itc = { importIgst: 0, otherCgst: 0, otherSgst: 0, otherIgst: 0, importBills: 0, otherBills: 0, farmerBills: 0, farmerValue: 0 };
  for (const b of db.purchaseBills) {
    if (!b.date.startsWith(month)) continue;
    if (b.kind === 'Logs — import') { itc.importIgst += b.gst; itc.importBills++; } else if (b.gst) { itc.otherCgst += b.gst / 2; itc.otherSgst += b.gst / 2; itc.otherBills++; } else { itc.farmerBills++; itc.farmerValue += b.taxable; }
  }
  // Set-off: IGST credit → IGST, then CGST, then SGST; CGST credit → CGST then IGST; SGST credit → SGST then IGST.
  const liab = { igst: out.igst, cgst: out.cgst, sgst: out.sgst };
  let cIgst = itc.importIgst + itc.otherIgst, cCgst = itc.otherCgst, cSgst = itc.otherSgst;
  const use = (credit, head) => { const u = Math.min(credit, liab[head]); liab[head] -= u; return credit - u; };
  cIgst = use(cIgst, 'igst'); cIgst = use(cIgst, 'cgst'); cIgst = use(cIgst, 'sgst');
  cCgst = use(cCgst, 'cgst'); cCgst = use(cCgst, 'igst');
  cSgst = use(cSgst, 'sgst'); cSgst = use(cSgst, 'igst');
  const [y, m] = month.split('-').map(Number);
  const next = new Date(y, m, 1);
  const nm = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
  const r = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? round0(v) : v]));
  return {
    month, outward: r(out), itc: r(itc),
    cash: r({ igst: liab.igst, cgst: liab.cgst, sgst: liab.sgst, total: liab.igst + liab.cgst + liab.sgst }),
    carryForward: r({ igst: cIgst, cgst: cCgst, sgst: cSgst, total: cIgst + cCgst + cSgst }),
    totalTax: round0(out.igst + out.cgst + out.sgst), totalItc: round0(itc.importIgst + itc.otherCgst + itc.otherSgst + itc.otherIgst),
    due: { gstr1: `${nm}-11`, gstr3b: `${nm}-20` },
  };
}

/** TDS working: 194Q on purchase of goods (> ₹50 L from one seller in the FY) and 194C on contract work. */
function tds() {
  const db = store.get();
  const p = period();
  const fyFrom = p.fyStart > db.meta.dataFrom ? p.fyStart : db.meta.dataFrom;
  const S = Object.fromEntries(db.suppliers.map((s) => [s.id, s]));
  const by = {};
  for (const b of db.purchaseBills) {
    if (b.date < fyFrom) continue;
    const s = S[b.supplierId];
    const name = partyOf(b, S);
    by[name] = by[name] || { party: name, type: s?.type || b.kind, resident: s?.type !== 'Import', base: 0, bills: 0 };
    by[name].base += b.taxable; by[name].bills++;
  }
  const LIMIT = 5000000;
  const q = Object.values(by).map((x) => {
    const over = Math.max(0, x.base - LIMIT);
    const applies = x.resident && over > 0;
    return { section: '194Q', nature: 'Purchase of goods', party: x.party, type: x.type, bills: x.bills, base: round0(x.base), threshold: LIMIT, taxable: applies ? round0(over) : 0, rate: 0.1, tds: applies ? round0(over * 0.001) : 0,
      status: !x.resident ? 'Not applicable — non-resident seller (imports)' : applies ? 'Deduct on amount above ₹50 L' : `Below ₹50 L (${Math.round((x.base / LIMIT) * 100)}% used)` };
  }).sort((a, b) => b.base - a.base);
  const con = {};
  for (const e of db.expenses) {
    if (e.date < fyFrom || e.category !== 'Repairs & maintenance') continue;
    const k = e.paidTo || 'Contractor';
    con[k] = con[k] || { party: k, base: 0, max: 0, n: 0 };
    con[k].base += e.amount; con[k].max = Math.max(con[k].max, e.amount); con[k].n++;
  }
  const c = Object.values(con).map((x) => {
    const applies = x.max > 30000 || x.base > 100000;
    return { section: '194C', nature: 'Repair / contract work', party: x.party, type: 'Contractor', bills: x.n, base: round0(x.base), threshold: 100000, taxable: applies ? round0(x.base) : 0, rate: 2, tds: applies ? round0(x.base * 0.02) : 0, status: applies ? 'Deduct (single > ₹30,000 or year > ₹1 L)' : 'Below threshold' };
  });
  const rows = [...q, ...c];
  return { fy: p.fy, from: fyFrom, rows, total: round0(sum(rows, (r) => r.tds)),
    notes: ['194Q applies because turnover is above ₹10 Cr; rate 0.1% (5% if seller has no PAN). Farmers selling their own produce: CA to confirm PAN status.', '194C at 2% for firms/companies, 1% for individuals/HUF. Salaries (192) are computed in payroll and not shown here.', 'TDS deducted in a month is deposited by the 7th of the next month (30 April for March).'] };
}

/** Debtor and creditor ageing, with MSME 43B(h) watch on creditors. */
function ageing() {
  const db = store.get();
  const t = today();
  const p = period();
  const ds = fin.distributorSummaries();
  const sales = sum(db.invoices.filter((i) => inP(i.date, p)), (i) => i.total);
  const recv = sum(ds, (d) => d.outstanding);
  const debtors = ds.map((d) => ({ id: d.id, name: d.name, city: d.city, creditDays: d.creditDays, creditLimit: d.creditLimit, outstanding: round0(d.outstanding), overdue: round0(d.overdue), b0: round0(d.ageing.b0), b30: round0(d.ageing.b30), b60: round0(d.ageing.b60), b90: round0(d.ageing.b90), avgDaysToPay: d.avgDaysToPay })).sort((a, b) => b.outstanding - a.outstanding);
  const st = fin.billStatuses();
  const S = Object.fromEntries(db.suppliers.map((s) => [s.id, s]));
  const cm = {};
  let msmeRisk = 0;
  const msmeBills = [];
  for (const b of db.purchaseBills) {
    const bal = st[b.id].balance;
    if (bal <= 0) continue;
    const name = partyOf(b, S);
    const age = daysBetween(b.date, t);
    cm[name] = cm[name] || { name, type: S[b.supplierId]?.type || 'Stores', msme: isMsme(b), outstanding: 0, overdue: 0, b0: 0, b30: 0, b60: 0, b90: 0, beyond45: 0 };
    const r = cm[name];
    r.outstanding += bal;
    if (st[b.id].status === 'Overdue') r.overdue += bal;
    r[fin.bucketOf(age)] += bal;
    if (isMsme(b) && age > MSME_DAYS) { r.beyond45 += bal; msmeRisk += bal; msmeBills.push({ no: b.no, party: name, date: b.date, age, balance: round0(bal), payBy: addDays(b.date, MSME_DAYS) }); }
  }
  const creditors = Object.values(cm).map((r) => ({ ...r, outstanding: round0(r.outstanding), overdue: round0(r.overdue), b0: round0(r.b0), b30: round0(r.b30), b60: round0(r.b60), b90: round0(r.b90), beyond45: round0(r.beyond45) })).sort((a, b) => b.outstanding - a.outstanding);
  const purchases = sum(db.purchaseBills.filter((b) => inP(b.date, p)), (b) => b.total);
  const pay = sum(creditors, (c) => c.outstanding);
  const msmeSoon = db.purchaseBills.filter((b) => isMsme(b) && st[b.id].balance > 0 && daysBetween(b.date, t) <= MSME_DAYS && daysBetween(b.date, t) >= 30).map((b) => ({ no: b.no, party: partyOf(b, S), date: b.date, age: daysBetween(b.date, t), balance: round0(st[b.id].balance), payBy: addDays(b.date, MSME_DAYS) }));
  return {
    debtors, creditors, receivables: round0(recv), payables: round0(pay),
    dso: sales ? Math.round((recv / sales) * p.days) : 0, dpo: purchases ? Math.round((pay / purchases) * p.days) : 0,
    msme: { atRisk: round0(msmeRisk), bills: msmeBills.sort((a, b) => b.age - a.age), soon: msmeSoon.sort((a, b) => b.age - a.age) },
  };
}

/** Month-end cash & bank balances with inflow and outflow. */
function cashflow(nMonths = 6) {
  const keys = monthKeys(nMonths);
  const cash = fin.book('cash').rows, bank = fin.book('bank').rows;
  const endBal = (rows, k) => { let b = null; for (const r of rows) if (r.date.slice(0, 7) <= k) b = r.balance; return b ?? 0; };
  const flow = (rows, k, f) => round0(sum(rows.filter((r) => r.date.startsWith(k) && r.mode !== 'Contra' && r.ref !== '—'), f));
  return keys.map((k) => ({
    month: k, cash: round0(endBal(cash, k)), bank: round0(endBal(bank, k)),
    inflow: flow(cash, k, (r) => r.in) + flow(bank, k, (r) => r.in),
    outflow: flow(cash, k, (r) => r.out) + flow(bank, k, (r) => r.out),
  }));
}

/** Upcoming statutory due dates (next ~75 days), with amounts where the software knows them. */
function compliance() {
  const t = today();
  const [y, m] = t.split('-').map(Number);
  const items = [];
  const ym = (yy, mm) => `${yy}-${String(mm).padStart(2, '0')}`;
  const prevMonth = (yy, mm) => (mm === 1 ? ym(yy - 1, 12) : ym(yy, mm - 1));
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  for (let i = 0; i < 3; i++) {
    const d = new Date(y, m - 1 + i, 1);
    const Y = d.getFullYear(), M = d.getMonth() + 1;
    const pm = prevMonth(Y, M);
    const g = gstr3b(pm);
    const lab = `${MON[Number(pm.slice(5)) - 1]} ${pm.slice(0, 4)}`;
    items.push({ date: `${ym(Y, M)}-07`, title: `TDS deposit for ${lab}`, form: 'Challan ITNS 281', kind: 'TDS' });
    items.push({ date: `${ym(Y, M)}-11`, title: `GSTR-1 for ${lab}`, form: `${g.outward.invoices} B2B invoices · ₹${(g.outward.taxable / 1e5).toFixed(1)} L taxable`, kind: 'GST' });
    items.push({ date: `${ym(Y, M)}-15`, title: `PF & ESI for ${lab}`, form: 'ECR on EPFO / ESIC portal', kind: 'Payroll' });
    items.push({ date: `${ym(Y, M)}-20`, title: `GSTR-3B for ${lab}`, form: `Cash payable ₹${g.cash.total.toLocaleString('en-IN')}`, amount: g.cash.total, kind: 'GST' });
  }
  const fixed = [[6, 15, 'Advance tax — 1st instalment (15%)'], [9, 15, 'Advance tax — 2nd instalment (45%)'], [12, 15, 'Advance tax — 3rd instalment (75%)'], [3, 15, 'Advance tax — 4th instalment (100%)'],
    [7, 31, 'TDS return Q1 (24Q / 26Q)'], [10, 31, 'TDS return Q2 (24Q / 26Q)'], [1, 31, 'TDS return Q3 (24Q / 26Q)'], [5, 31, 'TDS return Q4 (24Q / 26Q)'],
    [9, 30, 'Tax audit report (Form 3CA/3CD)'], [10, 31, 'Income-tax return (audit case)'], [12, 31, 'GSTR-9 / 9C annual return']];
  for (const yy of [y, y + 1]) for (const [mm, dd, title] of fixed) items.push({ date: `${ym(yy, mm)}-${String(dd).padStart(2, '0')}`, title, form: '', kind: /GST/.test(title) ? 'GST' : /TDS/.test(title) ? 'TDS' : 'Income tax' });
  const horizon = addDays(t, 75);
  return items.filter((x) => x.date >= t && x.date <= horizon).map((x) => ({ ...x, daysLeft: daysBetween(t, x.date) })).sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Sales mix by plywood category and by distributor for the period. */
function salesMix() {
  const db = store.get();
  const p = period();
  const P = Object.fromEntries(db.products.map((x) => [x.id, x]));
  const D = Object.fromEntries(db.distributors.map((x) => [x.id, x]));
  const cat = {}, dist = {};
  let sqft = 0;
  for (const i of db.invoices) {
    if (!inP(i.date, p)) continue;
    dist[i.distributorId] = (dist[i.distributorId] || 0) + i.taxable;
    for (const l of i.lines) { const c = P[l.productId]?.category || 'Other'; cat[c] = (cat[c] || 0) + l.taxable; sqft += l.sqft || 0; }
  }
  const sales = sum(Object.values(cat), (v) => v);
  return {
    byCategory: Object.entries(cat).map(([label, value]) => ({ label, value: round0(value) })).sort((a, b) => b.value - a.value),
    byDistributor: Object.entries(dist).map(([id, value]) => ({ id, label: D[id]?.name || id, value: round0(value) })).sort((a, b) => b.value - a.value),
    sqft: round0(sqft), avgRate: sqft ? round2(sales / sqft) : 0,
  };
}

module.exports = { period, profitAndLoss, trialBalance, gstr3b, tds, ageing, cashflow, compliance, salesMix, closingStock, isDirect };
