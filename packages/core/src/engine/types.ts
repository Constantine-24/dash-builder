export type DropMode = 'insert' | 'block' | 'shrink' | 'swap';
export interface LayoutItem { id: string; w: number; h: number; minW?: number; minH?: number; locked?: boolean }
export interface PlacedItem extends LayoutItem { x: number; y: number; row: number }
export interface EngineConfig { columns: number; maxRows?: number; mode: DropMode }
export type DropTarget = { index: number } | { swapWith: string };
export type RejectReason = 'locked' | 'no-room' | 'max-rows' | 'invalid' | 'duplicate';
export type DropResult = { ok: true; layout: LayoutItem[] } | { ok: false; reason: RejectReason };
