import { computeFlow, rowsOf, totalRows } from './flow.js';
import type { EngineConfig, LayoutItem } from './types.js';

/** Row membership of the flowed layout with `id` left out; emptied rows dropped. */
export function rowsWithout(layout: LayoutItem[], columns: number, id: string): string[][] {
  return rowsOf(computeFlow(layout, columns))
    .map((row) => row.filter((x) => x !== id))
    .filter((row) => row.length > 0);
}

/** True when both row groupings hold the same ids in the same order. */
export function sameRows(a: string[][], b: string[][]): boolean {
  return a.length === b.length && a.every((row, i) => row.length === b[i].length && row.every((id, j) => id === b[i][j]));
}

/**
 * The maxRows rule: a candidate is refused only when it is taller than both
 * `maxRows` and the current layout, so a layout already over the limit can
 * still be rearranged as long as it doesn't grow.
 */
export function exceedsMaxRows(current: LayoutItem[], candidate: LayoutItem[], config: EngineConfig): boolean {
  if (config.maxRows === undefined) return false;
  const limit = Math.max(config.maxRows, totalRows(computeFlow(current, config.columns)));
  return totalRows(computeFlow(candidate, config.columns)) > limit;
}
