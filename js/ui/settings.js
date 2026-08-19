import { escapeHtml } from '../core/html.js';
import { getState, setImportPending } from '../app/state.js';
import { bus } from '../app/bus.js';
import { exportData, importData, applyPendingImport } from '../app/persistence.js';

export const renderPortfolioHeader = () => {
    const state = getState();
    const label = document.getElementById('hdr-portfolio-label');
    const icon = document.getElementById('hdr-avatar-icon');
    if (label && icon) {
        if (state.activePortfolio === '__ALL__') {
            label.textContent = 'All Portfolios';
            icon.innerHTML = '<i class="ph ph-users"></i>';
        } else {
            label.textContent = state.activePortfolio;
            const initials = state.activePortfolio.substring(0, 2).toUpperCase();
            icon.innerHTML = initials;
        }
    }
};

export const openPortfolioPicker = () => {
    const state = getState();
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
            bus.autoSave();
            bus.closeModal();
            renderPortfolioHeader();
            bus.switchView('borrowers');
        };
        list.appendChild(el);
    });

    bus.openModal('modal-portfolio-picker');
};

export const updatePortfolioDropdowns = () => {
    const state = getState();
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
                    if (!confirm(`Delete portfolio "${p}" and ALL its accounts/transactions?`)) return;
                    state.portfolios = state.portfolios.filter(x => x !== p);
                    const toDelete = state.accounts.filter(a => a.portfolioId === p).map(a => a.id);
                    state.accounts = state.accounts.filter(a => a.portfolioId !== p);
                    state.transactions = state.transactions.filter(t => !toDelete.includes(t.accountId));
                    if (state.activePortfolio === p) state.activePortfolio = state.portfolios[0];
                    bus.autoSave(); bus.refreshUI();
                };
                li.appendChild(delBtn);
            }
            editList.appendChild(li);
        });
    }
};

export const bindSettings = () => {
    document.getElementById('hdr-avatar').onclick = openPortfolioPicker;

    document.getElementById('btn-manage-portfolios').onclick = () => {
        updatePortfolioDropdowns();
        bus.openModal('modal-manage-portfolios');
    };
    document.getElementById('btn-export-data').onclick = exportData;
    document.getElementById('btn-import-data').onclick = () => document.getElementById('import-file-input').click();
    document.getElementById('import-file-input').onchange = (e) => {
        if (e.target.files[0]) importData(e.target.files[0]);
        e.target.value = '';
    };

    document.getElementById('btn-create-portfolio').onclick = () => {
        const state = getState();
        const val = document.getElementById('input-new-portfolio').value.trim();
        if (!val) return;
        if (state.portfolios.includes(val) || val === '__ALL__') return alert('Invalid or existing portfolio name!');
        state.portfolios.push(val);
        document.getElementById('input-new-portfolio').value = '';
        bus.autoSave(); bus.refreshUI();
    };

    document.getElementById('btn-import-confirm').onclick = () => {
        if (!applyPendingImport()) return;
        bus.closeModal();
        bus.switchView('home');
        alert('Import successful.');
    };
    document.getElementById('btn-import-cancel').onclick = () => {
        setImportPending(null);
        bus.closeModal();
    };
};
