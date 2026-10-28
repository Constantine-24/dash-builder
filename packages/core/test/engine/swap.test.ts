import { expect, test } from 'vitest';
import { planDrop } from '../../src/engine/drop.js';
import type { LayoutItem } from '../../src/engine/types.js';

const L: LayoutItem[] = [
  { id: 'A', w: 1, h: 1 },
  { id: 'B', w: 3, h: 1 },
  { id: 'C', w: 2, h: 1 },
  { id: 'D', w: 2, h: 1 },
];
const sw = (layout: LayoutItem[], a: string, b: string, maxRows?: number) =>
  planDrop(layout, { columns: 4, mode: 'swap', maxRows }, a, { swapWith: b });

test('different sizes swap positions, keep sizes', () => {
  const r = sw(L, 'A', 'C');
  expect(r.ok && r.layout.map((i) => [i.id, i.w])).toEqual([['C', 2], ['B', 3], ['A', 1], ['D', 2]]);
});
test('locked target rejected', () => {
  expect(sw(L.map((i) => (i.id === 'C' ? { ...i, locked: true } : i)), 'A', 'C')).toEqual({ ok: false, reason: 'locked' });
});
test('maxRows applies', () => {
  expect(sw(L, 'A', 'C', 2)).toEqual({ ok: false, reason: 'max-rows' });
});
test('index target in swap mode is invalid', () => {
  expect(planDrop(L, { columns: 4, mode: 'swap' }, 'A', { index: 1 })).toEqual({ ok: false, reason: 'invalid' });
});
test('swapping with itself returns an equal layout', () => {
  expect(sw(L, 'B', 'B')).toEqual({ ok: true, layout: L });
});
test('unknown swap target is invalid', () => {
  expect(sw(L, 'A', 'Z')).toEqual({ ok: false, reason: 'invalid' });
});
