import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { calculateAccountMetrics, getBorrowerStats, clearMetricsCache } from '../js/core/accounting.js';
import { cases } from './fixtures/cases.js';

const expected = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'expected.json'), 'utf8')
);

const close = (actual, exp, label) => {
    for (const key of Object.keys(exp)) {
        if (typeof exp[key] === 'number') {
            assert.ok(Math.abs(actual[key] - exp[key]) < 1e-6, `${label}.${key}: ${actual[key]} vs ${exp[key]}`);
        } else {
            assert.equal(actual[key], exp[key], `${label}.${key}`);
        }
    }
};

describe('calculateAccountMetrics golden cases', () => {
    for (const [id, c] of Object.entries(cases)) {
        it(`${id} ${c.name}`, () => {
            const got = calculateAccountMetrics(c.account, c.txns, c.asOf);
            close(got, expected[id], id);
        });
    }

    it('null account returns zeros', () => {
        const got = calculateAccountMetrics(null, []);
        assert.equal(got.outstandingPrincipal, 0);
        assert.equal(got.isWrittenOff, false);
    });
});

describe('getBorrowerStats', () => {
    it('sums two accounts for one borrower', () => {
        clearMetricsCache();
        const a1 = { ...cases.G4.account, id: 'a1', borrowerId: 'b1' };
        const a2 = { ...cases.G10.account, id: 'a2', borrowerId: 'b1', status: 'closed', closedDate: '2024-01-01' };
        const txns = [
            { ...cases.G4.txns[0], accountId: 'a1' },
            { ...cases.G10.txns[0], accountId: 'a2' }
        ];
        const stats = getBorrowerStats('b1', { accounts: [a1, a2], transactions: txns });
        assert.equal(stats.totalLoans, 2);
        assert.equal(stats.activeAccounts, 1);
        assert.equal(stats.totalInitialPrincipal, 200000);
        assert.ok(stats.outstandingPrincipal > 0);
    });
});
