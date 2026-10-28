import { expect, test } from 'vitest';
import { computeFlow, rowsOf, stackForNarrow, totalRows } from '../../src/engine/flow.js';

const L = [
  { id: 'A', w: 1, h: 2 }, { id: 'B', w: 3, h: 1 },
  { id: 'C', w: 2, h: 1 }, { id: 'D', w: 2, h: 3 },
];
test('flows left to right and wraps; row height = tallest', () => {
  expect(computeFlow(L, 4).map(p => [p.id, p.x, p.y, p.row])).toEqual([
    ['A', 0, 0, 0], ['B', 1, 0, 0], ['C', 0, 2, 1], ['D', 2, 2, 1],
  ]);
  expect(totalRows(computeFlow(L, 4))).toBe(5);
  expect(rowsOf(computeFlow(L, 4))).toEqual([['A', 'B'], ['C', 'D']]);
});
test('empty layout', () => {
  expect(computeFlow([], 4)).toEqual([]);
  expect(totalRows([])).toBe(0);
});
test('stackForNarrow: one column, list order, keeps h', () => {
  expect(stackForNarrow(L).map(p => [p.id, p.x, p.y, p.w])).toEqual([
    ['A', 0, 0, 1], ['B', 0, 2, 1], ['C', 0, 3, 1], ['D', 0, 4, 1],
  ]);
});
