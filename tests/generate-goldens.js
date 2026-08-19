import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { calculateAccountMetrics } from '../js/core/accounting.js';
import { calculateXIRR } from '../js/core/xirr.js';
import { cases, xirrCase } from './fixtures/cases.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
mkdirSync(dir, { recursive: true });

const expected = {};
for (const [id, c] of Object.entries(cases)) {
    expected[id] = calculateAccountMetrics(c.account, c.txns, c.asOf);
}
expected.G9 = { rate: calculateXIRR(xirrCase.cashflows) };

writeFileSync(join(dir, 'expected.json'), JSON.stringify(expected, null, 2));
console.log('wrote tests/fixtures/expected.json');
