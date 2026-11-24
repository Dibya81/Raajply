# 10-minute client demo

Before the meeting: run `node server/seed.js` (fresh data dated today), then `node server/server.js`.

1. **Login screen** — point out the roles. Click **Owner / Director**.
2. **Dashboard** — today's log intake, production, recovery %, stock value, receivables, cash + bank. Click an alert.
3. **Log Yard → New gate entry** — pick a supplier and species, type girth/length for 3–4 logs, watch CFT and amount update.
   Save → show the **printable log tags** and the auto-created purchase bill.
4. **Production → New work order** — choose the same species, "Auto-select oldest", start. Enter output in CFT/sheets
   → recovery % shows live → Save & close. Mention low-recovery alerts.
5. **Inventory** — stock by godown; open **Stock ledger**: every movement, nothing can be edited.
6. **Sales Orders → New order** — choose a distributor, see the credit box. Place → approve.
   Show the order that is **on credit hold** and approve it from **Approvals** (only Finance Manager / Owner can).
7. **Dispatch** — dispatch the approved order → loading slip → **GST tax invoice** (CGST/SGST vs IGST, e-way bill, amount in words).
8. **Distributors** — open one with overdue: ageing, average days to pay, ledger. **Record receipt**.
9. **Finance** — overview, cash book, bank book, GST + HSN summary. "This replaces the books."
10. **Users & Audit** — roles matrix and the audit log of everything you just did.
    Sign out and log in as **yard** to show how little a yard supervisor sees.

Questions to collect during the demo: products and units, how logs are measured, number of locations,
distributor pricing/credit terms, approval rules, and which reports the owner checks daily.
