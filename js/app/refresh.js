import { getActiveData, getCurrentBorrowerId } from './state.js';
import { clearMetricsCache } from '../core/accounting.js';
import { renderPortfolioHeader, updatePortfolioDropdowns } from '../ui/settings.js';
import { updateDashboard, renderHome } from '../ui/home.js';
import { renderBorrowersList } from '../modules/lending/list.js';
import { renderLedgerHeader, renderLedgerView } from '../modules/lending/ledger.js';
import { renderRecentTransactions } from '../ui/transactions.js';

export const refreshUI = () => {
    clearMetricsCache();
    renderPortfolioHeader();
    updatePortfolioDropdowns();

    const homeActive = document.getElementById('view-home')?.classList.contains('active');
    const borrowersActive = document.getElementById('view-borrowers')?.classList.contains('active');
    const txnsActive = document.getElementById('view-transactions')?.classList.contains('active');
    const borrowerId = getCurrentBorrowerId();

    if (homeActive) {
        updateDashboard();
        renderHome();
    }
    if (borrowersActive) {
        renderBorrowersList();
    }
    if (txnsActive) {
        renderRecentTransactions(getActiveData(), 'all-txns-list', null);
    }
    if (borrowerId) {
        renderLedgerHeader(borrowerId);
        renderLedgerView(borrowerId);
    }
};
