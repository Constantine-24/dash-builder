import { computeFlow, rowsOf, totalRows } from './flow.js';
import { rowsWithout, sameRows } from './rows.js';
import { shrinkRowToFit } from './shrink.js';
import type { DropResult, DropTarget, EngineConfig, LayoutItem } from './types.js';

/** A target already validated against the mode and the list. */
type Slot = { kind: 'index'; index: number } | { kind: 'swap'; swapWith: string };

/** The list with the dragged item removed, plus the dragged item itself. */
function withoutItem(layout: LayoutItem[], dragId: string): { dragged: LayoutItem; rest: LayoutItem[] } | null {
  const from = layout.findIndex((i) => i.id === dragId);
  if (from < 0) return null;
  return { dragged: layout[from], rest: layout.filter((_, i) => i !== from) };
}

function insertAt(rest: LayoutItem[], dragged: LayoutItem, index: number): LayoutItem[] {
  return [...rest.slice(0, index), dragged, ...rest.slice(index)];
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
    return { kind: 'index', index: target.index };
  }
  return null;
}

/** Inserted order with the target row shrunk to fit, or null if it can't fit. */
function shrinkInsert(rest: LayoutItem[], dragged: LayoutItem, columns: number, index: number): LayoutItem[] | null {
  if (rest.length === 0) return [dragged];
  const placed = computeFlow(rest, columns);
  const rowNo = placed[Math.min(index, rest.length - 1)].row;
  const first = placed.findIndex((p) => p.row === rowNo);
  const last = first + placed.filter((p) => p.row === rowNo).length - 1;
  // Row slice of `rest`, with the dragged item at its position inside it.
  const row = insertAt(rest.slice(first, last + 1), dragged, index - first);
  const fitted = shrinkRowToFit(row, dragged.id, columns);
  if (!fitted) return null;
  const widths = new Map(fitted.map((i) => [i.id, i.w]));
  return insertAt(
    rest.map((i) => (widths.has(i.id) && widths.get(i.id) !== i.w ? { ...i, w: widths.get(i.id)! } : i)),
    dragged,
    index,
  );
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
      return { order: insertAt(rest, dragged, slot.index), fits: true };
    case 'shrink': {
      if (slot.kind !== 'index') throw new Error('unreachable: validated slot');
      const shrunk = shrinkInsert(rest, dragged, config.columns, slot.index);
      if (shrunk) return { order: shrunk, fits: true };
      return { order: insertAt(rest, dragged, slot.index), fits: false };
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
    case 'block': {
      const before = rowsWithout(rest, config.columns, dragged.id);
      const after = rowsWithout(candidate, config.columns, dragged.id);
      return sameRows(before, after);
    }
    case 'shrink':
      return fits;
    case 'swap':
      return true;
  }
}

/**
 * Plans a drop of `dragId` onto `target`. Checks run in order:
 * invalid -> locked (dragged item, then every locked item keeping its index in
 * the candidate order) -> mode rule -> max-rows. Input is expected to be normalized.
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
  if (layout.some((item, i) => item.locked && candidate[i]?.id !== item.id)) {
    return { ok: false, reason: 'locked' };
  }

  // 3. mode rule
  if (!modeAllows(rest, dragged, config, candidate, fits)) return { ok: false, reason: 'no-room' };

  // 4. max-rows
  if (config.maxRows !== undefined && totalRows(computeFlow(candidate, config.columns)) > config.maxRows) {
    return { ok: false, reason: 'max-rows' };
  }

  return { ok: true, layout: candidate };
}
