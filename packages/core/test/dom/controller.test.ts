// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
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
const col = (id: string) => el(id).style.getPropertyValue('--dash-col');
const row = (id: string) => el(id).style.getPropertyValue('--dash-row');

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
    expect(container.classList.contains('dash-grid')).toBe(true);
    expect(el('A').classList.contains('dash-item')).toBe(true);
    expect(container.style.display).toBe('grid');
    expect(container.style.getPropertyValue('--dash-columns')).toBe('4');
    expect(container.style.getPropertyValue('--dash-row-height')).toBe('80px');
    expect(container.style.getPropertyValue('--dash-gap')).toBe('8px');
    expect(container.querySelectorAll('.dash-marker').length).toBe(1);
    expect(container.querySelectorAll('.dash-resize-handle').length).toBe(4);
  });

  test('locked widgets get no resize handle', () => {
    setup();
    createGrid(container, { columns: 4, layout: L.map((i) => (i.id === 'A' ? { ...i, locked: true } : i)) });
    expect(el('A').querySelector('.dash-resize-handle')).toBeNull();
    expect(el('B').querySelector('.dash-resize-handle')).not.toBeNull();
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

  test('id attribute change on the same element keeps it managed', () => {
    setup(['A', 'B', 'C', 'D']);
    const g = createGrid(container, { columns: 4, layout: [...L, { id: 'Z', w: 1, h: 1 }] });
    const a = el('A');
    a.dataset.gridId = 'Z';
    g.refresh();
    expect(a.classList.contains('dash-item')).toBe(true);
    expect(a.style.getPropertyValue('--dash-col')).toBe('1 / span 1');
    expect(a.style.getPropertyValue('--dash-row')).toBe('3 / span 1');
  });

  test('duplicate ids: first wins, later hidden, refresh is stable; un-hidden on destroy', () => {
    setup(['A', 'B', 'C', 'D', 'A']);
    const g = createGrid(container, { columns: 4, layout: L });
    const [first, dup] = Array.from(container.querySelectorAll<HTMLElement>('[data-grid-id="A"]'));
    expect(first.hidden).toBe(false);
    expect(first.classList.contains('dash-item')).toBe(true);
    expect(dup.hidden).toBe(true);
    expect(dup.classList.contains('dash-item')).toBe(false);
    g.refresh();
    g.refresh();
    expect(first.hidden).toBe(false);
    expect(dup.hidden).toBe(true);
    g.destroy();
    expect(dup.hidden).toBe(false);
  });

  test('consumer-hidden elements are never un-hidden by the controller', () => {
    setup(['A', 'B', 'C', 'D', 'X']);
    el('X').hidden = true;
    const g = createGrid(container, { columns: 4, layout: L });
    g.setLayout([...L, { id: 'X', w: 1, h: 1 }]);
    expect(el('X').hidden).toBe(true);
    g.destroy();
    expect(el('X').hidden).toBe(true);
  });

  test('grid.css forces hidden widgets to display none', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/styles/grid.css', 'utf8');
    expect(css).toMatch(/\.dash-item\[hidden\][^{]*\{\s*display:\s*none\s*!important/);
  });

  test('setOptions columns change that alters the layout emits it', () => {
    setup();
    const onLayoutChange = vi.fn();
    const g = createGrid(container, { columns: 4, layout: L, onLayoutChange });
    g.setOptions({ columns: 2 });
    expect(onLayoutChange).toHaveBeenCalledTimes(1);
    const emitted = onLayoutChange.mock.calls[0][0] as LayoutItem[];
    expect(emitted.find((i) => i.id === 'B')!.w).toBe(2);
    g.setOptions({ columns: 3 }); // already fits: no change, no emit
    expect(onLayoutChange).toHaveBeenCalledTimes(1);
  });

  test('setOptions columns re-normalizes', () => {
    setup();
    const g = createGrid(container, { columns: 4, layout: L });
    g.setOptions({ columns: 2 });
    expect(g.getLayout().find((i) => i.id === 'B')!.w).toBe(2);
    expect(container.style.getPropertyValue('--dash-columns')).toBe('2');
  });

  test('narrow view below breakpoint', () => {
    setup(['A', 'B', 'C', 'D'], 500);
    const g = createGrid(container, { columns: 4, layout: L });
    g.refresh();
    expect(container.classList.contains('dash-grid--narrow')).toBe(true);
    for (const id of ['A', 'B', 'C', 'D']) expect(col(id)).toBe('1 / span 1');
    expect(row('D')).toBe('4 / span 1');
    expect(container.style.getPropertyValue('--dash-columns')).toBe('1');
  });

  test('refresh picks up newly added children', () => {
    setup(['A', 'B', 'C']);
    const g = createGrid(container, { columns: 4, layout: L });
    const d = document.createElement('div');
    d.dataset.gridId = 'D';
    container.appendChild(d);
    g.refresh();
    expect(d.classList.contains('dash-item')).toBe(true);
    expect(d.style.getPropertyValue('--dash-col')).toBe('3 / span 2');
  });

  test('destroy removes injected elements, classes and styles', () => {
    setup();
    const g = createGrid(container, { columns: 4, layout: L });
    g.destroy();
    expect(container.querySelector('.dash-marker')).toBeNull();
    expect(container.querySelector('.dash-resize-handle')).toBeNull();
    expect(container.classList.contains('dash-grid')).toBe(false);
    expect(el('A').classList.contains('dash-item')).toBe(false);
    expect(el('A').style.getPropertyValue('--dash-col')).toBe('');
    expect(container.style.display).toBe('');
    expect(container.style.getPropertyValue('--dash-columns')).toBe('');
  });

  test('after destroy every method is inert: nothing is re-applied and no listener fires', () => {
    setup();
    const onLayoutChange = vi.fn();
    const onReject = vi.fn();
    const g = createGrid(container, { columns: 4, layout: L, onLayoutChange, onReject });
    g.destroy();
    g.setLayout([...L, { id: 'E', w: 1, h: 1 }]);
    g.setOptions({ columns: 2, gap: 2 });
    expect(g.addItem({ id: 'F', w: 1, h: 1 })).toEqual({ ok: false, reason: 'invalid' });
    g.removeItem('A');
    g.refresh();
    g.destroy(); // idempotent
    expect(container.className).not.toMatch(/dash-/);
    expect(container.querySelector('[class*="dash-"]')).toBeNull();
    expect(container.querySelector('.dash-marker, .dash-resize-handle')).toBeNull();
    expect(container.style.cssText).not.toMatch(/--dash-/);
    for (const id of ['A', 'B', 'C', 'D']) expect(el(id).style.cssText).not.toMatch(/--dash-/);
    expect(g.getLayout()).toEqual(L);
    expect(g.getLayout()).not.toBe(g.getLayout());
    // a former widget does not start a drag
    const PE: typeof MouseEvent = typeof PointerEvent !== 'undefined' ? PointerEvent : MouseEvent;
    el('A').dispatchEvent(new PE('pointerdown', { clientX: 5, clientY: 5, bubbles: true, button: 0 }));
    document.dispatchEvent(new PE('pointermove', { clientX: 60, clientY: 60, bubbles: true }));
    document.dispatchEvent(new PE('pointerup', { clientX: 60, clientY: 60, bubbles: true }));
    expect(document.body.querySelector('.dash-ghost')).toBeNull();
    expect(onLayoutChange).not.toHaveBeenCalled();
    expect(onReject).not.toHaveBeenCalled();
  });
});

describe('ResizeObserver', () => {
  let roCallback: (() => void) | undefined;
  let frames: Map<number, FrameRequestCallback>;
  let nextFrame: number;
  const runFrames = () => {
    const pending = Array.from(frames.values());
    frames.clear();
    for (const cb of pending) cb(0);
  };

  beforeEach(() => {
    roCallback = undefined;
    frames = new Map();
    nextFrame = 1;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb: () => void) { roCallback = cb; }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      const id = nextFrame++;
      frames.set(id, cb);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id); });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  const setWidth = (w: number) =>
    Object.defineProperty(container, 'clientWidth', { configurable: true, value: w });

  test('callback renders on the next frame, not synchronously, and flips narrow', () => {
    setup();
    createGrid(container, { columns: 4, layout: L });
    expect(container.classList.contains('dash-grid--narrow')).toBe(false);
    setWidth(500);
    roCallback!();
    roCallback!(); // a second notification before the frame schedules nothing more
    expect(container.classList.contains('dash-grid--narrow')).toBe(false);
    expect(frames.size).toBe(1);
    runFrames();
    expect(container.classList.contains('dash-grid--narrow')).toBe(true);
    expect(col('D')).toBe('1 / span 1');
  });

  test('destroy cancels a pending frame', () => {
    setup();
    const g = createGrid(container, { columns: 4, layout: L });
    setWidth(500);
    roCallback!();
    expect(frames.size).toBe(1);
    g.destroy();
    expect(frames.size).toBe(0);
  });
});
