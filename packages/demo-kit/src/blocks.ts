import type { LayoutItem } from '@dash-builder/core';

export type BlockKind = 'number' | 'chart' | 'list' | 'map' | 'form' | 'note';

export interface BlockInfo {
  title: string;
  kind: BlockKind;
  accent: string;
  value?: string;
  items?: string[];
}

/** Content-free layout for 4 columns: ids and sizes only. */
export const DEMO_LAYOUT: LayoutItem[] = [
  { id: 'revenue', w: 1, h: 1 },
  { id: 'users', w: 1, h: 1 },
  { id: 'traffic', w: 2, h: 2 },
  { id: 'pinned', w: 1, h: 1, locked: true },
  { id: 'tasks', w: 1, h: 2 },
  { id: 'map', w: 2, h: 2 },
  { id: 'contact', w: 1, h: 2 },
  { id: 'notes', w: 2, h: 1 },
];

export const BLOCKS: Readonly<Record<string, BlockInfo>> = {
  revenue: { title: 'Revenue', kind: 'number', accent: '#2563eb', value: '$48.2k' },
  users: { title: 'Active users', kind: 'number', accent: '#0d9488', value: '1,284' },
  traffic: { title: 'Traffic', kind: 'chart', accent: '#7c3aed' },
  pinned: { title: 'Pinned', kind: 'note', accent: '#d97706', value: 'Locked in place' },
  tasks: {
    title: 'Tasks',
    kind: 'list',
    accent: '#059669',
    items: ['Review pull requests', 'Ship the release', 'Update the docs', 'Reply to feedback'],
  },
  map: { title: 'Drag by the handle', kind: 'map', accent: '#db2777' },
  contact: { title: 'Contact', kind: 'form', accent: '#0e7490' },
  notes: { title: 'Notes', kind: 'note', accent: '#64748b', value: 'Drag me, resize me, drop me anywhere.' },
};

/** Grid options every demo grid uses (hero, Vanilla tab, Angular and React apps). */
export const GRID_OPTIONS: Readonly<{ columns: number; rowHeight: number; gap: number }> = {
  columns: 4,
  rowHeight: 72,
  gap: 10,
};

/** Polyline points of the decorative chart block, in a `0 0 100 40` viewBox. */
export const CHART_POINTS = '0,32 12,26 24,29 36,18 48,22 60,12 72,16 84,6 100,10';

const FALLBACK_ACCENT = '#e2e8f0';

export function blockInfo(id: string): BlockInfo {
  return Object.hasOwn(BLOCKS, id) ? BLOCKS[id]! : { title: id, kind: 'note', accent: FALLBACK_ACCENT };
}

/** `new-1`, `new-2`, ... the first id not used in `layout`. */
export function nextBlockId(layout: LayoutItem[]): string {
  const used = new Set(layout.map((i) => i.id));
  let n = 1;
  while (used.has(`new-${n}`)) n++;
  return `new-${n}`;
}
