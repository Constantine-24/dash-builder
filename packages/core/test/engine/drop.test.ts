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
  test('locked: a drop that shifts a locked index is rejected; one that keeps it is fine', () => {
    const K = L.map((i) => (i.id === 'B' ? { ...i, locked: true } : i));
    expect(planDrop(K, cfg('insert'), 'A', { index: 2 })).toEqual({ ok: false, reason: 'locked' });
    expect(ids(planDrop(K, cfg('insert'), 'D', { index: 2 }))).toEqual(['A', 'B', 'D', 'C']);
  });
  test('block: locked is reported before no-room', () => {
    // B is locked at index 1; dragging C to index 1 shifts B and also fails the block rule.
    const K = L.map((i) => (i.id === 'B' ? { ...i, locked: true } : i));
    expect(planDrop(K, cfg('block'), 'C', { index: 1 })).toEqual({ ok: false, reason: 'locked' });
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
