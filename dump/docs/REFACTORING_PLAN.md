# Moneta Refactoring Plan

Version: 1.0
Last Updated: 2026-08-19
Status: Phases 0–5 executed in v5.6.0. Phase 6 is the next product (do not start until this stays green).

---

## Goal

Split the one-file app so the next products (Investments, FD, EPF/NPS, liabilities) can ship **without touching lending math**.

Non-goals:

- No React / Vue / Vite / bundler
- No rewrite of interest, repayment allocation, write-offs, or XIRR
- No data-format break for existing `moneta_data_v1` / Vault backups
- No visual redesign in this plan

Rule zero (from PROJECT_RULES): when in doubt, do not modify the accounting engine.

---

## Target shape

Vanilla ES modules. Browser loads them directly. Tests import the same files in Node.

```
js/
  core/
    ids.js              generateId
    dates.js            parseLocalDate, getTodayStr, getDaysBetween
    money.js            formatCurrency, formatDate
    html.js             escapeHtml
    accounting.js       calculateAccountMetrics, getBorrowerStats   PROTECTED
    xirr.js             calculateXIRR                               PROTECTED
    schema.js           validate + version
    storage.js          load / save / export / import
    migrate.js          vault_data_v2 → moneta_data_v1 → v2
  app/
    state.js            single store + getActiveData
    nav.js              switchView, tab fill, swipe
    refresh.js          paint active view only
  modules/
    registry.js         register / list / snapshotAll
    lending/            current product, extracted as-is
      engine.js         thin re-export of accounting.js
      list.js
      ledger.js
    networth/
      aggregator.js     sums module snapshots for Home
  ui/
    sheets.js
    home.js
    settings.js

app.js                  bootstrap only (~80 lines)
index.html              <script type="module" src="app.js">
tests/
  fixtures/             golden JSON + expected metrics
  accounting.test.js
  xirr.test.js
  migrate.test.js
```

A **module** is a product slice with this contract. Lending is the first implementation. Future products implement the same shape — they never call `calculateAccountMetrics`.

```js
// js/modules/registry.js
export const WealthModule = {
  id: 'lending',          // unique
  label: 'Lending',
  icon: 'ph-hand-coins',
  kind: 'asset',          // asset | liability
  snapshot(state, asOf) {
    return { id, label, assets: 0, liabilities: 0 };
  },
  renderHomeRow(snapshot),
  views: ['borrowers'],   // view ids this module owns
};
```

Home becomes: `registry.snapshotAll(state)` → render rows. Adding FD is a new folder + `registry.register(fdModule)`. No edits to lending.

---

## Safety method

Every phase is a **behavior-preserving extract** (Feathers / Fowler).

1. Pin current outputs with tests (Phase 1).
2. Move code. Do not rewrite it.
3. Re-run the same tests. Diff must be empty.
4. One concern per commit. Bump version per PROJECT_RULES.
5. If a test fails, revert the extract. Do not “fix” the math.

Commit prefix: `refactor:` for moves, `test:` for pins, `feat:` only after Phase 5.

---

## Phase 0 — Housekeeping (30 min)

No runtime change.

- [ ] Add to `.gitignore`: `.kilo/`, `.agents/`, `node_modules/`, `.idea/`
- [ ] Add root `package.json` **for tests only** (no bundler, no app deps):

```json
{
  "name": "moneta",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test tests/**/*.test.js"
  }
}
```

- [ ] Update ARCHITECTURE.md storage key: `moneta_data_v1` (legacy `vault_data_v2` still read)
- [ ] Record this plan in `docs/DECISIONS.md`

Exit: `git status` clean except the plan + gitignore. App behavior unchanged.

---

## Phase 1 — Pin the math (do this first, or do not refactor)

**Why:** You cannot prove a move is safe without a lock on outputs.

Create `tests/fixtures/golden-loan.json`: one borrower, one account, mixed txns covering every branch:

| Case | What it locks |
|------|----------------|
| G1 | Accrual across month boundary (365-day year) |
| G2 | `repayment` splits interest then principal |
| G3 | `payment_interest` only |
| G4 | `payment_principal` only |
| G5 | `writeoff` + `writeoff_interest` |
| G6 | Closed account uses `closedDate`, not today |
| G7 | Txn before `startDate` is ignored |
| G8 | `asOfDate` historical snapshot |
| G9 | XIRR cashflow set (lent negative, receipts positive) |
| G10 | Zero-principal / fully repaid |

**How to capture expected values (do not invent them):**

1. Temporarily `console.log(JSON.stringify(calculateAccountMetrics(...)))` in the running app against the fixture.
2. Paste that JSON into `tests/fixtures/expected-g1.json` etc.
3. Delete the logs. Those files are now the contract.

Then extract **copies** of the four pure functions into `js/core/*` *without deleting the originals yet*. Point tests at the new files.

```
tests/accounting.test.js   compare fixture → expected, 1e-6 tolerance on floats
tests/xirr.test.js
```

`accounting.js` / `xirr.js` / `dates.js` must import nothing from the DOM.

Exit: `npm test` green. `app.js` still the live engine. You now have a tripwire.

---

## Phase 2 — Mechanical extract of core (no behavior change)

Move, don’t edit. After each file, run tests + click through Lending / Ledger / Import.

Order:

| Step | Move from `app.js` | To | DOM allowed? |
|------|--------------------|-----|--------------|
| 2.1 | `escapeHtml` | `js/core/html.js` | no |
| 2.2 | `generateId` | `js/core/ids.js` | no |
| 2.3 | date helpers | `js/core/dates.js` | no |
| 2.4 | `formatCurrency`, `formatDate` | `js/core/money.js` | no |
| 2.5 | `calculateAccountMetrics`, cache, `getBorrowerStats` | `js/core/accounting.js` | no |
| 2.6 | `calculateXIRR` | `js/core/xirr.js` | no |
| 2.7 | `loadData`, `flushSave`, `autoSave`, `exportData`, `importData` | `js/core/storage.js` + `migrate.js` | no (except `alert` via injected `onError`) |

Then:

- [ ] Deduplicate the two Vault→Moneta migrators (`loadData` vs `importData`) into `migrate.js` **only after** `tests/migrate.test.js` covers both paths with the same fixture.
- [ ] Switch `index.html` to `<script type="module" src="app.js?v=…">`.
- [ ] Export the same function names. `app.js` becomes `import { calculateAccountMetrics } from './js/core/accounting.js'`.

Do **not** change a formula, a default, or a field name in this phase.

Exit: tests green, import of an old Vault JSON still works, a live save/reload round-trip matches.

---

## Phase 3 — State and paint

| Step | What | Rule |
|------|------|------|
| 3.1 | `js/app/state.js` | `state` lives here. No `window.state`. Export `getState`, `setState`, `getActiveData`. |
| 3.2 | `js/app/nav.js` | `switchView`, tab fill icons, swipe, tab-bar hide |
| 3.3 | `js/app/refresh.js` | Paint **only the active view**. Today `refreshUI()` redraws Home + Borrowers + Ledger + dropdowns every time. |
| 3.4 | `js/ui/sheets.js` | `openModal` / `closeModal` |

Exit: switching tabs does not rebuild the ledger DOM. Adding a borrower still persists.

---

## Phase 4 — Lending becomes a module

Move UI that knows about loans. Engine stays in `js/core`.

```
js/modules/lending/list.js      renderBorrowersList
js/modules/lending/ledger.js    renderLedgerHeader, renderLedgerView
js/modules/lending/engine.js    re-export accounting + borrower stats
js/modules/lending/index.js     WealthModule object
```

`js/modules/registry.js`:

```js
const modules = [];
export const register = (m) => modules.push(m);
export const all = () => modules;
export const snapshotAll = (state, asOf) =>
  modules.map(m => m.snapshot(state, asOf));
```

`js/modules/networth/aggregator.js`:

```js
export const totalNetWorth = (snapshots) => {
  const assets = snapshots.reduce((s, x) => s + x.assets, 0);
  const liabilities = snapshots.reduce((s, x) => s + x.liabilities, 0);
  return { assets, liabilities, net: assets - liabilities };
};
```

Home (`js/ui/home.js`) renders from `snapshotAll`. Delete the hardcoded “Coming Soon” rows from `index.html`. Future modules appear when registered.

Exit: Home numbers match pre-refactor. Lending tab works. Registry has exactly one module.

---

## Phase 5 — Schema that can grow

Today the dump is a flat bag: `{ borrowers, accounts, transactions, portfolios }`. That cannot hold stocks and FDs cleanly.

**Do not migrate on disk until the reader is dual-stack.**

Target document (`moneta_data_v2`):

```json
{
  "schemaVersion": 2,
  "exportedAt": "2026-08-19",
  "portfolios": ["Self"],
  "activePortfolio": "__ALL__",
  "modules": {
    "lending": {
      "borrowers": [],
      "accounts": [],
      "transactions": []
    }
  }
}
```

Rules:

- Reader accepts v1 (flat) and v2 (namespaced). Writer stays on **v1** until v2 read is tested on real backups.
- Then flip writer to v2. Keep v1 import forever (PROJECT_RULES: Vault users never lose data).
- `schema.js` rejects unknown required fields, coerces missing optionals.
- Each module owns `modules[id]` only.

Exit: export → wipe → import equals previous balances to the rupee.

---

## Phase 6 — Ready for the next product

Only after Phases 1–5.

To add Fixed Deposits (example):

1. `js/modules/fd/index.js` implementing `WealthModule`
2. `modules.fd` slice in schema
3. Register in bootstrap
4. Home row appears. No change to `accounting.js`

Same for investments, EPF, credit cards. Shared things (portfolios, INR format, sheets, nav) stay in `core` / `app` / `ui`. Product math never crosses modules.

---

## What not to do

| Temptation | Why not |
|------------|---------|
| “Clean up” interest while moving it | Breaks the golden files and user balances |
| Introduce React to “make modules easier” | You need boundaries, not a framework |
| One shared `Account` type for loans and FDs | Different math, different txns |
| IndexedDB rewrite now | localStorage + export is fine until you hit quota |
| Split CSS in the same week | Cosmetic; does not unblock modules |
| Change `refreshUI` and accounting in one commit | Cannot tell which broke |

---

## Good-practice guides (this kind of project)

Read these. They map 1:1 onto Moneta.

### Extracting a working app without breaking it

- **Michael Feathers — *Working Effectively with Legacy Code***  
  Characterization tests, seams, sprout/extract. Phase 1 is this book.
- **Martin Fowler — *Refactoring*** + [Strangler Fig](https://martinfowler.com/bliki/StranglerFigApplication.html)  
  New structure grows around the old file; `app.js` shrinks to a husk.
- **John Ousterhout — *A Philosophy of Software Design***  
  Deep modules: `accounting.js` should hide the replay loop; callers only ask “what’s outstanding?”

### Domain and money

- **Eric Evans / Vaughn Vernon — DDD (lite)**  
  Bounded contexts: Lending ≠ Investments ≠ Net Worth. The registry is the context map. Do not share entities across them.
- **Martin Fowler — [Accounting Patterns](https://martinfowler.com/apsupp/accounting.pdf)**  
  You already replay events. Keep it. Don’t replace the ledger with “current balance” fields.
- Treat money as integer paise inside the engine later if you ever see ₹1 drift. Not now — pin current float behavior first.

### Offline-first / local-first

- **Ink & Switch — [Local-first software](https://www.inkandswitch.com/local-first/)**  
  The file on device is the source of truth. Sync is optional and later.
- **PWA:** keep `sw.js` as a cache of *code*, never of user data. User data stays in `localStorage` / future IDB.
- Schema version + migrate on read. Never mutate a backup in place.

### JS structure without a bundler

- Native ES modules (`<script type="module">`). One HTTP request per file is fine at this size.
- Node `--test` imports the **same** `js/core/*.js` the browser uses. No duplicate engine.
- Cache-bust with `?v=` from `VERSION` (already required). After modules, bump once per release; don’t invent a second versioning scheme.

### When you do add the next module

1. Write the snapshot function and its tests first (what Home will show).
2. Then UI.
3. Then register.
4. Never import `js/core/accounting.js` from a non-lending module.

---

## Suggested cadence

| Week | Phase | Commit example |
|------|-------|----------------|
| 1 | 0 + 1 | `test: pin lending metrics golden files (v5.5.1)` |
| 2 | 2.1–2.6 | `refactor: extract core date/money/accounting modules (v5.5.2)` |
| 3 | 2.7 + migrate tests | `refactor: unify storage and vault migration (v5.5.3)` |
| 4 | 3 | `refactor: isolate state, nav, and active-view refresh (v5.6.0)` |
| 5 | 4 | `refactor: register lending as first wealth module (v5.6.1)` |
| 6 | 5 | `feat: dual-read schema v2, keep writing v1 (v5.7.0)` |

Do not start Investments until Phase 5 exit is checked.

---

## Definition of done (whole plan)

- [ ] `npm test` covers G1–G10 and migration
- [ ] `app.js` is bootstrap only
- [ ] Lending math lives in `js/core/accounting.js` and is imported, not copied
- [ ] Home totals come from `registry.snapshotAll`
- [ ] Old Vault JSON and `moneta_data_v1` still import
- [ ] A second module can be added by creating a folder + `register()`, with no edit to accounting

When that list is true, the architecture matches ARCHITECTURE.md’s “Planned” section — and the next product will not endanger the engine.
