import { describe, expect, test } from 'vitest';
import { planDrop } from '../../src/engine/drop.js';
import { layoutsEqual } from '../../src/engine/normalize.js';
import type { DropMode, DropResult, EngineConfig, LayoutItem } from '../../src/engine/types.js';

const cfg = (mode: DropMode, maxRows?: number): EngineConfig => ({ columns: 4, mode, maxRows });
const ids = (r: DropResult): string[] | false => r.ok && r.layout.map((i) => i.id);

const L: LayoutItem[] = [
  { id: 'A', w: 1, h: 1 },
  { id: 'B', w: 3, h: 1 },
  { id: 'C', w: 2, h: 1 },
  { id: 'D', w: 2, h: 1 },
];

describe('planDrop insert/block', () => {
  test('insert: C between A and B wraps B', () => {
    expect(ids(planDrop(L, cfg('insert'), 'C', { index: 1 }))).toEqual(['A', 'C', 'B', 'D']);
  });
  test('block: same drop rejected', () => {
    expect(planDrop(L, cfg('block'), 'C', { index: 1 })).toEqual({ ok: false, reason: 'no-room' });
  });
  test('block: move to end is allowed (new row, others unchanged)', () => {
    expect(ids(planDrop(L, cfg('block'), 'A', { index: 3 }))).toEqual(['B', 'C', 'D', 'A']);
  });
  test('block: fits in free column', () => {
    const M: LayoutItem[] = [
      { id: 'A', w: 1, h: 1 },
      { id: 'B', w: 2, h: 1 },
      { id: 'C', w: 2, h: 1 },
      { id: 'D', w: 1, h: 1 },
    ];
    expect(ids(planDrop(M, cfg('block'), 'D', { index: 2 }))).toEqual(['A', 'B', 'D', 'C']);
  });
  test('dropping on own position returns an equal layout', () => {
    const r = planDrop(L, cfg('insert'), 'C', { index: 2 });
    expect(r.ok && layoutsEqual(r.layout, L)).toBe(true);
  });
  test('locked: cannot drag a locked item', () => {
    const K = L.map((i) => (i.id === 'A' ? { ...i, locked: true } : i));
    expect(planDrop(K, cfg('insert'), 'A', { index: 2 })).toEqual({ ok: false, reason: 'locked' });
  });
  test('locked: a drop across a locked item reorders around it; one that keeps it is fine', () => {
    const K = L.map((i) => (i.id === 'B' ? { ...i, locked: true } : i));
    // A goes after C; B stays pinned at index 1.
    expect(ids(planDrop(K, cfg('insert'), 'A', { index: 2 }))).toEqual(['C', 'B', 'A', 'D']);
    expect(ids(planDrop(K, cfg('insert'), 'D', { index: 2 }))).toEqual(['A', 'B', 'D', 'C']);
  });
  test('block: pointing between a locked item and its neighbor maps back to the own slot (no-op)', () => {
    // B is locked at index 1; C at index 1 of [A, B, D] has one unlocked item (A) before it,
    // which is C's own slot among the unlocked items.
    const K = L.map((i) => (i.id === 'B' ? { ...i, locked: true } : i));
    const r = planDrop(K, cfg('block'), 'C', { index: 1 });
    expect(r.ok && layoutsEqual(r.layout, K)).toBe(true);
  });
  test('block: no-op drop onto own position is allowed even if later items could pull up', () => {
    const X: LayoutItem[] = [
      { id: 'A', w: 2, h: 1 },
      { id: 'X', w: 2, h: 1 },
      { id: 'B', w: 2, h: 1 },
      { id: 'C', w: 2, h: 1 },
    ];
    const r = planDrop(X, cfg('block'), 'X', { index: 1 });
    expect(r.ok && layoutsEqual(r.layout, X)).toBe(true);
  });
  test('maxRows rejects overflow', () => {
    expect(planDrop(L, cfg('insert', 2), 'C', { index: 1 })).toEqual({ ok: false, reason: 'max-rows' });
  });
  test('invalid targets', () => {
    expect(planDrop(L, cfg('insert'), 'C', { swapWith: 'A' })).toEqual({ ok: false, reason: 'invalid' });
    expect(planDrop(L, cfg('insert'), 'C', { index: 9 })).toEqual({ ok: false, reason: 'invalid' });
    expect(planDrop(L, cfg('insert'), 'Z', { index: 0 })).toEqual({ ok: false, reason: 'invalid' });
  });

  test('maxRows below the current height: reorders keeping the height are ok, growing it is max-rows', () => {
    const tall: LayoutItem[] = [
      { id: 'A', w: 2, h: 1 }, { id: 'B', w: 2, h: 1 }, { id: 'C', w: 4, h: 1 }, { id: 'D', w: 4, h: 1 }, { id: 'E', w: 4, h: 1 },
    ]; // rows A,B | C | D | E = 4 rows
    expect(ids(planDrop(tall, cfg('insert', 3), 'A', { index: 1 }))).toEqual(['B', 'A', 'C', 'D', 'E']);
    expect(planDrop(tall, cfg('insert', 3), 'A', { index: 2 })).toEqual({ ok: false, reason: 'max-rows' });
  });
});

describe('planDrop: locked items are pinned to their index', () => {
  const it = (id: string, w = 1, locked = false): LayoutItem => (locked ? { id, w, h: 1, locked } : { id, w, h: 1 });
  const aLb: LayoutItem[] = [it('a'), it('L', 1, true), it('b')];

  test('insert: drag a to the end -> [b, L, a]', () => {
    expect(ids(planDrop(aLb, cfg('insert'), 'a', { index: 2 }))).toEqual(['b', 'L', 'a']);
  });
  test('insert: drag b to index 0 -> [b, L, a]', () => {
    expect(ids(planDrop(aLb, cfg('insert'), 'b', { index: 0 }))).toEqual(['b', 'L', 'a']);
  });
  test('insert: [a, L, b, c], drag c to index 0 -> [c, L, a, b]', () => {
    const K = [it('a'), it('L', 1, true), it('b'), it('c')];
    expect(ids(planDrop(K, cfg('insert'), 'c', { index: 0 }))).toEqual(['c', 'L', 'a', 'b']);
  });
  test('insert: drag a between L and b maps back to its own slot: no-op, equal layout', () => {
    const r = planDrop(aLb, cfg('insert'), 'a', { index: 1 });
    expect(r.ok && layoutsEqual(r.layout, aLb)).toBe(true);
  });
  test('dragging the locked item is rejected', () => {
    for (const mode of ['insert', 'block', 'shrink'] as const) {
      expect(planDrop(aLb, cfg(mode), 'L', { index: 0 })).toEqual({ ok: false, reason: 'locked' });
    }
  });
  test('block: cross-locked move that keeps every other row passes', () => {
    // rows: a L b | c(4); candidate [b, L, c, a] flows b L | c | a: others keep rows {L,b},{c}
    const K = [it('a'), it('L', 1, true), it('b'), it('c', 4)];
    expect(ids(planDrop(K, cfg('block'), 'a', { index: 3 }))).toEqual(['b', 'L', 'c', 'a']);
  });
  test('block: cross-locked move that splits a row is no-room', () => {
    // rows: a(2) L b | c(2); candidate [b, L, a, c] flows b L a(2) | c(2): {L,b,c} split
    const K = [it('a', 2), it('L', 1, true), it('b'), it('c', 2)];
    expect(planDrop(K, cfg('block'), 'a', { index: 2 })).toEqual({ ok: false, reason: 'no-room' });
  });
  test('block: a reorder that moves other widgets between rows is no-room', () => {
    // rows: a L(2) | b(3); candidate [b, L, a] flows b(3) | L(2) a: L and b swap rows
    const K = [it('a'), it('L', 2, true), it('b', 3)];
    expect(planDrop(K, cfg('block'), 'a', { index: 2 })).toEqual({ ok: false, reason: 'no-room' });
  });
  test('shrink: cross-locked move squeezes the marker row', () => {
    // rows: a(2) L b | c; drag c before a -> [c, L, a, b], a shrinks to 1
    const K = [it('a', 2), it('L', 1, true), it('b'), it('c')];
    const r = planDrop(K, cfg('shrink'), 'c', { index: 0 });
    expect(r.ok && r.layout.map((i) => [i.id, i.w])).toEqual([['c', 1], ['L', 1], ['a', 1], ['b', 1]]);
  });
});
