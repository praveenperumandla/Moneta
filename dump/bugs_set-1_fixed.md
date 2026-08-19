# Moneta — Bug Report & Resolution Record (Set 1: Bugs 1 – 24)

**Reviewed & Completed:** 2026-08-18  
**Scope:** `app.js`, `index.html`, `sw.js`, `manifest.json`, `styles.css`, `serve.py`, `developer.js`, `update_css.py`  
**Status:** All 24 bugs resolved and verified.

---

## Critical

### 1. Debounced save + SW auto-reload can wipe new data
- **Status:** FIXED
- **Files Modified:** [app.js:L128-L155](file:///d:/Python%20Projects/Moneta%20-%20Copy/app.js#L128-L155), [sw.js:L14-L26](file:///d:/Python%20Projects/Moneta%20-%20Copy/sw.js#L14-L26), [index.html:L620-L645](file:///d:/Python%20Projects/Moneta%20-%20Copy/index.html#L620-L645)
- **Problem:** `autoSave()` waited 300ms. If the app was closed or refreshed before the timer fired, or if Service Worker triggered `skipWaiting()` automatically on install and caused a controller change reload, newly added data was wiped.
- **Fix Applied:**
  1. Implemented synchronous `flushSave()` which cancels any pending debounce timer and writes to `localStorage` immediately.
  2. Attached `flushSave()` to window lifecycle listeners: `pagehide`, `beforeunload`, and `visibilitychange` (when document becomes `hidden`).
  3. Removed automatic `self.skipWaiting()` from `sw.js` install handler.
  4. Explicitly flushed data before posting `SKIP_WAITING` and before reloading on Service Worker updates.

---

### 2. Corrupt load then save erases the vault
- **Status:** FIXED
- **Files Modified:** [app.js:L78-L125](file:///d:/Python%20Projects/Moneta%20-%20Copy/app.js#L78-L125), [app.js:L140-L195](file:///d:/Python%20Projects/Moneta%20-%20Copy/app.js#L140-L195)
- **Problem:** If deserialization or data migration failed in `loadData()`, `state` was left as empty defaults. Subsequent auto-saves or flushes would overwrite `localStorage['moneta_data_v1']`, permanently destroying user data.
- **Fix Applied:**
  1. Added a global `loadFailed` safety flag.
  2. If `JSON.parse` or migration fails, `loadFailed` is set to `true`, and an error alert is shown with recovery options.
  3. Both `autoSave()` and `flushSave()` immediately abort if `loadFailed === true`.
  4. Updated `exportData()` so that when `loadFailed === true`, it dumps raw storage to `Moneta_RAW_Corrupt_<timestamp>.json` so the user can rescue their data.

---

## High

### 3. Backdated “Repayment (P+I)” over-allocates principal
- **Status:** FIXED
- **Files Modified:** [app.js:L207-L295](file:///d:/Python%20Projects/Moneta%20-%20Copy/app.js#L207-L295), [app.js:L1230-L1280](file:///d:/Python%20Projects/Moneta%20-%20Copy/app.js#L1230-L1280)
- **Problem:** Validation evaluated against today's outstanding balance, while repayment allocation calculated interest accrued only up to the backdated transaction date. A payment entered near `startDate` had ~₹0 interest accrued at that time, pushing the entire payment into principal without capping `totalGotPrincipal` at original principal.
- **Fix Applied:**
  1. Extended `calculateAccountMetrics(account, allTxns, asOfDate = null)` to replay transactions up to `asOfDate` and compute exact interest accrued and outstanding balances up to that date.
  2. Capped principal recovery so that total recovered principal never exceeds initial principal (`rem = Math.min(rem, currentPrincipal)`).
  3. Capped interest payments against interest accrued as of the transaction date.
  4. Updated `submit-txn` validation to compute as-of metrics using the entered transaction date (`date`).

---

### 4. `crypto.randomUUID()` dies on LAN HTTP
- **Status:** FIXED
- **Files Modified:** [app.js:L30-L40](file:///d:/Python%20Projects/Moneta%20-%20Copy/app.js#L30-L40)
- **Problem:** Browsers only expose `crypto.randomUUID` in Secure Contexts (HTTPS / localhost). Accessing via LAN IP (`http://192.168.x.x:8080`) on mobile crashed ID generation on creating borrowers, loans, and transactions.
- **Fix Applied:**
  1. Added an RFC4122 v4 compliant fallback in `generateId()` when `crypto.randomUUID` is unavailable:
  ```javascript
  const generateId = () => {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
          return crypto.randomUUID();
      }
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
          const r = Math.random() * 16 | 0;
          return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
  };
  ```

---

### 5. Ledger header does not refresh
- **Status:** FIXED
- **Files Modified:** [app.js:L640-L685](file:///d:/Python%20Projects/Moneta%20-%20Copy/app.js#L640-L685), [app.js:L1040-L1055](file:///d:/Python%20Projects/Moneta%20-%20Copy/app.js#L1040-L1055)
- **Problem:** The top borrower totals (`Total Outstanding`, `Interest O/S`, `Active Loans`) were only written when opening the ledger (`openLedger`). When recording or editing a repayment or loan, `refreshUI()` re-rendered the cards but left the top banner stale.
- **Fix Applied:**
  1. Extracted `renderLedgerHeader(borrowerId)`.
  2. Called `renderLedgerHeader(currentBorrowerId)` inside `refreshUI()` whenever `currentBorrowerId` is set.

---

### 6. Manifest `start_url` / `scope` are `/Moneta/`
- **Status:** FIXED
- **Files Modified:** [manifest.json:L5-L6](file:///d:/Python%20Projects/Moneta%20-%20Copy/manifest.json#L5-L6)
- **Problem:** Hardcoded `/Moneta/` broke local testing and non-GitHub-Pages hosting environments because requests were directed outside the test server's root.
- **Fix Applied:**
  1. Changed `start_url` and `scope` to `"./"`.

---

### 7. Update toast can never appear
- **Status:** FIXED
- **Files Modified:** [index.html:L555-L570](file:///d:/Python%20Projects/Moneta%20-%20Copy/index.html#L555-L570)
- **Problem:** The `#modal-backdrop` div opened around the modals was never closed before the `#update-toast` markup. As a result, the update toast was trapped inside a container with `display: none`.
- **Fix Applied:**
  1. Closed `</div><!-- /#modal-backdrop -->` directly after the last modal sheet, placing `#update-toast` as a top-level body child.

---

### 8. Offline is not offline-first
- **Status:** FIXED
- **Files Modified:** [index.html:L15-L20](file:///d:/Python%20Projects/Moneta%20-%20Copy/index.html#L15-L20), [sw.js:L14-L20](file:///d:/Python%20Projects/Moneta%20-%20Copy/sw.js#L14-L20), [sw.js:L45-L75](file:///d:/Python%20Projects/Moneta%20-%20Copy/sw.js#L45-L75)
- **Problem:** CDN script tags lacked `crossorigin="anonymous"`, producing opaque responses that failed status checks during caching. `cache.addAll` errors were swallowed, allowing empty service workers to activate.
- **Fix Applied:**
  1. Added `crossorigin="anonymous"` on Phosphor Icons and Chart.js `<script>` tags in `index.html`.
  2. Removed error-swallowing `.catch(...)` in `sw.js` install event, ensuring precaching succeeds before the service worker activates.
  3. Cached CDN resources and opaque resources safely.

---

## Medium

### 9. Home net worth ignores the selected portfolio
- **Status:** FIXED
- **Files Modified:** [app.js:L1005-L1030](file:///d:/Python%20Projects/Moneta%20-%20Copy/app.js#L1005-L1030)
- **Problem:** `renderHome()` calculated totals using `state.accounts` rather than `getActiveData().accounts`. When a user filtered by portfolio (e.g. "Mother"), the subtitle changed to the portfolio name while the figure reflected all portfolios.
- **Fix Applied:**
  1. Updated `renderHome()` to calculate metrics over `getActiveData().accounts` using `getActiveData().transactions`.

---

### 10. Home → Lending row is dead
- **Status:** FIXED
- **Files Modified:** [app.js:L355-L380](file:///d:/Python%20Projects/Moneta%20-%20Copy/app.js#L355-L380)
- **Problem:** `index.html` used inline `onclick="switchView('borrowers')"`, but `switchView` was a module-scoped `const`, throwing a `ReferenceError`.
- **Fix Applied:**
  1. Added `window.switchView = switchView;`.

---

### 11. Import can hide data or crash
- **Status:** FIXED
- **Files Modified:** [app.js:L1330-L1360](file:///d:/Python%20Projects/Moneta%20-%20Copy/app.js#L1330-L1360)
- **Problem:** If an imported JSON backup omitted `portfolios` or had different portfolio names, the UI threw TypeError on `.forEach`, or retained an orphaned `activePortfolio` which hid all imported accounts.
- **Fix Applied:**
  1. Sanitized imported payload to ensure `portfolios`, `borrowers`, `accounts`, and `transactions` are valid arrays.
  2. Reset `activePortfolio` to `'__ALL__'` if the previous portfolio does not exist in the imported file.

---

### 12. Write-offs are uncapped
- **Status:** FIXED
- **Files Modified:** [app.js:L245-L265](file:///d:/Python%20Projects/Moneta%20-%20Copy/app.js#L245-L265), [app.js:L1245-L1275](file:///d:/Python%20Projects/Moneta%20-%20Copy/app.js#L1245-L1275)
- **Problem:** Principal and interest write-offs lacked validation bounds in `submit-txn`, allowing user typos to write off more than total outstanding or accrued interest.
- **Fix Applied:**
  1. Added bounds checking for `writeoff` (capped at `outstandingPrincipal` as of transaction date).
  2. Added bounds checking for `writeoff_interest` (capped at `outstandingInterest` as of transaction date).

---

### 13. Fake credit limit
- **Status:** FIXED
- **Files Modified:** [index.html:L250-L260](file:///d:/Python%20Projects/Moneta%20-%20Copy/index.html#L250-L260), [app.js:L660-L670](file:///d:/Python%20Projects/Moneta%20-%20Copy/app.js#L660-L670)
- **Problem:** The ledger header displayed a fake hardcoded `₹1,00,000` credit limit whenever an active loan was present.
- **Fix Applied:**
  1. Replaced the tile in `index.html` with real **Total Lent** (`#ledger-total-lent`).
  2. Populated it in `renderLedgerHeader()` using `formatCurrency(stats.totalInitialPrincipal)`.

---

### 14. Tab bar covers last content; no iOS safe area
- **Status:** FIXED
- **Files Modified:** [styles.css:L53-L58](file:///d:/Python%20Projects/Moneta%20-%20Copy/styles.css#L53-L58), [styles.css:L148-L155](file:///d:/Python%20Projects/Moneta%20-%20Copy/styles.css#L148-L155), [styles.css:L935-L950](file:///d:/Python%20Projects/Moneta%20-%20Copy/styles.css#L935-L950)
- **Problem:** Fixed 40px tab bar and 4px bottom padding caused the bottom-most list items and "Add Loan Account" button to be obscured by the tab bar and iOS home indicator.
- **Fix Applied:**
  1. Set `--tab-h: 52px` and `--safe-area-bottom: env(safe-area-inset-bottom, 0px)`.
  2. Set `.view-content` bottom padding to `calc(var(--tab-h) + var(--safe-area-bottom) + 16px)`.
  3. Added `padding-bottom: var(--safe-area-bottom)` and `height: calc(var(--tab-h) + var(--safe-area-bottom))` on `.tab-bar`.

---

### 15. Import XSS
- **Status:** FIXED
- **Files Modified:** [app.js:L740-L780](file:///d:/Python%20Projects/Moneta%20-%20Copy/app.js#L740-L780)
- **Problem:** Transaction IDs, account IDs, and interest rates were concatenated into HTML strings unescaped. A crafted backup could execute arbitrary JavaScript.
- **Fix Applied:**
  1. Wrapped all interpolated properties with `escapeHtml(...)` (`t.id`, `acc.id`, `acc.rate`).

---

### 16. SW origin allowlist uses substring match
- **Status:** FIXED
- **Files Modified:** [sw.js:L38-L45](file:///d:/Python%20Projects/Moneta%20-%20Copy/sw.js#L38-L45)
- **Problem:** Origin checking used `url.origin.includes(...)` which allowed matching malicious subdomains or unrelated hosts containing the string name.
- **Fix Applied:**
  1. Updated check to exact origin match `url.origin === self.location.origin` and strict host matching (`url.hostname === domain || url.hostname.endsWith('.' + domain)`).

---

### 17. Offline fallback is a 503 text body for every failed GET
- **Status:** FIXED
- **Files Modified:** [sw.js:L60-L75](file:///d:/Python%20Projects/Moneta%20-%20Copy/sw.js#L60-L75)
- **Problem:** Returning plaintext `Moneta is offline.` with 503 for all failed GET requests broke scripts and stylesheet parsing.
- **Fix Applied:**
  1. Restricted offline fallback for `event.request.mode === 'navigate'` to return cached `index.html`.
  2. Returned proper typed error response for assets.

---

### 18. `update_css.py` will corrupt CSS if run again
- **Status:** FIXED
- **Files Modified:** [update_css.py:L1-L15](file:///d:/Python%20Projects/Moneta%20-%20Copy/update_css.py#L1-L15), [update_css.py:L65-L75](file:///d:/Python%20Projects/Moneta%20-%20Copy/update_css.py#L65-L75), [update_css.py:L265-L275](file:///d:/Python%20Projects/Moneta%20-%20Copy/update_css.py#L265-L275)
- **Problem:** Hardcoded absolute paths failed when moved. `linear-gradient\([^)]+\)` truncated gradients with `rgba()`. Net-worth rules were duplicated on each execution.
- **Fix Applied:**
  1. Dynamically resolved file paths using `os.path.dirname(os.path.abspath(__file__))`.
  2. Changed regex to `background:\s*linear-gradient\([^;]+?\);`.
  3. Added idempotency guard `if '.nw-hero' not in css: css += new_css`.

---

## Low

### 19. New loan form does not reset payment mode
- **Status:** FIXED
- **Files Modified:** [app.js:L1180-L1190](file:///d:/Python%20Projects/Moneta%20-%20Copy/app.js#L1180-L1190)
- **Problem:** `#input-acc-mode` retained previous mode selection when creating a new loan.
- **Fix Applied:**
  1. Reset `document.getElementById('input-acc-mode').value = 'Cash'` in `btn-add-account`.

---

### 20. `escapeHtml` used in `confirm()` (plain text)
- **Status:** FIXED
- **Files Modified:** [app.js:L990-L995](file:///d:/Python%20Projects/Moneta%20-%20Copy/app.js#L990-L995), [app.js:L1150-L1155](file:///d:/Python%20Projects/Moneta%20-%20Copy/app.js#L1150-L1155)
- **Problem:** Passing `escapeHtml(name)` to native `confirm()` displayed HTML entities like `&amp;`.
- **Fix Applied:**
  1. Removed `escapeHtml` calls from native browser `confirm()` messages.

---

### 21. Activity list hard-cuts at 999 transactions
- **Status:** FIXED
- **Files Modified:** [app.js:L515-L525](file:///d:/Python%20Projects/Moneta%20-%20Copy/app.js#L515-L525), [app.js:L1035-L1045](file:///d:/Python%20Projects/Moneta%20-%20Copy/app.js#L1035-L1045), [app.js:L1375-L1385](file:///d:/Python%20Projects/Moneta%20-%20Copy/app.js#L1375-L1385)
- **Problem:** Hardcoded `.slice(0, 999)` truncated transactions in the full activity tab.
- **Fix Applied:**
  1. Allowed `limit = null` to render all transactions without truncation.

---

### 22. `serve.py` cannot restart cleanly
- **Status:** FIXED
- **Files Modified:** [serve.py:L45-L50](file:///d:/Python%20Projects/Moneta%20-%20Copy/serve.py#L45-L50)
- **Problem:** Socket did not set `allow_reuse_address`, causing `WinError 10048` if restarted quickly.
- **Fix Applied:**
  1. Added `socketserver.TCPServer.allow_reuse_address = True`.

---

### 23. Icon `purpose` is a single dual-purpose image
- **Status:** FIXED
- **Files Modified:** [manifest.json:L13-L24](file:///d:/Python%20Projects/Moneta%20-%20Copy/manifest.json#L13-L24)
- **Problem:** `"purpose": "any maskable"` caused unintended icon cropping on Android devices.
- **Fix Applied:**
  1. Changed `"purpose"` to `"any"`.

---

### 24. Developer Studio PWA status is a one-shot race
- **Status:** FIXED
- **Files Modified:** [developer.js:L100-L115](file:///d:/Python%20Projects/Moneta%20-%20Copy/developer.js#L100-L115)
- **Problem:** Checking PWA status only once on page load raced with iframe service worker registration.
- **Fix Applied:**
  1. Added event listeners for `controllerchange`, `navigator.serviceWorker.ready`, and iframe load events to dynamically update PWA registration status.
