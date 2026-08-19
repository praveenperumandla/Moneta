import { getCachedMetrics } from './engine.js';

export const lendingModule = {
    id: 'lending',
    label: 'Lending',
    icon: 'ph-hand-coins',
    kind: 'asset',
    views: ['borrowers', 'ledger'],
    snapshot(state) {
        const accounts = state.accounts || [];
        const txns = state.transactions || [];
        let assets = 0;
        accounts.forEach(acc => {
            const m = getCachedMetrics(acc, txns);
            assets += m.outstandingPrincipal + m.outstandingInterest;
        });
        return { id: 'lending', label: 'Lending', assets, liabilities: 0 };
    }
};
