import { getDaysBetween, getTodayStr } from './dates.js';

export const calculateAccountMetrics = (account, allTxns, asOfDate = null) => {
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

export const clearMetricsCache = () => {
    metricsCache = null;
};

export const getCachedMetrics = (acc, txns) => {
    if (!metricsCache) metricsCache = new Map();
    if (metricsCache.has(acc.id)) return metricsCache.get(acc.id);
    const m = calculateAccountMetrics(acc, txns);
    metricsCache.set(acc.id, m);
    return m;
};

export const getBorrowerStats = (borrowerId, activeData) => {
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
