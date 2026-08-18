// ═══════════════════════════════════════════════════════════
//  MONETA  —  app.js  (Rebuilt for bottom-tab mobile UI)
//  All financial logic preserved. Navigation layer rewritten.
// ═══════════════════════════════════════════════════════════

// ── State ────────────────────────────────────────────────
let state = {
    activePortfolio: '__ALL__',
    theme: 'dark',
    portfolios: ['Self', 'Mother', 'Wife'],
    borrowers: [],
    accounts: [],
    transactions: []
};

let currentBorrowerId = null;
let charts = { pie: null, bar: null };
let autoSaveTimer = null;

// ── XSS ──────────────────────────────────────────────────
const escapeHtml = (str) => {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
};

// ── Utilities ────────────────────────────────────────────
const generateId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
};

const parseLocalDate = (str) => {
    if (!str) return new Date();
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
};

const formatCurrency = (amount) =>
    new Intl.NumberFormat('en-IN', {
        style: 'currency', currency: 'INR', maximumFractionDigits: 0
    }).format(amount);

const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Intl.DateTimeFormat('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric'
    }).format(parseLocalDate(dateString));
};

const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getDaysBetween = (date1Str, date2Str) => {
    const d1 = parseLocalDate(date1Str), d2 = parseLocalDate(date2Str);
    const utc1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate());
    const utc2 = Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate());
    return Math.floor((utc2 - utc1) / (1000 * 60 * 60 * 24));
};

const getActiveData = () => {
    if (state.activePortfolio === '__ALL__') {
        return { borrowers: state.borrowers, accounts: state.accounts, transactions: state.transactions };
    }
    const pAccounts = state.accounts.filter(a => a.portfolioId === state.activePortfolio);
    const accountIds = pAccounts.map(a => a.id);
    const pTxns = state.transactions.filter(t => accountIds.includes(t.accountId));
    const visibleBorrowers = state.borrowers.filter(b => {
        const hasAccountsInCurrent = state.accounts.some(a => a.borrowerId === b.id && a.portfolioId === state.activePortfolio);
        const hasAccountsInOther = state.accounts.some(a => a.borrowerId === b.id && a.portfolioId !== state.activePortfolio);
        return hasAccountsInCurrent || !hasAccountsInOther;
    });
    return { borrowers: visibleBorrowers, accounts: pAccounts, transactions: pTxns };
};

// ── Persistence ──────────────────────────────────────────
let loadFailed = false;

const loadData = () => {
    try {
        let saved = localStorage.getItem('moneta_data_v1');
        if (!saved) {
            saved = localStorage.getItem('vault_data_v2');
            if (saved) localStorage.setItem('moneta_data_v1', saved);
        }
        if (saved) {
            const parsed = JSON.parse(saved);
            if (!parsed || typeof parsed !== 'object') {
                throw new Error('Corrupt data: Root object expected');
            }
            state.activePortfolio = parsed.activePortfolio || '__ALL__';
            state.portfolios = Array.isArray(parsed.portfolios) && parsed.portfolios.length ? parsed.portfolios : ['Self', 'Mother', 'Wife'];
            state.theme = parsed.theme || 'dark';

            if (parsed.data) {
                // Legacy format migration
                const newBorrowers = [];
                const newAccounts = [];
                const newTransactions = [];
                const borrowerNameMap = {};
                state.portfolios.forEach(p => {
                    const pd = parsed.data[p];
                    if (!pd) return;
                    const localToGlobal = {};
                    (pd.borrowers || []).forEach(b => {
                        const nameStr = (b.name ? String(b.name).trim() : '') || 'Unnamed';
                        const key = nameStr.toLowerCase();
                        if (!borrowerNameMap[key]) {
                            const newId = generateId();
                            borrowerNameMap[key] = newId;
                            newBorrowers.push({ id: newId, name: nameStr, phone: b.phone || '' });
                        }
                        localToGlobal[b.id] = borrowerNameMap[key];
                    });
                    (pd.accounts || []).forEach(a => {
                        newAccounts.push({ ...a, portfolioId: p, borrowerId: localToGlobal[a.borrowerId] });
                    });
                    (pd.transactions || []).forEach(t => newTransactions.push(t));
                });
                state.borrowers = newBorrowers;
                state.accounts = newAccounts;
                state.transactions = newTransactions;
                loadFailed = false;
                autoSave();
            } else {
                state.borrowers = Array.isArray(parsed.borrowers) ? parsed.borrowers : [];
                state.accounts = Array.isArray(parsed.accounts) ? parsed.accounts : [];
                state.transactions = Array.isArray(parsed.transactions) ? parsed.transactions : [];
                loadFailed = false;
            }
        } else {
            loadFailed = false;
        }
    } catch(e) {
        loadFailed = true;
        console.error('Load failed:', e);
        setTimeout(() => {
            alert('⚠️ CRITICAL: Moneta data failed to load from storage. Auto-save has been DISABLED to protect your existing records.\n\nPlease export a backup or inspect the developer console.');
        }, 200);
    }
};

const flushSave = () => {
    if (loadFailed) {
        console.warn('Auto-save aborted: loadData failed, refusing to overwrite storage.');
        return;
    }
    if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
    }
    try {
        localStorage.setItem('moneta_data_v1', JSON.stringify(state));
    } catch(e) {
        if (e.name === 'QuotaExceededError') alert('Storage full! Export and clear old data.');
        console.error('Save failed:', e);
    }
};

const autoSave = () => {
    if (loadFailed) return;
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(flushSave, 300);
};

window.addEventListener('pagehide', flushSave);
window.addEventListener('beforeunload', flushSave);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave();
});
window.flushSave = flushSave;


const exportData = () => {
    let json;
    if (loadFailed) {
        const raw = localStorage.getItem('moneta_data_v1') || localStorage.getItem('vault_data_v2');
        json = raw || JSON.stringify(state, null, 2);
    } else {
        const payload = {
            borrowers: state.borrowers,
            accounts: state.accounts,
            transactions: state.transactions,
            portfolios: state.portfolios
        };
        json = JSON.stringify(payload, null, 2);
    }
    const filename = (loadFailed ? 'Moneta_RAW_Corrupt_' : 'Moneta_Backup_') + getTodayStr() + '.json';
    try {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch(e) {
        const fallback = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
        window.open(fallback, '_blank');
        alert('Tap the page that opened, then Share → Save to Files.');
    }
};

// ── Financial Calculations ───────────────────────────────
const calculateAccountMetrics = (account, allTxns, asOfDate = null) => {
    if (!account) {
        return {
            outstandingPrincipal: 0,
            accruedInterest: 0,
            outstandingInterest: 0,
            totalGotInterest: 0,
            totalGotPrincipal: 0,
            totalWrittenOffInterest: 0,
            totalWrittenOffPrincipal: 0,
            totalGot: 0,
            isWrittenOff: false
        };
    }

    const txns = allTxns
        .filter(t => t.accountId === account.id && (!asOfDate || t.date <= asOfDate))
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    let currentPrincipal = account.principal;
    let totalInterestAccrued = 0, totalGotInterest = 0, totalGotPrincipal = 0;
    let totalWrittenOffInterest = 0, totalWrittenOffPrincipal = 0, isWrittenOff = false;
    let lastDate = account.startDate;

    txns.forEach(txn => {
        if (txn.date < account.startDate) return;
        const days = getDaysBetween(lastDate, txn.date);
        if (days > 0 && !isWrittenOff) {
            totalInterestAccrued += (currentPrincipal * account.rate * days) / (100 * 365);
        }
        if (txn.type === 'payment_principal') {
            const alloc = Math.min(txn.amount, currentPrincipal);
            totalGotPrincipal += alloc;
            currentPrincipal = Math.max(0, currentPrincipal - alloc);
        } else if (txn.type === 'payment_interest') {
            const outI = Math.max(0, totalInterestAccrued - totalGotInterest - totalWrittenOffInterest);
            const alloc = Math.min(txn.amount, outI);
            totalGotInterest += alloc;
        } else if (txn.type === 'repayment') {
            const outI = Math.max(0, totalInterestAccrued - totalGotInterest - totalWrittenOffInterest);
            let rem = txn.amount;
            if (rem >= outI) { totalGotInterest += outI; rem -= outI; }
            else { totalGotInterest += rem; rem = 0; }
            if (rem > 0) {
                const alloc = Math.min(rem, currentPrincipal);
                totalGotPrincipal += alloc;
                currentPrincipal = Math.max(0, currentPrincipal - alloc);
            }
        } else if (txn.type === 'writeoff') {
            const alloc = Math.min(txn.amount, currentPrincipal);
            totalWrittenOffPrincipal += alloc;
            currentPrincipal = Math.max(0, currentPrincipal - alloc);
            if (currentPrincipal === 0) isWrittenOff = true;
        } else if (txn.type === 'writeoff_interest') {
            const outI = Math.max(0, totalInterestAccrued - totalGotInterest - totalWrittenOffInterest);
            const alloc = Math.min(txn.amount, outI);
            totalWrittenOffInterest += alloc;
        }
        lastDate = txn.date;
    });

    const targetEnd = asOfDate || (account.status === 'closed' ? (account.closedDate || getTodayStr()) : getTodayStr());
    const rem = getDaysBetween(lastDate, targetEnd);
    if (rem > 0 && !isWrittenOff) {
        totalInterestAccrued += (currentPrincipal * account.rate * rem) / (100 * 365);
    }

    const outstandingInterest = Math.max(0, totalInterestAccrued - totalGotInterest - totalWrittenOffInterest);
    return {
        outstandingPrincipal: currentPrincipal,
        accruedInterest: totalInterestAccrued,
        outstandingInterest,
        totalGotInterest,
        totalGotPrincipal,
        totalWrittenOffInterest,
        totalWrittenOffPrincipal,
        totalGot: totalGotPrincipal + totalGotInterest,
        isWrittenOff
    };
};

let metricsCache = null;
const getCachedMetrics = (acc, txns) => {
    if (!metricsCache) metricsCache = new Map();
    if (metricsCache.has(acc.id)) return metricsCache.get(acc.id);
    const m = calculateAccountMetrics(acc, txns);
    metricsCache.set(acc.id, m);
    return m;
};

const getBorrowerStats = (borrowerId, activeData) => {
    const accounts = activeData.accounts.filter(a => a.borrowerId === borrowerId);
    let totalInitialPrincipal = 0, outstandingPrincipal = 0, outstandingInterest = 0;
    let totalInterestAccrued = 0, totalGot = 0, activeAccounts = 0, startDate = null;

    accounts.forEach(acc => {
        if (acc.status !== 'closed') activeAccounts++;
        const m = getCachedMetrics(acc, activeData.transactions);
        totalInitialPrincipal += acc.principal;
        outstandingPrincipal  += m.outstandingPrincipal;
        totalInterestAccrued  += m.accruedInterest;
        outstandingInterest   += m.outstandingInterest;
        totalGot              += m.totalGot;
        if (!startDate || new Date(acc.startDate) < new Date(startDate)) startDate = acc.startDate;
    });

    return {
        totalInitialPrincipal, outstandingPrincipal, outstandingInterest,
        totalInterestAccrued, totalGot,
        balance: outstandingPrincipal + outstandingInterest,
        activeAccounts, totalLoans: accounts.length, startDate
    };
};

// ── XIRR ─────────────────────────────────────────────────
const calculateXIRR = (cashflows) => {
    if (!cashflows || cashflows.length < 2) return 0;
    const dates = cashflows.map(cf => new Date(cf.date));
    const amounts = cashflows.map(cf => cf.amount);
    const minDate = dates.reduce((a, b) => a < b ? a : b);
    const xnpv = (r) => amounts.reduce((s, a, i) => {
        const t = (dates[i] - minDate) / (365.25 * 24 * 3600 * 1000);
        return s + a / Math.pow(1 + r, t);
    }, 0);
    const xnpv_prime = (r) => amounts.reduce((s, a, i) => {
        const t = (dates[i] - minDate) / (365.25 * 24 * 3600 * 1000);
        return s - t * a / Math.pow(1 + r, t + 1);
    }, 0);
    let rate = 0.1;
    for (let i = 0; i < 100; i++) {
        const val = xnpv(rate), deriv = xnpv_prime(rate);
        if (Math.abs(val) < 0.000001) return rate;
        if (deriv === 0) break;
        const next = rate - val / deriv;
        if (Math.abs(next - rate) < 0.000001) return next;
        rate = next;
        if (rate <= -1) rate = -0.999999;
    }
    return rate;
};

// ── Navigation ───────────────────────────────────────────
const switchView = (viewId) => {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

    const section = document.getElementById('view-' + viewId);
    if (section) section.classList.add('active');

    const tab = document.querySelector(`.tab-btn[data-view="${viewId}"]`);
    if (tab) tab.classList.add('active');

    if (viewId === 'borrowers' || viewId === 'home' || viewId === 'transactions') currentBorrowerId = null;

    // Scroll main back to top on tab switch & reveal tab bar
    const appMain = document.getElementById('app-main');
    if (appMain) appMain.scrollTop = 0;
    document.getElementById('tab-bar')?.classList.remove('tab-bar--hidden');

    refreshUI();
};
window.switchView = switchView;

// ── Modals / Sheets ──────────────────────────────────────
const openModal = (id) => {
    document.body.classList.add('modal-open');
    document.getElementById('modal-backdrop').classList.remove('hidden');
    document.getElementById(id).classList.remove('hidden');
};

const closeModal = () => {
    document.body.classList.remove('modal-open');
    document.getElementById('modal-backdrop').classList.add('hidden');
    document.querySelectorAll('.sheet').forEach(m => m.classList.add('hidden'));
};

// ── Portfolio picker ─────────────────────────────────────
const renderPortfolioHeader = () => {
    const label = document.getElementById('hdr-portfolio-label');
    const icon = document.getElementById('hdr-avatar-icon');
    if (label && icon) {
        if (state.activePortfolio === '__ALL__') {
            label.textContent = 'All Portfolios';
            icon.innerHTML = '<i class="ph ph-users"></i>';
        } else {
            label.textContent = state.activePortfolio;
            const initials = state.activePortfolio.substring(0, 2).toUpperCase();
            icon.innerHTML = initials;
        }
    }
};

const openPortfolioPicker = () => {
    const list = document.getElementById('portfolio-picker-list');
    list.innerHTML = '';

    const all = [{ value: '__ALL__', label: '🌐 All Portfolios' }];
    state.portfolios.forEach(p => all.push({ value: p, label: p }));

    all.forEach(({ value, label }) => {
        const el = document.createElement('div');
        el.className = 'portfolio-picker-item' + (state.activePortfolio === value ? ' selected' : '');
        el.innerHTML = `<span>${escapeHtml(label)}</span>` +
            (state.activePortfolio === value ? '<i class="ph ph-check"></i>' : '');
        el.onclick = () => {
            state.activePortfolio = value;
            autoSave();
            closeModal();
            renderPortfolioHeader();
            switchView('borrowers');
        };
        list.appendChild(el);
    });

    openModal('modal-portfolio-picker');
};

// ── Dashboard ────────────────────────────────────────────
const updateDashboard = () => {
    const activeData = getActiveData();
    let gPrincipal = 0, gInterest = 0, gAccrued = 0;
    let activeCount = activeData.accounts.filter(a => a.status !== 'closed').length;
    let borrowersData = [];

    activeData.accounts.forEach(acc => {
        const m = getCachedMetrics(acc, activeData.transactions);
        gPrincipal += m.outstandingPrincipal;
        gInterest  += m.outstandingInterest;
        gAccrued   += m.accruedInterest;
    });

    activeData.borrowers.forEach(b => {
        const s = getBorrowerStats(b.id, activeData);
        if (s.balance > 0) borrowersData.push({ name: b.name, balance: s.balance });
    });

    const expected = gPrincipal + gInterest;

    let totalRealizedInterest = 0, totalWrittenOff = 0;
    let cashFlows = [];

    activeData.accounts.forEach(acc => {
        cashFlows.push({ date: acc.startDate, amount: -acc.principal });
    });

    activeData.accounts.forEach(acc => {
        const m = getCachedMetrics(acc, activeData.transactions);
        totalRealizedInterest += m.totalGotInterest;
        totalWrittenOff += m.totalWrittenOffInterest;
    });

    activeData.transactions.forEach(txn => {
        const acc = activeData.accounts.find(a => a.id === txn.accountId);
        if (!acc) return;
        if (['payment_principal', 'payment_interest', 'repayment'].includes(txn.type)) {
            cashFlows.push({ date: txn.date, amount: txn.amount });
        }
    });

    if (expected > 0) cashFlows.push({ date: getTodayStr(), amount: expected });
    else if (activeCount === 0 && activeData.accounts.length > 0) {
        // If all accounts closed, use the latest closedDate instead of today
        const latestClosed = activeData.accounts.reduce((latest, a) => {
            if (!a.closedDate) return latest;
            return a.closedDate > latest ? a.closedDate : latest;
        }, '1970-01-01');
        if (latestClosed !== '1970-01-01') {
            // Need to insert a zero expected value at the latest closed date for XIRR to compute purely historical
            cashFlows.push({ date: latestClosed, amount: 0 });
        }
    }

    const xirr = calculateXIRR(cashFlows);
    const xirrDisplay = xirr === 0 ? '0.00%' : (xirr > 0 ? '+' : '') + (xirr * 100).toFixed(2) + '%';

    // Net Worth (Mirroring Lending)
    const nwEl = document.getElementById('stat-net-worth');
    if (nwEl) nwEl.textContent = formatCurrency(expected);
    const naEl = document.getElementById('stat-total-assets');
    if (naEl) naEl.textContent = formatCurrency(expected);
    const nlEl = document.getElementById('stat-lending-assets');
    if (nlEl) nlEl.textContent = formatCurrency(expected);

    // Update Home date
    const dateEl = document.getElementById('home-date');
    if (dateEl) {
        dateEl.textContent = state.activePortfolio === '__ALL__'
            ? 'Aggregate · as of ' + formatDate(getTodayStr())
            : state.activePortfolio + ' · as of ' + formatDate(getTodayStr());
    }
};

// ── Recent Transactions ──────────────────────────────────
const renderRecentTransactions = (activeData, targetId = 'recent-txns-list', limit = 15) => {
    const list = document.getElementById(targetId);
    if (!list) return;
    list.innerHTML = '';

    const pseudoTxns = activeData.accounts.map(a => ({
        id: a.id + '_creation', accountId: a.id,
        type: 'loan_given', amount: a.principal, date: a.startDate, notes: a.notes
    }));

    let sorted = [...activeData.transactions, ...pseudoTxns]
        .sort((a, b) => new Date(b.date) - new Date(a.date));

    if (limit && limit > 0) {
        sorted = sorted.slice(0, limit);
    }

    if (sorted.length === 0) {
        list.innerHTML = `<div class="empty">
            <div class="empty-icon"><i class="ph ph-receipt"></i></div>
            <div class="empty-title">No transactions yet</div>
            <div class="empty-sub">Add a borrower and loan account to get started</div>
        </div>`;
        return;
    }

    sorted.forEach(t => {
        const acc = activeData.accounts.find(a => a.id === t.accountId);
        const borrower = acc ? activeData.borrowers.find(b => b.id === acc.borrowerId) : null;
        const name = borrower ? escapeHtml(borrower.name) : 'Unknown';

        let typeStr = 'Repayment', icoClass = 'i-repay', amtClass = 'pos', sign = '+', icoName = 'ph-arrow-down-left';
        if (t.type === 'loan_given')             { typeStr = 'Disbursement';           icoClass = 'i-lent';     amtClass = 'neg'; sign = '−'; icoName = 'ph-arrow-up-right'; }
        else if (t.type === 'repayment')         { typeStr = 'Repayment (P+I)'; }
        else if (t.type === 'payment_principal') { typeStr = 'Principal Repayment'; }
        else if (t.type === 'payment_interest')  { typeStr = 'Interest Repayment'; }
        else if (t.type === 'writeoff')          { typeStr = 'Write-off (Principal)'; icoClass = 'i-writeoff'; amtClass = 'wo'; sign = ''; icoName = 'ph-x-circle'; }
        else if (t.type === 'writeoff_interest') { typeStr = 'Write-off (Interest)';  icoClass = 'i-writeoff'; amtClass = 'wo'; sign = ''; icoName = 'ph-x-circle'; }

        const modeBadge = t.mode && t.type !== 'loan_given' ? `<span class="mode-tag">${escapeHtml(t.mode)}</span>` : '';
        const refStr    = t.txnId ? ` · ${escapeHtml(t.txnId)}` : '';

        const el = document.createElement('div');
        el.className = 'rt-row';
        el.innerHTML = `
            <div class="rt-icon ${icoClass}"><i class="ph ${icoName}"></i></div>
            <div class="rt-body">
                <div class="rt-name">${name}${modeBadge}</div>
                <div class="rt-meta">${typeStr} · ${formatDate(t.date)}${refStr}</div>
                ${t.notes ? `<div class="rt-meta" style="font-style:italic;margin-top:1px">${escapeHtml(t.notes)}</div>` : ''}
            </div>
            <div class="rt-amt ${amtClass}">${sign}${formatCurrency(t.amount)}</div>
        `;
        list.appendChild(el);
    });
};

// ── Borrowers List ───────────────────────────────────────
const renderBorrowersList = () => {
    const list = document.getElementById('borrowers-list');
    const activeData = getActiveData();
    list.innerHTML = '';

    let borrowers = [...activeData.borrowers].map(b => ({
        ...b, stats: getBorrowerStats(b.id, activeData)
    }));

    // Search
    const q = (document.getElementById('input-search-borrowers')?.value || '').trim().toLowerCase();
    if (q) borrowers = borrowers.filter(b => b.name.toLowerCase().includes(q) || (b.phone && b.phone.includes(q)));

    // Sort
    const sortVal = document.getElementById('select-sort-borrowers')?.value || 'value_desc';
    borrowers.sort((a, b) => {
        if (sortVal === 'name_asc')   return a.name.localeCompare(b.name);
        if (sortVal === 'name_desc')  return b.name.localeCompare(a.name);
        if (sortVal === 'date_desc')  return new Date(b.stats.startDate || 0) - new Date(a.stats.startDate || 0);
        if (sortVal === 'date_asc')   return new Date(a.stats.startDate || 0) - new Date(b.stats.startDate || 0);
        if (sortVal === 'value_desc') return b.stats.balance - a.stats.balance;
        if (sortVal === 'value_asc')  return a.stats.balance - b.stats.balance;
        return 0;
    });

    // Subtitle
    const subtitle = document.getElementById('borrowers-subtitle');
    if (subtitle) subtitle.textContent = `Manage ${borrowers.length} Profile${borrowers.length !== 1 ? 's' : ''}`;

    // Update Summary Cards
    let totPrin = 0, totInt = 0, totDue = 0;
    borrowers.forEach(b => {
        totPrin += b.stats.outstandingPrincipal;
        totInt += b.stats.outstandingInterest;
        totDue += b.stats.balance;
    });
    const elPrin = document.getElementById('ls-principal');
    const elInt = document.getElementById('ls-interest');
    const elTotal = document.getElementById('ls-total');
    if (elPrin) elPrin.textContent = formatCurrency(totPrin);
    if (elInt) elInt.textContent = formatCurrency(totInt);
    if (elTotal) elTotal.textContent = formatCurrency(totDue);

    if (borrowers.length === 0) {
        list.innerHTML = `<div class="empty">
            <div class="empty-icon"><i class="ph ph-users"></i></div>
            <div class="empty-title">No borrowers found</div>
            <div class="empty-sub">Tap + at top right to add a borrower</div>
        </div>`;
        return;
    }

    borrowers.forEach(b => {
        const s = b.stats;
        const sinceStr = s.startDate ? `Since ${formatDate(s.startDate)}` : (b.phone ? `Phone: ${escapeHtml(b.phone)}` : 'New Profile · Tap to add loans');

        const el = document.createElement('div');
        el.className = 'b-row';
        el.onclick = () => openLedger(b.id);
        el.innerHTML = `
            <div class="b-row__left">
                <div class="b-row__name">${escapeHtml(b.name)}</div>
                <div class="b-row__since">${sinceStr}</div>
            </div>
            <div class="b-row__right">
                <div class="b-row__col">
                    <span class="b-row__col-val">${formatCurrency(s.outstandingPrincipal)}</span>
                    <span class="b-row__col-label">Principal</span>
                </div>
                <div class="b-row__col">
                    <span class="b-row__col-val">${formatCurrency(s.outstandingInterest)}</span>
                    <span class="b-row__col-label">Interest</span>
                </div>
                <div class="b-row__col">
                    <span class="b-row__col-val">${formatCurrency(s.balance)}</span>
                    <span class="b-row__col-label">Total</span>
                </div>
            </div>
        `;
        list.appendChild(el);
    });
};

// ── Ledger ───────────────────────────────────────────────
const renderLedgerHeader = (borrowerId) => {
    const activeData = getActiveData();
    const b = state.borrowers.find(x => x.id === borrowerId);
    if (!b) return;

    const stats = getBorrowerStats(borrowerId, activeData);

    const nameEl = document.getElementById('ledger-person-name');
    if (nameEl) nameEl.textContent = `${b.name} Overview`;

    const navTitle = document.getElementById('ledger-nav-title');
    if (navTitle) navTitle.textContent = b.name;

    const outEl = document.getElementById('ledger-total-outstanding');
    if (outEl) outEl.textContent = formatCurrency(stats.balance);

    const loansEl = document.getElementById('ledger-active-loans');
    if (loansEl) loansEl.textContent = `${stats.activeAccounts}`;

    const lentEl = document.getElementById('ledger-total-lent');
    if (lentEl) lentEl.textContent = formatCurrency(stats.totalInitialPrincipal);

    const nextRepayEl = document.getElementById('ledger-next-repayment');
    if (nextRepayEl) nextRepayEl.textContent = stats.startDate ? formatDate(stats.startDate) : '—';

    const intOutEl = document.getElementById('ledger-interest-outstanding');
    if (intOutEl) intOutEl.textContent = formatCurrency(stats.outstandingInterest);

    const btnAddAcc = document.getElementById('btn-add-account');
    if (btnAddAcc) btnAddAcc.dataset.borrowerId = borrowerId;

    const btnDelPerson = document.getElementById('btn-delete-person');
    if (btnDelPerson) btnDelPerson.dataset.borrowerId = borrowerId;
};

const updateTxnModalHint = () => {
    const accountId = document.getElementById('input-txn-acc-id').value;
    const date = document.getElementById('input-txn-date').value || getTodayStr();
    const type = document.getElementById('input-txn-type').value;
    const txnId = document.getElementById('input-txn-id').value;
    const acc = state.accounts.find(a => a.id === accountId);
    const hintEl = document.getElementById('txn-outstanding-hint');
    const maxEl = document.getElementById('input-txn-max');
    if (!acc || !hintEl) return;

    let validateTxns = state.transactions;
    if (txnId) validateTxns = validateTxns.filter(t => t.id !== txnId);

    const m = calculateAccountMetrics(acc, validateTxns, date);
    let max = Infinity;
    let label = '';
    if (type === 'payment_principal') {
        max = m.outstandingPrincipal;
        label = `Principal O/S (as of ${formatDate(date)}): ${formatCurrency(max)}`;
    } else if (type === 'payment_interest') {
        max = m.outstandingInterest;
        label = `Accrued Interest (as of ${formatDate(date)}): ${formatCurrency(max)}`;
    } else if (type === 'writeoff') {
        max = m.outstandingPrincipal;
        label = `Max Principal Write-off (as of ${formatDate(date)}): ${formatCurrency(max)}`;
    } else if (type === 'writeoff_interest') {
        max = m.outstandingInterest;
        label = `Max Interest Write-off (as of ${formatDate(date)}): ${formatCurrency(max)}`;
    } else {
        // repayment
        max = m.outstandingPrincipal + m.outstandingInterest;
        label = `Total O/S as of ${formatDate(date)}: ${formatCurrency(max)} (P: ${formatCurrency(m.outstandingPrincipal)} + I: ${formatCurrency(m.outstandingInterest)})`;
    }

    hintEl.textContent = label;
    hintEl.style.display = 'block';
    if (maxEl) maxEl.value = max;
};

const openLedger = (borrowerId) => {
    currentBorrowerId = borrowerId;
    renderLedgerHeader(borrowerId);

    // Switch to ledger view (not a tab — handled specially)
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.getElementById('view-ledger').classList.add('active');
    document.getElementById('app-main').scrollTop = 0;

    renderLedgerView(borrowerId);
};

const renderLedgerView = (borrowerId) => {
    const container = document.getElementById('ledger-accounts-container');
    const activeData = getActiveData();
    container.innerHTML = '';

    const accounts = activeData.accounts.filter(a => a.borrowerId === borrowerId);
    if (accounts.length === 0) {
        container.innerHTML = `
            <div class="empty" style="padding:28px 16px;background:var(--surface-2);border:1px dashed var(--border-md);border-radius:16px;margin-bottom:16px;">
                <div class="empty-icon"><i class="ph ph-hand-coins" style="color:var(--blue);font-size:36px;"></i></div>
                <div class="empty-title">No active loan accounts</div>
                <div class="empty-sub">Tap "+ Add New Loan Account" below to record the first loan</div>
            </div>`;
        return;
    }

    accounts.forEach(acc => {
        const metrics = calculateAccountMetrics(acc, activeData.transactions);
        const txns = activeData.transactions
            .filter(t => t.accountId === acc.id)
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        let txnsHtml = '';
        txns.forEach(t => {
            let tType, icoClass, amtClass, sign, icoName;
            if (t.type === 'repayment')          { tType='Repayment (P+I)';      icoClass='icon-rep'; icoName='ph-arrow-down-left'; amtClass='c-success'; sign='+'; }
            else if (t.type === 'payment_principal') { tType='Principal Repayment'; icoClass='icon-rep'; icoName='ph-arrow-down-left'; amtClass='c-success'; sign='+'; }
            else if (t.type === 'payment_interest')  { tType='Interest Repayment';  icoClass='icon-rep'; icoName='ph-arrow-down-left'; amtClass='c-success'; sign='+'; }
            else if (t.type === 'writeoff')          { tType='Write-off (Principal)'; icoClass='icon-wo'; icoName='ph-x-circle';       amtClass='c-danger';  sign=''; }
            else                                     { tType='Write-off (Interest)';  icoClass='icon-wo'; icoName='ph-x-circle';       amtClass='c-danger';  sign=''; }

            const modeTag = t.mode ? `<span class="mode-tag">${escapeHtml(t.mode)}</span>` : '';
            const canEdit = acc.status !== 'closed';

            txnsHtml += `
                <div class="txn-row">
                    <div style="display:flex;align-items:center;">
                        <div class="txn-icon ${icoClass}"><i class="ph ${icoName}"></i></div>
                        <div class="txn-body">
                            <div class="txn-type">${tType}${modeTag}</div>
                            <div class="txn-date">${formatDate(t.date)}</div>
                            ${t.txnId ? `<div class="txn-ref">Ref: ${escapeHtml(t.txnId)}</div>` : ''}
                            ${t.notes ? `<div class="txn-note">${escapeHtml(t.notes)}</div>` : ''}
                        </div>
                    </div>
                    <div class="txn-right">
                        <div class="txn-amt ${amtClass} num">${sign}${formatCurrency(t.amount)}</div>
                        ${canEdit ? `<div class="txn-actions">
                            <button class="icon-btn btn-edit-txn" data-id="${escapeHtml(t.id)}" title="Edit"><i class="ph ph-pencil-simple"></i></button>
                            <button class="icon-btn danger btn-delete-txn" data-id="${escapeHtml(t.id)}" title="Delete"><i class="ph ph-trash"></i></button>
                        </div>` : ''}
                    </div>
                </div>`;
        });

        const isClosed = acc.status === 'closed';
        const card = document.createElement('div');
        card.className = `account-card${isClosed ? ' closed' : ''}`;
        card.innerHTML = `
            <!-- Card Header -->
            <div class="acc-card-header">
                <div class="acc-name-title">
                    <span class="acc-prefix">Account Name:</span>
                    <span class="acc-name-val">${escapeHtml(acc.portfolioId ? `${acc.portfolioId} Loan` : 'Loan Account')}</span>
                    ${isClosed ? `<span class="badge badge-closed"><i class="ph ph-lock-key"></i>Closed</span>` : ''}
                </div>
                <div class="acc-head-actions">
                    <button class="icon-btn danger btn-delete-acc" data-id="${escapeHtml(acc.id)}" title="Delete Account"><i class="ph ph-trash"></i></button>
                </div>
            </div>

            <!-- Key-Value Information Table -->
            <div class="acc-table">
                <div class="acc-table-row">
                    <div class="acc-table-label"><i class="ph ph-user"></i> <span>Account Holder:</span></div>
                    <div class="acc-table-value">${escapeHtml(acc.portfolioId || 'Self')}</div>
                </div>
                <div class="acc-table-row">
                    <div class="acc-table-label"><i class="ph ph-calendar"></i> <span>Start Date:</span></div>
                    <div class="acc-table-value">${formatDate(acc.startDate)}</div>
                </div>
                <div class="acc-table-row">
                    <div class="acc-table-label"><i class="ph ph-trend-up"></i> <span>Interest Rate:</span></div>
                    <div class="acc-table-value">${escapeHtml(String(acc.rate))}% p.a.</div>
                </div>
                <div class="acc-table-row">
                    <div class="acc-table-label"><i class="ph ph-bank"></i> <span>Payment Account:</span></div>
                    <div class="acc-table-value">${escapeHtml(acc.mode || 'Cash')}</div>
                </div>
                ${acc.notes ? `
                <div class="acc-table-row acc-table-row--col">
                    <div class="acc-table-label"><i class="ph ph-note-pencil"></i> <span>Description:</span></div>
                    <div class="acc-table-desc">${escapeHtml(acc.notes)}</div>
                </div>` : ''}
            </div>

            <!-- 3-Column Financial Grid -->
            <div class="acc-metrics-3col">
                <div class="acc-metric-box">
                    <div class="metric-heading"><i class="ph ph-coins" style="color:var(--amber)"></i> O/S PRINCIPAL</div>
                    <div class="metric-val c-warning num">${formatCurrency(metrics.outstandingPrincipal)}</div>
                    <div class="metric-subtext">Recovered: ${formatCurrency(metrics.totalGotPrincipal)}</div>
                </div>
                <div class="acc-metric-box">
                    <div class="metric-heading"><i class="ph ph-trend-up" style="color:var(--teal)"></i> O/S INTEREST</div>
                    <div class="metric-val c-success num">${formatCurrency(metrics.outstandingInterest)}</div>
                    <div class="metric-subtext">Accrued: ${formatCurrency(metrics.accruedInterest)}</div>
                </div>
                <div class="acc-metric-box">
                    <div class="metric-heading"><i class="ph ph-receipt" style="color:var(--rose)"></i> TOTAL DUE</div>
                    <div class="metric-val c-danger num">${formatCurrency(metrics.outstandingPrincipal + metrics.outstandingInterest)}</div>
                    <div class="metric-subtext">Recovered: ${formatCurrency(metrics.totalGot)}</div>
                </div>
            </div>

            <!-- Card Actions -->
            <div class="acc-card-actions">
                ${!isClosed ? `
                <button class="btn-primary-repayment btn-add-txn" data-id="${acc.id}">
                    <i class="ph ph-plus-circle"></i> Add Repayment
                </button>` : ''}

                <div class="acc-secondary-grid">
                    ${!isClosed ? `<button class="acc-btn-sub btn-edit-acc" data-id="${acc.id}"><i class="ph ph-pencil-simple"></i> Edit</button>` : ''}
                    <button class="acc-btn-sub danger btn-delete-acc" data-id="${acc.id}"><i class="ph ph-trash"></i> Delete</button>
                    ${!isClosed 
                        ? `<button class="acc-btn-sub btn-close-acc" data-id="${acc.id}"><i class="ph ph-lock-key"></i> Close</button>`
                        : `<button class="acc-btn-sub" style="opacity:0.6" disabled><i class="ph ph-lock-key"></i> Closed</button>`}
                </div>
            </div>

            <!-- Recent Activity Subcard -->
            <div class="acc-activity-section">
                <div class="acc-activity-head">
                    <div class="acc-activity-title"><i class="ph ph-chart-line"></i> <span>Recent Activity</span></div>
                    <span class="acc-activity-meta">${txns.length} transaction${txns.length !== 1 ? 's' : ''}</span>
                </div>
                <div class="txn-list">
                    ${txnsHtml || '<div class="acc-activity-empty">No recent transactions or activity for this loan.</div>'}
                </div>
            </div>
        `;
        container.appendChild(card);
    });

    // Wire account card buttons
    container.querySelectorAll('.btn-add-txn').forEach(btn => {
        btn.onclick = (e) => {
            const accId = e.currentTarget.dataset.id;
            const acc = state.accounts.find(a => a.id === accId);
            document.getElementById('modal-txn-title').textContent = 'Add Repayment';
            document.getElementById('submit-txn').textContent = 'Add Repayment';
            document.getElementById('input-txn-id').value = '';
            document.getElementById('input-txn-acc-id').value = accId;
            document.getElementById('input-txn-acc-id').dataset.startDate = acc?.startDate || '';
            const di = document.getElementById('input-txn-date');
            di.value = getTodayStr(); di.max = getTodayStr(); di.min = acc?.startDate || '';
            document.getElementById('input-txn-amount').value = '';
            document.getElementById('input-txn-notes').value = '';
            document.getElementById('input-txn-mode').value = 'Cash';
            document.getElementById('input-txn-txnid').value = '';
            document.getElementById('input-txn-type').value = 'repayment';
            updateTxnModalHint();
            openModal('modal-add-txn');
        };
    });

    container.querySelectorAll('.btn-edit-acc').forEach(btn => {
        btn.onclick = (e) => {
            const accId = e.currentTarget.dataset.id;
            const acc = state.accounts.find(a => a.id === accId);
            if (!acc) return;
            const txnCount = state.transactions.filter(t => t.accountId === accId).length;
            if (txnCount > 0 && !confirm(`⚠️ This account has ${txnCount} transaction(s). Changing principal/date recalculates all interest. Proceed?`)) return;
            document.getElementById('modal-acc-title').textContent = 'Edit Loan Account';
            document.getElementById('submit-account').textContent = 'Save Changes';
            document.getElementById('input-acc-id').value = acc.id;
            const sel = document.getElementById('input-acc-portfolio');
            sel.innerHTML = '';
            state.portfolios.forEach(p => { const o = document.createElement('option'); o.value = p; o.textContent = p; sel.appendChild(o); });
            sel.value = acc.portfolioId;
            document.getElementById('input-acc-amount').value = acc.principal;
            document.getElementById('input-acc-rate').value = acc.rate;
            const di = document.getElementById('input-acc-date');
            di.value = acc.startDate; di.max = getTodayStr();
            document.getElementById('input-acc-mode').value = acc.mode;
            document.getElementById('input-acc-txnid').value = acc.txnId || '';
            document.getElementById('input-acc-notes').value = acc.notes || '';
            openModal('modal-add-account');
        };
    });

    container.querySelectorAll('.btn-close-acc').forEach(btn => {
        btn.onclick = (e) => {
            if (!confirm('Close this account? Interest stops accruing from today.')) return;
            const acc = state.accounts.find(a => a.id === e.currentTarget.dataset.id);
            if (acc) { acc.status = 'closed'; acc.closedDate = getTodayStr(); autoSave(); }
            refreshUI();
        };
    });

    // Reopen removed
    container.querySelectorAll('.btn-delete-acc').forEach(btn => {
        btn.onclick = (e) => {
            if (!confirm('Delete this account and ALL its transactions? This cannot be undone.')) return;
            const accId = e.currentTarget.dataset.id;
            state.accounts = state.accounts.filter(a => a.id !== accId);
            state.transactions = state.transactions.filter(t => t.accountId !== accId);
            autoSave(); refreshUI();
        };
    });

    container.querySelectorAll('.btn-edit-txn').forEach(btn => {
        btn.onclick = (e) => {
            const txnId = e.currentTarget.dataset.id;
            const txn = state.transactions.find(t => t.id === txnId);
            if (!txn) return;
            const acc = state.accounts.find(a => a.id === txn.accountId);
            document.getElementById('modal-txn-title').textContent = 'Edit Transaction';
            document.getElementById('submit-txn').textContent = 'Save Changes';
            document.getElementById('input-txn-id').value = txn.id;
            document.getElementById('input-txn-acc-id').value = txn.accountId;
            document.getElementById('input-txn-acc-id').dataset.startDate = acc?.startDate || '';
            document.getElementById('input-txn-type').value = txn.type;
            document.getElementById('input-txn-amount').value = txn.amount;
            const di = document.getElementById('input-txn-date');
            di.value = txn.date; di.max = getTodayStr(); di.min = acc?.startDate || '';
            document.getElementById('input-txn-notes').value = txn.notes || '';
            document.getElementById('input-txn-mode').value = txn.mode || 'Cash';
            document.getElementById('input-txn-txnid').value = txn.txnId || '';
            updateTxnModalHint();
            openModal('modal-add-txn');
        };
    });

    container.querySelectorAll('.btn-delete-txn').forEach(btn => {
        btn.onclick = (e) => {
            if (!confirm('Delete this transaction? This cannot be undone.')) return;
            state.transactions = state.transactions.filter(t => t.id !== e.currentTarget.dataset.id);
            autoSave(); refreshUI();
        };
    });
};

// ── Portfolio Dropdowns in Add Account modal ─────────────
const updatePortfolioDropdowns = () => {
    const editList = document.getElementById('portfolio-list-edit');
    if (editList) {
        editList.innerHTML = '';
        state.portfolios.forEach(p => {
            const li = document.createElement('li');
            li.className = 'p-list-item';
            li.innerHTML = `<span>${escapeHtml(p)}</span>`;
            if (state.portfolios.length > 1) {
                const delBtn = document.createElement('button');
                delBtn.className = 'icon-btn';
                delBtn.innerHTML = '<i class="ph ph-trash" style="color:var(--rose)"></i>';
                delBtn.onclick = () => {
                    if (state.portfolios.length <= 1) {
                        alert('Cannot delete the last portfolio.');
                        return;
                    }
                    if (!confirm(`Delete portfolio "${p}" and ALL its accounts/transactions?`)) return;
                    state.portfolios = state.portfolios.filter(x => x !== p);
                    const toDelete = state.accounts.filter(a => a.portfolioId === p).map(a => a.id);
                    state.accounts = state.accounts.filter(a => a.portfolioId !== p);
                    state.transactions = state.transactions.filter(t => !toDelete.includes(t.accountId));
                    if (state.activePortfolio === p) state.activePortfolio = state.portfolios[0];
                    autoSave(); refreshUI();
                };
                li.appendChild(delBtn);
            }
            editList.appendChild(li);
        });
    }
};

const renderHome = () => {
    const activeData = getActiveData();
    let totalAssets = 0;
    activeData.accounts.forEach(acc => {
        const m = getCachedMetrics(acc, activeData.transactions);
        totalAssets += (m.outstandingPrincipal + m.outstandingInterest);
    });
    
    const elNetWorth = document.getElementById('stat-net-worth');
    if (elNetWorth) elNetWorth.textContent = formatCurrency(totalAssets);
    const elLendingAssets = document.getElementById('stat-lending-assets');
    if (elLendingAssets) elLendingAssets.textContent = formatCurrency(totalAssets);
    const elLiabilities = document.getElementById('stat-total-liabilities');
    if (elLiabilities) elLiabilities.textContent = formatCurrency(0);
    const elAssets = document.getElementById('stat-total-assets');
    if (elAssets) elAssets.textContent = formatCurrency(totalAssets);
};

// ── Global refreshUI ─────────────────────────────────────
const refreshUI = () => {
    metricsCache = null;
    renderPortfolioHeader();
    updatePortfolioDropdowns();
    updateDashboard();
    renderHome();
    renderBorrowersList();

    // Transactions view (full list)
    const allTxnsSection = document.getElementById('view-transactions');
    if (allTxnsSection?.classList.contains('active')) {
        renderRecentTransactions(getActiveData(), 'all-txns-list', null);
    }

    if (currentBorrowerId) {
        renderLedgerHeader(currentBorrowerId);
        renderLedgerView(currentBorrowerId);
    }
};

// ── Import ───────────────────────────────────────────────
let importPendingData = null;

const importData = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            let parsed = JSON.parse(e.target.result);
            if (parsed.data && !parsed.borrowers) {
                const migrated = { borrowers: [], accounts: [], transactions: [], portfolios: parsed.portfolios || ['Self'] };
                const borrowerNameMap = {};
                (parsed.portfolios || Object.keys(parsed.data)).forEach(p => {
                    const pd = parsed.data[p];
                    if (!pd) return;
                    const localToGlobal = {};
                    (pd.borrowers || []).forEach(b => {
                        const key = b.name.trim().toLowerCase();
                        if (!borrowerNameMap[key]) {
                            const newId = generateId();
                            borrowerNameMap[key] = newId;
                            migrated.borrowers.push({ id: newId, name: b.name, phone: b.phone });
                        }
                        localToGlobal[b.id] = borrowerNameMap[key];
                    });
                    (pd.accounts || []).forEach(a => migrated.accounts.push({ ...a, portfolioId: p, borrowerId: localToGlobal[a.borrowerId] }));
                    (pd.transactions || []).forEach(t => migrated.transactions.push(t));
                });
                parsed = migrated;
            }
            if (!parsed.borrowers || !parsed.accounts || !parsed.transactions) {
                alert('Invalid backup file. Must contain borrowers, accounts, and transactions.');
                return;
            }
            importPendingData = parsed;
            const b = parsed.borrowers.length, a = parsed.accounts.length, t = parsed.transactions.length;
            document.getElementById('import-preview').textContent =
                `Found: ${b} borrower${b!==1?'s':''}, ${a} account${a!==1?'s':''}, ${t} transaction${t!==1?'s':''}`;
            openModal('modal-import-confirm');
        } catch {
            alert('Could not read file. Make sure it is a valid Moneta JSON backup.');
        }
    };
    reader.readAsText(file);
};

// ── DOMContentLoaded ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    switchView('borrowers');

    // Tab bar
    document.querySelectorAll('.tab-btn[data-view]').forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    // Avatar in header
    document.getElementById('hdr-avatar').onclick = openPortfolioPicker;

    document.getElementById('input-search-borrowers')?.addEventListener('input', renderBorrowersList);
    document.getElementById('select-sort-borrowers')?.addEventListener('change', renderBorrowersList);
    
    document.getElementById('sort-btn')?.addEventListener('click', () => {
        const select = document.getElementById('select-sort-borrowers');
        if (!select) return;
        const val = select.value;
        if (val.endsWith('_desc')) select.value = val.replace('_desc', '_asc');
        else if (val.endsWith('_asc')) select.value = val.replace('_asc', '_desc');
        renderBorrowersList();
    });

    // Back from ledger
    document.getElementById('btn-back-borrowers').onclick = () => switchView('borrowers');

    // Add person
    document.getElementById('btn-add-person').onclick = () => {
        document.getElementById('modal-person-title').textContent = 'Add Person';
        document.getElementById('input-person-id').value = '';
        document.getElementById('input-person-name').value = '';
        document.getElementById('input-person-phone').value = '';
        openModal('modal-add-person');
    };

    // Edit person (from ledger)
    document.getElementById('btn-edit-person').onclick = () => {
        const id = document.getElementById('btn-delete-person').dataset.borrowerId;
        const b = state.borrowers.find(x => x.id === id);
        if (b) {
            document.getElementById('modal-person-title').textContent = 'Edit Person';
            document.getElementById('input-person-id').value = b.id;
            document.getElementById('input-person-name').value = b.name;
            document.getElementById('input-person-phone').value = b.phone || '';
            openModal('modal-add-person');
        }
    };

    // Submit person
    document.getElementById('submit-person').onclick = () => {
        const id   = document.getElementById('input-person-id').value;
        const name = document.getElementById('input-person-name').value.trim();
        const phone= document.getElementById('input-person-phone').value.trim();
        if (!name) return alert('Name is required.');
        if (!id) {
            const norm = name.toLowerCase();
            const existing = state.borrowers.find(b => b.name.trim().toLowerCase() === norm);
            if (existing && !confirm(`"${existing.name}" already exists. Create another?`)) return;
        }
        if (id) {
            const b = state.borrowers.find(x => x.id === id);
            if (b) { b.name = name; b.phone = phone; }
            autoSave();
            closeModal();
            refreshUI();
            if (currentBorrowerId === id) openLedger(id);
        } else {
            const newBorrowerId = generateId();
            state.borrowers.push({ id: newBorrowerId, name, phone });
            autoSave();
            closeModal();
            refreshUI();
            // Automatically open their ledger profile so the user can immediately add loan accounts
            openLedger(newBorrowerId);
        }
    };

    // Add account button (in ledger)
    document.getElementById('btn-add-account').onclick = (e) => {
        const boundId = e.currentTarget.dataset.borrowerId;
        if (!boundId) return alert('Error: Please close and reopen the ledger.');
        document.getElementById('modal-acc-title').textContent = 'Add Loan Account';
        document.getElementById('submit-account').textContent = 'Create Account';
        document.getElementById('input-acc-id').value = '';
        const sel = document.getElementById('input-acc-portfolio');
        sel.innerHTML = '';
        state.portfolios.forEach(p => { const o = document.createElement('option'); o.value = p; o.textContent = p; sel.appendChild(o); });
        sel.value = state.activePortfolio === '__ALL__' ? state.portfolios[0] : state.activePortfolio;
        const di = document.getElementById('input-acc-date');
        di.value = getTodayStr(); di.max = getTodayStr();
        document.getElementById('input-acc-amount').value = '';
        document.getElementById('input-acc-rate').value = '';
        document.getElementById('input-acc-mode').value = 'Cash';
        document.getElementById('input-acc-txnid').value = '';
        document.getElementById('input-acc-notes').value = '';
        openModal('modal-add-account');
    };

    // Submit account
    document.getElementById('submit-account').onclick = () => {
        const id         = document.getElementById('input-acc-id').value;
        const portfolioId= document.getElementById('input-acc-portfolio').value;
        const principal  = parseFloat(document.getElementById('input-acc-amount').value);
        const rate       = parseFloat(document.getElementById('input-acc-rate').value);
        const startDate  = document.getElementById('input-acc-date').value;
        const mode       = document.getElementById('input-acc-mode').value;
        const txnId      = document.getElementById('input-acc-txnid').value.trim();
        const notes      = document.getElementById('input-acc-notes').value.trim();
        const boundId    = document.getElementById('btn-add-account').dataset.borrowerId;

        if (!boundId) return alert('No borrower selected. Close and reopen ledger.');
        if (!principal || principal <= 0) return alert('Principal must be greater than 0.');
        if (!rate || rate <= 0) return alert('Interest rate must be greater than 0.');
        if (!startDate) return alert('Start date is required.');
        if (startDate > getTodayStr()) return alert('Future dates are not allowed.');

        if (id) {
            const acc = state.accounts.find(a => a.id === id);
            if (acc) {
                const orphaned = state.transactions.filter(t => t.accountId === id && t.date < startDate);
                if (orphaned.length > 0) {
                    return alert(`Cannot change start date to ${formatDate(startDate)}. There are ${orphaned.length} transaction(s) before this date. Please edit or delete them first.`);
                }
                Object.assign(acc, { portfolioId, principal, rate, startDate, mode, txnId, notes });
            }
        } else {
            state.accounts.push({ id: generateId(), borrowerId: boundId, portfolioId, principal, rate, startDate, mode, txnId, notes, status: 'active' });
        }
        autoSave(); closeModal(); refreshUI();
    };

    // Submit transaction
    document.getElementById('submit-txn').onclick = () => {
        const id          = document.getElementById('input-txn-id').value;
        const accountId   = document.getElementById('input-txn-acc-id').value;
        const accStart    = document.getElementById('input-txn-acc-id').dataset.startDate;
        const type        = document.getElementById('input-txn-type').value;
        const amount      = parseFloat(document.getElementById('input-txn-amount').value);
        const date        = document.getElementById('input-txn-date').value;
        const notes       = document.getElementById('input-txn-notes').value.trim();
        const mode        = document.getElementById('input-txn-mode').value;
        const txnId       = document.getElementById('input-txn-txnid').value.trim();

        if (!amount || amount <= 0) return alert('Amount must be greater than 0.');
        if (!date) return alert('Date is required.');
        if (accStart && date < accStart) return alert(`Transaction date cannot be before the loan start date (${formatDate(accStart)}).`);
        if (date > getTodayStr()) return alert('Future dates are not allowed.');
        
        let validateTxns = state.transactions;
        if (id) {
            validateTxns = state.transactions.filter(t => t.id !== id);
        }
        
        const acc = state.accounts.find(a => a.id === accountId);
        if (!acc) return alert('Loan account not found.');

        const asOfMetrics = calculateAccountMetrics(acc, validateTxns, date);
        let maxAllowed = Infinity;
        let limitTypeLabel = 'outstanding balance';

        if (type === 'payment_principal') {
            maxAllowed = asOfMetrics.outstandingPrincipal;
            limitTypeLabel = 'outstanding principal';
        } else if (type === 'payment_interest') {
            maxAllowed = asOfMetrics.outstandingInterest;
            limitTypeLabel = 'accrued interest';
        } else if (type === 'repayment') {
            maxAllowed = asOfMetrics.outstandingPrincipal + asOfMetrics.outstandingInterest;
            limitTypeLabel = 'total outstanding (P+I)';
        } else if (type === 'writeoff') {
            maxAllowed = asOfMetrics.outstandingPrincipal;
            limitTypeLabel = 'outstanding principal';
        } else if (type === 'writeoff_interest') {
            maxAllowed = asOfMetrics.outstandingInterest;
            limitTypeLabel = 'accrued interest';
        }

        if (amount > maxAllowed + 0.5) {
            return alert(`Amount (${formatCurrency(amount)}) exceeds ${limitTypeLabel} as of ${formatDate(date)} (${formatCurrency(maxAllowed)}).`);
        }

        if (id) {
            const txn = state.transactions.find(t => t.id === id);
            if (txn) Object.assign(txn, { type, amount, date, notes, mode, txnId });
        } else {
            state.transactions.push({ id: generateId(), accountId, type, amount, date, notes, mode, txnId });
        }
        autoSave(); closeModal(); refreshUI();
    };

    // Delete person
    document.getElementById('btn-delete-person').onclick = (e) => {
        if (!confirm('DANGER: Delete this person and ALL their accounts/transactions?')) return;
        const id = e.currentTarget.dataset.borrowerId;
        state.borrowers = state.borrowers.filter(b => b.id !== id);
        const accIds = state.accounts.filter(a => a.borrowerId === id).map(a => a.id);
        state.accounts = state.accounts.filter(a => a.borrowerId !== id);
        state.transactions = state.transactions.filter(t => !accIds.includes(t.accountId));
        autoSave(); switchView('borrowers');
    };

    // Settings rows
    document.getElementById('btn-manage-portfolios').onclick = () => {
        updatePortfolioDropdowns();
        openModal('modal-manage-portfolios');
    };
    document.getElementById('btn-export-data').onclick = exportData;
    document.getElementById('btn-import-data').onclick = () => document.getElementById('import-file-input').click();
    document.getElementById('import-file-input').onchange = (e) => {
        if (e.target.files[0]) importData(e.target.files[0]);
        e.target.value = '';
    };

    // Portfolio create
    document.getElementById('btn-create-portfolio').onclick = () => {
        const val = document.getElementById('input-new-portfolio').value.trim();
        if (!val) return;
        if (state.portfolios.includes(val) || val === '__ALL__') return alert('Invalid or existing portfolio name!');
        state.portfolios.push(val);
        document.getElementById('input-new-portfolio').value = '';
        autoSave(); refreshUI();
    };

    // Import confirm / cancel
    document.getElementById('btn-import-confirm').onclick = () => {
        if (!importPendingData) return;
        const preservedTheme = state.theme;
        const preservedPortfolio = state.activePortfolio;
        let errs = [];
        (importPendingData.accounts || []).forEach((acc, i) => {
            if (acc.status === 'closed' && acc.closedDate) {
                if (acc.closedDate < acc.startDate) errs.push(`Account #${i+1}: closedDate before startDate`);
                if (acc.closedDate > getTodayStr()) errs.push(`Account #${i+1}: closedDate in the future`);
            }
        });
        if (errs.length && !confirm('⚠️ Warnings:\n\n' + errs.join('\n') + '\n\nProceed?')) return;
        
        const importedPortfolios = Array.isArray(importPendingData.portfolios) && importPendingData.portfolios.length
            ? importPendingData.portfolios
            : ['Self', 'Mother', 'Wife'];
        
        let targetPortfolio = preservedPortfolio;
        if (targetPortfolio !== '__ALL__' && !importedPortfolios.includes(targetPortfolio)) {
            targetPortfolio = '__ALL__';
        }

        state = {
            ...importPendingData,
            portfolios: importedPortfolios,
            borrowers: Array.isArray(importPendingData.borrowers) ? importPendingData.borrowers : [],
            accounts: Array.isArray(importPendingData.accounts) ? importPendingData.accounts : [],
            transactions: Array.isArray(importPendingData.transactions) ? importPendingData.transactions : [],
            theme: preservedTheme,
            activePortfolio: targetPortfolio
        };
        loadFailed = false;
        autoSave(); closeModal(); importPendingData = null; switchView('home');
        alert('Import successful.');
    };
    document.getElementById('btn-import-cancel').onclick = () => { importPendingData = null; closeModal(); };

    // Close modal on backdrop click
    document.getElementById('modal-backdrop').onclick = (e) => {
        if (e.target === document.getElementById('modal-backdrop')) closeModal();
    };

    // All close-modal buttons
    document.querySelectorAll('.close-modal').forEach(el => el.onclick = closeModal);

    // Filter tabs (Borrowers) — visual only for now
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.onclick = () => {
            document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
        };
    });

    // Dynamic hint update on transaction modal input changes
    document.getElementById('input-txn-type')?.addEventListener('change', updateTxnModalHint);
    document.getElementById('input-txn-date')?.addEventListener('change', updateTxnModalHint);
    document.getElementById('input-txn-date')?.addEventListener('input', updateTxnModalHint);

    // Transactions view — render on tab switch
    document.querySelector('.tab-btn[data-view="transactions"]')?.addEventListener('click', () => {
        setTimeout(() => renderRecentTransactions(getActiveData(), 'all-txns-list', null), 50);
    });
});

// ── Swipe gestures (left-edge open for any deep view) ────
(function() {
    const EDGE = 24, THRESHOLD = 60, VEL = 0.3;
    let sx = 0, sy = 0, st = 0, dragging = false, horiz = null;

    document.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now();
        horiz = null; dragging = false;
        // Enable left-edge swipe to go back from ledger
        const ledgerActive = document.getElementById('view-ledger')?.classList.contains('active');
        if (ledgerActive && sx <= EDGE) dragging = true;
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!dragging || e.touches.length !== 1) return;
        const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
        if (horiz === null && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
            horiz = Math.abs(dx) > Math.abs(dy);
        }
        if (horiz === false) { dragging = false; }
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        if (!dragging || horiz !== true) { dragging = false; return; }
        dragging = false;
        const dx = e.changedTouches[0].clientX - sx;
        const vel = Math.abs(dx) / (Date.now() - st);
        const ledgerActive = document.getElementById('view-ledger')?.classList.contains('active');
        if (ledgerActive && (dx > THRESHOLD || (dx > 10 && vel > VEL))) {
            switchView('borrowers');
        }
    }, { passive: true });
})();

// ── Auto-hide Tab Bar on Scroll Down / Reveal on Scroll Up ─
(function initTabBarScrollAutoHide() {
    const mainEl = document.getElementById('app-main');
    const tabBar = document.getElementById('tab-bar');
    if (!mainEl || !tabBar) return;

    let lastScrollTop = 0;
    const SCROLL_DELTA_THRESHOLD = 8;

    mainEl.addEventListener('scroll', () => {
        const currentScroll = mainEl.scrollTop;
        const delta = currentScroll - lastScrollTop;

        // If at or near the top, always show the tab bar
        if (currentScroll <= 15) {
            tabBar.classList.remove('tab-bar--hidden');
            lastScrollTop = currentScroll;
            return;
        }

        // Scroll Down (finger drag up / reading further content) -> Hide tab bar
        if (delta > SCROLL_DELTA_THRESHOLD) {
            tabBar.classList.add('tab-bar--hidden');
        }
        // Scroll Up (finger drag down / returning towards top) -> Show tab bar
        else if (delta < -SCROLL_DELTA_THRESHOLD) {
            tabBar.classList.remove('tab-bar--hidden');
        }

        lastScrollTop = currentScroll;
    }, { passive: true });
})();

