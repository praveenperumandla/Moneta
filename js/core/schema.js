export const SCHEMA_V1 = 1;
export const SCHEMA_V2 = 2;

export const detectSchemaVersion = (doc) => {
    if (!doc || typeof doc !== 'object') return 0;
    if (doc.schemaVersion === 2 || (doc.modules && typeof doc.modules === 'object')) return SCHEMA_V2;
    if (doc.data && !doc.borrowers) return 0;
    return SCHEMA_V1;
};

export const flattenToV1 = (doc) => {
    const version = detectSchemaVersion(doc);
    if (version === SCHEMA_V2) {
        const lending = doc.modules?.lending || {};
        return {
            borrowers: Array.isArray(lending.borrowers) ? lending.borrowers : [],
            accounts: Array.isArray(lending.accounts) ? lending.accounts : [],
            transactions: Array.isArray(lending.transactions) ? lending.transactions : [],
            portfolios: Array.isArray(doc.portfolios) && doc.portfolios.length ? doc.portfolios : ['Self'],
            activePortfolio: doc.activePortfolio || '__ALL__',
            theme: doc.theme || 'dark'
        };
    }
    return {
        borrowers: Array.isArray(doc.borrowers) ? doc.borrowers : [],
        accounts: Array.isArray(doc.accounts) ? doc.accounts : [],
        transactions: Array.isArray(doc.transactions) ? doc.transactions : [],
        portfolios: Array.isArray(doc.portfolios) && doc.portfolios.length ? doc.portfolios : ['Self', 'Mother', 'Wife'],
        activePortfolio: doc.activePortfolio || '__ALL__',
        theme: doc.theme || 'dark'
    };
};

export const validateV1 = (doc) =>
    !!(doc && Array.isArray(doc.borrowers) && Array.isArray(doc.accounts) && Array.isArray(doc.transactions));

export const toV1Export = (state) => ({
    borrowers: state.borrowers,
    accounts: state.accounts,
    transactions: state.transactions,
    portfolios: state.portfolios
});
