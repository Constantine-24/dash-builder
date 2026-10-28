import { computeFlow } from './flow.js';
import { exceedsMaxRows, rowsWithout } from './rows.js';
import { shrinkRowToFit } from './shrink.js';
import type { DropResult, DropTarget, EngineConfig, LayoutItem } from './types.js';

/** A target already validated against the mode and the list. */
type Slot = { kind: 'index'; index: number; after: boolean } | { kind: 'swap'; swapWith: string };

/** The list with the dragged item removed, plus the dragged item itself. */
function withoutItem(layout: LayoutItem[], dragId: string): { dragged: LayoutItem; rest: LayoutItem[] } | null {
  const from = layout.findIndex((i) => i.id === dragId);
  if (from < 0) return null;
  return { dragged: layout[from], rest: layout.filter((_, i) => i !== from) };
}

function insertAt(rest: LayoutItem[], dragged: LayoutItem, index: number): LayoutItem[] {
  return [...rest.slice(0, index), dragged, ...rest.slice(index)];
}

/**
 * Order for an index target with locked items pinned: every locked item stays at
 * its index in `layout`; the unlocked items (dragged one included) fill the other
 * slots in order. The dragged item goes among the unlocked items at the number
 * of unlocked items in `rest[0 .. index)`. Without locked items this is
 * `insertAt(rest, dragged, index)`.
 */
function pinnedInsert(layout: LayoutItem[], rest: LayoutItem[], dragged: LayoutItem, index: number): LayoutItem[] {
  const free = rest.filter((i) => !i.locked);
  const freeIndex = rest.slice(0, index).filter((i) => !i.locked).length;
  const order = insertAt(free, dragged, freeIndex);
  let next = 0;
  return layout.map((item) => (item.locked ? item : order[next++]));
}

/** Validates the target for the mode; null means `invalid`. */
function toSlot(layout: LayoutItem[], rest: LayoutItem[], config: EngineConfig, dragId: string, target: DropTarget): Slot | null {
  if (config.mode === 'swap') {
    if ('swapWith' in target && layout.some((i) => i.id === target.swapWith)) {
      return { kind: 'swap', swapWith: target.swapWith };
    }
    return null;
  }
  if ('index' in target && Number.isInteger(target.index) && target.index >= 0 && target.index <= rest.length) {
    return { kind: 'index', index: target.index, after: target.after === true };
  }
  return null;
}

/**
 * `order` (the pinned candidate) with the target row shrunk to fit, or null if it
 * can't fit. The target row is the marker's row: the row of the item the marker
 * is drawn against, `rest[index - 1]` for an "after" target, else `rest[index]`
 * (the last item when index is past the end), found in the flow of `order`
 * without the dragged item. The dragged item must land in that row (its index in
 * `order` lies within the row or right after it); when locked items pin it
 * elsewhere, null. Without locked items this squeezes the same row as before.
 */
function shrinkInsert(
  rest: LayoutItem[],
  order: LayoutItem[],
  dragged: LayoutItem,
  columns: number,
  index: number,
  after: boolean,
): LayoutItem[] | null {
  if (rest.length === 0) return [dragged];
  const k = order.findIndex((i) => i.id === dragged.id);
  const base = order.filter((i) => i.id !== dragged.id);
  const refId = rest[after && index > 0 ? index - 1 : Math.min(index, rest.length - 1)].id;
  const placed = computeFlow(base, columns);
  const rowNo = placed.find((p) => p.id === refId)!.row;
  const first = placed.findIndex((p) => p.row === rowNo);
  const last = first + placed.filter((p) => p.row === rowNo).length - 1;
  if (k < first || k > last + 1) return null;
  // Row slice of `base`, with the dragged item at its position inside it.
  const row = insertAt(base.slice(first, last + 1), dragged, k - first);
  const fitted = shrinkRowToFit(row, dragged.id, columns);
  if (!fitted) return null;
  const widths = new Map(fitted.map((i) => [i.id, i.w]));
  return order.map((i) => (widths.has(i.id) && widths.get(i.id) !== i.w ? { ...i, w: widths.get(i.id)! } : i));
}

/** Candidate item order for the mode, before any rule is applied; `fits` is false when shrink could not make room. */
function buildCandidate(
  layout: LayoutItem[],
  rest: LayoutItem[],
  dragged: LayoutItem,
  config: EngineConfig,
  slot: Slot,
): { order: LayoutItem[]; fits: boolean } {
  switch (config.mode) {
    case 'insert':
    case 'block':
      if (slot.kind !== 'index') throw new Error('unreachable: validated slot');
      return { order: pinnedInsert(layout, rest, dragged, slot.index), fits: true };
    case 'shrink': {
      if (slot.kind !== 'index') throw new Error('unreachable: validated slot');
      const order = pinnedInsert(layout, rest, dragged, slot.index);
      const shrunk = shrinkInsert(rest, order, dragged, config.columns, slot.index, slot.after);
      if (shrunk) return { order: shrunk, fits: true };
      return { order, fits: false };
    }
    case 'swap': {
      if (slot.kind !== 'swap') throw new Error('unreachable: validated slot');
      const a = layout.findIndex((i) => i.id === dragged.id);
      const b = layout.findIndex((i) => i.id === slot.swapWith);
      const order = layout.slice();
      order[a] = layout[b];
      order[b] = layout[a];
      return { order, fits: true };
    }
  }
}

/**
 * Every item other than the dragged one sits in the same row (by row number) in
 * the candidate as in the list without it. Order inside a row may differ: with
 * locked items pinned, unlocked items can swap sides of a locked one in the same
 * row. Without locked items the candidate keeps `rest`'s order, so this equals
 * comparing the rows in order.
 */
function keepsRows(rest: LayoutItem[], dragged: LayoutItem, config: EngineConfig, candidate: LayoutItem[]): boolean {
  const rowOf = (rows: string[][]) => new Map(rows.flatMap((row, r) => row.map((id) => [id, r] as const)));
  const before = rowsWithout(rest, config.columns, dragged.id);
  const after = rowsWithout(candidate, config.columns, dragged.id);
  if (before.length !== after.length) return false;
  const a = rowOf(before);
  const b = rowOf(after);
  return [...a].every(([id, r]) => b.get(id) === r);
}

/** Mode-specific acceptance rule applied to the candidate. */
function modeAllows(
  rest: LayoutItem[],
  dragged: LayoutItem,
  config: EngineConfig,
  candidate: LayoutItem[],
  fits: boolean,
): boolean {
  switch (config.mode) {
    case 'insert':
      return true;
    case 'block':
      return keepsRows(rest, dragged, config, candidate);
    case 'shrink':
      // Only the target row may change: every other row keeps its members (ignoring
      // the dragged item), so a shrunk neighbour can't jump onto the row above. With
      // the row count equal this is the same as all rows matching.
      return fits && keepsRows(rest, dragged, config, candidate);
    case 'swap':
      return true;
  }
}

/**
 * Plans a drop of `dragId` onto `target`. Input is expected to be normalized.
 * Locked items are pinned to their list index: for an index target the unlocked
 * items reorder around them (see `pinnedInsert`), so a widget can be moved
 * across a locked one.
 * Checks run in order:
 * 1. invalid: unknown dragId, or a target that doesn't fit the mode (`index` in
 *    0..rest.length for insert/block/shrink, an existing `swapWith` for swap);
 * 2. locked: the dragged item is locked;
 * 3. no-op short-circuits, returning the layout unchanged (`ok`): an index target
 *    at the item's own position or one that maps back to it (e.g. right after a
 *    locked item the dragged one precedes), or a swap with itself;
 * 4. swap only: a locked swap target -> locked (checked before building a candidate);
 * 5. locked (safety assertion; never fires for index targets): every locked item
 *    keeps its index in the candidate order;
 * 6. mode rule -> no-room (block: every item other than the dragged one keeps its
 *    row; shrink: the dragged item lands in the marker's row, that row could be
 *    shrunk to fit, and every other item keeps its row; insert and swap always pass);
 * 7. max-rows: the candidate is taller than both maxRows and the current layout.
 */
export function planDrop(
  layout: LayoutItem[],
  config: EngineConfig,
  dragId: string,
  target: DropTarget,
): DropResult {
  // 1. invalid
  const split = withoutItem(layout, dragId);
  if (!split) return { ok: false, reason: 'invalid' };
  const { dragged, rest } = split;
  const slot = toSlot(layout, rest, config, dragId, target);
  if (!slot) return { ok: false, reason: 'invalid' };

  // 2. locked: the dragged item, then every locked item must keep its index
  if (dragged.locked) return { ok: false, reason: 'locked' };

  // Dropping where the item already sits changes nothing, whatever the mode.
  if (slot.kind === 'index' && layout[slot.index]?.id === dragId) return { ok: true, layout };
  if (slot.kind === 'swap') {
    if (slot.swapWith === dragId) return { ok: true, layout };
    if (layout.find((i) => i.id === slot.swapWith)?.locked) return { ok: false, reason: 'locked' };
  }

  const { order: candidate, fits } = buildCandidate(layout, rest, dragged, config, slot);
  // An index target that maps back to the item's own slot among the unlocked items.
  if (slot.kind === 'index' && candidate.every((item, i) => item.id === layout[i].id)) return { ok: true, layout };
  if (layout.some((item, i) => item.locked && candidate[i]?.id !== item.id)) {
    return { ok: false, reason: 'locked' };
  }

  // 3. mode rule
  if (!modeAllows(rest, dragged, config, candidate, fits)) return { ok: false, reason: 'no-room' };

  // 4. max-rows
  if (exceedsMaxRows(layout, candidate, config)) {
    return { ok: false, reason: 'max-rows' };
  }

  return { ok: true, layout: candidate };
}
