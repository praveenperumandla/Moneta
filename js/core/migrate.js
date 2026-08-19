import { generateId } from './ids.js';

export const migrateVaultNested = (parsed, idFn = generateId) => {
    const portfolios = Array.isArray(parsed.portfolios) && parsed.portfolios.length
        ? parsed.portfolios
        : Object.keys(parsed.data || {});
    const newBorrowers = [];
    const newAccounts = [];
    const newTransactions = [];
    const borrowerNameMap = {};

    portfolios.forEach(p => {
        const pd = parsed.data?.[p];
        if (!pd) return;
        const localToGlobal = {};
        (pd.borrowers || []).forEach(b => {
            const nameStr = (b.name ? String(b.name).trim() : '') || 'Unnamed';
            const key = nameStr.toLowerCase();
            if (!borrowerNameMap[key]) {
                const newId = idFn();
                borrowerNameMap[key] = newId;
                newBorrowers.push({ id: newId, name: nameStr, phone: b.phone || '' });
            }
            localToGlobal[b.id] = borrowerNameMap[key];
        });
        (pd.accounts || []).forEach(a => {
            newAccounts.push({ ...a, portfolioId: p, borrowerId: localToGlobal[a.borrowerId] });
        });
        (pd.transactions || []).forEach(t => newTransactions.push(t));
    });

    return {
        borrowers: newBorrowers,
        accounts: newAccounts,
        transactions: newTransactions,
        portfolios: portfolios.length ? portfolios : ['Self']
    };
};
