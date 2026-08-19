import { formatCurrency, formatDate } from '../core/money.js';
import { getTodayStr } from '../core/dates.js';
import { getState, getActiveData } from '../app/state.js';
import { snapshotAll } from '../modules/registry.js';
import { totalNetWorth } from '../modules/networth/aggregator.js';
import { getCachedMetrics, getBorrowerStats } from '../core/accounting.js';
import { calculateXIRR } from '../core/xirr.js';

export const updateDashboard = () => {
    const activeData = getActiveData();
    const state = getState();
    let gPrincipal = 0, gInterest = 0;
    const activeCount = activeData.accounts.filter(a => a.status !== 'closed').length;

    activeData.accounts.forEach(acc => {
        const m = getCachedMetrics(acc, activeData.transactions);
        gPrincipal += m.outstandingPrincipal;
        gInterest  += m.outstandingInterest;
    });

    activeData.borrowers.forEach(b => {
        getBorrowerStats(b.id, activeData);
    });

    const expected = gPrincipal + gInterest;
    const cashFlows = [];

    activeData.accounts.forEach(acc => {
        cashFlows.push({ date: acc.startDate, amount: -acc.principal });
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
        const latestClosed = activeData.accounts.reduce((latest, a) => {
            if (!a.closedDate) return latest;
            return a.closedDate > latest ? a.closedDate : latest;
        }, '1970-01-01');
        if (latestClosed !== '1970-01-01') {
            cashFlows.push({ date: latestClosed, amount: 0 });
        }
    }

    calculateXIRR(cashFlows);

    const dateEl = document.getElementById('home-date');
    if (dateEl) {
        dateEl.textContent = state.activePortfolio === '__ALL__'
            ? 'Aggregate · as of ' + formatDate(getTodayStr())
            : state.activePortfolio + ' · as of ' + formatDate(getTodayStr());
    }
};

export const renderHome = () => {
    const snaps = snapshotAll(getActiveData());
    const totals = totalNetWorth(snaps);
    const lending = snaps.find(s => s.id === 'lending');

    const elNetWorth = document.getElementById('stat-net-worth');
    if (elNetWorth) elNetWorth.textContent = formatCurrency(totals.net);
    const elLendingAssets = document.getElementById('stat-lending-assets');
    if (elLendingAssets) elLendingAssets.textContent = formatCurrency(lending ? lending.assets : 0);
    const elLiabilities = document.getElementById('stat-total-liabilities');
    if (elLiabilities) elLiabilities.textContent = formatCurrency(totals.liabilities);
    const elAssets = document.getElementById('stat-total-assets');
    if (elAssets) elAssets.textContent = formatCurrency(totals.assets);
};
