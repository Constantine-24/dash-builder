// `pnpm test:smoke` builds first, then runs this: checks the built package loads in Node via its own exports.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

if (!existsSync(new URL('../dist/index.js', import.meta.url))) {
  console.error('smoke: dist/index.js is missing. Run `pnpm build` first (`pnpm test:smoke` does this for you).');
  process.exit(1);
}

const mod = await import('@grid-master/core');
const expected = [
  'addItem',
  'computeFlow',
  'createGrid',
  'layoutsEqual',
  'normalizeLayout',
  'planDrop',
  'planResize',
  'removeItem',
  'rowsOf',
  'stackForNarrow',
  'totalRows',
];
assert.deepEqual(Object.keys(mod).sort(), expected, 'the built package should export exactly the public API');
for (const name of expected) assert.equal(typeof mod[name], 'function', `${name} should be a function`);
console.log(`smoke ok: ${expected.length} public exports, internals not exported`);
