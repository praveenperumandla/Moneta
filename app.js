// --- STATE MANAGEMENT ---
const defaultDataStructure = () => ({ borrowers: [], accounts: [], transactions: [] });

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

// --- XSS SANITIZATION ---
const escapeHtml = (str) => {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
};

// --- UTILITIES ---
const generateId = () => Math.random().toString(36).substr(2, 9);
const formatCurrency = (amount) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(dateString));
};
const getTodayStr = () => new Date().toISOString().split('T')[0];

const getDaysBetween = (date1Str, date2Str) => {
    const d1 = new Date(date1Str);
    const d2 = new Date(date2Str);
    const utc1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate());
    const utc2 = Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate());
    return Math.floor((utc2 - utc1) / (1000 * 60 * 60 * 24));
};

const getActiveData = () => {
    if (state.activePortfolio === '__ALL__') {
        return {
            borrowers: state.borrowers,
            accounts: state.accounts,
            transactions: state.transactions
        };
    }

    const pAccounts = state.accounts.filter(a => a.portfolioId === state.activePortfolio);
    const accountIds = pAccounts.map(a => a.id);
    const pTxns = state.transactions.filter(t => accountIds.includes(t.accountId));

    const visibleBorrowers = state.borrowers.filter(b => {
        const portfolioAccounts = state.accounts.filter(a => a.borrowerId === b.id && a.portfolioId === state.activePortfolio);
        return portfolioAccounts.length > 0;
    });

    return {
        borrowers: visibleBorrowers,
        accounts: pAccounts,
        transactions: pTxns
    };
};

// --- PERSISTENCE ---
const loadData = () => {
    try {
        const saved = localStorage.getItem('vault_data_v2');
        if (saved) {
            const parsed = JSON.parse(saved);
            state.activePortfolio = parsed.activePortfolio || '__ALL__';
            state.portfolios = parsed.portfolios || ['Self', 'Mother', 'Wife'];
            state.theme = parsed.theme || 'dark';

            if (parsed.data) {
                state.borrowers = [];
                state.accounts = [];
                state.transactions = [];

                const borrowerNameMap = {};

                state.portfolios.forEach(p => {
                    const pd = parsed.data[p];
                    if (!pd) return;

                    const localToGlobal = {};

                    (pd.borrowers || []).forEach(b => {
                        const normalizedName = b.name.trim().toLowerCase();
                        if (!borrowerNameMap[normalizedName]) {
                            const newId = generateId();
                            borrowerNameMap[normalizedName] = newId;
                            state.borrowers.push({ id: newId, name: b.name, phone: b.phone });
                        }
                        localToGlobal[b.id] = borrowerNameMap[normalizedName];
                    });

                    (pd.accounts || []).forEach(a => {
                        state.accounts.push({
                            ...a,
                            portfolioId: p,
                            borrowerId: localToGlobal[a.borrowerId]
                        });
                    });

                    (pd.transactions || []).forEach(t => {
                        state.transactions.push(t);
                    });
                });

                autoSave();
            } else {
                state.borrowers = parsed.borrowers || [];
                state.accounts = parsed.accounts || [];
                state.transactions = parsed.transactions || [];
            }
        }
    } catch(e) {
        console.error("Failed to load data, using defaults.", e);
    }
    document.documentElement.setAttribute('data-theme', state.theme);
};

const autoSave = () => {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
        try {
            localStorage.setItem('vault_data_v2', JSON.stringify(state));
        } catch (e) {
            if (e.name === 'QuotaExceededError') {
                alert('Storage full! Please export and clear old data.');
            }
        }
    }, 300);
};

const exportData = () => {
    // Strip UI preferences from export — only export data
    const exportPayload = {
        borrowers: state.borrowers,
        accounts: state.accounts,
        transactions: state.transactions,
        portfolios: state.portfolios
    };
    const json = JSON.stringify(exportPayload, null, 2);
    const filename = "Vault_Backup_" + getTodayStr() + ".json";

    // iOS Safari blocks data: URI downloads — use Blob + createObjectURL instead
    try {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
        // Ultimate fallback: open in new tab so user can Save As manually
        const fallbackUrl = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
        window.open(fallbackUrl, '_blank');
        alert('Tap the page that opened, then use Share → Save to Files to save your backup.');
    }
};

// --- CORE ACCOUNTING LOGIC ---
const calculateXIRR = (cashFlows) => {
    if (cashFlows.length < 2) return 0;
    cashFlows.sort((a,b) => new Date(a.date) - new Date(b.date));

    const hasPositive = cashFlows.some(cf => cf.amount > 0);
    const hasNegative = cashFlows.some(cf => cf.amount < 0);
    if (!hasPositive || !hasNegative) return 0;

    const d0 = new Date(cashFlows[0].date).getTime();
    const msPerYear = 1000 * 3600 * 24 * 365;

    const xnpv = (rate) => {
        return cashFlows.reduce((acc, cf) => {
            const di = new Date(cf.date).getTime();
            const t = (di - d0) / msPerYear;
            return acc + cf.amount / Math.pow(1 + rate, t);
        }, 0);
    };

    const xnpv_prime = (rate) => {
        return cashFlows.reduce((acc, cf) => {
            const di = new Date(cf.date).getTime();
            const t = (di - d0) / msPerYear;
            return acc - (cf.amount * t) / Math.pow(1 + rate, t + 1);
        }, 0);
    };

    let rate = 0.1;
    const maxIters = 100;
    const tolerance = 0.000001;

    for (let i = 0; i < maxIters; i++) {
        const val = xnpv(rate);
        if (Math.abs(val) < tolerance) return rate;

        const deriv = xnpv_prime(rate);
        if (deriv === 0) break;

        const nextRate = rate - val / deriv;
        if (Math.abs(nextRate - rate) < tolerance) return nextRate;
        rate = nextRate;
        if (rate <= -1) rate = -0.999999;
    }
    return rate;
};

const calculateAccountMetrics = (account, allTxns) => {
    const txns = allTxns
        .filter(t => t.accountId === account.id)
        .sort((a, b) => new Date(a.date) - new Date(b.date) || 0);

    const SI_DAYS = 365;

    let currentPrincipal = account.principal;
    let totalInterestAccrued = 0;
    let totalGotInterest = 0;
    let totalGotPrincipal = 0;
    let totalWrittenOffInterest = 0;
    let isWrittenOff = false;
    let lastDate = account.startDate;

    txns.forEach(txn => {
        if (txn.date < account.startDate) return;

        const days = getDaysBetween(lastDate, txn.date);

        if (days > 0 && !isWrittenOff && account.status !== 'closed') {
            totalInterestAccrued += (currentPrincipal * account.rate * days) / (100 * SI_DAYS);
        }

        if (txn.type === 'payment_principal') {
            totalGotPrincipal += txn.amount;
            currentPrincipal = Math.max(0, currentPrincipal - txn.amount);
        } else if (txn.type === 'payment_interest') {
            totalGotInterest += txn.amount;
        } else if (txn.type === 'repayment') {
            const outstandingInterest = Math.max(0, totalInterestAccrued - totalGotInterest - totalWrittenOffInterest);
            let remaining = txn.amount;
            if (remaining >= outstandingInterest) {
                totalGotInterest += outstandingInterest;
                remaining -= outstandingInterest;
            } else {
                totalGotInterest += remaining;
                remaining = 0;
            }
            if (remaining > 0) {
                totalGotPrincipal += remaining;
                currentPrincipal = Math.max(0, currentPrincipal - remaining);
            }
        } else if (txn.type === 'writeoff') {
            currentPrincipal = Math.max(0, currentPrincipal - txn.amount);
            if (currentPrincipal === 0) isWrittenOff = true;
        } else if (txn.type === 'writeoff_interest') {
            totalWrittenOffInterest += txn.amount;
        }

        lastDate = txn.date;
    });

    const endDate = account.status === 'closed' ? (account.closedDate || getTodayStr()) : getTodayStr();
    const remainingDays = getDaysBetween(lastDate, endDate);

    if (remainingDays > 0 && !isWrittenOff) {
        totalInterestAccrued += (currentPrincipal * account.rate * remainingDays) / (100 * SI_DAYS);
    }

    const outstandingInterest = Math.max(0, totalInterestAccrued - totalGotInterest - totalWrittenOffInterest);

    return {
        outstandingPrincipal: currentPrincipal,
        accruedInterest: totalInterestAccrued,
        outstandingInterest,
        totalGotInterest,
        totalGotPrincipal,
        totalWrittenOffInterest,
        totalGot: totalGotPrincipal + totalGotInterest,
        isWrittenOff
    };
};

const getBorrowerStats = (borrowerId, activeData) => {
    const accounts = activeData.accounts.filter(a => a.borrowerId === borrowerId);
    let totalInitialPrincipal = 0;
    let outstandingPrincipal = 0;
    let outstandingInterest = 0;
    let totalInterestAccrued = 0;
    let totalGot = 0;
    let activeAccounts = 0;
    let startDate = null;

    accounts.forEach(acc => {
        if (acc.status !== 'closed') activeAccounts++;
        const metrics = calculateAccountMetrics(acc, activeData.transactions);
        totalInitialPrincipal += acc.principal;
        outstandingPrincipal += metrics.outstandingPrincipal;
        totalInterestAccrued += metrics.accruedInterest;
        outstandingInterest += metrics.outstandingInterest;
        totalGot += metrics.totalGot;

        if (!startDate || new Date(acc.startDate) < new Date(startDate)) {
            startDate = acc.startDate;
        }
    });

    const balance = outstandingPrincipal + outstandingInterest;
    return {
        totalInitialPrincipal,
        outstandingPrincipal,
        outstandingInterest,
        totalInterestAccrued,
        totalGot,
        balance,
        activeAccounts,
        totalLoans: accounts.length,  // FIX: Added missing field
        startDate
    };
};

// --- CHARTS & DASHBOARD ---
const renderCharts = (borrowersData, activeData) => {
    const isDark = state.theme === 'dark';
    const textColor = isDark ? '#fff' : '#000';

    const pieCtx = document.getElementById('portfolioChart');
    if (charts.pie) charts.pie.destroy();

    if (borrowersData.length === 0) {
        pieCtx.style.display = 'none';
    } else {
        pieCtx.style.display = 'block';
        charts.pie = new Chart(pieCtx, {
            type: 'doughnut',
            data: {
                labels: borrowersData.map(b => b.name),
                datasets: [{
                    data: borrowersData.map(b => b.balance),
                    backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'],
                    borderWidth: 0
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }

    const barCtx = document.getElementById('interestChart');
    if (charts.bar) charts.bar.destroy();

    let currentPrincipal = 0;
    let currentInterest = 0;
    let monthlyInterestRate = 0;

    activeData.accounts.forEach(acc => {
        if (acc.status !== 'closed') {
            const metrics = calculateAccountMetrics(acc, activeData.transactions);
            currentPrincipal += metrics.outstandingPrincipal;
            currentInterest += metrics.outstandingInterest;
            monthlyInterestRate += (metrics.outstandingPrincipal * acc.rate) / 100 / 12;
        }
    });

    const labels = ['Now', '3 Months', '6 Months', '9 Months', '12 Months'];
    const months = [0, 3, 6, 9, 12];
    const principalData = months.map(() => currentPrincipal);
    const interestData = months.map(m => currentInterest + (monthlyInterestRate * m));
    const totalData = principalData.map((p, i) => p + interestData[i]);

    charts.bar = new Chart(barCtx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Total Outstanding',
                    data: totalData,
                    borderColor: '#8b5cf6',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Outstanding Principal',
                    data: principalData,
                    borderColor: '#3b82f6',
                    borderWidth: 2,
                    tension: 0.4,
                    borderDash: [5, 5],
                    fill: false
                },
                {
                    label: 'Projected Interest',
                    data: interestData,
                    borderColor: '#10b981',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { ticks: { color: textColor }, beginAtZero: false },
                x: { ticks: { color: textColor } }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'bottom',
                    labels: { color: textColor, boxWidth: 12 }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            if (context.parsed.y !== null) {
                                label += new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(context.parsed.y);
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
};

const renderRecentTransactions = (activeData) => {
    const list = document.getElementById('recent-txns-list');
    list.innerHTML = '';

    const pseudoTxns = activeData.accounts.map(a => ({
        id: a.id + '_creation', accountId: a.id,
        type: 'loan_given', amount: a.principal, date: a.startDate, notes: a.notes
    }));

    const sortedTxns = [...activeData.transactions, ...pseudoTxns]
        .sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 15);

    if (sortedTxns.length === 0) {
        list.innerHTML = `<div class="empty"><div class="empty-icon"><i class="ph ph-receipt"></i></div><div class="empty-title">No transactions yet</div><div class="empty-sub">Add a borrower and loan account to get started</div></div>`;
        return;
    }

    sortedTxns.forEach(t => {
        const acc = activeData.accounts.find(a => a.id === t.accountId);
        const borrower = acc ? activeData.borrowers.find(b => b.id === acc.borrowerId) : null;
        const name = borrower ? escapeHtml(borrower.name) : 'Unknown';

        let typeStr = 'Repayment', icoClass = 'i-repay', amtClass = 'pos', sign = '+', icoName = 'ph-arrow-down-left';
        if (t.type === 'loan_given')         { typeStr = 'Disbursement';            icoClass = 'i-lent';     amtClass = 'neg'; sign = '−'; icoName = 'ph-arrow-up-right'; }
        else if (t.type === 'repayment')     { typeStr = 'Repayment (P+I)'; }
        else if (t.type === 'payment_principal') { typeStr = 'Principal repayment'; }
        else if (t.type === 'payment_interest')  { typeStr = 'Interest repayment'; }
        else if (t.type === 'writeoff')      { typeStr = 'Write-off (principal)';  icoClass = 'i-writeoff'; amtClass = 'wo';  sign = '';  icoName = 'ph-x-circle'; }
        else if (t.type === 'writeoff_interest') { typeStr = 'Write-off (interest)'; icoClass = 'i-writeoff'; amtClass = 'wo'; sign = ''; icoName = 'ph-x-circle'; }

        const modeBadge = t.mode && t.type !== 'loan_given' ? `<span class="mode-tag">${escapeHtml(t.mode)}</span>` : '';
        const refStr    = t.txnId ? ` · ${escapeHtml(t.txnId)}` : '';

        const el = document.createElement('div');
        el.className = 'rt-row';
        el.innerHTML = `
            <div class="rt-icon ${icoClass}"><i class="ph ${icoName}"></i></div>
            <div class="rt-body">
                <div class="rt-name">${name}${modeBadge}</div>
                <div class="rt-meta">${typeStr} · ${formatDate(t.date)}${refStr}</div>
                ${t.notes ? `<div class="rt-meta" style="font-style:italic;margin-top:2px;">${escapeHtml(t.notes)}</div>` : ''}
            </div>
            <div class="rt-amt ${amtClass}">${sign}${formatCurrency(t.amount)}</div>
        `;
        list.appendChild(el);
    });
};

// --- UI UPDATES ---
const refreshUI = () => {
    updatePortfolioDropdowns();
    updateDashboard();
    renderBorrowersList();
    if (currentBorrowerId) renderLedgerView(currentBorrowerId);
};

const updatePortfolioDropdowns = () => {
    const select = document.getElementById('portfolio-select');
    select.innerHTML = '<option value="__ALL__">🌐 All Portfolios (Aggregate)</option>';

    state.portfolios.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p; opt.textContent = p;
        select.appendChild(opt);
    });
    select.value = state.activePortfolio;

    document.getElementById('btn-add-person').disabled = false;

    const editList = document.getElementById('portfolio-list-edit');
    editList.innerHTML = '';
    state.portfolios.forEach(p => {
        const li = document.createElement('li');
        li.className = 'p-list-item';
        li.innerHTML = `<span>${escapeHtml(p)}</span>`;
        if (state.portfolios.length > 1) {
            const delBtn = document.createElement('button');
            delBtn.className = 'icon-btn';
            delBtn.innerHTML = '<i class="ph ph-trash" style="color:var(--accent-danger)"></i>';
            delBtn.onclick = () => {
                if(confirm(`Delete portfolio "${escapeHtml(p)}" and ALL its accounts/transactions? Borrowers will NOT be deleted.`)) {
                    state.portfolios = state.portfolios.filter(x => x !== p);
                    const accountsToDelete = state.accounts.filter(a => a.portfolioId === p).map(a => a.id);
                    state.accounts = state.accounts.filter(a => a.portfolioId !== p);
                    state.transactions = state.transactions.filter(t => !accountsToDelete.includes(t.accountId));
                    if (state.activePortfolio === p) state.activePortfolio = state.portfolios[0];
                    autoSave();
                    refreshUI();
                }
            };
            li.appendChild(delBtn);
        }
        editList.appendChild(li);
    });
};

const updateDashboard = () => {
    const activeData = getActiveData();

    let gOutstandingPrincipal = 0;
    let gOutstandingInterest = 0;
    let gTotalAccruedInterest = 0;
    let activeAccountsCount = activeData.accounts.filter(a => a.status !== 'closed').length;
    let borrowersData = [];

    activeData.accounts.forEach(acc => {
        const metrics = calculateAccountMetrics(acc, activeData.transactions);
        gOutstandingPrincipal += metrics.outstandingPrincipal;
        gOutstandingInterest += metrics.outstandingInterest;
        gTotalAccruedInterest += metrics.accruedInterest;
    });

    activeData.borrowers.forEach(b => {
        const stats = getBorrowerStats(b.id, activeData);
        if (stats.balance > 0) borrowersData.push({ name: b.name, balance: stats.balance });
    });

    const expected = gOutstandingPrincipal + gOutstandingInterest;

    let totalRealizedInterest = 0;
    let totalWrittenOff = 0;

    let cashFlows = [];
    activeData.accounts.forEach(acc => {
        if (acc.status !== 'closed') {
            cashFlows.push({ date: acc.startDate, amount: -acc.principal });
        }
    });

    activeData.transactions.forEach(txn => {
        const acc = activeData.accounts.find(a => a.id === txn.accountId);
        if (!acc || acc.status === 'closed') return;

        if (txn.type === 'payment_principal' || txn.type === 'payment_interest') {
            cashFlows.push({ date: txn.date, amount: txn.amount });
            if (txn.type === 'payment_interest') totalRealizedInterest += txn.amount;
        } else if (txn.type === 'repayment') {
            cashFlows.push({ date: txn.date, amount: txn.amount });
            const metrics = calculateAccountMetrics(acc, activeData.transactions);
            totalRealizedInterest += Math.min(txn.amount, metrics.totalGotInterest);
        } else if (txn.type === 'writeoff' || txn.type === 'writeoff_interest') {
            totalWrittenOff += txn.amount;
        }
    });

    if (expected > 0) {
        cashFlows.push({ date: getTodayStr(), amount: expected });
    }

    const xirr = calculateXIRR(cashFlows);
    let xirrDisplay = "0.00%";
    if (xirr !== 0) {
        xirrDisplay = (xirr * 100).toFixed(2) + "%";
        if (xirr > 0) xirrDisplay = "+" + xirrDisplay;
    }

    document.getElementById('stat-total-principal').innerText = formatCurrency(gOutstandingPrincipal);
    document.getElementById('stat-total-interest').innerText = formatCurrency(gOutstandingInterest);
    document.getElementById('stat-total-expected').innerText = formatCurrency(expected);
    document.getElementById('stat-active-loans').innerText = activeAccountsCount;

    const xirrEl = document.getElementById('stat-xirr');
    if (xirrEl) {
        xirrEl.innerText = xirrDisplay;
        xirrEl.style.color = xirr > 0 ? 'var(--stat-green)' : (xirr < 0 ? 'var(--accent-danger)' : 'var(--text-primary)');
    }
    const realIntEl = document.getElementById('stat-realized-interest');
    if (realIntEl) realIntEl.innerText = formatCurrency(totalRealizedInterest);
    const writeOffEl = document.getElementById('stat-written-off');
    if (writeOffEl) writeOffEl.innerText = formatCurrency(totalWrittenOff);

    document.getElementById('dashboard-date').innerText = state.activePortfolio === '__ALL__'
        ? `Aggregate of all portfolios as of ${formatDate(getTodayStr())}`
        : `As of ${formatDate(getTodayStr())}`;

    renderCharts(borrowersData, activeData);
    renderRecentTransactions(activeData);
};

const renderBorrowersList = () => {
    const list = document.getElementById('borrowers-list');
    const activeData = getActiveData();
    list.innerHTML = '';

    let borrowers = [...activeData.borrowers];

    const borrowersWithStats = borrowers.map(b => ({
        ...b,
        stats: getBorrowerStats(b.id, activeData)
    }));

    const searchEl = document.getElementById('input-search-borrowers');
    if (searchEl && searchEl.value.trim() !== '') {
        const query = searchEl.value.trim().toLowerCase();
        borrowers = borrowersWithStats.filter(b => b.name.toLowerCase().includes(query));
    } else {
        borrowers = borrowersWithStats;
    }

    const sortEl = document.getElementById('select-sort-borrowers');
    const sortVal = sortEl ? sortEl.value : 'name_asc';

    borrowers.sort((a, b) => {
        if (sortVal === 'name_asc') return a.name.localeCompare(b.name);
        if (sortVal === 'name_desc') return b.name.localeCompare(a.name);
        if (sortVal === 'date_desc') return new Date(b.stats.startDate) - new Date(a.stats.startDate);
        if (sortVal === 'date_asc') return new Date(a.stats.startDate) - new Date(b.stats.startDate);
        if (sortVal === 'value_desc') return b.stats.balance - a.stats.balance;
        if (sortVal === 'value_asc') return a.stats.balance - b.stats.balance;
        return 0;
    });

    if (borrowers.length === 0) {
        list.innerHTML = `<div class="empty"><div class="empty-icon"><i class="ph ph-users"></i></div><div class="empty-title">No borrowers found</div><div class="empty-sub">Tap "Add Person" to create your first borrower</div></div>`;
        return;
    }

    borrowers.forEach(b => {
        const stats = b.stats;
        const initials = b.name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0,2);
        const activeAccStr = stats.activeAccounts === 1 ? '1 active account' : `${stats.activeAccounts} active accounts`;
        const el = document.createElement('div');
        el.className = 'borrower-tile';
        el.onclick = () => openLedger(b.id);
        el.innerHTML = `
            <div class="b-avatar">${initials}</div>
            <div class="b-main">
                <div class="b-name">${escapeHtml(b.name)}</div>
                <div class="b-meta">${activeAccStr} · Since ${formatDate(stats.startDate)}</div>
            </div>
            <div class="b-right">
                <div class="b-due num">${formatCurrency(stats.balance)}</div>
                <div class="b-int"><span class="live-dot"></span>${formatCurrency(stats.outstandingInterest)} interest</div>
            </div>
            <i class="ph ph-caret-right b-chevron"></i>
        `;
        list.appendChild(el);
    });
};

const openLedger = (borrowerId) => {
    currentBorrowerId = borrowerId;
    const activeData = getActiveData();
    const b = activeData.borrowers.find(x => x.id === borrowerId);
    if (!b) return;

    const stats = getBorrowerStats(borrowerId, activeData);
    const initials = b.name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0,2);

    document.getElementById('ledger-avatar').textContent = initials;
    document.getElementById('ledger-person-name').innerText = escapeHtml(b.name);
    document.getElementById('ledger-person-stats').innerText =
        `${stats.activeAccounts} active · ${stats.totalLoans} total · Balance: ${formatCurrency(stats.balance)}`;

    document.getElementById('btn-add-account').dataset.borrowerId = borrowerId;
    document.getElementById('btn-delete-person').dataset.borrowerId = borrowerId;

    const bb2 = document.getElementById('btn-back-borrowers-2');
    if (bb2) bb2.style.display = 'inline-flex';

    switchView('ledger');
    renderLedgerView(borrowerId);
};

const renderLedgerView = (borrowerId) => {
    const container = document.getElementById('ledger-accounts-container');
    const activeData = getActiveData();
    container.innerHTML = '';

    const accounts = activeData.accounts.filter(a => a.borrowerId === borrowerId);
    if (accounts.length === 0) {
        container.innerHTML = `<p style="padding: 24px; text-align: center; color: var(--text-secondary);">No accounts found. Create one to start tracking.</p>`;
        return;
    }

    accounts.forEach(acc => {
        const metrics = calculateAccountMetrics(acc, activeData.transactions);
        const txns = activeData.transactions.filter(t => t.accountId === acc.id).sort((a,b) => new Date(a.date) - new Date(b.date));

        let txnsHtml = '';
        txns.forEach(t => {
            let tType, icoClass, icoName, amtClass, sign;
            if (t.type === 'repayment')          { tType='Repayment (auto-split P+I)'; icoClass='icon-rep'; icoName='ph-arrow-down-left'; amtClass='c-success'; sign='+'; }
            else if (t.type === 'payment_principal') { tType='Principal repayment';    icoClass='icon-rep'; icoName='ph-arrow-down-left'; amtClass='c-success'; sign='+'; }
            else if (t.type === 'payment_interest')  { tType='Interest repayment';     icoClass='icon-rep'; icoName='ph-arrow-down-left'; amtClass='c-success'; sign='+'; }
            else if (t.type === 'writeoff')          { tType='Write-off (principal)';  icoClass='icon-wo';  icoName='ph-x-circle';        amtClass='c-danger';  sign=''; }
            else                                     { tType='Write-off (interest)';   icoClass='icon-wo';  icoName='ph-x-circle';        amtClass='c-danger';  sign=''; }

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
                </div>
            `;
        });

        const isClosed = acc.status === 'closed';
        const card = document.createElement('div');
        card.className = `account-card${isClosed ? ' closed' : ''}`;
        card.innerHTML = `
            <div class="acc-head">
                <div class="acc-head-row">
                    <div>
                        <div class="acc-title-row">
                            <span class="acc-title">Loan Account</span>
                            <span class="badge ${isClosed ? 'badge-closed' : 'badge-active'}">${isClosed ? 'Closed' : 'Active'}</span>
                        </div>
                        <div class="acc-chips">
                            <span class="chip"><i class="ph ph-wallet"></i>${escapeHtml(acc.portfolioId)}</span>
                            <span class="chip"><i class="ph ph-calendar"></i>${formatDate(acc.startDate)}</span>
                            <span class="chip"><i class="ph ph-percent"></i>${acc.rate}% p.a.</span>
                            <span class="chip"><i class="ph ph-tag"></i>${escapeHtml(acc.mode)}</span>
                            ${acc.closedDate ? `<span class="chip" style="background:var(--danger-bg);color:var(--danger);border-color:rgba(224,92,92,0.2)"><i class="ph ph-lock-key"></i>Closed ${formatDate(acc.closedDate)}</span>` : ''}
                            ${acc.txnId ? `<span class="chip"><i class="ph ph-receipt"></i>${escapeHtml(acc.txnId)}</span>` : ''}
                        </div>
                        ${acc.notes ? `<div style="font-size:11px;color:var(--t3);font-style:italic;margin-top:8px;">${escapeHtml(acc.notes)}</div>` : ''}
                    </div>
                    <div class="acc-actions">
                        ${!isClosed ? `<button class="btn btn-success btn-add-txn" data-id="${acc.id}"><i class="ph ph-plus"></i>Repayment</button>` : ''}
                        ${!isClosed ? `<button class="icon-btn btn-edit-acc" data-id="${acc.id}" title="Edit"><i class="ph ph-pencil-simple"></i></button>` : ''}
                        ${!isClosed ? `<button class="icon-btn btn-close-acc" data-id="${acc.id}" title="Close account"><i class="ph ph-lock-key"></i></button>` : `<button class="icon-btn btn-reopen-acc" data-id="${acc.id}" title="Reopen account"><i class="ph ph-lock-key-open"></i></button>`}
                        <button class="icon-btn danger btn-delete-acc" data-id="${acc.id}" title="Delete account"><i class="ph ph-trash"></i></button>
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
            <div class="txn-list">${txnsHtml || '<div class="empty" style="padding:20px"><div class="empty-sub">No transactions yet — add a repayment above</div></div>'}</div>
        `;
        container.appendChild(card);
    });

    document.querySelectorAll('.btn-add-txn').forEach(btn => {
        btn.onclick = (e) => {
            const accId = e.currentTarget.dataset.id;
            const acc = state.accounts.find(a => a.id === accId);
            document.getElementById('modal-txn-title').innerText = "Add Repayment";
            document.getElementById('submit-txn').innerText = "Add Repayment";
            document.getElementById('input-txn-id').value = '';
            document.getElementById('input-txn-acc-id').value = accId;
            document.getElementById('input-txn-acc-id').dataset.startDate = acc ? acc.startDate : '';
            const dateInput = document.getElementById('input-txn-date');
            dateInput.value = getTodayStr();
            dateInput.max = getTodayStr();
            dateInput.min = acc ? acc.startDate : '';
            document.getElementById('input-txn-amount').value = '';
            document.getElementById('input-txn-notes').value = '';
            document.getElementById('input-txn-mode').value = 'Cash';
            document.getElementById('input-txn-txnid').value = '';

            const metrics = calculateAccountMetrics(acc, state.transactions);
            const outstanding = metrics.outstandingPrincipal + metrics.outstandingInterest;
            document.getElementById('txn-outstanding-hint').innerText =
                `Outstanding: ${formatCurrency(outstanding)} (P: ${formatCurrency(metrics.outstandingPrincipal)} + I: ${formatCurrency(metrics.outstandingInterest)})`;
            document.getElementById('txn-outstanding-hint').style.display = 'block';
            document.getElementById('input-txn-max').value = outstanding;

            openModal('modal-add-txn');
        };
    });

    document.querySelectorAll('.btn-edit-acc').forEach(btn => {
        btn.onclick = (e) => {
            const accId = e.currentTarget.dataset.id;
            const acc = state.accounts.find(a => a.id === accId);
            if (acc) {
                const txnCount = state.transactions.filter(t => t.accountId === accId).length;
                if (txnCount > 0) {
                    if (!confirm(`⚠️ Warning: This account has ${txnCount} transaction(s). Changing the principal amount or start date will recalculate all historical interest figures. Proceed?`)) return;
                }

                document.getElementById('modal-acc-title').innerText = "Edit Loan Account";
                document.getElementById('submit-account').innerText = "Save Changes";
                document.getElementById('input-acc-id').value = acc.id;

                const select = document.getElementById('input-acc-portfolio');
                select.innerHTML = '';
                state.portfolios.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p; opt.textContent = p;
                    select.appendChild(opt);
                });
                select.value = acc.portfolioId;

                document.getElementById('input-acc-amount').value = acc.principal;
                document.getElementById('input-acc-rate').value = acc.rate;
                const dateInput = document.getElementById('input-acc-date');
                dateInput.value = acc.startDate;
                dateInput.max = getTodayStr();
                document.getElementById('input-acc-mode').value = acc.mode;
                document.getElementById('input-acc-txnid').value = acc.txnId || '';
                document.getElementById('input-acc-notes').value = acc.notes || '';
                openModal('modal-add-account');
            }
        };
    });

    document.querySelectorAll('.btn-close-acc').forEach(btn => {
        btn.onclick = (e) => {
            if (confirm("Are you sure you want to close this account? It will stop accruing interest from today.")) {
                const accId = e.currentTarget.dataset.id;
                const acc = state.accounts.find(a => a.id === accId);
                if (acc) {
                    acc.status = 'closed';
                    acc.closedDate = getTodayStr();
                    autoSave();
                }
                refreshUI();
            }
        };
    });

    document.querySelectorAll('.btn-reopen-acc').forEach(btn => {
        btn.onclick = (e) => {
            if (confirm("Reopen this account? Interest will resume accruing from today.")) {
                const accId = e.currentTarget.dataset.id;
                const acc = state.accounts.find(a => a.id === accId);
                if (acc) {
                    acc.status = 'active';
                    delete acc.closedDate;
                    autoSave();
                }
                refreshUI();
            }
        };
    });

    document.querySelectorAll('.btn-delete-acc').forEach(btn => {
        btn.onclick = (e) => {
            if (confirm("Are you sure you want to permanently delete this account and ALL its transactions?")) {
                const accId = e.currentTarget.dataset.id;
                state.accounts = state.accounts.filter(a => a.id !== accId);
                state.transactions = state.transactions.filter(t => t.accountId !== accId);
                autoSave();
                refreshUI();
            }
        };
    });

    document.querySelectorAll('.btn-edit-txn').forEach(btn => {
        btn.onclick = (e) => {
            const txnId = e.currentTarget.dataset.id;
            const txn = state.transactions.find(t => t.id === txnId);
            if (txn) {
                const acc = state.accounts.find(a => a.id === txn.accountId);
                document.getElementById('modal-txn-title').innerText = "Edit Transaction";
                document.getElementById('submit-txn').innerText = "Save Changes";
                document.getElementById('input-txn-id').value = txn.id;
                document.getElementById('input-txn-acc-id').value = txn.accountId;
                document.getElementById('input-txn-acc-id').dataset.startDate = acc ? acc.startDate : '';
                document.getElementById('input-txn-type').value = txn.type;
                document.getElementById('input-txn-amount').value = txn.amount;
                const dateInput = document.getElementById('input-txn-date');
                dateInput.value = txn.date;
                dateInput.max = getTodayStr();
                dateInput.min = acc ? acc.startDate : '';
                document.getElementById('input-txn-notes').value = txn.notes || '';
                document.getElementById('input-txn-mode').value = txn.mode || 'Cash';
                document.getElementById('input-txn-txnid').value = txn.txnId || '';
                document.getElementById('txn-outstanding-hint').style.display = 'none';
                openModal('modal-add-txn');
            }
        };
    });

    document.querySelectorAll('.btn-delete-txn').forEach(btn => {
        btn.onclick = (e) => {
            if (confirm("Delete this transaction? This cannot be undone.")) {
                const txnId = e.currentTarget.dataset.id;
                state.transactions = state.transactions.filter(t => t.id !== txnId);
                autoSave();
                refreshUI();
            }
        };
    });
};

// --- NAVIGATION & MODALS ---
const switchView = (viewId) => {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'));

    document.getElementById(`view-${viewId}`).classList.add('active');
    const navBtn = document.querySelector(`[data-view="${viewId}"]`);
    if (navBtn) navBtn.classList.add('active');

    if (viewId === 'dashboard') currentBorrowerId = null;

    if (window.innerWidth <= 860) {
        document.getElementById('sidebar').classList.remove('open');
    }

    refreshUI();
};

const openModal = (id) => {
    document.body.classList.add('modal-open');
    document.getElementById('modal-backdrop').classList.remove('hidden');
    document.getElementById(id).classList.remove('hidden');
};

const closeModal = () => {
    document.body.classList.remove('modal-open');
    document.getElementById('modal-backdrop').classList.add('hidden');
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
};

// --- IMPORT ---
let importPendingData = null;

const importData = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const parsed = JSON.parse(e.target.result);
            if (!parsed.borrowers || !parsed.accounts || !parsed.transactions) {
                alert('Invalid backup file. Must contain borrowers, accounts, and transactions.');
                return;
            }
            importPendingData = parsed;
            const b = parsed.borrowers.length, a = parsed.accounts.length, t = parsed.transactions.length;
            document.getElementById('import-preview').textContent =
                `Found: ${b} borrower${b!==1?'s':''}, ${a} account${a!==1?'s':''}, ${t} transaction${t!==1?'s':''}`;
            openModal('modal-import-confirm');
        } catch(err) {
            alert('Could not read file. Make sure it is a valid Vault JSON backup.');
        }
    };
    reader.readAsText(file);
};

// --- EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    refreshUI();

    const searchInput = document.getElementById('input-search-borrowers');
    if (searchInput) searchInput.addEventListener('input', () => renderBorrowersList());

    const sortSelect = document.getElementById('select-sort-borrowers');
    if (sortSelect) sortSelect.addEventListener('change', () => renderBorrowersList());

    document.getElementById('mobile-close-btn').onclick = () =>
        document.getElementById('sidebar').classList.remove('open');
    document.querySelectorAll('.mobile-open-btn').forEach(btn => {
        btn.onclick = () => document.getElementById('sidebar').classList.add('open');
    });

    document.querySelectorAll('.nav-btn').forEach(btn => {
        if (btn.dataset.view) {
            btn.addEventListener('click', (e) => switchView(e.currentTarget.dataset.view));
        }
    });

    document.getElementById('btn-back-borrowers').onclick = () => switchView('borrowers');
    const bb2 = document.getElementById('btn-back-borrowers-2');
    if (bb2) bb2.onclick = () => switchView('borrowers');

    document.getElementById('btn-import-data').onclick = () =>
        document.getElementById('import-file-input').click();
    document.getElementById('import-file-input').onchange = (e) => {
        if (e.target.files[0]) importData(e.target.files[0]);
        e.target.value = '';
    };
    document.getElementById('btn-import-confirm').onclick = () => {
        if (!importPendingData) return;

        // Preserve current UI preferences
        const preservedTheme = state.theme;
        const preservedActivePortfolio = state.activePortfolio;

        // Validate imported data
        let validationErrors = [];
        (importPendingData.accounts || []).forEach((acc, idx) => {
            if (acc.status === 'closed' && acc.closedDate) {
                if (acc.closedDate < acc.startDate) {
                    validationErrors.push(`Account #${idx+1}: closedDate (${acc.closedDate}) is before startDate (${acc.startDate})`);
                }
                if (acc.closedDate > getTodayStr()) {
                    validationErrors.push(`Account #${idx+1}: closedDate (${acc.closedDate}) is in the future`);
                }
            }
        });

        if (validationErrors.length > 0) {
            if (!confirm('⚠️ Data validation warnings found:\n\n' + validationErrors.join('\n') + '\n\nProceed with import anyway?')) {
                return;
            }
        }

        state = { 
            ...importPendingData,
            theme: preservedTheme,
            activePortfolio: preservedActivePortfolio
        };
        autoSave();
        closeModal();
        importPendingData = null;
        switchView('dashboard');
        alert('Import successful.');
    };
    document.getElementById('btn-import-cancel').onclick = () => {
        importPendingData = null;
        closeModal();
    };

    document.getElementById('portfolio-select').addEventListener('change', (e) => {
        state.activePortfolio = e.target.value;
        switchView('dashboard');
    });

    document.getElementById('btn-manage-portfolios').onclick = () => openModal('modal-manage-portfolios');

    document.getElementById('btn-create-portfolio').onclick = () => {
        const val = document.getElementById('input-new-portfolio').value.trim();
        if (!val) return;
        if (state.portfolios.includes(val) || val === '__ALL__') return alert('Invalid or existing portfolio name!');
        state.portfolios.push(val);
        document.getElementById('input-new-portfolio').value = '';
        autoSave();
        refreshUI();
    };

    document.getElementById('btn-export-data').onclick = exportData;

    document.querySelectorAll('.close-modal').forEach(el => {
        el.onclick = () => closeModal();
    });
    document.getElementById('modal-backdrop').onclick = (e) => {
        if (e.target === document.getElementById('modal-backdrop')) closeModal();
    };

    document.getElementById('btn-add-person').onclick = () => {
        document.getElementById('modal-person-title').innerText = "Add Person";
        document.getElementById('input-person-id').value = '';
        document.getElementById('input-person-name').value = '';
        document.getElementById('input-person-phone').value = '';
        openModal('modal-add-person');
    };

    document.getElementById('btn-edit-person').onclick = () => {
        const boundId = document.getElementById('btn-delete-person').dataset.borrowerId;
        const b = state.borrowers.find(x => x.id === boundId);
        if (b) {
            document.getElementById('modal-person-title').innerText = "Edit Person";
            document.getElementById('input-person-id').value = b.id;
            document.getElementById('input-person-name').value = b.name;
            document.getElementById('input-person-phone').value = b.phone || '';
            openModal('modal-add-person');
        }
    };

    document.getElementById('btn-add-account').onclick = (e) => {
        const boundBorrowerId = e.currentTarget.dataset.borrowerId;
        if (!boundBorrowerId) return alert('Error: Please close and re-open ledger.');

        document.getElementById('modal-acc-title').innerText = "Add Loan Account";
        document.getElementById('submit-account').innerText = "Create Account";
        document.getElementById('input-acc-id').value = '';

        const select = document.getElementById('input-acc-portfolio');
        select.innerHTML = '';
        state.portfolios.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p; opt.textContent = p;
            select.appendChild(opt);
        });
        select.value = state.activePortfolio === '__ALL__' ? state.portfolios[0] : state.activePortfolio;

        const dateInput = document.getElementById('input-acc-date');
        dateInput.value = getTodayStr();
        dateInput.max = getTodayStr();

        document.getElementById('input-acc-amount').value = '';
        document.getElementById('input-acc-rate').value = '';
        document.getElementById('input-acc-txnid').value = '';
        document.getElementById('input-acc-notes').value = '';
        openModal('modal-add-account');
    };

    document.getElementById('btn-delete-person').onclick = (e) => {
        if (confirm("DANGER: Delete this entire person and ALL their accounts/transactions globally?")) {
            const boundId = e.currentTarget.dataset.borrowerId;
            state.borrowers = state.borrowers.filter(b => b.id !== boundId);
            const accountIds = state.accounts.filter(a => a.borrowerId === boundId).map(a => a.id);
            state.accounts = state.accounts.filter(a => a.borrowerId !== boundId);
            state.transactions = state.transactions.filter(t => !accountIds.includes(t.accountId));
            autoSave();
            switchView('borrowers');
        }
    };

    document.getElementById('submit-person').onclick = () => {
        const id = document.getElementById('input-person-id').value;
        const name = document.getElementById('input-person-name').value.trim();
        const phone = document.getElementById('input-person-phone').value.trim();
        if (!name) return alert('Name is required.');

        // Check for duplicate names (case-insensitive, only for new borrowers)
        if (!id) {
            const normalizedName = name.toLowerCase();
            const existing = state.borrowers.find(b => b.name.trim().toLowerCase() === normalizedName);
            if (existing) {
                if (!confirm(`A borrower named "${escapeHtml(existing.name)}" already exists.\n\nCreate another entry with the same name?`)) {
                    return;
                }
            }
        }

        if (id) {
            const b = state.borrowers.find(x => x.id === id);
            if (b) { b.name = name; b.phone = phone; }
        } else {
            state.borrowers.push({ id: generateId(), name, phone });
        }
        autoSave();
        closeModal();
        refreshUI();
    };

    document.getElementById('submit-account').onclick = () => {
        const id = document.getElementById('input-acc-id').value;
        const portfolioId = document.getElementById('input-acc-portfolio').value;
        const principal = parseFloat(document.getElementById('input-acc-amount').value);
        const rate = parseFloat(document.getElementById('input-acc-rate').value);
        const startDate = document.getElementById('input-acc-date').value;
        const mode = document.getElementById('input-acc-mode').value;
        const txnId = document.getElementById('input-acc-txnid').value.trim();
        const notes = document.getElementById('input-acc-notes').value.trim();

        const boundBorrowerId = document.getElementById('btn-add-account').dataset.borrowerId;

        if (!boundBorrowerId) return alert('No borrower selected. Please close and re-open ledger.');
        if (!principal || principal <= 0) return alert('Principal amount must be greater than 0.');
        if (!rate || rate <= 0) return alert('Interest rate must be greater than 0.');
        if (!startDate) return alert('Start date is required.');
        if (startDate > getTodayStr()) return alert('Future dates are not allowed!');

        if (id) {
            const acc = state.accounts.find(a => a.id === id);
            if (acc) {
                acc.portfolioId = portfolioId;
                acc.principal = principal;
                acc.rate = rate;
                acc.startDate = startDate;
                acc.mode = mode;
                acc.txnId = txnId;
                acc.notes = notes;
            }
        } else {
            state.accounts.push({ id: generateId(), borrowerId: boundBorrowerId, portfolioId, principal, rate, startDate, mode, txnId, notes, status: 'active' });
        }
        autoSave();
        closeModal();
        refreshUI();
    };

    document.getElementById('submit-txn').onclick = () => {
        const id = document.getElementById('input-txn-id').value;
        const accountId = document.getElementById('input-txn-acc-id').value;
        const accountStartDate = document.getElementById('input-txn-acc-id').dataset.startDate;
        const type = document.getElementById('input-txn-type').value;
        const amount = parseFloat(document.getElementById('input-txn-amount').value);
        const date = document.getElementById('input-txn-date').value;
        const notes = document.getElementById('input-txn-notes').value.trim();
        const mode = document.getElementById('input-txn-mode').value;
        const txnId = document.getElementById('input-txn-txnid').value.trim();
        const maxOutstanding = parseFloat(document.getElementById('input-txn-max').value) || Infinity;

        if (!amount || amount <= 0) return alert('Amount must be greater than 0.');
        if (!date) return alert('Date is required.');

        if (accountStartDate && date < accountStartDate) {
            return alert(`Transaction date cannot be before the loan start date (${formatDate(accountStartDate)}).`);
        }
        if (date > getTodayStr()) return alert('Future dates are not allowed!');

        if ((type === 'repayment' || type === 'payment_principal' || type === 'payment_interest') && amount > maxOutstanding + 0.5) {
            return alert(`Amount (${formatCurrency(amount)}) exceeds the outstanding balance (${formatCurrency(maxOutstanding)}). Please check the amount.`);
        }

        if (id) {
            const txn = state.transactions.find(t => t.id === id);
            if (txn) {
                txn.type = type;
                txn.amount = amount;
                txn.date = date;
                txn.notes = notes;
                txn.mode = mode;
                txn.txnId = txnId;
            }
        } else {
            state.transactions.push({ id: generateId(), accountId, type, amount, date, notes, mode, txnId });
        }

        autoSave();
        closeModal();
        refreshUI();
    };
});

// --- SWIPE GESTURES ---
// Swipe right from left edge → open sidebar
// Swipe left on open sidebar → close sidebar
// Finger follows the sidebar in real time

(function() {
    const SIDEBAR_WIDTH = 260;
    const EDGE_ZONE = 24;        // px from left edge that triggers open gesture
    const SWIPE_THRESHOLD = 60;  // px dragged to commit open/close
    const VELOCITY_THRESHOLD = 0.3; // px/ms — fast flick commits even under threshold

    const sidebar = document.getElementById('sidebar');
    const backdrop = document.getElementById('modal-backdrop');

    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let isDragging = false;
    let isHorizontal = null;  // null = undecided, true = horizontal, false = vertical
    let sidebarWasOpen = false;

    const getSidebarOpen = () => sidebar.classList.contains('open');

    const setSidebarPosition = (x) => {
        // x = how many px the sidebar is translated (0 = fully open, -SIDEBAR_WIDTH = fully closed)
        const clamped = Math.max(-SIDEBAR_WIDTH, Math.min(0, x));
        sidebar.style.transition = 'none';
        sidebar.style.transform = `translateX(${clamped}px)`;

        // Fade backdrop proportionally
        const progress = (clamped + SIDEBAR_WIDTH) / SIDEBAR_WIDTH; // 0..1
        if (progress > 0) {
            backdrop.classList.remove('hidden');
            // Only show backdrop dimming, not the modal sheets
            backdrop.style.background = `rgba(0,0,0,${0.6 * progress})`;
            backdrop.style.backdropFilter = `blur(${4 * progress}px)`;
            backdrop.style.webkitBackdropFilter = `blur(${4 * progress}px)`;
            backdrop.style.pointerEvents = 'none'; // don't block taps during drag
        } else {
            backdrop.classList.add('hidden');
            backdrop.style.pointerEvents = '';
        }
    };

    const commitSidebar = (open) => {
        sidebar.style.transition = '';   // restore CSS transition
        sidebar.style.transform = '';
        backdrop.style.background = '';
        backdrop.style.backdropFilter = '';
        backdrop.style.webkitBackdropFilter = '';
        backdrop.style.pointerEvents = '';

        if (open) {
            sidebar.classList.add('open');
            backdrop.classList.remove('hidden');
            // Backdrop should block taps to close (but not show modal sheets)
            backdrop.style.background = 'rgba(0,0,0,0.6)';
            backdrop.style.backdropFilter = 'blur(4px)';
            backdrop.style.webkitBackdropFilter = 'blur(4px)';
            // Tapping backdrop closes sidebar
            backdrop.onclick = (e) => {
                if (e.target === backdrop) {
                    closeSidebarFromBackdrop();
                }
            };
        } else {
            sidebar.classList.remove('open');
            backdrop.classList.add('hidden');
            backdrop.style.background = '';
            backdrop.style.backdropFilter = '';
            backdrop.style.webkitBackdropFilter = '';
            backdrop.onclick = (e) => {
                if (e.target === backdrop) closeModal();
            };
        }
    };

    const closeSidebarFromBackdrop = () => {
        sidebar.classList.remove('open');
        backdrop.classList.add('hidden');
        backdrop.style.background = '';
        backdrop.style.backdropFilter = '';
        backdrop.style.webkitBackdropFilter = '';
        backdrop.onclick = (e) => {
            if (e.target === backdrop) closeModal();
        };
    };

    document.addEventListener('touchstart', (e) => {
        // Ignore multi-touch
        if (e.touches.length !== 1) return;
        // Ignore if a modal sheet is open
        if (!document.getElementById('modal-backdrop').classList.contains('hidden') && 
            !getSidebarOpen()) return;

        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartTime = Date.now();
        isHorizontal = null;
        isDragging = false;
        sidebarWasOpen = getSidebarOpen();

        // Only start gesture if:
        // - sidebar is open (swipe anywhere to close), OR
        // - touch starts within left edge zone (swipe to open)
        if (!sidebarWasOpen && touchStartX > EDGE_ZONE) return;

        isDragging = true;
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!isDragging || e.touches.length !== 1) return;

        const dx = e.touches[0].clientX - touchStartX;
        const dy = e.touches[0].clientY - touchStartY;

        // On first meaningful move, decide if this is horizontal or vertical
        if (isHorizontal === null && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
            isHorizontal = Math.abs(dx) > Math.abs(dy);
        }

        // If vertical scroll, abandon gesture
        if (isHorizontal === false) {
            isDragging = false;
            return;
        }

        if (!isHorizontal) return;

        if (sidebarWasOpen) {
            // Dragging left to close: sidebar starts at 0, moves negative
            const x = Math.min(0, dx);
            setSidebarPosition(x);
        } else {
            // Dragging right to open: sidebar starts at -SIDEBAR_WIDTH
            const x = -SIDEBAR_WIDTH + Math.max(0, dx);
            setSidebarPosition(x);
        }
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        if (!isDragging || isHorizontal !== true) {
            isDragging = false;
            return;
        }
        isDragging = false;

        const dx = e.changedTouches[0].clientX - touchStartX;
        const dt = Date.now() - touchStartTime;
        const velocity = Math.abs(dx) / dt;

        if (sidebarWasOpen) {
            // Commit close if dragged far enough left OR fast flick left
            const shouldClose = dx < -SWIPE_THRESHOLD || (dx < -10 && velocity > VELOCITY_THRESHOLD);
            commitSidebar(!shouldClose);
        } else {
            // Commit open if dragged far enough right OR fast flick right
            const shouldOpen = dx > SWIPE_THRESHOLD || (dx > 10 && velocity > VELOCITY_THRESHOLD);
            commitSidebar(shouldOpen);
        }
    }, { passive: true });

})();
