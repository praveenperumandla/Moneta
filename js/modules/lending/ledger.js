import { escapeHtml } from '../../core/html.js';
import { generateId } from '../../core/ids.js';
import { getTodayStr } from '../../core/dates.js';
import { formatCurrency, formatDate } from '../../core/money.js';
import { getState, getActiveData, setCurrentBorrowerId, getCurrentBorrowerId } from '../../app/state.js';
import { bus } from '../../app/bus.js';
import { calculateAccountMetrics, getBorrowerStats } from './engine.js';

export const renderLedgerHeader = (borrowerId) => {
    const activeData = getActiveData();
    const state = getState();
    const b = state.borrowers.find(x => x.id === borrowerId);
    if (!b) return;

    const stats = getBorrowerStats(borrowerId, activeData);

    const nameEl = document.getElementById('ledger-person-name');
    if (nameEl) nameEl.textContent = `${b.name} Overview`;

    const navTitle = document.getElementById('ledger-nav-title');
    if (navTitle) navTitle.textContent = b.name;

    const outEl = document.getElementById('ledger-total-outstanding');
    if (outEl) outEl.textContent = formatCurrency(stats.balance);

    const loansEl = document.getElementById('ledger-active-loans');
    if (loansEl) loansEl.textContent = `${stats.activeAccounts}`;

    const lentEl = document.getElementById('ledger-total-lent');
    if (lentEl) lentEl.textContent = formatCurrency(stats.totalInitialPrincipal);

    const nextRepayEl = document.getElementById('ledger-next-repayment');
    if (nextRepayEl) nextRepayEl.textContent = stats.startDate ? formatDate(stats.startDate) : '—';

    const intOutEl = document.getElementById('ledger-interest-outstanding');
    if (intOutEl) intOutEl.textContent = formatCurrency(stats.outstandingInterest);

    const btnAddAcc = document.getElementById('btn-add-account');
    if (btnAddAcc) btnAddAcc.dataset.borrowerId = borrowerId;

    const btnDelPerson = document.getElementById('btn-delete-person');
    if (btnDelPerson) btnDelPerson.dataset.borrowerId = borrowerId;
};

export const updateTxnModalHint = () => {
    const state = getState();
    const accountId = document.getElementById('input-txn-acc-id').value;
    const date = document.getElementById('input-txn-date').value || getTodayStr();
    const type = document.getElementById('input-txn-type').value;
    const txnId = document.getElementById('input-txn-id').value;
    const acc = state.accounts.find(a => a.id === accountId);
    const hintEl = document.getElementById('txn-outstanding-hint');
    const maxEl = document.getElementById('input-txn-max');
    if (!acc || !hintEl) return;

    let validateTxns = state.transactions;
    if (txnId) validateTxns = validateTxns.filter(t => t.id !== txnId);

    const m = calculateAccountMetrics(acc, validateTxns, date);
    let max = Infinity;
    let label = '';
    if (type === 'payment_principal') {
        max = m.outstandingPrincipal;
        label = `Principal O/S (as of ${formatDate(date)}): ${formatCurrency(max)}`;
    } else if (type === 'payment_interest') {
        max = m.outstandingInterest;
        label = `Accrued Interest (as of ${formatDate(date)}): ${formatCurrency(max)}`;
    } else if (type === 'writeoff') {
        max = m.outstandingPrincipal;
        label = `Max Principal Write-off (as of ${formatDate(date)}): ${formatCurrency(max)}`;
    } else if (type === 'writeoff_interest') {
        max = m.outstandingInterest;
        label = `Max Interest Write-off (as of ${formatDate(date)}): ${formatCurrency(max)}`;
    } else {
        max = m.outstandingPrincipal + m.outstandingInterest;
        label = `Total O/S as of ${formatDate(date)}: ${formatCurrency(max)} (P: ${formatCurrency(m.outstandingPrincipal)} + I: ${formatCurrency(m.outstandingInterest)})`;
    }

    hintEl.textContent = label;
    hintEl.style.display = 'block';
    if (maxEl) maxEl.value = max;
};

export const openLedger = (borrowerId) => {
    setCurrentBorrowerId(borrowerId);
    renderLedgerHeader(borrowerId);
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.getElementById('view-ledger').classList.add('active');
    document.getElementById('app-main').scrollTop = 0;
    renderLedgerView(borrowerId);
};

export const renderLedgerView = (borrowerId) => {
    const container = document.getElementById('ledger-accounts-container');
    const activeData = getActiveData();
    const state = getState();
    container.innerHTML = '';

    const accounts = activeData.accounts.filter(a => a.borrowerId === borrowerId);
    if (accounts.length === 0) {
        container.innerHTML = `
            <div class="empty" style="padding:28px 16px;background:var(--surface-2);border:1px dashed var(--border-md);border-radius:16px;margin-bottom:16px;">
                <div class="empty-icon"><i class="ph ph-hand-coins" style="color:var(--blue);font-size:36px;"></i></div>
                <div class="empty-title">No active loan accounts</div>
                <div class="empty-sub">Tap "+ Add New Loan Account" below to record the first loan</div>
            </div>`;
        return;
    }

    accounts.forEach(acc => {
        const metrics = calculateAccountMetrics(acc, activeData.transactions);
        const txns = activeData.transactions
            .filter(t => t.accountId === acc.id)
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        let txnsHtml = '';
        txns.forEach(t => {
            let tType, icoClass, amtClass, sign, icoName;
            if (t.type === 'repayment')          { tType='Repayment (P+I)';      icoClass='icon-rep'; icoName='ph-arrow-down-left'; amtClass='c-success'; sign='+'; }
            else if (t.type === 'payment_principal') { tType='Principal Repayment'; icoClass='icon-rep'; icoName='ph-arrow-down-left'; amtClass='c-success'; sign='+'; }
            else if (t.type === 'payment_interest')  { tType='Interest Repayment';  icoClass='icon-rep'; icoName='ph-arrow-down-left'; amtClass='c-success'; sign='+'; }
            else if (t.type === 'writeoff')          { tType='Write-off (Principal)'; icoClass='icon-wo'; icoName='ph-x-circle';       amtClass='c-danger';  sign=''; }
            else                                     { tType='Write-off (Interest)';  icoClass='icon-wo'; icoName='ph-x-circle';       amtClass='c-danger';  sign=''; }

            const modeTag = t.mode ? `<span class="mode-tag">${escapeHtml(t.mode)}</span>` : '';
            const canEdit = acc.status !== 'closed';

            txnsHtml += `
                <div class="txn-row">
                    <div style="display:flex;align-items:center;">
                        <div class="txn-icon ${icoClass}"><i class="ph ${icoName}"></i></div>
                        <div class="txn-body">
                            <div class="txn-type">${tType}${modeTag}</div>
                            <div class="txn-date">${formatDate(t.date)}</div>
                            ${t.txnId ? `<div class="txn-ref">Ref: ${escapeHtml(t.txnId)}</div>` : ''}
                            ${t.notes ? `<div class="txn-note">${escapeHtml(t.notes)}</div>` : ''}
                        </div>
                    </div>
                    <div class="txn-right">
                        <div class="txn-amt ${amtClass} num">${sign}${formatCurrency(t.amount)}</div>
                        ${canEdit ? `<div class="txn-actions">
                            <button class="icon-btn btn-edit-txn" data-id="${escapeHtml(t.id)}" title="Edit"><i class="ph ph-pencil-simple"></i></button>
                            <button class="icon-btn danger btn-delete-txn" data-id="${escapeHtml(t.id)}" title="Delete"><i class="ph ph-trash"></i></button>
                        </div>` : ''}
                    </div>
                </div>`;
        });

        const isClosed = acc.status === 'closed';
        const card = document.createElement('div');
        card.className = `account-card${isClosed ? ' closed' : ''}`;
        card.innerHTML = `
            <div class="acc-card-header">
                <div class="acc-name-title">
                    <span class="acc-prefix">Account Name:</span>
                    <span class="acc-name-val">${escapeHtml(acc.portfolioId ? `${acc.portfolioId} Loan` : 'Loan Account')}</span>
                    ${isClosed ? `<span class="badge badge-closed"><i class="ph ph-lock-key"></i>Closed</span>` : ''}
                </div>
                <div class="acc-head-actions">
                    <button class="icon-btn danger btn-delete-acc" data-id="${escapeHtml(acc.id)}" title="Delete Account"><i class="ph ph-trash"></i></button>
                </div>
            </div>
            <div class="acc-table">
                <div class="acc-table-row">
                    <div class="acc-table-label"><i class="ph ph-user"></i> <span>Account Holder:</span></div>
                    <div class="acc-table-value">${escapeHtml(acc.portfolioId || 'Self')}</div>
                </div>
                <div class="acc-table-row">
                    <div class="acc-table-label"><i class="ph ph-calendar"></i> <span>Start Date:</span></div>
                    <div class="acc-table-value">${formatDate(acc.startDate)}</div>
                </div>
                <div class="acc-table-row">
                    <div class="acc-table-label"><i class="ph ph-trend-up"></i> <span>Interest Rate:</span></div>
                    <div class="acc-table-value">${escapeHtml(String(acc.rate))}% p.a.</div>
                </div>
                <div class="acc-table-row">
                    <div class="acc-table-label"><i class="ph ph-bank"></i> <span>Payment Account:</span></div>
                    <div class="acc-table-value">${escapeHtml(acc.mode || 'Cash')}</div>
                </div>
                ${acc.notes ? `
                <div class="acc-table-row acc-table-row--col">
                    <div class="acc-table-label"><i class="ph ph-note-pencil"></i> <span>Description:</span></div>
                    <div class="acc-table-desc">${escapeHtml(acc.notes)}</div>
                </div>` : ''}
            </div>
            <div class="acc-metrics-3col">
                <div class="acc-metric-box">
                    <div class="metric-heading"><i class="ph ph-coins" style="color:var(--amber)"></i> O/S PRINCIPAL</div>
                    <div class="metric-val c-warning num">${formatCurrency(metrics.outstandingPrincipal)}</div>
                    <div class="metric-subtext">Recovered: ${formatCurrency(metrics.totalGotPrincipal)}</div>
                </div>
                <div class="acc-metric-box">
                    <div class="metric-heading"><i class="ph ph-trend-up" style="color:var(--teal)"></i> O/S INTEREST</div>
                    <div class="metric-val c-success num">${formatCurrency(metrics.outstandingInterest)}</div>
                    <div class="metric-subtext">Accrued: ${formatCurrency(metrics.accruedInterest)}</div>
                </div>
                <div class="acc-metric-box">
                    <div class="metric-heading"><i class="ph ph-receipt" style="color:var(--rose)"></i> TOTAL DUE</div>
                    <div class="metric-val c-danger num">${formatCurrency(metrics.outstandingPrincipal + metrics.outstandingInterest)}</div>
                    <div class="metric-subtext">Recovered: ${formatCurrency(metrics.totalGot)}</div>
                </div>
            </div>
            <div class="acc-card-actions">
                ${!isClosed ? `
                <button class="btn-primary-repayment btn-add-txn" data-id="${acc.id}">
                    <i class="ph ph-plus-circle"></i> Add Repayment
                </button>` : ''}
                <div class="acc-secondary-grid">
                    ${!isClosed ? `<button class="acc-btn-sub btn-edit-acc" data-id="${acc.id}"><i class="ph ph-pencil-simple"></i> Edit</button>` : ''}
                    <button class="acc-btn-sub danger btn-delete-acc" data-id="${acc.id}"><i class="ph ph-trash"></i> Delete</button>
                    ${!isClosed
                        ? `<button class="acc-btn-sub btn-close-acc" data-id="${acc.id}"><i class="ph ph-lock-key"></i> Close</button>`
                        : `<button class="acc-btn-sub" style="opacity:0.6" disabled><i class="ph ph-lock-key"></i> Closed</button>`}
                </div>
            </div>
            <div class="acc-activity-section">
                <div class="acc-activity-head">
                    <div class="acc-activity-title"><i class="ph ph-chart-line"></i> <span>Recent Activity</span></div>
                    <span class="acc-activity-meta">${txns.length} transaction${txns.length !== 1 ? 's' : ''}</span>
                </div>
                <div class="txn-list">
                    ${txnsHtml || '<div class="acc-activity-empty">No recent transactions or activity for this loan.</div>'}
                </div>
            </div>
        `;
        container.appendChild(card);
    });

    container.querySelectorAll('.btn-add-txn').forEach(btn => {
        btn.onclick = (e) => {
            const accId = e.currentTarget.dataset.id;
            const acc = state.accounts.find(a => a.id === accId);
            document.getElementById('modal-txn-title').textContent = 'Add Repayment';
            document.getElementById('submit-txn').textContent = 'Add Repayment';
            document.getElementById('input-txn-id').value = '';
            document.getElementById('input-txn-acc-id').value = accId;
            document.getElementById('input-txn-acc-id').dataset.startDate = acc?.startDate || '';
            const di = document.getElementById('input-txn-date');
            di.value = getTodayStr(); di.max = getTodayStr(); di.min = acc?.startDate || '';
            document.getElementById('input-txn-amount').value = '';
            document.getElementById('input-txn-notes').value = '';
            document.getElementById('input-txn-mode').value = 'Cash';
            document.getElementById('input-txn-txnid').value = '';
            document.getElementById('input-txn-type').value = 'repayment';
            updateTxnModalHint();
            bus.openModal('modal-add-txn');
        };
    });

    container.querySelectorAll('.btn-edit-acc').forEach(btn => {
        btn.onclick = (e) => {
            const accId = e.currentTarget.dataset.id;
            const acc = state.accounts.find(a => a.id === accId);
            if (!acc) return;
            const txnCount = state.transactions.filter(t => t.accountId === accId).length;
            if (txnCount > 0 && !confirm(`⚠️ This account has ${txnCount} transaction(s). Changing principal/date recalculates all interest. Proceed?`)) return;
            document.getElementById('modal-acc-title').textContent = 'Edit Loan Account';
            document.getElementById('submit-account').textContent = 'Save Changes';
            document.getElementById('input-acc-id').value = acc.id;
            const sel = document.getElementById('input-acc-portfolio');
            sel.innerHTML = '';
            state.portfolios.forEach(p => { const o = document.createElement('option'); o.value = p; o.textContent = p; sel.appendChild(o); });
            sel.value = acc.portfolioId;
            document.getElementById('input-acc-amount').value = acc.principal;
            document.getElementById('input-acc-rate').value = acc.rate;
            const di = document.getElementById('input-acc-date');
            di.value = acc.startDate; di.max = getTodayStr();
            document.getElementById('input-acc-mode').value = acc.mode;
            document.getElementById('input-acc-txnid').value = acc.txnId || '';
            document.getElementById('input-acc-notes').value = acc.notes || '';
            bus.openModal('modal-add-account');
        };
    });

    container.querySelectorAll('.btn-close-acc').forEach(btn => {
        btn.onclick = (e) => {
            if (!confirm('Close this account? Interest stops accruing from today.')) return;
            const acc = state.accounts.find(a => a.id === e.currentTarget.dataset.id);
            if (acc) { acc.status = 'closed'; acc.closedDate = getTodayStr(); bus.autoSave(); }
            bus.refreshUI();
        };
    });

    container.querySelectorAll('.btn-delete-acc').forEach(btn => {
        btn.onclick = (e) => {
            if (!confirm('Delete this account and ALL its transactions? This cannot be undone.')) return;
            const accId = e.currentTarget.dataset.id;
            state.accounts = state.accounts.filter(a => a.id !== accId);
            state.transactions = state.transactions.filter(t => t.accountId !== accId);
            bus.autoSave(); bus.refreshUI();
        };
    });

    container.querySelectorAll('.btn-edit-txn').forEach(btn => {
        btn.onclick = (e) => {
            const txnId = e.currentTarget.dataset.id;
            const txn = state.transactions.find(t => t.id === txnId);
            if (!txn) return;
            const acc = state.accounts.find(a => a.id === txn.accountId);
            document.getElementById('modal-txn-title').textContent = 'Edit Transaction';
            document.getElementById('submit-txn').textContent = 'Save Changes';
            document.getElementById('input-txn-id').value = txn.id;
            document.getElementById('input-txn-acc-id').value = txn.accountId;
            document.getElementById('input-txn-acc-id').dataset.startDate = acc?.startDate || '';
            document.getElementById('input-txn-type').value = txn.type;
            document.getElementById('input-txn-amount').value = txn.amount;
            const di = document.getElementById('input-txn-date');
            di.value = txn.date; di.max = getTodayStr(); di.min = acc?.startDate || '';
            document.getElementById('input-txn-notes').value = txn.notes || '';
            document.getElementById('input-txn-mode').value = txn.mode || 'Cash';
            document.getElementById('input-txn-txnid').value = txn.txnId || '';
            updateTxnModalHint();
            bus.openModal('modal-add-txn');
        };
    });

    container.querySelectorAll('.btn-delete-txn').forEach(btn => {
        btn.onclick = (e) => {
            if (!confirm('Delete this transaction? This cannot be undone.')) return;
            state.transactions = state.transactions.filter(t => t.id !== e.currentTarget.dataset.id);
            bus.autoSave(); bus.refreshUI();
        };
    });
};

export const bindLedgerForms = () => {
    document.getElementById('btn-back-borrowers').onclick = () => bus.switchView('borrowers');

    document.getElementById('btn-add-person').onclick = () => {
        document.getElementById('modal-person-title').textContent = 'Add Person';
        document.getElementById('input-person-id').value = '';
        document.getElementById('input-person-name').value = '';
        document.getElementById('input-person-phone').value = '';
        bus.openModal('modal-add-person');
    };

    document.getElementById('btn-edit-person').onclick = () => {
        const id = document.getElementById('btn-delete-person').dataset.borrowerId;
        const b = getState().borrowers.find(x => x.id === id);
        if (b) {
            document.getElementById('modal-person-title').textContent = 'Edit Person';
            document.getElementById('input-person-id').value = b.id;
            document.getElementById('input-person-name').value = b.name;
            document.getElementById('input-person-phone').value = b.phone || '';
            bus.openModal('modal-add-person');
        }
    };

    document.getElementById('submit-person').onclick = () => {
        const state = getState();
        const id   = document.getElementById('input-person-id').value;
        const name = document.getElementById('input-person-name').value.trim();
        const phone= document.getElementById('input-person-phone').value.trim();
        if (!name) return alert('Name is required.');
        if (!id) {
            const norm = name.toLowerCase();
            const existing = state.borrowers.find(b => b.name.trim().toLowerCase() === norm);
            if (existing && !confirm(`"${existing.name}" already exists. Create another?`)) return;
        }
        if (id) {
            const b = state.borrowers.find(x => x.id === id);
            if (b) { b.name = name; b.phone = phone; }
            bus.autoSave();
            bus.closeModal();
            bus.refreshUI();
            if (getCurrentBorrowerId() === id) openLedger(id);
        } else {
            const newBorrowerId = generateId();
            state.borrowers.push({ id: newBorrowerId, name, phone });
            bus.autoSave();
            bus.closeModal();
            bus.refreshUI();
            openLedger(newBorrowerId);
        }
    };

    document.getElementById('btn-add-account').onclick = (e) => {
        const state = getState();
        const boundId = e.currentTarget.dataset.borrowerId;
        if (!boundId) return alert('Error: Please close and reopen the ledger.');
        document.getElementById('modal-acc-title').textContent = 'Add Loan Account';
        document.getElementById('submit-account').textContent = 'Create Account';
        document.getElementById('input-acc-id').value = '';
        const sel = document.getElementById('input-acc-portfolio');
        sel.innerHTML = '';
        state.portfolios.forEach(p => { const o = document.createElement('option'); o.value = p; o.textContent = p; sel.appendChild(o); });
        sel.value = state.activePortfolio === '__ALL__' ? state.portfolios[0] : state.activePortfolio;
        const di = document.getElementById('input-acc-date');
        di.value = getTodayStr(); di.max = getTodayStr();
        document.getElementById('input-acc-amount').value = '';
        document.getElementById('input-acc-rate').value = '';
        document.getElementById('input-acc-mode').value = 'Cash';
        document.getElementById('input-acc-txnid').value = '';
        document.getElementById('input-acc-notes').value = '';
        bus.openModal('modal-add-account');
    };

    document.getElementById('submit-account').onclick = () => {
        const state = getState();
        const id         = document.getElementById('input-acc-id').value;
        const portfolioId= document.getElementById('input-acc-portfolio').value;
        const principal  = parseFloat(document.getElementById('input-acc-amount').value);
        const rate       = parseFloat(document.getElementById('input-acc-rate').value);
        const startDate  = document.getElementById('input-acc-date').value;
        const mode       = document.getElementById('input-acc-mode').value;
        const txnId      = document.getElementById('input-acc-txnid').value.trim();
        const notes      = document.getElementById('input-acc-notes').value.trim();
        const boundId    = document.getElementById('btn-add-account').dataset.borrowerId;

        if (!boundId) return alert('No borrower selected. Close and reopen ledger.');
        if (!principal || principal <= 0) return alert('Principal must be greater than 0.');
        if (!rate || rate <= 0) return alert('Interest rate must be greater than 0.');
        if (!startDate) return alert('Start date is required.');
        if (startDate > getTodayStr()) return alert('Future dates are not allowed.');

        if (id) {
            const acc = state.accounts.find(a => a.id === id);
            if (acc) {
                const orphaned = state.transactions.filter(t => t.accountId === id && t.date < startDate);
                if (orphaned.length > 0) {
                    return alert(`Cannot change start date to ${formatDate(startDate)}. There are ${orphaned.length} transaction(s) before this date. Please edit or delete them first.`);
                }
                Object.assign(acc, { portfolioId, principal, rate, startDate, mode, txnId, notes });
            }
        } else {
            state.accounts.push({ id: generateId(), borrowerId: boundId, portfolioId, principal, rate, startDate, mode, txnId, notes, status: 'active' });
        }
        bus.autoSave(); bus.closeModal(); bus.refreshUI();
    };

    document.getElementById('submit-txn').onclick = () => {
        const state = getState();
        const id          = document.getElementById('input-txn-id').value;
        const accountId   = document.getElementById('input-txn-acc-id').value;
        const accStart    = document.getElementById('input-txn-acc-id').dataset.startDate;
        const type        = document.getElementById('input-txn-type').value;
        const amount      = parseFloat(document.getElementById('input-txn-amount').value);
        const date        = document.getElementById('input-txn-date').value;
        const notes       = document.getElementById('input-txn-notes').value.trim();
        const mode        = document.getElementById('input-txn-mode').value;
        const txnId       = document.getElementById('input-txn-txnid').value.trim();

        if (!amount || amount <= 0) return alert('Amount must be greater than 0.');
        if (!date) return alert('Date is required.');
        if (accStart && date < accStart) return alert(`Transaction date cannot be before the loan start date (${formatDate(accStart)}).`);
        if (date > getTodayStr()) return alert('Future dates are not allowed.');

        let validateTxns = state.transactions;
        if (id) {
            validateTxns = state.transactions.filter(t => t.id !== id);
        }

        const acc = state.accounts.find(a => a.id === accountId);
        if (!acc) return alert('Loan account not found.');

        const asOfMetrics = calculateAccountMetrics(acc, validateTxns, date);
        let maxAllowed = Infinity;
        let limitTypeLabel = 'outstanding balance';

        if (type === 'payment_principal') {
            maxAllowed = asOfMetrics.outstandingPrincipal;
            limitTypeLabel = 'outstanding principal';
        } else if (type === 'payment_interest') {
            maxAllowed = asOfMetrics.outstandingInterest;
            limitTypeLabel = 'accrued interest';
        } else if (type === 'repayment') {
            maxAllowed = asOfMetrics.outstandingPrincipal + asOfMetrics.outstandingInterest;
            limitTypeLabel = 'total outstanding (P+I)';
        } else if (type === 'writeoff') {
            maxAllowed = asOfMetrics.outstandingPrincipal;
            limitTypeLabel = 'outstanding principal';
        } else if (type === 'writeoff_interest') {
            maxAllowed = asOfMetrics.outstandingInterest;
            limitTypeLabel = 'accrued interest';
        }

        if (amount > maxAllowed + 0.5) {
            return alert(`Amount (${formatCurrency(amount)}) exceeds ${limitTypeLabel} as of ${formatDate(date)} (${formatCurrency(maxAllowed)}).`);
        }

        if (id) {
            const txn = state.transactions.find(t => t.id === id);
            if (txn) Object.assign(txn, { type, amount, date, notes, mode, txnId });
        } else {
            state.transactions.push({ id: generateId(), accountId, type, amount, date, notes, mode, txnId });
        }
        bus.autoSave(); bus.closeModal(); bus.refreshUI();
    };

    document.getElementById('btn-delete-person').onclick = (e) => {
        if (!confirm('DANGER: Delete this person and ALL their accounts/transactions?')) return;
        const state = getState();
        const id = e.currentTarget.dataset.borrowerId;
        state.borrowers = state.borrowers.filter(b => b.id !== id);
        const accIds = state.accounts.filter(a => a.borrowerId === id).map(a => a.id);
        state.accounts = state.accounts.filter(a => a.borrowerId !== id);
        state.transactions = state.transactions.filter(t => !accIds.includes(t.accountId));
        bus.autoSave(); bus.switchView('borrowers');
    };

    document.getElementById('input-txn-type')?.addEventListener('change', updateTxnModalHint);
    document.getElementById('input-txn-date')?.addEventListener('change', updateTxnModalHint);
    document.getElementById('input-txn-date')?.addEventListener('input', updateTxnModalHint);
};
