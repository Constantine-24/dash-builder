import { normalizeLayout } from './normalize.js';
import { exceedsMaxRows } from './rows.js';
import type { DropResult, EngineConfig, LayoutItem } from './types.js';

/**
 * Adds `item` at `index` (default: append; valid range 0..layout.length).
 * The item is normalized. Checks run in order: duplicate -> invalid index -> max-rows
 * (refused only when the result is taller than both maxRows and the current layout).
 * Shifting locked items is allowed: locks constrain user drags, not developer actions.
 */
export function addItem(
  layout: LayoutItem[],
  config: EngineConfig,
  item: LayoutItem,
  index: number = layout.length,
): DropResult {
  if (layout.some((i) => i.id === item.id)) return { ok: false, reason: 'duplicate' };
  if (!Number.isInteger(index) || index < 0 || index > layout.length) return { ok: false, reason: 'invalid' };

  const [normalized] = normalizeLayout([item], config.columns);
  const next = [...layout.slice(0, index), normalized, ...layout.slice(index)];
  if (exceedsMaxRows(layout, next, config)) {
    return { ok: false, reason: 'max-rows' };
  }
  return { ok: true, layout: next };
}

/** Removes the item with `id`; an unknown id returns the layout unchanged. */
export function removeItem(layout: LayoutItem[], id: string): LayoutItem[] {
  return layout.some((i) => i.id === id) ? layout.filter((i) => i.id !== id) : layout;
}
