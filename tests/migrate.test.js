import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { migrateVaultNested } from '../js/core/migrate.js';
import { flattenToV1, detectSchemaVersion, validateV1, SCHEMA_V2 } from '../js/core/schema.js';
import { parseImportPayload } from '../js/core/storage.js';
import { vaultLegacy, schemaV2Doc } from './fixtures/cases.js';

const sequentialIds = () => {
    let n = 0;
    return () => `id-${++n}`;
};

describe('migrateVaultNested', () => {
    it('merges same-name borrowers across portfolios', () => {
        const out = migrateVaultNested(vaultLegacy, sequentialIds());
        assert.equal(out.borrowers.length, 2);
        assert.deepEqual(out.borrowers.map(b => b.name).sort(), ['Anita', 'Ravi']);
        assert.equal(out.accounts.length, 2);
        const ravi = out.borrowers.find(b => b.name === 'Ravi');
        assert.ok(out.accounts.every(a => a.borrowerId === ravi.id || a.portfolioId === 'Mother'));
        assert.equal(out.accounts.filter(a => a.borrowerId === ravi.id).length, 2);
        assert.equal(out.transactions.length, 1);
        assert.equal(out.transactions[0].accountId, 'a1');
    });
});

describe('schema v2 dual-read', () => {
    it('detects v2 and flattens lending slice', () => {
        assert.equal(detectSchemaVersion(schemaV2Doc), SCHEMA_V2);
        const flat = flattenToV1(schemaV2Doc);
        assert.ok(validateV1(flat));
        assert.equal(flat.borrowers[0].name, 'Dev');
        assert.equal(flat.portfolios[0], 'Self');
    });

    it('parseImportPayload accepts v1, v2, and vault', () => {
        const v1 = parseImportPayload({
            borrowers: [{ id: 'b', name: 'X' }],
            accounts: [],
            transactions: [],
            portfolios: ['Self']
        });
        assert.equal(v1.borrowers[0].name, 'X');

        const v2 = parseImportPayload(schemaV2Doc);
        assert.equal(v2.borrowers[0].name, 'Dev');

        const vault = parseImportPayload(vaultLegacy, sequentialIds());
        assert.equal(vault.borrowers.length, 2);
        assert.equal(vault._didMigrate, true);
    });
});
