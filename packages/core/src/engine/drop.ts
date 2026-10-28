import { computeFlow, rowsOf, totalRows } from './flow.js';
import type { DropResult, DropTarget, EngineConfig, LayoutItem } from './types.js';

/** Result of the mode-specific step: a candidate layout, or a rejection. */
type ModeOutcome = { layout: LayoutItem[] } | { reason: 'no-room' | 'invalid' };

/** The list with the dragged item removed, plus the dragged item itself. */
function withoutItem(layout: LayoutItem[], dragId: string): { dragged: LayoutItem; rest: LayoutItem[] } | null {
  const from = layout.findIndex((i) => i.id === dragId);
  if (from < 0) return null;
  return { dragged: layout[from], rest: layout.filter((_, i) => i !== from) };
}

function rowsWithout(layout: LayoutItem[], columns: number, id: string): string[][] {
  return rowsOf(computeFlow(layout, columns))
    .map((row) => row.filter((x) => x !== id))
    .filter((row) => row.length > 0);
}

function sameRows(a: string[][], b: string[][]): boolean {
  return a.length === b.length && a.every((row, i) => row.length === b[i].length && row.every((id, j) => id === b[i][j]));
}

/**
 * Plans a drop of `dragId` onto `target`. Shared checks run in order:
 * invalid -> locked -> mode rule -> max-rows. Input is expected to be normalized.
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

  const isIndex = 'index' in target;
  if (config.mode === 'swap') {
    if (isIndex || !layout.some((i) => i.id === target.swapWith) || target.swapWith === dragId) {
      return { ok: false, reason: 'invalid' };
    }
  } else if (
    !isIndex ||
    !Number.isInteger(target.index) ||
    target.index < 0 ||
    target.index > rest.length
  ) {
    return { ok: false, reason: 'invalid' };
  }

  // 2. locked: the dragged item itself
  if (dragged.locked) return { ok: false, reason: 'locked' };

  // 3. mode rule produces the candidate layout
  const outcome = applyMode(rest, dragged, config, target);
  if ('reason' in outcome) return { ok: false, reason: outcome.reason };
  const result = outcome.layout;

  // 3b. every locked item must keep its index
  if (layout.some((item, i) => item.locked && result[i]?.id !== item.id)) {
    return { ok: false, reason: 'locked' };
  }

  // 4. max-rows
  if (config.maxRows !== undefined && totalRows(computeFlow(result, config.columns)) > config.maxRows) {
    return { ok: false, reason: 'max-rows' };
  }

  return { ok: true, layout: result };
}

function applyMode(
  rest: LayoutItem[],
  dragged: LayoutItem,
  config: EngineConfig,
  target: DropTarget,
): ModeOutcome {
  switch (config.mode) {
    case 'insert': {
      return { layout: insertAt(rest, dragged, (target as { index: number }).index) };
    }
    case 'block': {
      const result = insertAt(rest, dragged, (target as { index: number }).index);
      const before = rowsWithout(rest, config.columns, dragged.id);
      const after = rowsWithout(result, config.columns, dragged.id);
      return sameRows(before, after) ? { layout: result } : { reason: 'no-room' };
    }
    case 'shrink':
    case 'swap':
      throw new Error('not implemented');
  }
}

function insertAt(rest: LayoutItem[], dragged: LayoutItem, index: number): LayoutItem[] {
  return [...rest.slice(0, index), dragged, ...rest.slice(index)];
}
