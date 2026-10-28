import type { LayoutItem } from './types.js';

/**
 * Fits one row into `columns` by shrinking items other than `fixedId`, nearest
 * to `fixedId` first (ties: left first), each down to `minW ?? 1` before moving
 * on. Locked items never shrink. Returns a new array, or null if it can't fit.
 */
export function shrinkRowToFit(row: LayoutItem[], fixedId: string, columns: number): LayoutItem[] | null {
  const fixedAt = row.findIndex((i) => i.id === fixedId);
  if (fixedAt < 0) throw new Error(`shrinkRowToFit: fixedId "${fixedId}" is not in the row`);
  const widths = row.map((i) => i.w);
  let excess = widths.reduce((a, b) => a + b, 0) - columns;
  if (excess > 0) {
    const order = row
      .map((item, idx) => ({ item, idx, dist: Math.abs(idx - fixedAt) }))
      .filter(({ item }) => item.id !== fixedId && !item.locked)
      .sort((a, b) => a.dist - b.dist || a.idx - b.idx);
    for (const { item, idx } of order) {
      if (excess <= 0) break;
      const cut = Math.min(excess, widths[idx] - (item.minW ?? 1));
      if (cut > 0) {
        widths[idx] -= cut;
        excess -= cut;
      }
    }
    if (excess > 0) return null;
  }
  return row.map((item, i) => (widths[i] === item.w ? item : { ...item, w: widths[i] }));
}
