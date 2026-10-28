import type { LayoutItem } from './types.js';

/** Non-finite -> `min`; otherwise truncated toward zero. */
function int(value: number, min: number): number {
  return Number.isFinite(value) ? Math.trunc(value) : min;
}

/**
 * Returns a normalized copy of `items`: w, h, minW and minH are truncated to
 * integers (non-finite values become their minimum: 1, or minW/minH for w/h),
 * minW and minH are raised to at least 1, minW is capped to `columns`,
 * w is clamped into [minW, columns], h is raised to at least minH (and 1).
 * Optional fields absent in the input stay absent in the output.
 * Throws on duplicate ids.
 */
export function normalizeLayout(items: LayoutItem[], columns: number): LayoutItem[] {
  const seen = new Set<string>();
  return items.map((item) => {
    if (seen.has(item.id)) throw new Error(`duplicate id "${item.id}"`);
    seen.add(item.id);

    const out: LayoutItem = { ...item };
    if (item.minW !== undefined) out.minW = Math.min(Math.max(int(item.minW, 1), 1), columns);
    if (item.minH !== undefined) out.minH = Math.max(int(item.minH, 1), 1);
    const minW = Math.max(out.minW ?? 1, 1);
    const minH = Math.max(out.minH ?? 1, 1);
    out.w = Math.min(columns, Math.max(int(item.w, minW), minW));
    out.h = Math.max(int(item.h, minH), minH);
    return out;
  });
}

export function layoutsEqual(a: LayoutItem[], b: LayoutItem[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x, i) => {
    const y = b[i];
    return (
      x.id === y.id &&
      x.w === y.w &&
      x.h === y.h &&
      x.minW === y.minW &&
      x.minH === y.minH &&
      x.locked === y.locked
    );
  });
}
