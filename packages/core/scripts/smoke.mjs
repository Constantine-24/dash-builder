// Run after `pnpm build`: checks the built package loads in Node via its own exports.
import assert from 'node:assert/strict';

const mod = await import('@grid-master/core');
assert.equal(typeof mod.createGrid, 'function', 'createGrid should be exported');
assert.equal(typeof mod.planDrop, 'function', 'planDrop should be exported');
console.log('smoke ok: createGrid and planDrop are exported');
