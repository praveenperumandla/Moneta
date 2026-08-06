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
const generateId = () => Math.random().toString(36).substr(2, 9);

const formatCurrency = (amount) =>
    new Intl.NumberFormat('en-IN', {
        style: 'currency', currency: 'INR', maximumFractionDigits: 0
    }).format(amount);

const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Intl.DateTimeFormat('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric'
    }).format(new Date(dateString));
};

const getTodayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getDaysBetween = (date1Str, date2Str) => {
    const d1 = new Date(date1Str), d2 = new Date(date2Str);
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
    const visibleBorrowers = state.borrowers.filter(b =>
        state.accounts.some(a => a.borrowerId === b.id && a.portfolioId === state.activePortfolio)
    );
    return { borrowers: visibleBorrowers, accounts: pAccounts, transactions: pTxns };
};

// ── Persistence ──────────────────────────────────────────
const loadData = () => {
    try {
        let saved = localStorage.getItem('moneta_data_v1');
        if (!saved) {
            saved = localStorage.getItem('vault_data_v2');
            if (saved) localStorage.setItem('moneta_data_v1', saved);
        }
        if (saved) {
            const parsed = JSON.parse(saved);
            state.activePortfolio = parsed.activePortfolio || '__ALL__';
            state.portfolios = parsed.portfolios || ['Self', 'Mother', 'Wife'];
            state.theme = parsed.theme || 'dark';

            if (parsed.data) {
                // Legacy format migration
                state.borrowers = []; state.accounts = []; state.transactions = [];
                const borrowerNameMap = {};
                state.portfolios.forEach(p => {
                    const pd = parsed.data[p];
                    if (!pd) return;
                    const localToGlobal = {};
                    (pd.borrowers || []).forEach(b => {
                        const key = b.name.trim().toLowerCase();
                        if (!borrowerNameMap[key]) {
                            const newId = generateId();
                            borrowerNameMap[key] = newId;
                            state.borrowers.push({ id: newId, name: b.name, phone: b.phone });
                        }
                        localToGlobal[b.id] = borrowerNameMap[key];
                    });
                    (pd.accounts || []).forEach(a => {
                        state.accounts.push({ ...a, portfolioId: p, borrowerId: localToGlobal[a.borrowerId] });
                    });
                    (pd.transactions || []).forEach(t => state.transactions.push(t));
                });
                autoSave();
            } else {
                state.borrowers = parsed.borrowers || [];
                state.accounts = parsed.accounts || [];
                state.transactions = parsed.transactions || [];
            }
        }
    } catch(e) { console.error('Load failed:', e); }
};

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

const exportData = () => {
    const payload = {
        borrowers: state.borrowers,
        accounts: state.accounts,
        transactions: state.transactions,
        portfolios: state.portfolios
    };
    const json = JSON.stringify(payload, null, 2);
    const filename = 'Moneta_Backup_' + getTodayStr() + '.json';
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
const calculateAccountMetrics = (account, allTxns) => {
    const txns = allTxns
        .filter(t => t.accountId === account.id)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    let currentPrincipal = account.principal;
    let totalInterestAccrued = 0, totalGotInterest = 0, totalGotPrincipal = 0;
    let totalWrittenOffInterest = 0, isWrittenOff = false;
    let lastDate = account.startDate;

    txns.forEach(txn => {
        if (txn.date < account.startDate) return;
        const days = getDaysBetween(lastDate, txn.date);
        if (days > 0 && !isWrittenOff) {
            totalInterestAccrued += (currentPrincipal * account.rate * days) / (100 * 365);
        }
        if (txn.type === 'payment_principal') {
            totalGotPrincipal += txn.amount;
            currentPrincipal = Math.max(0, currentPrincipal - txn.amount);
        } else if (txn.type === 'payment_interest') {
            totalGotInterest += txn.amount;
        } else if (txn.type === 'repayment') {
            const outI = Math.max(0, totalInterestAccrued - totalGotInterest - totalWrittenOffInterest);
            let rem = txn.amount;
            if (rem >= outI) { totalGotInterest += outI; rem -= outI; }
            else { totalGotInterest += rem; rem = 0; }
            if (rem > 0) { totalGotPrincipal += rem; currentPrincipal = Math.max(0, currentPrincipal - rem); }
        } else if (txn.type === 'writeoff') {
            currentPrincipal = Math.max(0, currentPrincipal - txn.amount);
            if (currentPrincipal === 0) isWrittenOff = true;
        } else if (txn.type === 'writeoff_interest') {
            totalWrittenOffInterest += txn.amount;
        }
        lastDate = txn.date;
    });

    const endDate = account.status === 'closed' ? (account.closedDate || getTodayStr()) : getTodayStr();
    const rem = getDaysBetween(lastDate, endDate);
    if (rem > 0 && !isWrittenOff) {
        totalInterestAccrued += (currentPrincipal * account.rate * rem) / (100 * 365);
    }

    const outstandingInterest = Math.max(0, totalInterestAccrued - totalGotInterest - totalWrittenOffInterest);
    return {
        outstandingPrincipal: currentPrincipal,
        accruedInterest: totalInterestAccrued,
        outstandingInterest,
        totalGotInterest, totalGotPrincipal,
        totalWrittenOffInterest,
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

    if (viewId === 'dashboard' || viewId === 'home') currentBorrowerId = null;

    // Scroll main back to top on tab switch
    document.getElementById('app-main').scrollTop = 0;

    refreshUI();
};

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
    label.textContent = state.activePortfolio === '__ALL__' ? 'All Portfolios' : state.activePortfolio;
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
            switchView('home');
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

    const xirr = calculateXIRR(cashFlows);
    const xirrDisplay = xirr === 0 ? '0.00%' : (xirr > 0 ? '+' : '') + (xirr * 100).toFixed(2) + '%';

    // Dashboard KPI tiles
    document.getElementById('stat-total-principal').textContent = formatCurrency(gPrincipal);
    document.getElementById('stat-realized-interest').textContent = formatCurrency(totalRealizedInterest);
    document.getElementById('stat-total-expected').textContent = formatCurrency(expected);

    // Dashboard date subtitle
    const dateEl = document.getElementById('dashboard-date');
    if (dateEl) {
        dateEl.textContent = state.activePortfolio === '__ALL__'
            ? 'Aggregate · as of ' + formatDate(getTodayStr())
            : state.activePortfolio + ' · as of ' + formatDate(getTodayStr());
    }

    // Portfolio view KPIs
    const pPrincipal = document.getElementById('stat-total-principal-portfolio');
    if (pPrincipal) pPrincipal.textContent = formatCurrency(gPrincipal);
    const pInterest = document.getElementById('stat-total-interest');
    if (pInterest) pInterest.textContent = formatCurrency(gInterest);
    const pLoans = document.getElementById('stat-active-loans');
    if (pLoans) pLoans.textContent = activeCount;
    const pXirr = document.getElementById('stat-xirr');
    if (pXirr) { pXirr.textContent = xirrDisplay; pXirr.style.color = xirr > 0 ? 'var(--green)' : xirr < 0 ? 'var(--rose)' : ''; }
    const pWo = document.getElementById('stat-written-off');
    if (pWo) pWo.textContent = formatCurrency(totalWrittenOff);

    renderCharts(borrowersData, activeData, gPrincipal, gInterest);
    renderRecentTransactions(activeData);
};

// ── Charts ───────────────────────────────────────────────
const renderCharts = (borrowersData, activeData, gPrincipal, gInterest) => {
    // Doughnut — Portfolio view
    const pieCtx = document.getElementById('portfolioChart');
    if (charts.pie) charts.pie.destroy();
    if (borrowersData.length > 0 && pieCtx) {
        charts.pie = new Chart(pieCtx, {
            type: 'doughnut',
            data: {
                labels: borrowersData.map(b => b.name),
                datasets: [{
                    data: borrowersData.map(b => b.balance),
                    backgroundColor: ['#4F8CFF','#22C55E','#F59E0B','#EF4444','#A78BFA','#2DD4BF','#FB923C'],
                    borderWidth: 0, hoverOffset: 6
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '68%',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => ` ${ctx.label}: ${formatCurrency(ctx.parsed)}`
                        }
                    }
                }
            }
        });
    }

    // Line chart — Dashboard
    const barCtx = document.getElementById('interestChart');
    if (charts.bar) charts.bar.destroy();
    if (!barCtx) return;

    let monthlyRate = 0;
    activeData.accounts.forEach(acc => {
        if (acc.status !== 'closed') {
            const m = calculateAccountMetrics(acc, activeData.transactions);
            monthlyRate += (m.outstandingPrincipal * acc.rate) / 100 / 12;
        }
    });

    const months = [0, 3, 6, 9, 12];
    const labels = ['Now', '3M', '6M', '9M', '12M'];
    const principalData = months.map(() => gPrincipal);
    const interestData  = months.map(m => gInterest + monthlyRate * m);

    charts.bar = new Chart(barCtx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Outstanding',
                    data: principalData,
                    borderColor: '#4F8CFF',
                    backgroundColor: 'rgba(79,140,255,0.08)',
                    borderWidth: 2, tension: 0.4, fill: true,
                    pointRadius: 3, pointBackgroundColor: '#4F8CFF'
                },
                {
                    label: 'Interest',
                    data: interestData,
                    borderColor: '#22C55E',
                    backgroundColor: 'transparent',
                    borderWidth: 2, tension: 0.4, fill: false,
                    pointRadius: 3, pointBackgroundColor: '#22C55E'
                }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                y: {
                    ticks: {
                        color: 'rgba(255,255,255,0.3)',
                        font: { size: 10, family: '-apple-system, sans-serif' },
                        callback: (v) => {
                            if (v >= 100000) return '₹' + (v/100000).toFixed(0) + 'L';
                            if (v >= 1000)   return '₹' + (v/1000).toFixed(0) + 'K';
                            return '₹' + v;
                        }
                    },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    border: { display: false }
                },
                x: {
                    ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10 } },
                    grid: { display: false },
                    border: { display: false }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(17,20,26,0.95)',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    padding: 10,
                    callbacks: {
                        label: (ctx) => ` ${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`
                    }
                }
            }
        }
    });
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

    const sorted = [...activeData.transactions, ...pseudoTxns]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, limit);

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
    if (q) borrowers = borrowers.filter(b => b.name.toLowerCase().includes(q));

    // Sort
    const sortVal = document.getElementById('select-sort-borrowers')?.value || 'value_desc';
    borrowers.sort((a, b) => {
        if (sortVal === 'name_asc')   return a.name.localeCompare(b.name);
        if (sortVal === 'name_desc')  return b.name.localeCompare(a.name);
        if (sortVal === 'date_desc')  return new Date(b.stats.startDate) - new Date(a.stats.startDate);
        if (sortVal === 'date_asc')   return new Date(a.stats.startDate) - new Date(b.stats.startDate);
        if (sortVal === 'value_desc') return b.stats.balance - a.stats.balance;
        if (sortVal === 'value_asc')  return a.stats.balance - b.stats.balance;
        return 0;
    });

    // Subtitle
    const subtitle = document.getElementById('borrowers-subtitle');
    if (subtitle) subtitle.textContent = `Manage ${borrowers.length} Active Profile${borrowers.length !== 1 ? 's' : ''}`;

    if (borrowers.length === 0) {
        list.innerHTML = `<div class="empty">
            <div class="empty-icon"><i class="ph ph-users"></i></div>
            <div class="empty-title">No borrowers found</div>
            <div class="empty-sub">Tap + to create your first borrower</div>
        </div>`;
        return;
    }

    borrowers.forEach(b => {
        const s = b.stats;
        const initials = b.name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
        const accsStr = `${s.activeAccounts} active loan${s.activeAccounts !== 1 ? 's' : ''}`;
        const hasActive = s.activeAccounts > 0;

        const el = document.createElement('div');
        el.className = 'borrower-tile';
        el.onclick = () => openLedger(b.id);
        el.innerHTML = `
            <div class="b-avatar ${hasActive ? 'status-active' : 'status-closed'}">
                <div class="b-avatar-inner">${initials}</div>
            </div>
            <div class="b-main">
                <div class="b-name">${escapeHtml(b.name)}
                    ${hasActive ? '<span class="b-status-badge active">Active</span>' : ''}
                </div>
                <div class="b-meta">${accsStr} · Since ${formatDate(s.startDate)}</div>
            </div>
            <div class="b-right">
                <div class="b-due num">${formatCurrency(s.balance)}</div>
                <div class="b-int"><span class="live-dot"></span>${formatCurrency(s.outstandingInterest)} interest</div>
            </div>
            <i class="ph ph-caret-right b-chevron"></i>
        `;
        list.appendChild(el);
    });
};

// ── Ledger ───────────────────────────────────────────────
const openLedger = (borrowerId) => {
    currentBorrowerId = borrowerId;
    const activeData = getActiveData();
    const b = activeData.borrowers.find(x => x.id === borrowerId);
    if (!b) return;

    const stats = getBorrowerStats(borrowerId, activeData);
    const initials = b.name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);

    document.getElementById('ledger-avatar').textContent = initials;
    document.getElementById('ledger-person-name').textContent = b.name;
    document.getElementById('ledger-person-stats').textContent = `ID: B-${borrowerId.slice(-5).toUpperCase()}`;
    document.getElementById('ledger-total-outstanding').textContent = formatCurrency(stats.balance);
    document.getElementById('ledger-active-loans').textContent = `Active Loans: ${stats.activeAccounts}`;
    document.getElementById('ledger-credit-limit').textContent = `Credit Limit: —`;

    document.getElementById('btn-add-account').dataset.borrowerId = borrowerId;
    document.getElementById('btn-delete-person').dataset.borrowerId = borrowerId;

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
        container.innerHTML = `<div class="empty"><div class="empty-sub">No accounts yet — create one below</div></div>`;
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
                    <div class="txn-icon ${icoClass}"><i class="ph ${icoName}"></i></div>
                    <div class="txn-body">
                        <div class="txn-type">${tType}${modeTag}</div>
                        <div class="txn-date">${formatDate(t.date)}</div>
                        ${t.txnId ? `<div class="txn-ref">Ref: ${escapeHtml(t.txnId)}</div>` : ''}
                        ${t.notes ? `<div class="txn-note">${escapeHtml(t.notes)}</div>` : ''}
                    </div>
                    <div class="txn-right">
                        <div class="txn-amt ${amtClass} num">${sign}${formatCurrency(t.amount)}</div>
                        ${canEdit ? `<div class="txn-actions">
                            <button class="icon-btn btn-edit-txn" data-id="${t.id}" title="Edit"><i class="ph ph-pencil-simple"></i></button>
                            <button class="icon-btn danger btn-delete-txn" data-id="${t.id}" title="Delete"><i class="ph ph-trash"></i></button>
                        </div>` : ''}
                    </div>
                </div>`;
        });

        const isClosed = acc.status === 'closed';
        const card = document.createElement('div');
        card.className = `account-card${isClosed ? ' closed' : ''}`;
        card.innerHTML = `
            <div class="acc-head">
                <div class="acc-head-row">
                    <div style="flex:1;min-width:0">
                        <div class="acc-title-row">
                            <span class="acc-title">Loan Account</span>
                            <span class="badge ${isClosed ? 'badge-closed' : 'badge-active'}">${isClosed ? 'Closed' : 'Active'}</span>
                        </div>
                        <div class="acc-chips">
                            <span class="chip"><i class="ph ph-stack"></i>${escapeHtml(acc.portfolioId)}</span>
                            <span class="chip"><i class="ph ph-calendar"></i>${formatDate(acc.startDate)}</span>
                            <span class="chip"><i class="ph ph-percent"></i>${acc.rate}% p.a.</span>
                            <span class="chip"><i class="ph ph-tag"></i>${escapeHtml(acc.mode)}</span>
                            ${acc.closedDate ? `<span class="chip" style="color:var(--rose)"><i class="ph ph-lock-key"></i>Closed ${formatDate(acc.closedDate)}</span>` : ''}
                        </div>
                        ${acc.notes ? `<div style="font-size:11px;color:var(--t3);font-style:italic;margin-top:8px">${escapeHtml(acc.notes)}</div>` : ''}
                    </div>
                    <div class="acc-actions">
                        ${!isClosed ? `<button class="btn btn-success btn-add-txn" data-id="${acc.id}"><i class="ph ph-plus"></i>Repayment</button>` : ''}
                        ${!isClosed ? `<button class="icon-btn btn-edit-acc" data-id="${acc.id}" title="Edit"><i class="ph ph-pencil-simple"></i></button>` : ''}
                        ${!isClosed
                            ? `<button class="icon-btn btn-close-acc" data-id="${acc.id}" title="Close"><i class="ph ph-lock-key"></i></button>`
                            : `<button class="icon-btn btn-reopen-acc" data-id="${acc.id}" title="Reopen"><i class="ph ph-lock-key-open"></i></button>`}
                        <button class="icon-btn danger btn-delete-acc" data-id="${acc.id}" title="Delete"><i class="ph ph-trash"></i></button>
                    </div>
                </div>
            </div>
            <div class="acc-metrics">
                <div class="metric-cell">
                    <div class="metric-label">O/S Principal</div>
                    <div class="metric-value c-warning num">${formatCurrency(metrics.outstandingPrincipal)}</div>
                    <div class="metric-sub">Recovered: ${formatCurrency(metrics.totalGotPrincipal)}</div>
                </div>
                <div class="metric-cell">
                    <div class="metric-label">O/S Interest</div>
                    <div class="metric-value c-success num">${formatCurrency(metrics.outstandingInterest)}</div>
                    <div class="metric-sub">Accrued: ${formatCurrency(metrics.accruedInterest)}</div>
                </div>
                <div class="metric-cell">
                    <div class="metric-label">Total Due</div>
                    <div class="metric-value c-danger num">${formatCurrency(metrics.outstandingPrincipal + metrics.outstandingInterest)}</div>
                    <div class="metric-sub">Recovered: ${formatCurrency(metrics.totalGot)}</div>
                </div>
            </div>
            <div class="txn-list">${txnsHtml || '<div class="empty" style="padding:16px 0"><div class="empty-sub">No transactions yet</div></div>'}</div>
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
            const metrics = calculateAccountMetrics(acc, state.transactions);
            const outstanding = metrics.outstandingPrincipal + metrics.outstandingInterest;
            document.getElementById('txn-outstanding-hint').textContent =
                `Outstanding: ${formatCurrency(outstanding)} (P: ${formatCurrency(metrics.outstandingPrincipal)} + I: ${formatCurrency(metrics.outstandingInterest)})`;
            document.getElementById('txn-outstanding-hint').style.display = 'block';
            document.getElementById('input-txn-max').value = outstanding;
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

    container.querySelectorAll('.btn-reopen-acc').forEach(btn => {
        btn.onclick = (e) => {
            if (!confirm('Reopen this account? Interest resumes from today.')) return;
            const acc = state.accounts.find(a => a.id === e.currentTarget.dataset.id);
            if (acc) { acc.status = 'active'; delete acc.closedDate; autoSave(); }
            refreshUI();
        };
    });

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
            document.getElementById('txn-outstanding-hint').style.display = 'none';
            const metrics = calculateAccountMetrics(acc, state.transactions);
            const outstanding = metrics.outstandingPrincipal + metrics.outstandingInterest + txn.amount;
            document.getElementById('input-txn-max').value = outstanding;
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
                    if (!confirm(`Delete portfolio "${escapeHtml(p)}" and ALL its accounts/transactions?`)) return;
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
    let totalAssets = 0;
    state.accounts.forEach(acc => {
        const m = getCachedMetrics(acc, state.transactions);
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
        renderRecentTransactions(getActiveData(), 'all-txns-list', 999);
    }

    if (currentBorrowerId) renderLedgerView(currentBorrowerId);
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
    switchView('home');

    // Header buttons
    document.getElementById('mobile-menu-btn').onclick = () => switchView('settings');

    // Tab bar
    document.querySelectorAll('.tab-btn[data-view]').forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    // Portfolio pill in header
    document.getElementById('hdr-portfolio-pill').onclick = openPortfolioPicker;

    // Borrowers search / sort
    document.getElementById('input-search-borrowers')?.addEventListener('input', renderBorrowersList);
    document.getElementById('select-sort-borrowers')?.addEventListener('change', renderBorrowersList);

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
            if (existing && !confirm(`"${escapeHtml(existing.name)}" already exists. Create another?`)) return;
        }
        if (id) {
            const b = state.borrowers.find(x => x.id === id);
            if (b) { b.name = name; b.phone = phone; }
        } else {
            state.borrowers.push({ id: generateId(), name, phone });
        }
        autoSave(); closeModal(); refreshUI();
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
                    if (!confirm(`⚠️ ${orphaned.length} transaction(s) are dated before the new start date and will be ignored in calculations. Proceed?`)) return;
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
        const maxOut      = parseFloat(document.getElementById('input-txn-max').value) || Infinity;

        if (!amount || amount <= 0) return alert('Amount must be greater than 0.');
        if (!date) return alert('Date is required.');
        if (accStart && date < accStart) return alert(`Transaction date cannot be before the loan start date (${formatDate(accStart)}).`);
        if (date > getTodayStr()) return alert('Future dates are not allowed.');
        if (['repayment','payment_principal','payment_interest'].includes(type) && amount > maxOut + 0.5) {
            return alert(`Amount (${formatCurrency(amount)}) exceeds outstanding (${formatCurrency(maxOut)}).`);
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
        state = { ...importPendingData, theme: preservedTheme, activePortfolio: preservedPortfolio };
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

    // Transactions view — render on tab switch
    document.querySelector('.tab-btn[data-view="transactions"]')?.addEventListener('click', () => {
        setTimeout(() => renderRecentTransactions(getActiveData(), 'all-txns-list', 999), 50);
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
