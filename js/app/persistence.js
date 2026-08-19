import { generateId } from '../core/ids.js';
import { getTodayStr } from '../core/dates.js';
import {
    readStoredJson, writeStoredJson, normalizeDocument,
    parseImportPayload, buildExportPayload
} from '../core/storage.js';
import {
    getState, setState, getLoadFailed, setLoadFailed,
    getImportPending, setImportPending
} from './state.js';
import { bus } from './bus.js';

let autoSaveTimer = null;

export const loadData = () => {
    try {
        const saved = readStoredJson();
        if (saved) {
            const parsed = JSON.parse(saved);
            const next = normalizeDocument(parsed, generateId);
            setState({
                ...getState(),
                activePortfolio: next.activePortfolio || '__ALL__',
                portfolios: next.portfolios,
                theme: next.theme || 'dark',
                borrowers: next.borrowers,
                accounts: next.accounts,
                transactions: next.transactions
            });
            setLoadFailed(false);
            if (next._didMigrate) autoSave();
        } else {
            setLoadFailed(false);
        }
    } catch (e) {
        setLoadFailed(true);
        console.error('Load failed:', e);
        setTimeout(() => {
            alert('⚠️ CRITICAL: Moneta data failed to load from storage. Auto-save has been DISABLED to protect your existing records.\n\nPlease export a backup or inspect the developer console.');
        }, 200);
    }
};

export const flushSave = () => {
    if (getLoadFailed()) {
        console.warn('Auto-save aborted: loadData failed, refusing to overwrite storage.');
        return;
    }
    if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
    }
    try {
        writeStoredJson(getState());
    } catch (e) {
        if (e.name === 'QuotaExceededError') alert('Storage full! Export and clear old data.');
        console.error('Save failed:', e);
    }
};

export const autoSave = () => {
    if (getLoadFailed()) return;
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(flushSave, 300);
};

export const exportData = () => {
    const { json, filename } = buildExportPayload(getState(), getLoadFailed());
    try {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
        const fallback = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
        window.open(fallback, '_blank');
        alert('Tap the page that opened, then Share → Save to Files.');
    }
};

export const importData = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const parsed = parseImportPayload(JSON.parse(e.target.result), generateId);
            setImportPending(parsed);
            const b = parsed.borrowers.length, a = parsed.accounts.length, t = parsed.transactions.length;
            document.getElementById('import-preview').textContent =
                `Found: ${b} borrower${b !== 1 ? 's' : ''}, ${a} account${a !== 1 ? 's' : ''}, ${t} transaction${t !== 1 ? 's' : ''}`;
            bus.openModal('modal-import-confirm');
        } catch {
            alert('Could not read file. Make sure it is a valid Moneta JSON backup.');
        }
    };
    reader.readAsText(file);
};

export const applyPendingImport = () => {
    const pending = getImportPending();
    if (!pending) return false;
    const current = getState();
    const preservedTheme = current.theme;
    const preservedPortfolio = current.activePortfolio;
    const errs = [];
    (pending.accounts || []).forEach((acc, i) => {
        if (acc.status === 'closed' && acc.closedDate) {
            if (acc.closedDate < acc.startDate) errs.push(`Account #${i + 1}: closedDate before startDate`);
            if (acc.closedDate > getTodayStr()) errs.push(`Account #${i + 1}: closedDate in the future`);
        }
    });
    if (errs.length && !confirm('⚠️ Warnings:\n\n' + errs.join('\n') + '\n\nProceed?')) return false;

    const importedPortfolios = Array.isArray(pending.portfolios) && pending.portfolios.length
        ? pending.portfolios
        : ['Self', 'Mother', 'Wife'];

    let targetPortfolio = preservedPortfolio;
    if (targetPortfolio !== '__ALL__' && !importedPortfolios.includes(targetPortfolio)) {
        targetPortfolio = '__ALL__';
    }

    setState({
        ...pending,
        portfolios: importedPortfolios,
        borrowers: Array.isArray(pending.borrowers) ? pending.borrowers : [],
        accounts: Array.isArray(pending.accounts) ? pending.accounts : [],
        transactions: Array.isArray(pending.transactions) ? pending.transactions : [],
        theme: preservedTheme,
        activePortfolio: targetPortfolio
    });
    setLoadFailed(false);
    setImportPending(null);
    autoSave();
    return true;
};

export const bindPersistenceLifecycle = () => {
    window.addEventListener('pagehide', flushSave);
    window.addEventListener('beforeunload', flushSave);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushSave();
    });
    window.flushSave = flushSave;
};
