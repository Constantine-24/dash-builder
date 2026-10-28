// `pnpm test:smoke` builds first, then runs this: checks the built package loads in Node via its own exports.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

if (!existsSync(new URL('../dist/index.js', import.meta.url))) {
  console.error('smoke: dist/index.js is missing. Run `pnpm build` first (`pnpm test:smoke` does this for you).');
  process.exit(1);
}

const mod = await import('@grid-master/react');
assert.equal(typeof mod.Grid, 'function', 'Grid should be a function');
assert.equal(typeof mod.Widget, 'function', 'Widget should be a function');
assert.equal(typeof mod.WidgetHandle, 'function', 'WidgetHandle should be a function');
assert.equal(mod.Widget.Handle, mod.WidgetHandle, 'Widget.Handle should be WidgetHandle');

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(pkg.name, '@grid-master/react');
assert.deepEqual(
  pkg.peerDependencies,
  { '@grid-master/core': '0.x', react: '^19.0.0', 'react-dom': '^19.0.0' },
  'peerDependencies should be exactly core, react and react-dom',
);
assert.equal(pkg.dependencies, undefined, 'there should be no runtime dependencies');
assert.ok(existsSync(new URL('../LICENSE', import.meta.url)), 'LICENSE should exist');
console.log('smoke ok: Grid, Widget, WidgetHandle, Widget.Handle, peers, LICENSE');
