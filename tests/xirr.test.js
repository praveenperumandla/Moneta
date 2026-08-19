import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { calculateXIRR } from '../js/core/xirr.js';
import { xirrCase } from './fixtures/cases.js';

const expected = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'expected.json'), 'utf8')
);

describe('calculateXIRR', () => {
    it('returns 0 for fewer than 2 cashflows', () => {
        assert.equal(calculateXIRR([]), 0);
        assert.equal(calculateXIRR([{ date: '2024-01-01', amount: -1 }]), 0);
    });

    it('G9 one-year 10 percent round trip', () => {
        const rate = calculateXIRR(xirrCase.cashflows);
        assert.ok(Math.abs(rate - expected.G9.rate) < 1e-6);
        assert.ok(Math.abs(rate - 0.1) < 0.002);
    });
});
