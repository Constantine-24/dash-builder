import { describe, expect, test } from 'vitest';
import { computeFlow, rowsOf } from '../../src/engine/flow.js';
import { planResize } from '../../src/engine/resize.js';
import type { DropMode, DropResult, LayoutItem } from '../../src/engine/types.js';

const L: LayoutItem[] = [
  { id: 'A', w: 1, h: 1 },
  { id: 'B', w: 3, h: 1 },
  { id: 'C', w: 2, h: 1 },
  { id: 'D', w: 2, h: 1 },
];
const rz = (mode: DropMode, id: string, w: number, h: number, maxRows?: number): DropResult =>
  planResize(L, { columns: 4, mode, maxRows }, id, { w, h });
const sizes = (r: DropResult): (string | number)[][] | false => r.ok && r.layout.map((i) => [i.id, i.w, i.h]);

describe('planResize', () => {
  test('insert: widening A wraps B', () => {
    const r = rz('insert', 'A', 2, 1);
    expect(r.ok && rowsOf(computeFlow(r.layout, 4))).toEqual([['A'], ['B'], ['C', 'D']]);
  });

  test('block/swap: widening into neighbor rejected, narrowing ok, taller ok', () => {
    expect(rz('block', 'A', 2, 1)).toEqual({ ok: false, reason: 'no-room' });
    expect(rz('swap', 'A', 2, 1)).toEqual({ ok: false, reason: 'no-room' });
    expect(sizes(rz('block', 'C', 1, 1))).toContainEqual(['C', 1, 1]);
    expect(sizes(rz('block', 'A', 1, 3))).toContainEqual(['A', 1, 3]);
  });

  test('shrink: widening A shrinks B', () => {
    expect(sizes(rz('shrink', 'A', 2, 1))).toEqual([['A', 2, 1], ['B', 2, 1], ['C', 2, 1], ['D', 2, 1]]);
  });

  test('shrink: no-room when neighbors cannot give way', () => {
    const tight: LayoutItem[] = [{ id: 'A', w: 1, h: 1 }, { id: 'B', w: 3, h: 1, minW: 3 }];
    expect(planResize(tight, { columns: 4, mode: 'shrink' }, 'A', { w: 2, h: 1 })).toEqual({ ok: false, reason: 'no-room' });
  });

  test('clamps to [minW, columns]', () => {
    expect(sizes(rz('insert', 'A', 9, 1))).toContainEqual(['A', 4, 1]);
    expect(sizes(rz('insert', 'A', 0, 0))).toContainEqual(['A', 1, 1]);
    const withMin: LayoutItem[] = [{ id: 'A', w: 3, h: 2, minW: 2, minH: 2 }];
    expect(planResize(withMin, { columns: 4, mode: 'insert' }, 'A', { w: 1, h: 1 })).toEqual({
      ok: true,
      layout: [{ id: 'A', w: 2, h: 2, minW: 2, minH: 2 }],
    });
  });

  test('locked, invalid and maxRows', () => {
    expect(planResize(L.map((i) => ({ ...i, locked: i.id === 'A' })), { columns: 4, mode: 'insert' }, 'A', { w: 1, h: 2 }))
      .toEqual({ ok: false, reason: 'locked' });
    expect(rz('insert', 'Z', 1, 1)).toEqual({ ok: false, reason: 'invalid' });
    expect(rz('block', 'A', 1, 3, 2)).toEqual({ ok: false, reason: 'max-rows' });
  });

  test('no-op size returns the same layout in every mode', () => {
    for (const mode of ['insert', 'block', 'shrink', 'swap'] as const) {
      expect(rz(mode, 'C', 2, 1, 1)).toEqual({ ok: true, layout: L });
    }
  });

  test('shrink: a shrunk neighbour may not jump onto the row above: no-room', () => {
    // rows A | B,C; widening C to 3 shrinks B to 1, which would join A's row
    const M: LayoutItem[] = [{ id: 'A', w: 3, h: 1 }, { id: 'B', w: 2, h: 1 }, { id: 'C', w: 2, h: 1 }];
    expect(planResize(M, { columns: 4, mode: 'shrink' }, 'C', { w: 3, h: 1 })).toEqual({ ok: false, reason: 'no-room' });
  });

  test('maxRows below the current height: a resize that keeps the height is ok, one that grows it is max-rows', () => {
    const tall: LayoutItem[] = [{ id: 'A', w: 2, h: 1 }, { id: 'B', w: 2, h: 1 }, { id: 'C', w: 4, h: 3 }]; // 4 rows
    const cfg4 = { columns: 4, mode: 'insert' as const, maxRows: 3 };
    expect(sizes(planResize(tall, cfg4, 'A', { w: 1, h: 1 }))).toContainEqual(['A', 1, 1]);
    expect(planResize(tall, cfg4, 'C', { w: 4, h: 4 })).toEqual({ ok: false, reason: 'max-rows' });
  });
});
