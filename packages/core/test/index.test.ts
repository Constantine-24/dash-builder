import { expect, test } from 'vitest';
import * as api from '../src/index.js';

test('the package exports exactly the public runtime API', () => {
  expect(Object.keys(api).sort()).toEqual([
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
  ]);
});
