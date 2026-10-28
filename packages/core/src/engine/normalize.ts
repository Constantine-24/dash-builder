import type { LayoutItem } from './types.js';

/**
 * Returns a normalized copy of `items`: minW is capped to `columns`, w is
 * clamped into [minW, columns], h is raised to at least minH (and 1).
 * Optional fields absent in the input stay absent in the output.
 * Throws on duplicate ids.
 */
export function normalizeLayout(items: LayoutItem[], columns: number): LayoutItem[] {
  const seen = new Set<string>();
  return items.map((item) => {
    if (seen.has(item.id)) throw new Error(`duplicate id "${item.id}"`);
    seen.add(item.id);

    const out: LayoutItem = { ...item };
    if (item.minW !== undefined) out.minW = Math.min(item.minW, columns);
    out.w = Math.min(columns, Math.max(item.w, out.minW ?? 1, 1));
    out.h = Math.max(item.h, out.minH ?? 1, 1);
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
