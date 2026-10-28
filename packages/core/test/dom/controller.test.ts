// @vitest-environment happy-dom
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createGrid } from '../../src/index.js';
import type { LayoutItem } from '../../src/index.js';

const L: LayoutItem[] = [
  { id: 'A', w: 1, h: 1 },
  { id: 'B', w: 3, h: 1 },
  { id: 'C', w: 2, h: 1 },
  { id: 'D', w: 2, h: 1 },
];

let container: HTMLElement;
const el = (id: string) => container.querySelector(`[data-grid-id="${id}"]`) as HTMLElement;
const col = (id: string) => el(id).style.getPropertyValue('--gm-col');
const row = (id: string) => el(id).style.getPropertyValue('--gm-row');

function setup(ids = ['A', 'B', 'C', 'D'], width = 1000) {
  container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { configurable: true, value: width });
  for (const id of ids) {
    const d = document.createElement('div');
    d.dataset.gridId = id;
    container.appendChild(d);
  }
  document.body.appendChild(container);
}
beforeEach(() => { document.body.innerHTML = ''; });

describe('createGrid', () => {
  test('positions widgets via custom properties and adds classes', () => {
    setup();
    createGrid(container, { columns: 4, layout: L });
    expect(col('A')).toBe('1 / span 1');
    expect(col('B')).toBe('2 / span 3');
    expect(row('C')).toBe('2 / span 1');
    expect(container.classList.contains('gm-grid')).toBe(true);
    expect(el('A').classList.contains('gm-item')).toBe(true);
    expect(container.style.display).toBe('grid');
    expect(container.style.getPropertyValue('--gm-columns')).toBe('4');
    expect(container.style.getPropertyValue('--gm-row-height')).toBe('80px');
    expect(container.style.getPropertyValue('--gm-gap')).toBe('8px');
    expect(container.querySelectorAll('.gm-marker').length).toBe(1);
    expect(container.querySelectorAll('.gm-resize-handle').length).toBe(4);
  });

  test('locked widgets get no resize handle', () => {
    setup();
    createGrid(container, { columns: 4, layout: L.map((i) => (i.id === 'A' ? { ...i, locked: true } : i)) });
    expect(el('A').querySelector('.gm-resize-handle')).toBeNull();
    expect(el('B').querySelector('.gm-resize-handle')).not.toBeNull();
  });

  test('setOptions without columns change does not emit', () => {
    setup();
    const onLayoutChange = vi.fn();
    const g = createGrid(container, { columns: 4, layout: L, onLayoutChange });
    g.setOptions({ dropMode: 'swap' });
    expect(onLayoutChange).not.toHaveBeenCalled();
  });

  test('addItem duplicate rejects without emitting; valid add emits 5 items', () => {
    setup(['A', 'B', 'C', 'D', 'E']);
    const onLayoutChange = vi.fn();
    const onReject = vi.fn();
    const g = createGrid(container, { columns: 4, layout: L, onLayoutChange, onReject });
    const r = g.addItem({ id: 'A', w: 1, h: 1 });
    expect(r).toEqual({ ok: false, reason: 'duplicate' });
    expect(onReject).toHaveBeenCalledWith('duplicate');
    expect(onLayoutChange).not.toHaveBeenCalled();
    expect(g.addItem({ id: 'E', w: 1, h: 1 }).ok).toBe(true);
    expect(onLayoutChange).toHaveBeenCalledTimes(1);
    const emitted = onLayoutChange.mock.calls[0][0] as LayoutItem[];
    expect(emitted).toHaveLength(5);
    expect(emitted).not.toBe(g.getLayout());
    expect(el('E').hidden).toBe(false);
  });

  test('removeItem emits without the item; unknown id does not emit', () => {
    setup();
    const onLayoutChange = vi.fn();
    const g = createGrid(container, { columns: 4, layout: L, onLayoutChange });
    g.removeItem('A');
    expect(onLayoutChange).toHaveBeenCalledTimes(1);
    expect((onLayoutChange.mock.calls[0][0] as LayoutItem[]).map((i) => i.id)).toEqual(['B', 'C', 'D']);
    g.removeItem('nope');
    expect(onLayoutChange).toHaveBeenCalledTimes(1);
  });

  test('layout entry without element is kept; element without entry is hidden then un-hidden', () => {
    setup(['A', 'B', 'C', 'D', 'X']);
    const g = createGrid(container, { columns: 4, layout: [...L, { id: 'E', w: 1, h: 1 }] });
    expect(g.getLayout().map((i) => i.id)).toContain('E');
    expect(el('X').hidden).toBe(true);
    g.setLayout([...L, { id: 'X', w: 1, h: 1 }]);
    expect(el('X').hidden).toBe(false);
    expect(col('X')).toBeTruthy();
  });

  test('getLayout returns a copy', () => {
    setup();
    const g = createGrid(container, { columns: 4, layout: L });
    g.getLayout().pop();
    expect(g.getLayout()).toHaveLength(4);
  });

  test('setOptions columns re-normalizes', () => {
    setup();
    const g = createGrid(container, { columns: 4, layout: L });
    g.setOptions({ columns: 2 });
    expect(g.getLayout().find((i) => i.id === 'B')!.w).toBe(2);
    expect(container.style.getPropertyValue('--gm-columns')).toBe('2');
  });

  test('narrow view below breakpoint', () => {
    setup(['A', 'B', 'C', 'D'], 500);
    const g = createGrid(container, { columns: 4, layout: L });
    g.refresh();
    expect(container.classList.contains('gm-grid--narrow')).toBe(true);
    for (const id of ['A', 'B', 'C', 'D']) expect(col(id)).toBe('1 / span 1');
    expect(row('D')).toBe('4 / span 1');
    expect(container.style.getPropertyValue('--gm-columns')).toBe('1');
  });

  test('refresh picks up newly added children', () => {
    setup(['A', 'B', 'C']);
    const g = createGrid(container, { columns: 4, layout: L });
    const d = document.createElement('div');
    d.dataset.gridId = 'D';
    container.appendChild(d);
    g.refresh();
    expect(d.classList.contains('gm-item')).toBe(true);
    expect(d.style.getPropertyValue('--gm-col')).toBe('3 / span 2');
  });

  test('destroy removes injected elements, classes and styles', () => {
    setup();
    const g = createGrid(container, { columns: 4, layout: L });
    g.destroy();
    expect(container.querySelector('.gm-marker')).toBeNull();
    expect(container.querySelector('.gm-resize-handle')).toBeNull();
    expect(container.classList.contains('gm-grid')).toBe(false);
    expect(el('A').classList.contains('gm-item')).toBe(false);
    expect(el('A').style.getPropertyValue('--gm-col')).toBe('');
    expect(container.style.display).toBe('');
    expect(container.style.getPropertyValue('--gm-columns')).toBe('');
  });
});
