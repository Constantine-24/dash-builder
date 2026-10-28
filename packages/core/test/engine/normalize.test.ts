import { expect, test } from 'vitest';
import { layoutsEqual, normalizeLayout } from '../../src/engine/normalize.js';

test('clamps w into [minW, columns] and h to >= minH', () => {
  const out = normalizeLayout([
    { id: 'a', w: 9, h: 1 },
    { id: 'b', w: 0, h: 0, minW: 2, minH: 2 },
  ], 4);
  expect(out).toEqual([
    { id: 'a', w: 4, h: 1 },
    { id: 'b', w: 2, h: 2, minW: 2, minH: 2 },
  ]);
});
test('minW larger than columns is clamped to columns', () => {
  expect(normalizeLayout([{ id: 'a', w: 1, h: 1, minW: 6 }], 4)[0]).toMatchObject({ w: 4, minW: 4 });
});
test('does not mutate input', () => {
  const input = [{ id: 'a', w: 9, h: 1 }];
  normalizeLayout(input, 4);
  expect(input[0].w).toBe(9);
});
test('throws on duplicate ids', () => {
  expect(() => normalizeLayout([{ id: 'a', w: 1, h: 1 }, { id: 'a', w: 1, h: 1 }], 4)).toThrow(/duplicate id "a"/);
});
test('layoutsEqual compares order and sizes', () => {
  const a = [{ id: 'a', w: 1, h: 1 }, { id: 'b', w: 2, h: 1 }];
  expect(layoutsEqual(a, structuredClone(a))).toBe(true);
  expect(layoutsEqual(a, [a[1], a[0]])).toBe(false);
  expect(layoutsEqual(a, [a[0], { ...a[1], w: 3 }])).toBe(false);
});
test('non-finite sizes become their minimum', () => {
  expect(normalizeLayout([
    { id: 'a', w: NaN, h: Infinity },
    { id: 'b', w: Infinity, h: NaN, minW: 2, minH: 3 },
    { id: 'c', w: 1, h: 1, minW: NaN, minH: -Infinity },
  ], 4)).toEqual([
    { id: 'a', w: 1, h: 1 },
    { id: 'b', w: 2, h: 3, minW: 2, minH: 3 },
    { id: 'c', w: 1, h: 1, minW: 1, minH: 1 },
  ]);
});
test('non-integer sizes are truncated before clamping', () => {
  expect(normalizeLayout([
    { id: 'a', w: 2.7, h: 1.9 },
    { id: 'b', w: 4.5, h: 2.2, minW: 1.8, minH: 2.6 },
  ], 4)).toEqual([
    { id: 'a', w: 2, h: 1 },
    { id: 'b', w: 4, h: 2, minW: 1, minH: 2 },
  ]);
});

test('normalize: minW/minH below 1 become 1', () => {
  expect(normalizeLayout([{ id: 'a', w: 2, h: 2, minW: 0, minH: -3 }], 4)[0]).toMatchObject({ w: 2, h: 2, minW: 1, minH: 1 });
  expect(normalizeLayout([{ id: 'a', w: 2, h: 2, minW: NaN }], 4)[0]).toMatchObject({ minW: 1 });
  expect(normalizeLayout([{ id: 'a', w: 2, h: 2, minW: -Infinity }], 4)[0]).toMatchObject({ minW: 1 });
});
