export const ACC = {
    id: 'acc-1',
    borrowerId: 'bor-1',
    portfolioId: 'Self',
    principal: 100000,
    rate: 12,
    startDate: '2024-01-01',
    status: 'active',
    mode: 'Cash'
};

export const cases = {
    G1: {
        name: 'accrual across month boundary',
        account: { ...ACC },
        txns: [],
        asOf: '2024-02-01'
    },
    G2: {
        name: 'repayment splits interest then principal',
        account: { ...ACC },
        txns: [
            { id: 't1', accountId: 'acc-1', type: 'repayment', amount: 5000, date: '2024-04-01' }
        ],
        asOf: '2024-04-01'
    },
    G3: {
        name: 'payment_interest only',
        account: { ...ACC },
        txns: [
            { id: 't1', accountId: 'acc-1', type: 'payment_interest', amount: 2000, date: '2024-04-01' }
        ],
        asOf: '2024-04-01'
    },
    G4: {
        name: 'payment_principal only',
        account: { ...ACC },
        txns: [
            { id: 't1', accountId: 'acc-1', type: 'payment_principal', amount: 10000, date: '2024-04-01' }
        ],
        asOf: '2024-04-01'
    },
    G5: {
        name: 'writeoff principal and interest',
        account: { ...ACC },
        txns: [
            { id: 't1', accountId: 'acc-1', type: 'writeoff_interest', amount: 1500, date: '2024-03-01' },
            { id: 't2', accountId: 'acc-1', type: 'writeoff', amount: 40000, date: '2024-03-15' }
        ],
        asOf: '2024-03-15'
    },
    G6: {
        name: 'closed account uses closedDate not today',
        account: { ...ACC, status: 'closed', closedDate: '2024-06-01' },
        txns: [],
        asOf: null
    },
    G7: {
        name: 'txn before startDate is ignored',
        account: { ...ACC },
        txns: [
            { id: 't0', accountId: 'acc-1', type: 'repayment', amount: 99999, date: '2023-12-01' }
        ],
        asOf: '2024-02-01'
    },
    G8: {
        name: 'asOfDate historical snapshot ignores later txns',
        account: { ...ACC },
        txns: [
            { id: 't1', accountId: 'acc-1', type: 'repayment', amount: 20000, date: '2024-06-01' }
        ],
        asOf: '2024-03-01'
    },
    G10: {
        name: 'fully repaid principal',
        account: { ...ACC },
        txns: [
            { id: 't1', accountId: 'acc-1', type: 'payment_principal', amount: 100000, date: '2024-01-01' }
        ],
        asOf: '2024-06-01'
    }
};

export const xirrCase = {
    name: 'one year 10 percent round trip',
    cashflows: [
        { date: '2024-01-01', amount: -100000 },
        { date: '2025-01-01', amount: 110000 }
    ]
};

export const vaultLegacy = {
    portfolios: ['Self', 'Mother'],
    data: {
        Self: {
            borrowers: [{ id: 'local-1', name: 'Ravi', phone: '999' }],
            accounts: [{ id: 'a1', borrowerId: 'local-1', principal: 10000, rate: 10, startDate: '2024-01-01', status: 'active' }],
            transactions: [{ id: 't1', accountId: 'a1', type: 'repayment', amount: 500, date: '2024-02-01' }]
        },
        Mother: {
            borrowers: [{ id: 'local-2', name: 'Ravi', phone: '' }, { id: 'local-3', name: 'Anita', phone: '' }],
            accounts: [{ id: 'a2', borrowerId: 'local-2', principal: 20000, rate: 12, startDate: '2024-03-01', status: 'active' }],
            transactions: []
        }
    }
};

export const schemaV2Doc = {
    schemaVersion: 2,
    portfolios: ['Self'],
    activePortfolio: 'Self',
    modules: {
        lending: {
            borrowers: [{ id: 'b1', name: 'Dev' }],
            accounts: [{ id: 'a1', borrowerId: 'b1', principal: 1, rate: 1, startDate: '2024-01-01' }],
            transactions: []
        }
    }
};
