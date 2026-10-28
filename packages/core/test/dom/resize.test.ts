// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createGrid } from '../../src/index.js';
import type { DropMode, LayoutItem } from '../../src/index.js';

const L: LayoutItem[] = [
  { id: 'A', w: 1, h: 1 },
  { id: 'B', w: 3, h: 1 },
  { id: 'C', w: 2, h: 1 },
  { id: 'D', w: 2, h: 1 },
];

type Box = { left: number; top: number; right: number; bottom: number };
// 424px container, 4 columns, 8px gap -> colWidth 100; rowHeight 80
const WIDE: Record<string, Box> = {
  A: { left: 0, right: 100, top: 0, bottom: 80 },
  B: { left: 108, right: 424, top: 0, bottom: 80 },
  C: { left: 0, right: 208, top: 88, bottom: 168 },
  D: { left: 216, right: 424, top: 88, bottom: 168 },
};
const NARROW: Record<string, Box> = {
  A: { left: 0, right: 400, top: 0, bottom: 80 },
  B: { left: 0, right: 400, top: 88, bottom: 168 },
  C: { left: 0, right: 400, top: 176, bottom: 256 },
  D: { left: 0, right: 400, top: 264, bottom: 344 },
};

const PE: typeof MouseEvent = typeof PointerEvent !== 'undefined' ? PointerEvent : MouseEvent;

let container: HTMLElement;
const el = (id: string) => container.querySelector(`[data-grid-id="${id}"]`) as HTMLElement;
const handle = (id: string) => el(id).querySelector(':scope > .gm-resize-handle') as HTMLElement | null;
const col = (id: string) => el(id).style.getPropertyValue('--gm-col');
const row = (id: string) => el(id).style.getPropertyValue('--gm-row');
const preview = () => document.querySelector('.gm-resize-preview') as HTMLElement | null;
const ghost = () => document.body.querySelector('.gm-ghost');
const sizes = (layout: LayoutItem[]) => layout.map((i) => `${i.id}${i.w}x${i.h}`);
const snapshot = () => ['A', 'B', 'C', 'D'].map((id) => [col(id), row(id)]);

function rect(b: Box): DOMRect {
  return { ...b, x: b.left, y: b.top, width: b.right - b.left, height: b.bottom - b.top, toJSON() {} } as DOMRect;
}

// clientWidth is the track width source (424 = 4·100 + 3·8); breakpoint 400 keeps it wide
function setup(boxes = WIDE, width = 424) {
  container = document.createElement('div');
  Object.defineProperty(container, 'clientWidth', { configurable: true, value: width });
  container.getBoundingClientRect = () => rect({ left: 0, top: 0, right: 424, bottom: 400 });
  for (const id of Object.keys(boxes)) {
    const d = document.createElement('div');
    d.dataset.gridId = id;
    const p = document.createElement('p');
    p.className = 'content';
    p.textContent = id;
    d.appendChild(p);
    d.getBoundingClientRect = () => rect(boxes[id]!);
    container.appendChild(d);
  }
  document.body.appendChild(container);
}

function grid(extra: { layout?: LayoutItem[]; dropMode?: DropMode; maxRows?: number } = {}) {
  const onLayoutChange = vi.fn();
  const g = createGrid(container, {
    columns: 4,
    layout: extra.layout ?? L,
    dropMode: extra.dropMode,
    maxRows: extra.maxRows,
    breakpoint: 400,
    onLayoutChange,
  });
  return { g, onLayoutChange };
}

const fire = (target: EventTarget, type: string, x: number, y: number, init: PointerEventInit = {}) =>
  target.dispatchEvent(new PE(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, ...init }));
const down = (target: EventTarget, x: number, y: number, init?: PointerEventInit) => fire(target, 'pointerdown', x, y, init);
const move = (x: number, y: number, init?: PointerEventInit) => fire(document, 'pointermove', x, y, init);
const up = (x: number, y: number, init?: PointerEventInit) => fire(document, 'pointerup', x, y, init);

// A's handle sits at its bottom-right corner
const HX = 98;
const HY = 78;

beforeEach(() => {
  document.body.innerHTML = '';
  vi.stubGlobal('requestAnimationFrame', undefined);
  vi.stubGlobal('cancelAnimationFrame', undefined);
});
afterEach(async () => {
  vi.unstubAllGlobals();
  // let post-gesture click suppressors expire so they cannot leak into the next test
  await new Promise((r) => setTimeout(r, 0));
});

describe('resize', () => {
  test('insert mode, A handle dx +108: preview at 2 columns, nothing else moves, emits A w:2', () => {
    setup();
    const { onLayoutChange } = grid();
    const before = snapshot();
    down(handle('A')!, HX, HY);
    move(HX + 108, HY);
    const p = preview()!;
    expect(p).not.toBeNull();
    expect(p.parentElement).toBe(container);
    expect(p.hidden).toBe(false);
    expect(p.classList.contains('gm-resize-preview--blocked')).toBe(false);
    expect([p.style.left, p.style.top, p.style.width, p.style.height]).toEqual(['0px', '0px', '208px', '80px']);
    expect(snapshot()).toEqual(before);
    expect(onLayoutChange).not.toHaveBeenCalled();

    up(HX + 108, HY);
    expect(onLayoutChange).toHaveBeenCalledTimes(1);
    expect(sizes(onLayoutChange.mock.calls[0][0])).toEqual(['A2x1', 'B3x1', 'C2x1', 'D2x1']);
    expect(preview()).toBeNull();
    expect(col('A')).toBe('1 / span 2');
  });

  test('block mode, same resize: preview blocked, nothing emitted', () => {
    setup();
    const { g, onLayoutChange } = grid({ dropMode: 'block' });
    down(handle('A')!, HX, HY);
    move(HX + 108, HY);
    expect(preview()!.classList.contains('gm-resize-preview--blocked')).toBe(true);
    up(HX + 108, HY);
    expect(onLayoutChange).not.toHaveBeenCalled();
    expect(preview()).toBeNull();
    expect(sizes(g.getLayout())).toEqual(['A1x1', 'B3x1', 'C2x1', 'D2x1']);
  });

  test('shrink mode: emits A w:2 and B w:2', () => {
    setup();
    const { onLayoutChange } = grid({ dropMode: 'shrink' });
    down(handle('A')!, HX, HY);
    move(HX + 108, HY);
    expect(preview()!.classList.contains('gm-resize-preview--blocked')).toBe(false);
    up(HX + 108, HY);
    expect(onLayoutChange).toHaveBeenCalledTimes(1);
    expect(sizes(onLayoutChange.mock.calls[0][0])).toEqual(['A2x1', 'B2x1', 'C2x1', 'D2x1']);
  });

  test('block mode, dy +88: emits A h:2', () => {
    setup();
    const { onLayoutChange } = grid({ dropMode: 'block' });
    down(handle('A')!, HX, HY);
    move(HX, HY + 88);
    const p = preview()!;
    expect(p.classList.contains('gm-resize-preview--blocked')).toBe(false);
    expect([p.style.width, p.style.height]).toEqual(['100px', '168px']);
    up(HX, HY + 88);
    expect(onLayoutChange).toHaveBeenCalledTimes(1);
    expect(sizes(onLayoutChange.mock.calls[0][0])).toEqual(['A1x2', 'B3x1', 'C2x1', 'D2x1']);
  });

  test('a locked widget has no resize handle', () => {
    setup();
    grid({ layout: [{ id: 'A', w: 1, h: 1, locked: true }, ...L.slice(1)] });
    expect(handle('A')).toBeNull();
    expect(handle('B')).not.toBeNull();
  });

  test('pointercancel: no emit, no preview', () => {
    setup();
    const { onLayoutChange } = grid();
    down(handle('A')!, HX, HY);
    move(HX + 108, HY);
    fire(document, 'pointercancel', HX + 108, HY);
    expect(preview()).toBeNull();
    up(HX + 108, HY);
    expect(onLayoutChange).not.toHaveBeenCalled();
  });

  test('Escape cancels', () => {
    setup();
    const { onLayoutChange } = grid();
    down(handle('A')!, HX, HY);
    move(HX + 108, HY);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(preview()).toBeNull();
    up(HX + 108, HY);
    expect(onLayoutChange).not.toHaveBeenCalled();
  });

  test('the handle has touch-action: none', () => {
    setup();
    grid();
    expect(handle('A')!.style.touchAction).toBe('none');
  });

  test('narrow view refuses to resize', () => {
    setup(NARROW, 300);
    const { onLayoutChange } = grid();
    expect(container.classList.contains('gm-grid--narrow')).toBe(true);
    const h = handle('A')!; // present in the DOM, hidden by CSS
    down(h, 398, 78);
    move(398 + 108, 78 + 88);
    expect(preview()).toBeNull();
    up(398 + 108, 78 + 88);
    expect(onLayoutChange).not.toHaveBeenCalled();
  });

  test('setLayout mid-resize cancels: preview gone, a later pointerup does not emit', () => {
    setup();
    const { g, onLayoutChange } = grid();
    down(handle('A')!, HX, HY);
    move(HX + 108, HY);
    g.setLayout(L.map((i) => (i.id === 'D' ? { ...i, h: 2 } : i)));
    expect(preview()).toBeNull();
    up(HX + 108, HY);
    expect(onLayoutChange).not.toHaveBeenCalled();
  });

  test('setOptions mid-resize cancels', () => {
    setup();
    const { g, onLayoutChange } = grid();
    down(handle('A')!, HX, HY);
    move(HX + 108, HY);
    g.setOptions({ gap: 4 });
    expect(preview()).toBeNull();
    up(HX + 108, HY);
    expect(onLayoutChange).not.toHaveBeenCalled();
  });

  test('destroy mid-resize removes the preview and every listener', () => {
    setup();
    const { g, onLayoutChange } = grid();
    down(handle('A')!, HX, HY);
    move(HX + 108, HY);
    g.destroy();
    expect(preview()).toBeNull();
    expect(container.classList.contains('gm-grid--resizing')).toBe(false);
    expect(document.body.style.userSelect).toBe('');
    up(HX + 108, HY);
    expect(onLayoutChange).not.toHaveBeenCalled();
    // no click blocker left behind
    const btn = document.createElement('button');
    const clicked = vi.fn();
    btn.addEventListener('click', clicked);
    document.body.appendChild(btn);
    btn.click();
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  test('removing the resized widget mid-resize cancels', () => {
    setup();
    const { g, onLayoutChange } = grid();
    down(handle('A')!, HX, HY);
    move(HX + 108, HY);
    el('A').remove();
    g.refresh();
    expect(preview()).toBeNull();
    up(HX + 108, HY);
    expect(onLayoutChange).not.toHaveBeenCalled();
  });

  test('a resize cannot start while a drag is active', () => {
    setup();
    const { onLayoutChange } = grid();
    down(el('C'), 100, 128, { pointerId: 1 });
    move(150, 40, { pointerId: 1 });
    expect(ghost()).not.toBeNull();
    down(handle('A')!, HX, HY, { pointerId: 2 });
    move(HX + 108, HY, { pointerId: 2 });
    expect(preview()).toBeNull();
    up(HX + 108, HY, { pointerId: 2 });
    expect(onLayoutChange).not.toHaveBeenCalled();
    up(150, 40, { pointerId: 1 });
    expect(onLayoutChange).toHaveBeenCalledTimes(1); // the drag still completes (A,C,B,D)
    expect(sizes(onLayoutChange.mock.calls[0][0])).toEqual(['A1x1', 'C2x1', 'B3x1', 'D2x1']);
  });

  test('a drag cannot start while a resize is active', () => {
    setup();
    const { onLayoutChange } = grid();
    down(handle('A')!, HX, HY, { pointerId: 1 });
    move(HX + 108, HY, { pointerId: 1 });
    down(el('C'), 100, 128, { pointerId: 2 });
    move(150, 40, { pointerId: 2 });
    expect(ghost()).toBeNull();
    up(150, 40, { pointerId: 2 });
    expect(onLayoutChange).not.toHaveBeenCalled();
    expect(preview()).not.toBeNull();
    up(HX + 108, HY, { pointerId: 1 });
    expect(onLayoutChange).toHaveBeenCalledTimes(1);
    expect(sizes(onLayoutChange.mock.calls[0][0])).toEqual(['A2x1', 'B3x1', 'C2x1', 'D2x1']);
  });

  test('candidate size is clamped: never below 1 column / minW, never past the column count', () => {
    setup();
    const { onLayoutChange } = grid({ layout: [{ id: 'A', w: 1, h: 1, minH: 1 }, ...L.slice(1)] });
    down(handle('A')!, HX, HY);
    move(HX - 300, HY - 300);
    expect([preview()!.style.width, preview()!.style.height]).toEqual(['100px', '80px']);
    move(HX + 1000, HY);
    expect(preview()!.style.width).toBe('424px');
    up(HX + 1000, HY);
    expect(sizes(onLayoutChange.mock.calls[0][0])[0]).toBe('A4x1');
  });

  test('resizing back to the original size does not emit', () => {
    setup();
    const { onLayoutChange } = grid();
    down(handle('A')!, HX, HY);
    move(HX + 108, HY);
    move(HX + 20, HY + 10);
    up(HX + 20, HY + 10);
    expect(onLayoutChange).not.toHaveBeenCalled();
    expect(preview()).toBeNull();
  });

  test('text selection is suppressed during an active resize', () => {
    setup();
    grid();
    const select = () => {
      const e = new Event('selectstart', { bubbles: true, cancelable: true });
      document.dispatchEvent(e);
      return e.defaultPrevented;
    };
    down(handle('A')!, HX, HY);
    expect(container.classList.contains('gm-grid--resizing')).toBe(true);
    expect(document.body.style.userSelect).toBe('none');
    expect(select()).toBe(true);
    up(HX, HY);
    expect(container.classList.contains('gm-grid--resizing')).toBe(false);
    expect(document.body.style.userSelect).toBe('');
    expect(select()).toBe(false);
  });

  test('the click after a real resize is swallowed once; a tap on the handle is not', async () => {
    setup();
    grid();
    const clicked = vi.fn();
    el('A').addEventListener('click', clicked);
    down(handle('A')!, HX, HY);
    move(HX + 108, HY);
    up(HX + 108, HY);
    handle('A')!.click();
    expect(clicked).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 0));
    handle('A')!.click();
    expect(clicked).toHaveBeenCalledTimes(1);

    down(handle('A')!, HX, HY);
    up(HX, HY);
    handle('A')!.click();
    expect(clicked).toHaveBeenCalledTimes(2);
  });

  test('swap mode behaves like block: widening A into B is blocked, nothing emitted', () => {
    setup();
    const { onLayoutChange } = grid({ dropMode: 'swap' });
    down(handle('A')!, HX, HY);
    move(HX + 108, HY);
    expect(preview()!.classList.contains('gm-resize-preview--blocked')).toBe(true);
    up(HX + 108, HY);
    expect(onLayoutChange).not.toHaveBeenCalled();
  });

  test('maxRows 2 + block: growing A to h3 is blocked, nothing emitted', () => {
    setup();
    const { onLayoutChange } = grid({ dropMode: 'block', maxRows: 2 });
    down(handle('A')!, HX, HY);
    move(HX, HY + 176);
    const p = preview()!;
    expect(p.style.height).toBe('256px');
    expect(p.classList.contains('gm-resize-preview--blocked')).toBe(true);
    up(HX, HY + 176);
    expect(onLayoutChange).not.toHaveBeenCalled();
  });

  test('horizontal container padding is excluded from the column width', () => {
    const PADDED: Record<string, Box> = Object.fromEntries(
      Object.entries(WIDE).map(([id, b]) => [id, { ...b, left: b.left + 10, right: b.right + 10 }]),
    );
    setup(PADDED, 444);
    container.style.padding = '0 10px';
    container.getBoundingClientRect = () => rect({ left: 0, top: 0, right: 444, bottom: 400 });
    const { onLayoutChange } = grid();
    down(handle('A')!, HX + 10, HY);
    move(HX + 10 + 108, HY);
    const p = preview()!;
    // colWidth (444 − 20 − 3·8) / 4 = 100: preview anchored at A's left in the padding box
    expect([p.style.left, p.style.width]).toEqual(['10px', '208px']);
    up(HX + 10 + 108, HY);
    expect(sizes(onLayoutChange.mock.calls[0][0])[0]).toBe('A2x1');
  });

  test('two grids holding gestures concurrently: ending one keeps suppression for the other', () => {
    setup();
    const first = container;
    grid();
    setup();
    const second = container;
    const g2 = grid();
    const prevented = (type: string) => {
      const e = new Event(type, { bubbles: true, cancelable: true });
      document.dispatchEvent(e);
      return e.defaultPrevented;
    };
    document.body.style.userSelect = 'text';
    const h1 = first.querySelector('[data-grid-id="A"] > .gm-resize-handle') as HTMLElement;
    const h2 = second.querySelector('[data-grid-id="A"] > .gm-resize-handle') as HTMLElement;
    // grid 1: drag C (pointer 1); grid 2: resize A (pointer 2)
    down(first.querySelector('[data-grid-id="C"]')!, 100, 128, { pointerId: 1 });
    move(150, 40, { pointerId: 1 });
    expect(ghost()).not.toBeNull();
    down(h2, HX, HY, { pointerId: 2 });
    expect(second.classList.contains('gm-grid--resizing')).toBe(true);
    // the drag in grid 1 ends; the resize in grid 2 is still held
    up(150, 40, { pointerId: 1 });
    expect(first.classList.contains('gm-grid--dragging')).toBe(false);
    expect(document.body.style.userSelect).toBe('none');
    expect(prevented('selectstart')).toBe(true);
    expect(prevented('touchmove')).toBe(true);
    up(HX, HY, { pointerId: 2 });
    expect(document.body.style.userSelect).toBe('text');
    expect(prevented('selectstart')).toBe(false);
    expect(prevented('touchmove')).toBe(false);
    // and the other way round: grid 1 resize ends first
    down(h1, HX, HY, { pointerId: 3 });
    down(h2, HX, HY, { pointerId: 4 });
    up(HX, HY, { pointerId: 3 });
    expect(document.body.style.userSelect).toBe('none');
    expect(prevented('selectstart')).toBe(true);
    g2.g.destroy();
    expect(document.body.style.userSelect).toBe('text');
    expect(prevented('selectstart')).toBe(false);
    document.body.style.userSelect = '';
  });

  test('grid.css: handle touch-action none, preview and resizing selection rules exist', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/styles/grid.css', 'utf8');
    expect(css).toMatch(/\.gm-resize-handle\s*\{[^}]*touch-action:\s*none/);
    expect(css).toContain('.gm-resize-preview--blocked');
    expect(css).toMatch(/\.gm-grid--resizing \*/);
  });
});
