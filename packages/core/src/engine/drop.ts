import { computeFlow } from './flow.js';
import { layoutsEqual } from './normalize.js';
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
 * `order` (the pinned candidate) with the marker's row shrunk to fit, or null if
 * no baseline accepts it. `baselines` are tried in turn (rows as seen, then
 * closed up). The marker's row is the baseline row holding the item the marker
 * is drawn against: `rest[index - 1]` for an "after" target, else `rest[index]`
 * (the last item when index is past the end). The dragged item must land in that
 * row: in `order` it sits between two of the row's items or directly before the
 * first or after the last; when locked items pin it elsewhere, the next baseline
 * is tried. The slice of `order` spanning the row and the dragged item is shrunk
 * with `shrinkRowToFit`, and the result must keep every other item in its row of
 * that baseline.
 */
function shrinkInsert(
  rest: LayoutItem[],
  order: LayoutItem[],
  dragged: LayoutItem,
  columns: number,
  index: number,
  after: boolean,
  baselines: string[][][],
): LayoutItem[] | null {
  if (rest.length === 0) return [dragged];
  const k = order.findIndex((i) => i.id === dragged.id);
  const refId = rest[after && index > 0 ? index - 1 : Math.min(index, rest.length - 1)].id;
  for (const baseline of baselines) {
    const row = new Set(baseline.find((ids) => ids.includes(refId)));
    const at = order.flatMap((i, n) => (row.has(i.id) ? [n] : []));
    const first = Math.min(...at);
    const last = Math.max(...at);
    if (k < first - 1 || k > last + 1) continue;
    const start = Math.min(first, k);
    const fitted = shrinkRowToFit(order.slice(start, Math.max(last, k) + 1), dragged.id, columns);
    if (!fitted) continue;
    const shrunk = [...order.slice(0, start), ...fitted, ...order.slice(start + fitted.length)];
    if (keepsRows(baseline, dragged.id, columns, shrunk)) return shrunk;
  }
  return null;
}

/** Candidate item order for the mode, before any rule is applied; `fits` is false when shrink could not make room. */
function buildCandidate(
  layout: LayoutItem[],
  rest: LayoutItem[],
  dragged: LayoutItem,
  config: EngineConfig,
  slot: Slot,
  baselines: string[][][],
): { order: LayoutItem[]; fits: boolean } {
  switch (config.mode) {
    case 'insert':
    case 'block':
      if (slot.kind !== 'index') throw new Error('unreachable: validated slot');
      return { order: pinnedInsert(layout, rest, dragged, slot.index), fits: true };
    case 'shrink': {
      if (slot.kind !== 'index') throw new Error('unreachable: validated slot');
      const order = pinnedInsert(layout, rest, dragged, slot.index);
      const shrunk = shrinkInsert(rest, order, dragged, config.columns, slot.index, slot.after, baselines);
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
 * The candidate, without the dragged item, has as many rows as `baseline` and
 * every other item sits in the same row (by row number). The baselines are the
 * rows as seen (`rowsWithout(layout, …)`, the dragged item still in place) and
 * closed up (`rowsWithout(rest, …)`, its old spot closed). Order inside a row may
 * differ: with locked items pinned, unlocked items can swap sides of a locked one
 * in the same row.
 */
function keepsRows(baseline: string[][], dragId: string, columns: number, candidate: LayoutItem[]): boolean {
  const rowOf = (rows: string[][]) => new Map(rows.flatMap((row, r) => row.map((id) => [id, r] as const)));
  const after = rowsWithout(candidate, columns, dragId);
  if (baseline.length !== after.length) return false;
  const b = rowOf(after);
  return [...rowOf(baseline)].every(([id, r]) => b.get(id) === r);
}

/** Mode-specific acceptance rule applied to the candidate. */
function modeAllows(baselines: string[][][], dragId: string, config: EngineConfig, candidate: LayoutItem[], fits: boolean): boolean {
  switch (config.mode) {
    case 'insert':
      return true;
    case 'block':
      return baselines.some((baseline) => keepsRows(baseline, dragId, config.columns, candidate));
    case 'shrink':
      // `shrinkInsert` only accepts a shrunk candidate that keeps the rows of one
      // baseline, so a shrunk neighbour can't jump onto the row above.
      return fits;
    case 'swap':
      return true;
  }
}

/**
 * Shrink mode, an "after" target at the dragged item's own position (`layout[index]`
 * is the dragged item, so `rest[index - 1]` is `layout[index - 1]`), where that
 * item is on an earlier row than the dragged one: the marker is at the end of the
 * previous row.
 */
function endsPreviousRow(layout: LayoutItem[], config: EngineConfig, slot: Slot & { kind: 'index' }): boolean {
  if (config.mode !== 'shrink' || !slot.after || slot.index === 0) return false;
  const placed = computeFlow(layout, config.columns);
  return placed[slot.index - 1].row !== placed[slot.index].row;
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
 *    at the item's own position, or one whose candidate equals the layout
 *    (`layoutsEqual`: ids and widths; e.g. right after a locked item the dragged
 *    one precedes), or a swap with itself. In shrink mode an "after" target at the
 *    item's own position whose `rest[index - 1]` ends the previous row is not a
 *    no-op (it asks to shrink that row), and a shrink that can't fit is never one;
 * 4. swap only: a locked swap target -> locked (checked before building a candidate);
 * 5. locked (safety assertion; never fires for index targets): every locked item
 *    keeps its index in the candidate order;
 * 6. mode rule -> no-room, judged against two baselines: the rows as the user sees
 *    them (dragged item still in place) and the rows with its old spot closed up.
 *    Block: every item other than the dragged one keeps its row under either
 *    baseline. Shrink: for the first baseline that works, the dragged item lands in
 *    the marker's row of that baseline, the row can be shrunk to fit, and every
 *    other item keeps its row of that baseline. Insert and swap always pass;
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

  // Dropping where the item already sits changes nothing, whatever the mode, except
  // a shrink onto the end of the previous row (the item starts its row).
  if (slot.kind === 'index' && layout[slot.index]?.id === dragId && !endsPreviousRow(layout, config, slot)) {
    return { ok: true, layout };
  }
  if (slot.kind === 'swap') {
    if (slot.swapWith === dragId) return { ok: true, layout };
    if (layout.find((i) => i.id === slot.swapWith)?.locked) return { ok: false, reason: 'locked' };
  }

  const baselines = [rowsWithout(layout, config.columns, dragId), rowsWithout(rest, config.columns, dragId)];
  const { order: candidate, fits } = buildCandidate(layout, rest, dragged, config, slot, baselines);
  // An index target that maps back to the item's own slot among the unlocked items.
  if (slot.kind === 'index' && fits && layoutsEqual(candidate, layout)) return { ok: true, layout };
  if (layout.some((item, i) => item.locked && candidate[i]?.id !== item.id)) {
    return { ok: false, reason: 'locked' };
  }

  // 3. mode rule
  if (!modeAllows(baselines, dragId, config, candidate, fits)) return { ok: false, reason: 'no-room' };

  // 4. max-rows
  if (exceedsMaxRows(layout, candidate, config)) {
    return { ok: false, reason: 'max-rows' };
  }

  return { ok: true, layout: candidate };
}
