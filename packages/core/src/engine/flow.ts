import type { LayoutItem, PlacedItem } from './types.js';

/**
 * Places items in list order, left to right, wrapping to a new row band when
 * the next item would exceed `columns`. Each row band is as tall as its
 * tallest item. Input x/y are never read; output carries computed x, y, row.
 */
export function computeFlow(items: LayoutItem[], columns: number): PlacedItem[] {
  const placed: PlacedItem[] = [];
  let x = 0;
  let row = 0;
  let rowTop = 0;
  let rowHeight = 0;
  for (const item of items) {
    if (x > 0 && x + item.w > columns) {
      rowTop += rowHeight;
      row++;
      x = 0;
      rowHeight = 0;
    }
    placed.push({ ...item, x, y: rowTop, row });
    x += item.w;
    rowHeight = Math.max(rowHeight, item.h);
  }
  return placed;
}

/** Groups placed item ids by row band, in order. */
export function rowsOf(placed: PlacedItem[]): string[][] {
  const rows: string[][] = [];
  for (const p of placed) {
    (rows[p.row] ??= []).push(p.id);
  }
  return rows;
}

/** Total height in rows: the top of the last band plus that band's height. */
export function totalRows(placed: PlacedItem[]): number {
  if (placed.length === 0) return 0;
  const lastRow = placed[placed.length - 1].row;
  let top = 0;
  let height = 0;
  for (const p of placed) {
    if (p.row === lastRow) {
      top = p.y;
      height = Math.max(height, p.h);
    }
  }
  return top + height;
}

/** Single-column stack in list order, keeping each item's h. */
export function stackForNarrow(items: LayoutItem[]): PlacedItem[] {
  return computeFlow(items.map((i) => ({ ...i, w: 1 })), 1);
}
