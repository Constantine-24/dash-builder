export type DropMode = 'insert' | 'block' | 'shrink' | 'swap';
export interface LayoutItem { id: string; w: number; h: number; minW?: number; minH?: number; locked?: boolean }
export interface PlacedItem extends LayoutItem { x: number; y: number; row: number }
export interface EngineConfig { columns: number; maxRows?: number; mode: DropMode }
/**
 * `index` is a position in the list without the dragged item. `after` marks an
 * "after" marker line (right/lower half of an item, beside an item, end of list):
 * shrink mode then squeezes into the row of the item before the index instead of
 * the one after it. Insert and block ignore it.
 */
export type DropTarget = { index: number; after?: boolean } | { swapWith: string };
export type RejectReason = 'locked' | 'no-room' | 'max-rows' | 'invalid' | 'duplicate';
export type DropResult = { ok: true; layout: LayoutItem[] } | { ok: false; reason: RejectReason };
