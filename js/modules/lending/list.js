import { escapeHtml } from '../../core/html.js';
import { formatCurrency, formatDate } from '../../core/money.js';
import { getActiveData } from '../../app/state.js';
import { getBorrowerStats } from './engine.js';
import { bus } from '../../app/bus.js';

export const renderBorrowersList = () => {
    const list = document.getElementById('borrowers-list');
    const activeData = getActiveData();
    list.innerHTML = '';

    let borrowers = [...activeData.borrowers].map(b => ({
        ...b, stats: getBorrowerStats(b.id, activeData)
    }));

    const q = (document.getElementById('input-search-borrowers')?.value || '').trim().toLowerCase();
    if (q) borrowers = borrowers.filter(b => b.name.toLowerCase().includes(q) || (b.phone && b.phone.includes(q)));

    const sortVal = document.getElementById('select-sort-borrowers')?.value || 'value_desc';
    borrowers.sort((a, b) => {
        if (sortVal === 'name_asc')   return a.name.localeCompare(b.name);
        if (sortVal === 'name_desc')  return b.name.localeCompare(a.name);
        if (sortVal === 'date_desc')  return new Date(b.stats.startDate || 0) - new Date(a.stats.startDate || 0);
        if (sortVal === 'date_asc')   return new Date(a.stats.startDate || 0) - new Date(b.stats.startDate || 0);
        if (sortVal === 'value_desc') return b.stats.balance - a.stats.balance;
        if (sortVal === 'value_asc')  return a.stats.balance - b.stats.balance;
        return 0;
    });

    const subtitle = document.getElementById('borrowers-subtitle');
    if (subtitle) subtitle.textContent = `Manage ${borrowers.length} Profile${borrowers.length !== 1 ? 's' : ''}`;

    let totPrin = 0, totInt = 0, totDue = 0;
    borrowers.forEach(b => {
        totPrin += b.stats.outstandingPrincipal;
        totInt += b.stats.outstandingInterest;
        totDue += b.stats.balance;
    });
    const elPrin = document.getElementById('ls-principal');
    const elInt = document.getElementById('ls-interest');
    const elTotal = document.getElementById('ls-total');
    if (elPrin) elPrin.textContent = formatCurrency(totPrin);
    if (elInt) elInt.textContent = formatCurrency(totInt);
    if (elTotal) elTotal.textContent = formatCurrency(totDue);

    if (borrowers.length === 0) {
        list.innerHTML = `<div class="empty">
            <div class="empty-icon"><i class="ph ph-users"></i></div>
            <div class="empty-title">No borrowers found</div>
            <div class="empty-sub">Tap + at top right to add a borrower</div>
        </div>`;
        return;
    }

    borrowers.forEach(b => {
        const s = b.stats;
        const sinceStr = s.startDate ? `Since ${formatDate(s.startDate)}` : (b.phone ? `Phone: ${escapeHtml(b.phone)}` : 'New Profile · Tap to add loans');

        const el = document.createElement('div');
        el.className = 'b-row';
        el.onclick = () => bus.openLedger(b.id);
        el.innerHTML = `
            <div class="b-row__left">
                <div class="b-row__name">${escapeHtml(b.name)}</div>
                <div class="b-row__since">${sinceStr}</div>
            </div>
            <div class="b-row__right">
                <div class="b-row__col">
                    <span class="b-row__col-val">${formatCurrency(s.outstandingPrincipal)}</span>
                    <span class="b-row__col-label">Principal</span>
                </div>
                <div class="b-row__col">
                    <span class="b-row__col-val">${formatCurrency(s.outstandingInterest)}</span>
                    <span class="b-row__col-label">Interest</span>
                </div>
                <div class="b-row__col">
                    <span class="b-row__col-val">${formatCurrency(s.balance)}</span>
                    <span class="b-row__col-label">Total</span>
                </div>
            </div>
        `;
        list.appendChild(el);
    });
};

export const bindBorrowersListChrome = () => {
    document.getElementById('input-search-borrowers')?.addEventListener('input', renderBorrowersList);
    document.getElementById('select-sort-borrowers')?.addEventListener('change', renderBorrowersList);
    document.getElementById('sort-btn')?.addEventListener('click', () => {
        const select = document.getElementById('select-sort-borrowers');
        if (!select) return;
        const val = select.value;
        if (val.endsWith('_desc')) select.value = val.replace('_desc', '_asc');
        else if (val.endsWith('_asc')) select.value = val.replace('_asc', '_desc');
        renderBorrowersList();
    });
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.onclick = () => {
            document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
        };
    });
};
