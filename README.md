# Raajply ERP — prototype

Software for **Raajply**, a plywood manufacturer with its factory and log yard in **Magadi, Karnataka**:
**logs arrive (farmers & imports) → peeled into veneer → glued & pressed into sheets → godown → distributors → GST invoice → Tally.**
It runs on six months of realistic demo data and needs nothing installed except Node.js.

## Run it

1. Install **Node.js 18 or newer** (https://nodejs.org → LTS). Check with `node -v`.
2. Double-click **`start.command`** (Mac), or in this folder run `node server/server.js`.
   It stops any older copy that is still running, then opens the website.
3. **Website:** http://localhost:4000/ · **Software:** http://localhost:4000/app

No `npm install` is needed — there are zero dependencies. Another port: `PORT=5000 node server/server.js`.

## Three roles (demo — no password)

The sign-in screen is a demo role picker: tap **Managing Director**, **Accounts** or **Production** to step in.
(The API still accepts `md` / `accounts` / `production` with password `demo123` for automated tests.)

| Username | Who | What they do |
| --- | --- | --- |
| `md` | Managing Director | Sees everything. Approves credit-limit overrides, stock-count differences and damaged sheets. |
| `accounts` | Accounts office | Orders, approvals within credit, invoices, money received, purchase bills, **Send to Tally**. |
| `production` | Production manager | Logs arriving, peeling & pressing, sheets made, plywood stock, **stock counts**, **stores**, loading trucks. |

Switch role any time from the menu (top of the sidebar, or the avatar on phones).

## What the client told us → where it is in the software

| Client answer | In the software |
| --- | --- |
| Raajply, factory + log yard in Magadi | Company name, address, log yard "Magadi" on every screen and document |
| Plywood of all kinds, sold per square foot | 17 plywood types/sizes (MR, BWR, BWP marine, teak decorative, shuttering, block board). Orders are in **sheets**; invoices show **sheets × sq ft × ₹ per sq ft** |
| Price list can't be shared | The website shows no prices ("rates on request") |
| Teak & pine, from farmers and imports (Canada, Vietnam, USA) | Suppliers are farmers or importers. Imports record **country, container and bill of entry** and carry IGST; farmer loads carry a cutting permit and no GST |
| Logs measured in girth × length (CFT), each numbered | Live CFT calculator; every log gets its own number and printable tag |
| Glue, rollers, motors, gloves, saw blades bought regularly | **Stores**: items received (creates a purchase bill), issued to a section, low-stock alerts, "lasts about N days" |
| Peel → veneer → glue/press → finishing; production = sheets per day | **Production batch**: logs → veneer CFT → sheets of each type. Home screen shows **sheets made per day** |
| Recovery about 75% | Recovery = veneer ÷ log CFT, shown against a **75% target**; below 68% is flagged |
| Stock counted twice a week in notebooks | **Stock count** every Monday & Thursday: type counted sheets, differences go to the MD to approve |
| 5–7 distributors across the state | 6 distributors in Karnataka with credit limits and ageing |
| Own trucks | Dispatch picks one of the company's trucks (driver fills in automatically) |
| Books kept in Tally | **Send to Tally** exports sales, receipts and purchase vouchers (GST split) as a Tally import file; only new entries; history kept |
| Used by accounts, production manager, MD | Exactly three roles |
| Data hard to find / summarise / time-consuming | Search (⌘K), one-click reports, CSV export, plain-language **? Help** on every screen |

## Website + software

| Address | What it is |
|---|---|
| `/` | **Company website** — real photos (stored in `public/img/photos`, works offline), scroll story of how plywood is made, product range without prices, timeline, *Become a distributor* form |
| `/app` | **The software** |

Enquiries from the website appear in the software under **Website enquiries**.

**Made for non-technical staff:** big "What would you like to do?" buttons per role, **? Help** on every screen,
plain menu names, sounds and smooth animations (both switchable), **Bigger text** option, tap-friendly on phones.

> The history (founded 1998), yearly figures, contact details, GSTIN and people's names are **sample content** — replace them with Raajply's real details after the visit.

## Accounts for the CA

**Accounts** (`/app#/finance`) gives the accountant's view, all derived from the registers so it always ties:
P&L in Schedule III shape (monthly), **trial balance** (Dr = Cr check), **GSTR-3B working** with ITC set-off (rule 88A) and import IGST from Bills of Entry,
HSN summary, **TDS working** (194Q / 194C), debtor & creditor **ageing** with DSO/DPO and the **MSME 43B(h)** 45-day watch,
cash & bank books, closing-stock valuation note (AS-2), a statutory **due-date calendar**, and **Send to Tally**.

## Deploy on Vercel

The repo is Vercel-ready (`vercel.json` + `api/index.js`): static files are served from `public/`, every `/api/*` call runs the same Node router as a serverless function.

1. Import the GitHub repo in Vercel → Framework preset **Other** → no build command → Deploy.
2. Optional: set an environment variable `ERP_SECRET` (any long random string).
3. `/` is the website, `/app` is the software.

Serverless disks are temporary: demo data is generated fresh on each cold start, and changes made during a demo last while the instance stays warm (fine for showing the client; a real deployment would use PostgreSQL).

## Demo data

- Created automatically the first time the server starts (`data/db.json`), dated so the last day is **today**.
  Data from an older version of this prototype is replaced automatically (a copy is kept in `data/backups`).
- To refresh before a demo: `node server/seed.js`.
- About 280 sheets a day, ~75% recovery, ~150 log arrivals (farmers + import containers), 50+ stock counts, weekly Tally exports.

## Tests

```bash
npm test
```

22 tests cover CFT maths, the three roles, farmer and import arrivals, production recovery from veneer,
order in sheets → per-sq-ft invoice → own truck → receipt, credit hold (MD only), stock count approval,
stores purchase/issue, Tally XML (balanced vouchers, no duplicates), reports, security headers and login throttling.

## Project layout

```
server/          Node.js API (no dependencies)
  routes/plant.js  stores, stock counts, Tally export
  routes/ops.js    log yard, production, inventory
  routes/sales.js  orders, distributors, dispatch
  seed.js          demo data generator
  services/accounts.js  P&L, trial balance, GSTR-3B, TDS, ageing, due dates
public/          browser app (plain JS modules) + website (public/site)
api/index.js     Vercel serverless entry
tests/           automated tests
```

## Notes

- GST IRN, acknowledgement and e-way bill numbers are **demo values**; invoices are watermarked "DEMO".
- Tally ledger names (Sales, CGST/SGST, Purchase – Logs, …) are listed on the Send to Tally tab and must match Raajply's Tally company.
- For production use we'd move to PostgreSQL and real GST / e-way bill APIs — see `docs/ARCHITECTURE.md`.
