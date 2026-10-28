import { describe, expect, test } from 'vitest';
import { computeFlow, rowsOf } from '../../src/engine/flow.js';
import { addItem, removeItem } from '../../src/engine/mutate.js';
import { layoutsEqual } from '../../src/engine/normalize.js';
import type { EngineConfig, LayoutItem } from '../../src/engine/types.js';

const L: LayoutItem[] = [
  { id: 'A', w: 1, h: 1 },
  { id: 'B', w: 3, h: 1 },
  { id: 'C', w: 2, h: 1 },
  { id: 'D', w: 2, h: 1 },
];
const cfg: EngineConfig = { columns: 4, mode: 'insert' };
const ids = (l: LayoutItem[]) => l.map((i) => i.id);

describe('addItem', () => {
  test('appends by default', () => {
    const r = addItem(L, cfg, { id: 'E', w: 1, h: 1 });
    expect(r.ok && ids(r.layout)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(r.ok && rowsOf(computeFlow(r.layout, 4))).toEqual([['A', 'B'], ['C', 'D'], ['E']]);
  });

  test('inserts at index 0', () => {
    const r = addItem(L, cfg, { id: 'E', w: 1, h: 1 }, 0);
    expect(r.ok && ids(r.layout)).toEqual(['E', 'A', 'B', 'C', 'D']);
  });

  test('index equal to length is valid; out of range is invalid', () => {
    const r = addItem(L, cfg, { id: 'E', w: 1, h: 1 }, 4);
    expect(r.ok && ids(r.layout)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(addItem(L, cfg, { id: 'E', w: 1, h: 1 }, 5)).toEqual({ ok: false, reason: 'invalid' });
    expect(addItem(L, cfg, { id: 'E', w: 1, h: 1 }, -1)).toEqual({ ok: false, reason: 'invalid' });
    expect(addItem(L, cfg, { id: 'E', w: 1, h: 1 }, 1.5)).toEqual({ ok: false, reason: 'invalid' });
  });

  test('duplicate id rejected (before index check)', () => {
    expect(addItem(L, cfg, { id: 'A', w: 1, h: 1 })).toEqual({ ok: false, reason: 'duplicate' });
    expect(addItem(L, cfg, { id: 'A', w: 1, h: 1 }, 99)).toEqual({ ok: false, reason: 'duplicate' });
  });

  test('max-rows rejected when adding would exceed', () => {
    const full: LayoutItem[] = [{ id: 'A', w: 1, h: 1 }, { id: 'B', w: 3, h: 1 }];
    expect(addItem(full, { ...cfg, maxRows: 1 }, { id: 'E', w: 1, h: 1 })).toEqual({ ok: false, reason: 'max-rows' });
    expect(addItem(full, { ...cfg, maxRows: 2 }, { id: 'E', w: 1, h: 1 }).ok).toBe(true);
  });

  test('maxRows below the current height: an add keeping the height is ok, one growing it is max-rows', () => {
    const tall: LayoutItem[] = [{ id: 'A', w: 2, h: 1 }, { id: 'B', w: 4, h: 3 }, { id: 'C', w: 2, h: 1 }]; // 5 rows
    expect(addItem(tall, { ...cfg, maxRows: 3 }, { id: 'E', w: 2, h: 1 }).ok).toBe(true);
    expect(addItem(tall, { ...cfg, maxRows: 3 }, { id: 'E', w: 3, h: 1 })).toEqual({ ok: false, reason: 'max-rows' });
  });

  test('normalizes: w 9 clamped to 4', () => {
    const r = addItem(L, cfg, { id: 'E', w: 9, h: 1 });
    expect(r.ok && r.layout[4]).toEqual({ id: 'E', w: 4, h: 1 });
  });

  test('does not mutate input', () => {
    const copy = L.map((i) => ({ ...i }));
    addItem(L, cfg, { id: 'E', w: 1, h: 1 }, 0);
    expect(L).toEqual(copy);
  });
});

describe('removeItem', () => {
  test('closes the gap', () => {
    const r = removeItem(L, 'B');
    expect(ids(r)).toEqual(['A', 'C', 'D']);
    expect(rowsOf(computeFlow(r, 4))).toEqual([['A', 'C'], ['D']]);
  });

  test('unknown id returns equal layout', () => {
    expect(layoutsEqual(removeItem(L, 'Z'), L)).toBe(true);
  });
});
