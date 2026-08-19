export let state = {
    activePortfolio: '__ALL__',
    theme: 'dark',
    portfolios: ['Self', 'Mother', 'Wife'],
    borrowers: [],
    accounts: [],
    transactions: []
};

export let currentBorrowerId = null;
export let loadFailed = false;
export let importPendingData = null;

export const getState = () => state;
export const setState = (next) => { state = next; };
export const getCurrentBorrowerId = () => currentBorrowerId;
export const setCurrentBorrowerId = (id) => { currentBorrowerId = id; };
export const getLoadFailed = () => loadFailed;
export const setLoadFailed = (v) => { loadFailed = v; };
export const getImportPending = () => importPendingData;
export const setImportPending = (v) => { importPendingData = v; };

export const getActiveData = () => {
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
