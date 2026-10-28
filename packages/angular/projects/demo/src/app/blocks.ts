import type { LayoutItem } from '@grid-master/angular';

export type BlockKind = 'number' | 'chart' | 'list' | 'map' | 'form' | 'note';

export interface Block {
  title: string;
  kind: BlockKind;
  color: string;
}

/** 12 blocks on a 4-column grid; one locked. Content lives in BLOCKS only. */
export const DEFAULT_LAYOUT: LayoutItem[] = [
  { id: 'revenue', w: 1, h: 1 },
  { id: 'users', w: 1, h: 1 },
  { id: 'traffic', w: 2, h: 2 },
  { id: 'pinned', w: 1, h: 1, locked: true },
  { id: 'tasks', w: 1, h: 2 },
  { id: 'map', w: 2, h: 2 },
  { id: 'contact', w: 1, h: 2 },
  { id: 'orders', w: 2, h: 1 },
  { id: 'errors', w: 1, h: 1 },
  { id: 'notes', w: 1, h: 3 },
  { id: 'sales', w: 3, h: 2 },
  { id: 'banner', w: 4, h: 1 },
];

export const BLOCKS: Record<string, Block> = {
  revenue: { title: 'Revenue', kind: 'number', color: '#dbeafe' },
  users: { title: 'Active users', kind: 'number', color: '#dcfce7' },
  traffic: { title: 'Traffic', kind: 'chart', color: '#fef9c3' },
  pinned: { title: 'Pinned (locked)', kind: 'note', color: '#e5e7eb' },
  tasks: { title: 'Tasks', kind: 'list', color: '#fce7f3' },
  map: { title: 'Map (drag by grip)', kind: 'map', color: '#e0f2fe' },
  contact: { title: 'Contact', kind: 'form', color: '#ede9fe' },
  orders: { title: 'Orders', kind: 'list', color: '#ffedd5' },
  errors: { title: 'Errors', kind: 'number', color: '#fee2e2' },
  notes: { title: 'Notes', kind: 'note', color: '#ecfccb' },
  sales: { title: 'Sales by region', kind: 'chart', color: '#cffafe' },
  banner: { title: 'Announcements', kind: 'note', color: '#fae8ff' },
};
