import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { totalNetWorth } from '../js/modules/networth/aggregator.js';
import { register, snapshotAll, all } from '../js/modules/registry.js';

describe('networth aggregator', () => {
    it('sums assets and liabilities', () => {
        const t = totalNetWorth([
            { assets: 100, liabilities: 10 },
            { assets: 50, liabilities: 5 }
        ]);
        assert.equal(t.assets, 150);
        assert.equal(t.liabilities, 15);
        assert.equal(t.net, 135);
    });
});

describe('module registry', () => {
    it('registers once and snapshots', () => {
        const before = all().length;
        const mod = {
            id: 'test-mod-' + before,
            snapshot: () => ({ id: 'test-mod', assets: 1, liabilities: 0 })
        };
        register(mod);
        register(mod);
        const snaps = snapshotAll({});
        assert.equal(all().length, before + 1);
        assert.ok(snaps.some(s => s.id === 'test-mod'));
    });
});
