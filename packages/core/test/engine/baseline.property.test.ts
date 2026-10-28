import { describe, expect, test } from 'vitest';
import { planDrop } from '../../src/engine/drop.js';
import { computeFlow } from '../../src/engine/flow.js';
import type { DropTarget, LayoutItem } from '../../src/engine/types.js';

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COLUMNS = 4;

describe('property: moving a widget within its own row', () => {
  test('block and shrink both allow it, and shrink narrows nothing', () => {
    const rand = mulberry32(1);
    const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
    for (let c = 0; c < 300; c++) {
      const w = int(1, 2);
      const layout: LayoutItem[] = Array.from({ length: int(3, 8) }, (_, i) => ({ id: `i${i}`, w, h: int(1, 3) }));
      const rowOf = computeFlow(layout, COLUMNS).map((p) => p.row);
      for (let p = 0; p < layout.length; p++) {
        // The dragged item's row spans layout indices [a, b]; in `rest` (without it) the
        // other members of that row sit at [a, b - 1].
        const a = rowOf.indexOf(rowOf[p]);
        const b = rowOf.lastIndexOf(rowOf[p]);
        if (a === b) continue; // alone in its row: no target inside it
        // Marker before a member of the row (index a..b-1), or after one (a+1..b).
        const targets: DropTarget[] = [];
        for (let i = a; i <= b - 1; i++) targets.push({ index: i });
        for (let i = a + 1; i <= b; i++) targets.push({ index: i, after: true });
        const target = targets[int(0, targets.length - 1)];
        const dragId = layout[p].id;
        const ctx = JSON.stringify({ c, layout, dragId, target });

        expect(planDrop(layout, { columns: COLUMNS, mode: 'block' }, dragId, target).ok, ctx).toBe(true);
        const shrunk = planDrop(layout, { columns: COLUMNS, mode: 'shrink' }, dragId, target);
        expect(shrunk.ok, ctx).toBe(true);
        if (shrunk.ok) expect(shrunk.layout.every((i) => i.w === w), ctx).toBe(true);
      }
    }
  });
});
