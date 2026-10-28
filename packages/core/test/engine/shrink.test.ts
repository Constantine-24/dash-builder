import { describe, expect, test } from 'vitest';
import { planDrop } from '../../src/engine/drop.js';
import { shrinkRowToFit } from '../../src/engine/shrink.js';

const L = [{ id: 'A', w: 1, h: 1 }, { id: 'B', w: 3, h: 1 }, { id: 'C', w: 2, h: 1 }, { id: 'D', w: 2, h: 1 }];

describe('shrink mode', () => {
  test('C between A and B: B shrinks 3→1 (A already at minW)', () => {
    const r = planDrop(L, { columns: 4, mode: 'shrink' }, 'C', { index: 1 });
    expect(r.ok && r.layout).toEqual([
      { id: 'A', w: 1, h: 1 }, { id: 'C', w: 2, h: 1 }, { id: 'B', w: 1, h: 1 }, { id: 'D', w: 2, h: 1 },
    ]);
  });
  test('impossible when minW prevents fit', () => {
    const M = L.map((i) => (i.id === 'B' ? { ...i, minW: 3 } : i));
    expect(planDrop(M, { columns: 4, mode: 'shrink' }, 'C', { index: 1 })).toEqual({ ok: false, reason: 'no-room' });
  });
  test('fits without shrinking → plain insert', () => {
    const M = [{ id: 'A', w: 1, h: 1 }, { id: 'B', w: 2, h: 1 }, { id: 'D', w: 1, h: 1 }];
    const r = planDrop(M, { columns: 4, mode: 'shrink' }, 'D', { index: 1 });
    expect(r.ok && r.layout.map((i) => [i.id, i.w])).toEqual([['A', 1], ['D', 1], ['B', 2]]);
  });
  test('append at end targets the last row', () => {
    const r = planDrop(L, { columns: 4, mode: 'shrink' }, 'A', { index: 3 });
    expect(r.ok && r.layout.map((i) => [i.id, i.w])).toEqual([['B', 3], ['C', 2], ['D', 1], ['A', 1]]);
  });
  test('single item', () => {
    const r = planDrop([{ id: 'A', w: 2, h: 1 }], { columns: 4, mode: 'shrink' }, 'A', { index: 0 });
    expect(r.ok && r.layout).toEqual([{ id: 'A', w: 2, h: 1 }]);
  });
});

describe('shrink no-op drop', () => {
  test('dropping at the current index leaves the layout unchanged', () => {
    const A = [{ id: 'A', w: 1, h: 1 }, { id: 'B', w: 2, h: 1 }, { id: 'C', w: 2, h: 1 }, { id: 'D', w: 2, h: 1 }];
    expect(planDrop(A, { columns: 4, mode: 'shrink' }, 'B', { index: 1 })).toEqual({ ok: true, layout: A });
    expect(planDrop(L, { columns: 4, mode: 'shrink' }, 'B', { index: 1 })).toEqual({ ok: true, layout: L });
  });
});

describe('shrinkRowToFit', () => {
  test('throws when fixedId is not in the row', () => {
    expect(() => shrinkRowToFit([{ id: 'A', w: 1, h: 1 }], 'Z', 4)).toThrow();
  });
  const row = [{ id: 'L', w: 2, h: 1 }, { id: 'X', w: 2, h: 1 }, { id: 'R', w: 2, h: 1 }];
  test('nearest first, ties left, locked skipped', () => {
    expect(shrinkRowToFit(row, 'X', 5)!.map((i) => i.w)).toEqual([1, 2, 2]);
    expect(shrinkRowToFit(row.map((i) => (i.id === 'L' ? { ...i, locked: true } : i)), 'X', 5)!.map((i) => i.w)).toEqual([2, 2, 1]);
    expect(shrinkRowToFit(row, 'X', 3)).toBeNull();
  });
  test('returns row unchanged when it already fits', () => {
    expect(shrinkRowToFit(row, 'X', 6)!.map((i) => i.w)).toEqual([2, 2, 2]);
  });
});
