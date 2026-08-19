import { bus } from './js/app/bus.js';
import { loadData, autoSave, bindPersistenceLifecycle } from './js/app/persistence.js';
import { switchView, bindNav, bindSwipeBack, bindTabBarAutoHide } from './js/app/nav.js';
import { refreshUI } from './js/app/refresh.js';
import { openModal, closeModal, bindSheetChrome } from './js/ui/sheets.js';
import { bindSettings } from './js/ui/settings.js';
import { bindTransactionsTab } from './js/ui/transactions.js';
import { bindBorrowersListChrome } from './js/modules/lending/list.js';
import { bindLedgerForms, openLedger } from './js/modules/lending/ledger.js';
import { register } from './js/modules/registry.js';
import { lendingModule } from './js/modules/lending/index.js';

register(lendingModule);

bus.refreshUI = refreshUI;
bus.autoSave = autoSave;
bus.openModal = openModal;
bus.closeModal = closeModal;
bus.switchView = switchView;
bus.openLedger = openLedger;

window.switchView = switchView;

bindPersistenceLifecycle();

document.addEventListener('DOMContentLoaded', () => {
    loadData();
    bindNav();
    bindSheetChrome();
    bindSettings();
    bindBorrowersListChrome();
    bindLedgerForms();
    bindTransactionsTab();
    bindSwipeBack();
    bindTabBarAutoHide();
    switchView('borrowers');

    fetch('VERSION', { cache: 'no-store' })
        .then(r => r.ok ? r.text() : Promise.reject())
        .then(v => {
            const label = document.getElementById('app-version-label');
            if (label && v.trim()) label.textContent = v.trim();
        })
        .catch(() => {});
});
