import { computeFlow, rowsOf } from './flow.js';
import type { LayoutItem } from './types.js';

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
