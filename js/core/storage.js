import { getTodayStr } from './dates.js';
import { flattenToV1, toV1Export, validateV1, detectSchemaVersion } from './schema.js';
import { migrateVaultNested } from './migrate.js';

const KEY_V1 = 'moneta_data_v1';
const KEY_LEGACY = 'vault_data_v2';

const defaultStorage = () => (typeof localStorage !== 'undefined' ? localStorage : null);

export const readStoredJson = (storage = defaultStorage()) => {
    if (!storage) return null;
    let saved = storage.getItem(KEY_V1);
    if (!saved) {
        saved = storage.getItem(KEY_LEGACY);
        if (saved) storage.setItem(KEY_V1, saved);
    }
    return saved;
};

export const writeStoredJson = (obj, storage = defaultStorage()) => {
    if (!storage) return;
    storage.setItem(KEY_V1, JSON.stringify(obj));
};

export const normalizeDocument = (parsed, idFn) => {
    if (!parsed || typeof parsed !== 'object') {
        throw new Error('Corrupt data: Root object expected');
    }
    const version = detectSchemaVersion(parsed);
    if (version === 0) {
        const migrated = migrateVaultNested(parsed, idFn);
        return {
            ...flattenToV1({ ...parsed, ...migrated }),
            borrowers: migrated.borrowers,
            accounts: migrated.accounts,
            transactions: migrated.transactions,
            portfolios: migrated.portfolios,
            _didMigrate: true
        };
    }
    return { ...flattenToV1(parsed), _didMigrate: false };
};

export const parseImportPayload = (parsed, idFn) => {
    const normalized = normalizeDocument(parsed, idFn);
    if (!validateV1(normalized)) {
        throw new Error('Invalid backup file. Must contain borrowers, accounts, and transactions.');
    }
    return normalized;
};

export const buildExportPayload = (state, loadFailed, storage = defaultStorage()) => {
    if (loadFailed) {
        const raw = storage?.getItem(KEY_V1) || storage?.getItem(KEY_LEGACY);
        return {
            json: raw || JSON.stringify(state, null, 2),
            filename: 'Moneta_RAW_Corrupt_' + getTodayStr() + '.json'
        };
    }
    return {
        json: JSON.stringify(toV1Export(state), null, 2),
        filename: 'Moneta_Backup_' + getTodayStr() + '.json'
    };
};
