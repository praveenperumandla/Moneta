# Moneta Architecture

Version: 1.2
Last Updated: 2026-08-20

---

# What this is

Moneta is an offline-first Progressive Web App. No backend, no cloud, no bundler, no framework.

The browser owns UI, lending math, localStorage, import/export, and the service worker.

---

# Why these two files live at the root

`ARCHITECTURE.md` and `PROJECT_RULES.md` stay in the **project root**, not `docs/`.

They are operating docs: humans and AI agents should find them immediately. `.github/copilot-instructions.md` points at these exact paths.

`dump/` is archive only. Do not add new features there.

---

# System flow

```
User action
    → update state (js/app/state.js)
    → autoSave (js/app/persistence.js)
    → refreshUI paints the active view only
```

Home totals come from `js/modules/registry.js` (`snapshotAll`). Lending is the first registered module.

---

# Live project structure

```
index.html          shell, markup, sheets
app.js              bootstrap only
styles.css          screens and components
css/tokens.css      colors, type, glass, --safe-top / --safe-bottom
js/core/            accounting, xirr, dates, money, schema, storage, migrate
js/app/             state, nav, refresh, persistence, bus
js/modules/         registry, lending/, networth/
js/ui/              home, sheets, settings, transactions
sw.js               PWA cache
manifest.json       standalone display
VERSION             app version string
icons/
tests/              Node --test goldens (npm test)
package.json        test runner only
developer.*         PWA preview studio
serve.py            local static server
```

---

# Data

- Writer key: `localStorage['moneta_data_v1']` (flat `{ borrowers, accounts, transactions, portfolios }`)
- Reader also accepts legacy `vault_data_v2` and schema v2 (`modules.lending`)
- Writer stays on v1 until a dual-stack cutover is explicitly approved

---

# Protected core

`js/core/accounting.js` and `js/core/xirr.js`

Interest, repayment split, write-offs, closed-as-of, XIRR. Do not edit formulas without `npm test` staying green.

Closed accounts stay closed. New loan = new account.

---

# How to add the next product (FD, investments, …)

1. Add `js/modules/<id>/` implementing the registry contract (`snapshot`, `id`, `label`).
2. Register it from `app.js`.
3. Do **not** import `js/core/accounting.js` from a non-lending module.

---

# iOS PWA layout (do not “fix” this with random padding)

Standalone iOS keeps a home-indicator strip **outside** the webview (~64px on the current device). CSS cannot paint there.

- Top: use `--safe-top` (`env(safe-area-inset-top)`) so the header clears the status bar.
- Bottom: do **not** add `env(safe-area-inset-bottom)` on `#app` — it double-counts and lifts the tab bar.
- Tab pill sits at the bottom of **our** box. Developer studio “Webview bottom inset 64” matches the phone.

---

# Design principles

1. Accounting before appearance.
2. UI and accounting stay independent.
3. Never duplicate business logic.
4. Offline and Vault-backup compatible.
5. New wealth products plug in via the registry.
