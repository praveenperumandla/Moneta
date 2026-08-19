# Moneta Project Rules

Version: 1.2
Last Updated: 2026-08-20

---

# Vision

Premium offline-first personal wealth and lending app. Fast, private, accurate.

---

# Core principles

1. **Offline first** — works with no internet. Network is optional.
2. **Privacy first** — data never leaves the device unless the user exports.
3. **Accounting first** — UI must never change lending math.

---

# Protected components

Do not change without a verified bug or approved accounting feature, plus `npm test`:

- `js/core/accounting.js` — interest, repayment allocation, write-offs
- `js/core/xirr.js`
- Historical replay / closed-as-of
- Import/export compatibility (`moneta_data_v1`, Vault `vault_data_v2`)

**Rule zero:** when in doubt, do not touch the accounting engine.

Closed accounts are permanent. New loan = new account. Do not build “reopen”.

---

# Architecture rules

- Modular ES files under `js/`. `app.js` stays bootstrap-only.
- Keep UI out of `js/core/`.
- Never duplicate business logic.
- New products = new folder + `registry.register()`. Do not import accounting from non-lending modules.
- No React/Vite/bundler unless explicitly decided.
- `dump/` is archive. Do not put live code there.

`ARCHITECTURE.md` and this file stay at the **repo root** (not `docs/`).

---

# UI

Premium, calm, mobile-first.

References: Apple HIG, Groww / INDMoney density, HDFC iOS craft (type, glass, pill nav).

Do not fight the iOS PWA home-indicator strip with extra bottom safe-area padding on `#app`.

---

# Tests

Before any accounting or persistence change:

```
npm test
```

18 golden cases must stay green. If you extract math, pin first, then move.

---

# Backward compatibility

Vault users must never lose data. Migrate on read. Keep old JSON imports working.

---

# Version bump (every product commit)

Sync all of these:

1. `VERSION`
2. `index.html` — Settings label and `?v=` on CSS/JS
3. `sw.js` — `CACHE_NAME`
4. `developer.js` — `fallbackVersion`

Commit prefixes: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`.

Docs-only or dump moves do not require a version bump.

---

# Workflow

Plan → implement → review → `npm test` → commit (version bump if product code) → release
