# Moneta — Bug Report

Reviewed: 2026-08-16  
Scope: `app.js`, `index.html`, `sw.js`, `manifest.json`, `styles.css`, `serve.py`, `developer.js`, `update_css.py`

Accounting engine is otherwise consistent (day-count, close-to-stop-interest, closed accounts not reopenable). Highest priority: flush saves, don’t overwrite on failed load, fix P+I as-of-date validation, and un-nest the update toast.

---

## Critical

### 1. Debounced save + SW auto-reload can wipe new data

**Files:** `app.js:124-133` · `sw.js:14-15,39` · `index.html:576-637`

`autoSave()` waits 300ms and is never flushed on `pagehide` / `visibilitychange`. The SW calls `skipWaiting()` + `clients.claim()`, and the page reloads on every `controllerchange` (checked every 60s). Close the PWA or hit an update within that window and the last borrower/loan/repayment is gone.

```javascript
const autoSave = () => {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
        try {
            localStorage.setItem('moneta_data_v1', JSON.stringify(state));
        } catch(e) {
            if (e.name === 'QuotaExceededError') alert('Storage full! Export and clear old data.');
        }
    }, 300);
};
```

**Fix direction:** Write immediately (or flush pending save) on `pagehide`, `visibilitychange`, and before any reload. Do not `skipWaiting()` automatically; wait for the user to tap update after a flush.

---

### 2. Corrupt load then save erases the vault

**File:** `app.js:79-121`

`JSON.parse` or legacy `b.name.trim()` failures are caught and ignored. `state` stays empty. The next `autoSave()` overwrites `moneta_data_v1`. App looks empty; original data is gone.

```javascript
    } catch(e) { console.error('Load failed:', e); }
```

**Fix direction:** On load failure, keep a `loadFailed` flag, refuse to auto-save, and show a recover/export prompt. Never overwrite storage with empty defaults.

---

## High

### 3. Backdated “Repayment (P+I)” over-allocates principal

**File:** `app.js:181-186, 1127-1137`

Validation uses **today’s** outstanding. Allocation uses interest **as of the txn date**. A full-due repayment dated near `startDate` has ~₹0 interest, so the whole amount hits principal. `totalGotPrincipal` is not capped. Loan can show recovered > lent, principal ₹0, interest frozen.

```javascript
if (['repayment','payment_principal','payment_interest'].includes(type)) {
    const acc = state.accounts.find(a => a.id === accountId);
    const baselineMetrics = calculateAccountMetrics(acc, validateTxns);
    // maxAllowed = *today's* P / I / P+I, not as-of txn.date
    if (amount > maxAllowed + 0.5) {
        return alert(`Amount (...) exceeds outstanding (...).`);
    }
}
```

```javascript
} else if (txn.type === 'repayment') {
    const outI = Math.max(0, totalInterestAccrued - totalGotInterest - totalWrittenOffInterest);
    let rem = txn.amount;
    if (rem >= outI) { totalGotInterest += outI; rem -= outI; }
    else { totalGotInterest += rem; rem = 0; }
    if (rem > 0) { totalGotPrincipal += rem; currentPrincipal = Math.max(0, currentPrincipal - rem); }
}
```

Related: a large `payment_interest` can be backdated and prepaid against interest that had not accrued yet, zeroing later outstanding interest.

**Fix direction:** Validate amount against outstanding **as of the transaction date** (replay only txns on or before that date). Cap `totalGotPrincipal` at original principal.

---

### 4. `crypto.randomUUID()` dies on LAN HTTP

**File:** `app.js:31` (also used at 103, 945, 1041, 1099, 1144)

`serve.py` tells you to open `http://LAPTOP_IP:8080` on iPhone. That is not a secure context. Add person/loan/repayment throws. Nothing can be created.

```javascript
const generateId = () => crypto.randomUUID();
```

**Fix direction:** Fall back when `crypto.randomUUID` is missing:

```javascript
const generateId = () =>
    (crypto.randomUUID && crypto.randomUUID()) ||
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
```

---

### 5. Ledger header does not refresh

**File:** `app.js:564-605` vs `910-925`

Totals (`Total Outstanding`, `Active Loans`, `Interest O/S`, start date) are written only in `openLedger()`. `refreshUI()` only re-renders cards via `renderLedgerView`. After a payment the top “Total Outstanding” stays stale. Easy to enter the same payment twice.

```javascript
const refreshUI = () => {
    metricsCache = null;
    renderPortfolioHeader();
    updatePortfolioDropdowns();
    updateDashboard();
    renderHome();
    renderBorrowersList();
    if (currentBorrowerId) renderLedgerView(currentBorrowerId);
};
```

**Fix direction:** Extract header updates from `openLedger()` and call them from `refreshUI()` whenever `currentBorrowerId` is set.

---

### 6. Manifest `start_url` / `scope` are `/Moneta/`

**File:** `manifest.json:5-6`

Local `serve.py` (and any non-GitHub-Pages host) is outside scope. Install is ignored, or the icon opens `/Moneta/` and 404s.

```json
"start_url": "/Moneta/",
"scope": "/Moneta/"
```

**Fix direction:** Use relative values (`"./"` / `"."`) or generate the manifest from the actual base path.

---

### 7. Update toast can never appear

**Files:** `index.html:382, 561-568` · `styles.css:1018`

`#modal-backdrop` is opened at line 382 and never closed. The update toast and SW scripts are nested inside it. `.modal-backdrop.hidden { display: none }` hides the toast. `skipWaiting()` already ran on install, so `reg.waiting` is always null — “Tap to update” cannot work even if the toast were visible.

**Fix direction:** Close `</div>` for `#modal-backdrop` before the toast. Do not call `skipWaiting()` in `install`; wait for the user’s tap.

---

### 8. Offline is not offline-first

**Files:** `index.html:16-18` · `sw.js:16-19, 48-57`

CDN scripts (Phosphor, Chart.js) have no `crossorigin`, so the SW sees opaque responses (`status` 0, `type` `'opaque'`) and does not cache them. Icons vanish offline. `cache.addAll` errors are swallowed, so a failed precache still installs an empty SW.

```javascript
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).catch(err => console.log('Cache failed:', err))
```

```javascript
            if (response && response.status === 200 && response.type === 'cors') {
              cache.put(event.request, response.clone());
            }
```

**Fix direction:** Add `crossorigin` on CDN tags (or vendor the files). Do not catch `cache.addAll` in a way that lets install succeed with an empty cache. Cache opaque responses only if you accept them, or switch to CORS.

---

## Medium

### 9. Home net worth ignores the selected portfolio

**File:** `app.js:407-421` then `892-907`

`updateDashboard()` writes portfolio-filtered totals and a subtitle like `Mother · as of …`. `renderHome()` immediately overwrites the same DOM nodes with **all** `state.accounts`. Subtitle says “Mother”; the number is everyone.

```javascript
const renderHome = () => {
    let totalAssets = 0;
    state.accounts.forEach(acc => {
        const m = getCachedMetrics(acc, state.transactions);
        totalAssets += (m.outstandingPrincipal + m.outstandingInterest);
    });
```

**Fix direction:** Sum `getActiveData()` in `renderHome()`, or drop the overwrite and let `updateDashboard()` own those nodes.

---

### 10. Home → Lending row is dead

**Files:** `index.html:93` · `app.js:275`

`onclick="switchView('borrowers')"` but `switchView` is a `const` — not on `window`. Throws `ReferenceError`. Bottom tab still works.

```html
<div class="nw-module-row" onclick="switchView('borrowers')">
```

**Fix direction:** Bind a click listener in `DOMContentLoaded`, or assign `window.switchView = switchView`.

---

### 11. Import can hide data or crash

**File:** `app.js:1183-1196`

Keeps `activePortfolio` even if the backup has no such portfolio (lists look empty). Missing `portfolios` is not defaulted; next `state.portfolios.forEach` throws.

```javascript
state = { ...importPendingData, theme: preservedTheme, activePortfolio: preservedPortfolio };
```

**Fix direction:** Default `portfolios` to `['Self', 'Mother', 'Wife']`. If preserved portfolio is not in the imported list, reset to `'__ALL__'`.

---

### 12. Write-offs are uncapped

**File:** `app.js:187-191, 1127`

Only `repayment` / `payment_principal` / `payment_interest` are amount-checked. A typo write-off zeros principal, sets `isWrittenOff`, and stops interest. Log shows a write-off larger than the loan.

**Fix direction:** Cap principal write-off at outstanding principal and interest write-off at outstanding interest as of the txn date.

---

### 13. Fake credit limit

**File:** `app.js:584-585` · `index.html:252-254`

Any borrower with an active loan is shown as `₹1,00,000`. There is no such field.

```javascript
const limitEl = document.getElementById('ledger-credit-limit');
if (limitEl) limitEl.textContent = stats.activeAccounts > 0 ? `₹1,00,000` : `—`;
```

**Fix direction:** Remove the tile, or add a real credit-limit field the user can set.

---

### 14. Tab bar covers last content; no iOS safe area

**File:** `styles.css:54-56, 150-152, 936-943`

Bar is `position: fixed; height: 40px`. `.view-content` bottom padding is `4px`. `--safe-area-bottom` is `0px` and unused. Last rows / “Add Loan” sit under the bar and the home indicator. Tab targets collide with the iOS home indicator.

```css
.view-content {
  padding: 16px 14px 4px;
}
.tab-bar {
  position: fixed;
  bottom: 0;
  height: var(--tab-h); /* 40px */
}
```

**Fix direction:** Pad the scroll area by `calc(var(--tab-h) + env(safe-area-inset-bottom))`. Add `padding-bottom: env(safe-area-inset-bottom)` on `.tab-bar` and grow `--tab-h` accordingly.

---

### 15. Import XSS

**File:** `app.js:655-656, 690`

Names/notes are escaped; `t.id`, `acc.id`, and `acc.rate` are dropped into HTML. A malicious backup can run script and read `localStorage` (the whole ledger).

```javascript
<button class="icon-btn btn-edit-txn" data-id="${t.id}" title="Edit">
<div class="acc-table-value">${acc.rate}% p.a.</div>
```

**Fix direction:** `escapeHtml()` every interpolated value, including ids and rates. Prefer `dataset` assignment after `createElement` instead of string HTML for ids.

---

### 16. SW origin allowlist uses substring match

**File:** `sw.js:45-46`

The worker intercepts (and may cache) hosts that merely **contain** `unpkg.com`, `cdn.jsdelivr.net`, or `self.location.hostname` (e.g. `evil-unpkg.com`, or `notmyapp.com` if the app is `myapp.com`).

```javascript
const isExternal = ['unpkg.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'].some(domain => url.hostname.includes(domain));
if (!url.origin.includes(self.location.hostname) && !isExternal) return;
```

**Fix direction:** Compare hostname with exact match or `===` / `endsWith('.' + domain)`.

---

### 17. Offline fallback is a 503 text body for every failed GET

**File:** `sw.js:69-72`

A cache miss for JS/CSS/JSON returns `Moneta is offline.` with no `Content-Type`. The page parses that as script/stylesheet and breaks instead of getting a useful navigation fallback.

```javascript
      }).catch(() =>
        caches.match(event.request).then(cached =>
          cached || new Response('Moneta is offline.', { status: 503 })
        )
```

**Fix direction:** For navigations, fall back to cached `index.html`. For other GETs, return a typed error or fail without a fake body.

---

### 18. `update_css.py` will corrupt CSS if run again

**File:** `update_css.py:5, 62, 264-267`

- Path is hardcoded to `d:/Python Projects/Moneta - Copy/` — fails if the repo moves.
- `linear-gradient\([^)]+\)` stops at the first `)`. Gradients that use `rgba(...)` become invalid CSS.
- The net-worth block is appended on every run, duplicating rules.

---

## Low

### 19. New loan form does not reset payment mode

**File:** `app.js:1052-1068`

Amount, rate, date, notes, and txn id are cleared. `#input-acc-mode` is not. After editing a UPI/Bank Transfer account, the next “Add Loan Account” still has that mode selected.

---

### 20. `escapeHtml` used in `confirm()` (plain text)

**File:** `app.js:877, 1031`

Portfolio delete and duplicate-name confirmations run names through `escapeHtml`. `confirm()` does not parse HTML. A name like `Ram & Shyam` shows as `Ram &amp; Shyam`.

---

### 21. Activity list hard-cuts at 999 transactions

**File:** `app.js:921, 1219`

`renderRecentTransactions(..., 999)` sorts newest-first and slices. Older activity disappears from the full log with no indication once there are 1,000+ rows (including synthetic disbursements).

---

### 22. `serve.py` cannot restart cleanly

**File:** `serve.py:47`

Default `TCPServer` does not set `allow_reuse_address`. Ctrl+C then immediate rerun often fails with `WinError 10048` until the socket times out.

---

### 23. Icon `purpose` is a single dual-purpose image

**File:** `manifest.json:16, 22`

`"purpose": "any maskable"` tells Android to crop the same 192/512 assets as maskable. Install still works; the home-screen icon is typically clipped unless those PNGs were drawn with maskable padding.

---

### 24. Developer Studio PWA status is a one-shot race

**File:** `developer.js:64-68, 104`

Opening `developer.html` first almost always shows “Not Registered”. The iframe registers the SW later; status is never refreshed.

---

## Not treated as defects

- Unused XIRR / Chart.js wiring
- Theme stored but never applied (no toggle)
- 0% rate blocked by HTML `min="0.01"` and JS (product rule)
- Closed accounts not reopenable (explicit product rule)
- Filter-tab handlers with no matching DOM
