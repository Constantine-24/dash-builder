import { computeFlow, rowsOf } from './flow.js';
import { exceedsMaxRows, rowsWithout, sameRows } from './rows.js';
import { shrinkRowToFit } from './shrink.js';
import type { DropResult, EngineConfig, LayoutItem } from './types.js';

function clamp(value: number, min: number, max: number): number {
  const v = Number.isFinite(value) ? Math.trunc(value) : min;
  return Math.min(max, Math.max(min, v));
}

/** Widths of the item's original row after shrinking it to fit with the resized item; null if it can't. */
function shrunkLayout(layout: LayoutItem[], resized: LayoutItem[], columns: number, id: string): LayoutItem[] | null {
  const rowNo = computeFlow(layout, columns).find((p) => p.id === id)!.row;
  const members = new Set(rowsOf(computeFlow(layout, columns))[rowNo]);
  const row = resized.filter((i) => members.has(i.id));
  const fitted = shrinkRowToFit(row, id, columns);
  if (!fitted) return null;
  const byId = new Map(fitted.map((i) => [i.id, i]));
  return resized.map((i) => byId.get(i.id) ?? i);
}

/**
 * Plans resizing `id` to `size` (clamped to w in [minW ?? 1, columns], h >= minH ?? 1).
 * Checks run in order: invalid -> locked -> no-op -> mode rule -> max-rows.
 * Shrink mode: the item's row neighbours shrink to fit; narrowing behaves like insert
 * (later items may move up), but when a neighbour had to shrink every other row must
 * keep its members (else no-room). max-rows: refused only when the result is
 * taller than both maxRows and the current layout.
 * Input is expected to be normalized.
 */
export function planResize(
  layout: LayoutItem[],
  config: EngineConfig,
  id: string,
  size: { w: number; h: number },
): DropResult {
  const at = layout.findIndex((i) => i.id === id);
  if (at < 0) return { ok: false, reason: 'invalid' };
  const item = layout[at];
  if (item.locked) return { ok: false, reason: 'locked' };

  const w = clamp(size.w, item.minW ?? 1, config.columns);
  const h = Math.max(item.minH ?? 1, Number.isFinite(size.h) ? Math.trunc(size.h) : 1);
  if (w === item.w && h === item.h) return { ok: true, layout };

  const resized = layout.map((i, idx) => (idx === at ? { ...i, w, h } : i));
  let candidate = resized;

  switch (config.mode) {
    case 'insert':
      break;
    case 'block':
    case 'swap': {
      const before = rowsOf(computeFlow(layout, config.columns));
      const after = rowsOf(computeFlow(resized, config.columns));
      if (!sameRows(before, after)) return { ok: false, reason: 'no-room' };
      break;
    }
    case 'shrink': {
      const fitted = shrunkLayout(layout, resized, config.columns, id);
      if (!fitted) return { ok: false, reason: 'no-room' };
      // Narrowing (or any resize that leaves the neighbours alone) behaves like insert:
      // later items may move up. Only when a neighbour had to shrink must every other
      // row keep its members (ignoring the resized item), so a shrunk neighbour does not
      // jump onto the row above nor a later item get pulled up. With the row count
      // equal, this is the same as all rows matching.
      const narrowed = fitted.some((f, i) => f.w !== resized[i].w);
      if (!narrowed) break;
      if (!sameRows(rowsWithout(layout, config.columns, id), rowsWithout(fitted, config.columns, id))) {
        return { ok: false, reason: 'no-room' };
      }
      candidate = fitted;
      break;
    }
  }

  if (exceedsMaxRows(layout, candidate, config)) {
    return { ok: false, reason: 'max-rows' };
  }
  return { ok: true, layout: candidate };
}
