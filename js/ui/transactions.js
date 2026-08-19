import { escapeHtml } from '../core/html.js';
import { formatCurrency, formatDate } from '../core/money.js';
import { getActiveData } from '../app/state.js';

export const renderRecentTransactions = (activeData, targetId = 'recent-txns-list', limit = 15) => {
    const list = document.getElementById(targetId);
    if (!list) return;
    list.innerHTML = '';

    const pseudoTxns = activeData.accounts.map(a => ({
        id: a.id + '_creation', accountId: a.id,
        type: 'loan_given', amount: a.principal, date: a.startDate, notes: a.notes
    }));

    let sorted = [...activeData.transactions, ...pseudoTxns]
        .sort((a, b) => new Date(b.date) - new Date(a.date));

    if (limit && limit > 0) {
        sorted = sorted.slice(0, limit);
    }

    if (sorted.length === 0) {
        list.innerHTML = `<div class="empty">
            <div class="empty-icon"><i class="ph ph-receipt"></i></div>
            <div class="empty-title">No transactions yet</div>
            <div class="empty-sub">Add a borrower and loan account to get started</div>
        </div>`;
        return;
    }

    sorted.forEach(t => {
        const acc = activeData.accounts.find(a => a.id === t.accountId);
        const borrower = acc ? activeData.borrowers.find(b => b.id === acc.borrowerId) : null;
        const name = borrower ? escapeHtml(borrower.name) : 'Unknown';

        let typeStr = 'Repayment', icoClass = 'i-repay', amtClass = 'pos', sign = '+', icoName = 'ph-arrow-down-left';
        if (t.type === 'loan_given')             { typeStr = 'Disbursement';           icoClass = 'i-lent';     amtClass = 'neg'; sign = '−'; icoName = 'ph-arrow-up-right'; }
        else if (t.type === 'repayment')         { typeStr = 'Repayment (P+I)'; }
        else if (t.type === 'payment_principal') { typeStr = 'Principal Repayment'; }
        else if (t.type === 'payment_interest')  { typeStr = 'Interest Repayment'; }
        else if (t.type === 'writeoff')          { typeStr = 'Write-off (Principal)'; icoClass = 'i-writeoff'; amtClass = 'wo'; sign = ''; icoName = 'ph-x-circle'; }
        else if (t.type === 'writeoff_interest') { typeStr = 'Write-off (Interest)';  icoClass = 'i-writeoff'; amtClass = 'wo'; sign = ''; icoName = 'ph-x-circle'; }

        const modeBadge = t.mode && t.type !== 'loan_given' ? `<span class="mode-tag">${escapeHtml(t.mode)}</span>` : '';
        const refStr    = t.txnId ? ` · ${escapeHtml(t.txnId)}` : '';

        const el = document.createElement('div');
        el.className = 'rt-row';
        el.innerHTML = `
            <div class="rt-icon ${icoClass}"><i class="ph ${icoName}"></i></div>
            <div class="rt-body">
                <div class="rt-name">${name}${modeBadge}</div>
                <div class="rt-meta">${typeStr} · ${formatDate(t.date)}${refStr}</div>
                ${t.notes ? `<div class="rt-meta" style="font-style:italic;margin-top:1px">${escapeHtml(t.notes)}</div>` : ''}
            </div>
            <div class="rt-amt ${amtClass}">${sign}${formatCurrency(t.amount)}</div>
        `;
        list.appendChild(el);
    });
};

export const bindTransactionsTab = () => {
    document.querySelector('.tab-btn[data-view="transactions"]')?.addEventListener('click', () => {
        setTimeout(() => renderRecentTransactions(getActiveData(), 'all-txns-list', null), 50);
    });
};
