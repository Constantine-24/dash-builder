import '@angular/compiler'; // partial-compiled output needs the JIT linker outside a bundler
import { existsSync, readFileSync } from 'node:fs';

const dist = new URL('../dist/grid-angular/', import.meta.url);
const fail = (msg) => {
  console.error(`smoke FAILED: ${msg}`);
  process.exit(1);
};

const mod = await import(new URL('fesm2022/grid-master-angular.mjs', dist).href);
for (const name of ['GmWidget', 'GmHandle', 'GmGrid']) {
  if (!(name in mod)) fail(`missing export ${name}`);
}

if (!existsSync(new URL('LICENSE', dist))) fail('dist/grid-angular/LICENSE is missing');

const pkg = JSON.parse(readFileSync(new URL('package.json', dist), 'utf8'));
if (pkg.name !== '@grid-master/angular') fail(`unexpected package name ${pkg.name}`);
const expected = {
  '@angular/common': '^22.0.0',
  '@angular/core': '^22.0.0',
  '@grid-master/core': '0.x',
};
for (const [dep, range] of Object.entries(expected)) {
  if (pkg.peerDependencies?.[dep] !== range) {
    fail(`peerDependencies[${dep}] is ${pkg.peerDependencies?.[dep]}, expected ${range}`);
  }
}
if (pkg.dependencies && Object.keys(pkg.dependencies).some((d) => d !== 'tslib')) {
  fail(`unexpected dependencies ${JSON.stringify(pkg.dependencies)}`);
}

console.log('smoke ok:', Object.keys(mod).join(', '));
