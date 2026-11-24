'use strict';
const store = require('../db');
const audit = require('../services/audit');
const fin = require('../services/finance');
const acc = require('../services/accounts');
const { HttpError, today, round0, sum, addDays } = require('../util');
const { can } = require('../permissions');
const { num, str, find, maps, userName } = require('./helpers');

const LARGE_PAYMENT = 500000;

module.exports = function register(r) {
  r.get('/api/finance/overview', 'finance.view', () => {
    const db = store.get();
    const t = today();
    const month = t.slice(0, 7);
    const dists = fin.distributorSummaries();
    const bills = fin.billStatuses();
    const cash = fin.book('cash').balance, bank = fin.book('bank').balance;
    const ageing = { b0: 0, b30: 0, b60: 0, b90: 0 };
    dists.forEach((d) => { for (const k in ageing) ageing[k] += d.ageing[k]; });
    for (const k in ageing) ageing[k] = round0(ageing[k]);
    const payables = round0(sum(Object.values(bills), (b) => b.balance));
    const payablesDue7 = round0(sum(db.purchaseBills.filter((b) => bills[b.id].balance > 0 && b.dueDate <= addDays(t, 7)), (b) => bills[b.id].balance));
    const months = fin.monthly(6);
    const cur = months[months.length - 1];
    const expByCat = {};
    db.expenses.filter((e) => e.date.startsWith(month)).forEach((e) => { expByCat[e.category] = (expByCat[e.category] || 0) + e.amount; });
    return {
      month, revenueMonth: cur.revenue, collectionsMonth: cur.collections, expensesMonth: cur.expenses, purchasesMonth: cur.purchases,
      receivables: round0(sum(dists, (d) => d.outstanding)), overdue: round0(sum(dists, (d) => d.overdue)), overdueParties: dists.filter((d) => d.overdue > 0).length,
      payables, payablesDue7, cash, bank, ageing, months,
      expensesByCategory: Object.entries(expByCat).map(([category, amount]) => ({ category, amount: round0(amount) })).sort((a, b) => b.amount - a.amount),
      topOverdue: dists.filter((d) => d.overdue > 0).sort((a, b) => b.overdue - a.overdue).slice(0, 6).map((d) => ({ id: d.id, name: d.name, city: d.city, overdue: d.overdue, outstanding: d.outstanding })),
    };
  });

  r.get('/api/finance/invoices', 'finance.view', () => {
    const db = store.get();
    const st = fin.invoiceStatuses();
    const { D } = maps();
    return db.invoices.slice().reverse().map((i) => ({ id: i.id, no: i.no, date: i.date, dueDate: i.dueDate, distributor: D[i.distributorId]?.name, distributorId: i.distributorId, state: i.placeOfSupply, taxable: i.taxable, gst: i.cgst + i.sgst + i.igst, total: i.total, ewayBill: i.ewayBill, irn: i.irn ? i.irn.slice(0, 12) + '…' : '', ...st[i.id] }));
  });

  r.get('/api/finance/invoices/:id', ['finance.view', 'sales.view', 'dispatch.view'], ({ params }) => {
    const db = store.get();
    const i = find('invoices', params.id, 'Invoice');
    const st = fin.invoiceStatuses()[i.id];
    const { D } = maps();
    const dsp = db.dispatches.find((x) => x.id === i.dispatchId);
    return { ...i, ...st, distributor: D[i.distributorId], company: db.company, dispatch: dsp };
  });

  r.get('/api/finance/receipts', 'finance.view', () => {
    const { D, U } = maps();
    return store.get().receipts.slice().reverse().map((x) => ({ ...x, distributor: D[x.distributorId]?.name, user: userName(U, x.userId) }));
  });
  r.post('/api/finance/receipts', 'finance.edit', ({ body, user }) => {
    const db = store.get();
    const d = find('distributors', body.distributorId, 'Distributor');
    const amount = round0(num(body.amount, 'Amount', { min: 1, max: 100000000 }));
    const mode = ['NEFT', 'RTGS', 'UPI', 'Cheque', 'Cash'].includes(body.mode) ? body.mode : null;
    if (!mode) throw new HttpError(400, 'Choose a payment mode');
    if (mode === 'Cash' && amount >= 200000) throw new HttpError(400, 'Cash receipts of ₹2,00,000 or more are not allowed (Income Tax s.269ST)');
    const no = store.nextNo('RCT', 'RCT');
    const rec = { id: no, no, date: body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date) && body.date <= today() ? body.date : today(), distributorId: d.id, amount, mode, ref: str(body.ref, 'Reference', { required: mode !== 'Cash', max: 60 }) || 'Cash', note: str(body.note, 'Note', { required: false, max: 200 }), userId: user.id };
    db.receipts.push(rec);
    audit.log(user, 'create', 'Receipt', no, `₹${amount.toLocaleString('en-IN')} from ${d.name} (${mode})`);
    store.save();
    return rec;
  });

  r.get('/api/finance/purchase-bills', 'finance.view', () => {
    const st = fin.billStatuses();
    const { S } = maps();
    return store.get().purchaseBills.slice().reverse().map((b) => ({ ...b, supplier: S[b.supplierId]?.name || b.party, supplierType: S[b.supplierId]?.type || b.kind, ...st[b.id] }));
  });
  r.get('/api/finance/supplier-payments', 'finance.view', () => {
    const { S, U } = maps();
    return store.get().supplierPayments.slice().reverse().map((p) => ({ ...p, supplier: S[p.supplierId]?.name || p.party, user: userName(U, p.userId) }));
  });
  r.post('/api/finance/supplier-payments', 'finance.edit', ({ body, user }) => {
    const db = store.get();
    const b = find('purchaseBills', body.billId, 'Purchase bill');
    const st = fin.billStatuses()[b.id];
    const amount = round0(num(body.amount, 'Amount', { min: 1 }));
    if (amount > st.balance) throw new HttpError(400, `Bill balance is only ₹${st.balance.toLocaleString('en-IN')}`);
    if (amount > LARGE_PAYMENT && !can(user, 'finance.approve')) throw new HttpError(403, `Payments above ₹${LARGE_PAYMENT.toLocaleString('en-IN')} need the MD`);
    const mode = ['Bank (RTGS)', 'Bank (NEFT)', 'UPI', 'Cheque', 'Cash'].includes(body.mode) ? body.mode : 'Bank (NEFT)';
    if (mode === 'Cash' && amount > 10000) throw new HttpError(400, 'Cash payments above ₹10,000 to one party in a day are disallowed (Income Tax s.40A(3))');
    const no = store.nextNo('PAY', 'PAY');
    const p = { id: no, no, date: today(), supplierId: b.supplierId, party: b.party, billId: b.id, amount, mode, ref: str(body.ref, 'Reference', { required: mode !== 'Cash', max: 60 }) || 'Cash', userId: user.id };
    db.supplierPayments.push(p);
    audit.log(user, 'create', 'Supplier payment', no, `₹${amount.toLocaleString('en-IN')} against ${b.no} (${mode})`);
    store.save();
    return p;
  });

  r.get('/api/finance/expenses', 'finance.view', () => {
    const { U } = maps();
    return store.get().expenses.slice().reverse().map((e) => ({ ...e, user: userName(U, e.userId) }));
  });
  r.post('/api/finance/expenses', 'finance.edit', ({ body, user }) => {
    const db = store.get();
    const amount = round0(num(body.amount, 'Amount', { min: 1, max: 50000000 }));
    const mode = body.mode === 'Cash' ? 'Cash' : 'Bank';
    if (mode === 'Cash' && amount > 10000) throw new HttpError(400, 'Cash expenses above ₹10,000 per payment are disallowed — use bank');
    const no = store.nextNo('EXP', 'EXP');
    const e = { id: no, no, date: today(), category: str(body.category, 'Category', { max: 40 }), description: str(body.description, 'Description', { max: 200 }), amount, mode, paidTo: str(body.paidTo, 'Paid to', { required: false, max: 80 }), userId: user.id };
    db.expenses.push(e);
    audit.log(user, 'create', 'Expense', no, `₹${amount.toLocaleString('en-IN')} — ${e.category}: ${e.description}`);
    store.save();
    return e;
  });

  r.get('/api/finance/book/:kind', 'finance.view', ({ params }) => {
    if (!['cash', 'bank'].includes(params.kind)) throw new HttpError(404, 'Unknown book');
    const b = fin.book(params.kind);
    return { balance: b.balance, rows: b.rows.slice().reverse() };
  });

  r.get('/api/finance/gst', 'finance.view', () => {
    const months = fin.monthly(6);
    const t = today();
    const m0 = t.slice(0, 7) + '-01';
    return { months: months.map((m) => ({ month: m.month, taxable: m.revenue, outputTax: m.gstOut, inputTax: m.gstIn, net: m.gstNet })), hsnThisMonth: fin.hsnSummary(m0, t), hsnAll: fin.hsnSummary() };
  });

  r.get('/api/finance/suppliers', 'finance.view', () => {
    const db = store.get();
    const st = fin.billStatuses();
    return db.suppliers.map((s) => {
      const bills = db.purchaseBills.filter((b) => b.supplierId === s.id);
      return { ...s, bills: bills.length, purchased: round0(sum(bills, (b) => b.total)), paid: round0(sum(bills, (b) => st[b.id].paid)), balance: round0(sum(bills, (b) => st[b.id].balance)), overdue: round0(sum(bills.filter((b) => st[b.id].status === 'Overdue'), (b) => st[b.id].balance)) };
    });
  });

  r.get('/api/finance/pnl', 'finance.view', () => fin.monthly(6));

  // ---------- Accountant's views (CA) ----------
  r.get('/api/finance/statements/pnl', 'finance.view', () => acc.profitAndLoss(6));
  r.get('/api/finance/statements/trial-balance', 'finance.view', () => acc.trialBalance());
  r.get('/api/finance/statements/gstr3b', 'finance.view', ({ query }) => {
    const m = /^\d{4}-\d{2}$/.test(query.month || '') ? query.month : today().slice(0, 7);
    const months = fin.monthly(6).map((x) => x.month);
    return { ...acc.gstr3b(m), months, trend: months.map((k) => { const g = acc.gstr3b(k); return { month: k, output: g.totalTax, itc: g.totalItc, cash: g.cash.total }; }) };
  });
  r.get('/api/finance/statements/tds', 'finance.view', () => acc.tds());
  r.get('/api/finance/statements/ageing', 'finance.view', () => acc.ageing());
  r.get('/api/finance/statements/cashflow', 'finance.view', () => ({ months: acc.cashflow(6), cash: fin.book('cash').balance, bank: fin.book('bank').balance }));
  r.get('/api/finance/statements/compliance', 'finance.view', () => acc.compliance());
  r.get('/api/finance/statements/summary', 'finance.view', () => {
    const pl = acc.profitAndLoss(6);
    const ag = acc.ageing();
    const g = acc.gstr3b(today().slice(0, 7));
    return { period: pl.period, pnl: pl.summary, costStructure: pl.costStructure, closingStock: pl.closingStock, mix: acc.salesMix(), dso: ag.dso, dpo: ag.dpo, receivables: ag.receivables, payables: ag.payables, msmeAtRisk: ag.msme.atRisk, gstThisMonth: g.cash.total, cashflow: acc.cashflow(6), cash: fin.book('cash').balance, bank: fin.book('bank').balance, compliance: acc.compliance().slice(0, 6), trialBalanceOk: acc.trialBalance().difference === 0 };
  });
};
