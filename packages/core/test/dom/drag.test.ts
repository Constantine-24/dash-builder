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

/** A layout different from L (D taller): setLayout with it really changes the layout and cancels. */
const changed: LayoutItem[] = L.map((i) => (i.id === 'D' ? { ...i, h: 2 } : i));

type Box = { left: number; top: number; right: number; bottom: number };
// Task 8 geometry (4 columns, 8px gap)
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
const col = (id: string) => el(id).style.getPropertyValue('--dash-col');
const row = (id: string) => el(id).style.getPropertyValue('--dash-row');
const marker = () => container.querySelector('.dash-marker') as HTMLElement;
const ghost = () => document.body.querySelector('.dash-ghost');
const order = (layout: LayoutItem[]) => layout.map((i) => i.id);

function rect(b: Box): DOMRect {
  return { ...b, x: b.left, y: b.top, width: b.right - b.left, height: b.bottom - b.top, toJSON() {} } as DOMRect;
}

function setup(boxes = WIDE, width = 1000, handleOn?: string) {
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
    if (id === handleOn) {
      const h = document.createElement('span');
      h.setAttribute('data-grid-handle', '');
      d.appendChild(h);
    }
    d.getBoundingClientRect = () => rect(boxes[id]!);
    container.appendChild(d);
  }
  document.body.appendChild(container);
}

function grid(extra: { layout?: LayoutItem[]; dropMode?: DropMode } = {}) {
  const onLayoutChange = vi.fn();
  const g = createGrid(container, { columns: 4, layout: extra.layout ?? L, dropMode: extra.dropMode, onLayoutChange });
  return { g, onLayoutChange };
}

const fire = (target: EventTarget, type: string, x: number, y: number, init: PointerEventInit = {}) =>
  target.dispatchEvent(new PE(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0, ...init }));
const touch = { pointerType: 'touch' } as PointerEventInit;
const down = (target: EventTarget, x: number, y: number, init?: PointerEventInit) => fire(target, 'pointerdown', x, y, init);
const move = (x: number, y: number) => fire(document, 'pointermove', x, y);
const up = (x: number, y: number) => fire(document, 'pointerup', x, y);

const snapshot = (ids: string[]) => ids.map((id) => [col(id), row(id)]);

beforeEach(() => {
  document.body.innerHTML = '';
  vi.stubGlobal('requestAnimationFrame', undefined);
  vi.stubGlobal('cancelAnimationFrame', undefined);
});
afterEach(async () => {
  vi.unstubAllGlobals();
  // let post-drag click suppressors expire so they cannot leak into the next test
  await new Promise((r) => setTimeout(r, 0));
});

describe('drag', () => {
  test('drag C onto the left half of B: ghost, placeholder, marker, others untouched, emits A,C,B,D', () => {
    setup();
    const { onLayoutChange } = grid();
    const before = snapshot(['A', 'B', 'D']);
    down(el('C'), 100, 128);
    move(150, 40);
    const g = ghost() as HTMLElement;
    expect(g).not.toBeNull();
    expect(g.classList.contains('dash-ghost')).toBe(true);
    expect(g.style.position).toBe('fixed');
    expect(g.style.pointerEvents).toBe('none');
    expect(g.style.width).toBe('208px');
    expect(g.style.height).toBe('80px');
    // keeps the grab offset (100, 40) inside C
    expect(g.style.left).toBe('50px');
    expect(g.style.top).toBe('0px');
    expect(g.hasAttribute('data-grid-id')).toBe(false);
    expect(el('C').classList.contains('dash-item--placeholder')).toBe(true);
    expect(marker().hidden).toBe(false);
    expect(marker().classList.contains('dash-marker--blocked')).toBe(false);
    expect(snapshot(['A', 'B', 'D'])).toEqual(before);
    expect(onLayoutChange).not.toHaveBeenCalled();

    up(150, 40);
    expect(onLayoutChange).toHaveBeenCalledTimes(1);
    expect(order(onLayoutChange.mock.calls[0][0])).toEqual(['A', 'C', 'B', 'D']);
    expect(ghost()).toBeNull();
    expect(el('C').classList.contains('dash-item--placeholder')).toBe(false);
    expect(marker().hidden).toBe(true);
  });

  test('shrink mode: dropping D on the right half of B squeezes into B\'s row (after is kept)', () => {
    setup();
    const { onLayoutChange } = grid({ dropMode: 'shrink' });
    down(el('D'), 300, 128);
    move(380, 40);
    up(380, 40);
    expect(onLayoutChange).toHaveBeenCalledTimes(1);
    expect(onLayoutChange.mock.calls[0][0].map((i: LayoutItem) => [i.id, i.w])).toEqual([['A', 1], ['B', 1], ['D', 2], ['C', 2]]);
  });

  test('block mode, same drag: marker blocked, pointerup does not emit', () => {
    setup();
    const { onLayoutChange } = grid({ dropMode: 'block' });
    down(el('C'), 100, 128);
    move(150, 40);
    expect(marker().hidden).toBe(false);
    expect(marker().classList.contains('dash-marker--blocked')).toBe(true);
    up(150, 40);
    expect(onLayoutChange).not.toHaveBeenCalled();
    expect(ghost()).toBeNull();
    expect(marker().classList.contains('dash-marker--blocked')).toBe(false);
  });

  test('pointerdown/pointerup without movement: no ghost, no emit', () => {
    setup();
    const { onLayoutChange } = grid();
    down(el('C'), 100, 128);
    move(102, 129); // below the 4px threshold
    expect(ghost()).toBeNull();
    up(102, 129);
    expect(ghost()).toBeNull();
    expect(el('C').classList.contains('dash-item--placeholder')).toBe(false);
    expect(onLayoutChange).not.toHaveBeenCalled();
  });

  test('dropping C back onto its own spot (left half of D) does not emit', () => {
    setup();
    const { onLayoutChange } = grid();
    down(el('C'), 100, 128);
    move(250, 128);
    up(250, 128);
    expect(onLayoutChange).not.toHaveBeenCalled();
    expect(ghost()).toBeNull();
  });

  test('pointercancel mid-drag: no emit, no ghost', () => {
    setup();
    const { onLayoutChange } = grid();
    down(el('C'), 100, 128);
    move(150, 40);
    fire(document, 'pointercancel', 150, 40);
    expect(ghost()).toBeNull();
    expect(marker().hidden).toBe(true);
    expect(el('C').classList.contains('dash-item--placeholder')).toBe(false);
    up(150, 40);
    expect(onLayoutChange).not.toHaveBeenCalled();
  });

  test('Escape mid-drag cancels', () => {
    setup();
    const { onLayoutChange } = grid();
    down(el('C'), 100, 128);
    move(150, 40);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(ghost()).toBeNull();
    up(150, 40);
    expect(onLayoutChange).not.toHaveBeenCalled();
  });

  test('setLayout mid-drag: no ghost and a later pointerup does not emit', () => {
    setup();
    const { g, onLayoutChange } = grid();
    down(el('C'), 100, 128);
    move(150, 40);
    g.setLayout(changed);
    expect(ghost()).toBeNull();
    expect(el('C').classList.contains('dash-item--placeholder')).toBe(false);
    expect(marker().hidden).toBe(true);
    up(150, 40);
    expect(onLayoutChange).not.toHaveBeenCalled();
  });

  test('setOptions mid-drag cancels without emitting', () => {
    setup();
    const { g, onLayoutChange } = grid();
    down(el('C'), 100, 128);
    move(150, 40);
    g.setOptions({ gap: 4 });
    expect(ghost()).toBeNull();
    up(150, 40);
    expect(onLayoutChange).not.toHaveBeenCalled();
  });

  test('setLayout with an equal layout mid-drag is a no-op: the drag continues and emits', () => {
    setup();
    const { g, onLayoutChange } = grid();
    down(el('C'), 100, 128);
    move(150, 40);
    g.setLayout(structuredClone(L));
    expect(ghost()).not.toBeNull();
    up(150, 40);
    expect(onLayoutChange).toHaveBeenCalledTimes(1);
    expect(order(onLayoutChange.mock.calls[0][0])).toEqual(['A', 'C', 'B', 'D']);
  });

  test('setOptions with only a new callback mid-drag does not cancel; the drop emits via the new callback', () => {
    setup();
    const { g, onLayoutChange } = grid();
    down(el('C'), 100, 128);
    move(150, 40);
    const next = vi.fn();
    g.setOptions({ onLayoutChange: next });
    expect(ghost()).not.toBeNull();
    up(150, 40);
    expect(onLayoutChange).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(order(next.mock.calls[0][0])).toEqual(['A', 'C', 'B', 'D']);
  });

  test('setOptions with an unchanged dropMode mid-drag does not cancel; a changed one does', () => {
    setup();
    const { g, onLayoutChange } = grid();
    down(el('C'), 100, 128);
    move(150, 40);
    g.setOptions({ dropMode: 'insert' }); // the default: same effective value
    expect(ghost()).not.toBeNull();
    g.setOptions({ dropMode: 'block' });
    expect(ghost()).toBeNull();
    up(150, 40);
    expect(onLayoutChange).not.toHaveBeenCalled();
  });

  test('destroy mid-drag cancels and cleans up', () => {
    setup();
    const { g, onLayoutChange } = grid();
    down(el('C'), 100, 128);
    move(150, 40);
    g.destroy();
    expect(ghost()).toBeNull();
    expect(el('C').classList.contains('dash-item--placeholder')).toBe(false);
    up(150, 40);
    expect(onLayoutChange).not.toHaveBeenCalled();
  });

  test('a locked widget does not start a drag', () => {
    setup();
    const { onLayoutChange } = grid({ layout: L.map((i) => (i.id === 'A' ? { ...i, locked: true } : i)) });
    down(el('A'), 50, 40);
    move(300, 128);
    expect(ghost()).toBeNull();
    expect(el('A').classList.contains('dash-item--placeholder')).toBe(false);
    up(300, 128);
    expect(onLayoutChange).not.toHaveBeenCalled();
  });

  test('insert mode: dragging D before A, past locked B, keeps B at index 1 and emits D,B,A,C', () => {
    setup();
    const { onLayoutChange } = grid({ layout: L.map((i) => (i.id === 'B' ? { ...i, locked: true } : i)) });
    down(el('D'), 300, 128);
    move(30, 40);
    expect(marker().classList.contains('dash-marker--blocked')).toBe(false);
    up(30, 40);
    expect(onLayoutChange).toHaveBeenCalledTimes(1);
    expect(order(onLayoutChange.mock.calls[0][0])).toEqual(['D', 'B', 'A', 'C']);
  });

  test('insert mode: next to a locked widget the marker shows the landing spot, not the pointer spot', () => {
    setup();
    const { onLayoutChange } = grid({ layout: L.map((i) => (i.id === 'B' ? { ...i, locked: true } : i)) });
    down(el('D'), 300, 128);
    move(150, 40); // left half of B: "before B", but pinning lands D after B
    expect(marker().hidden).toBe(false);
    expect(marker().style.left).toBe('422px'); // B's right edge minus half the line
    expect(marker().style.top).toBe('0px');
    up(150, 40);
    expect(order(onLayoutChange.mock.calls[0][0])).toEqual(['A', 'B', 'D', 'C']);
  });

  test('a form control inside a handle-less widget does not start a drag', () => {
    setup();
    const { onLayoutChange } = grid();
    const button = document.createElement('button');
    el('B').appendChild(button);
    down(button, 200, 40);
    move(220, 40);
    expect(ghost()).toBeNull();
    up(220, 40);
    expect(onLayoutChange).not.toHaveBeenCalled();
  });

  test('data-grid-no-drag opts an element out of starting a drag', () => {
    setup();
    grid();
    const span = document.createElement('span');
    span.setAttribute('data-grid-no-drag', '');
    el('B').appendChild(span);
    down(span, 200, 40);
    move(220, 40);
    expect(ghost()).toBeNull();
    up(220, 40);
  });

  /** Replace widget `id` with a `<tag>` root carrying the same id, children and geometry. */
  function retag(id: string, tag: string, attrs: Record<string, string> = {}): HTMLElement {
    const old = el(id);
    const next = document.createElement(tag);
    next.dataset.gridId = id;
    for (const [k, v] of Object.entries(attrs)) next.setAttribute(k, v);
    next.append(...Array.from(old.childNodes));
    next.getBoundingClientRect = old.getBoundingClientRect;
    old.replaceWith(next);
    return next;
  }

  test('a widget whose root is an <a href> still drags', () => {
    setup();
    retag('B', 'a', { href: '#b' });
    const { onLayoutChange } = grid();
    down(el('B').querySelector('.content')!, 200, 40);
    move(30, 40);
    expect(ghost()).not.toBeNull();
    up(30, 40);
    expect(order(onLayoutChange.mock.calls[0][0])).toEqual(['B', 'A', 'C', 'D']);
  });

  test('a widget whose root is a <label> still drags', () => {
    setup();
    retag('B', 'label');
    const { onLayoutChange } = grid();
    down(el('B'), 200, 40);
    move(30, 40);
    expect(ghost()).not.toBeNull();
    up(30, 40);
    expect(onLayoutChange).toHaveBeenCalledTimes(1);
  });

  test('data-grid-no-drag on the widget root opts the whole widget out', () => {
    setup();
    el('B').setAttribute('data-grid-no-drag', '');
    const { onLayoutChange } = grid();
    down(el('B').querySelector('.content')!, 200, 40);
    move(30, 40);
    expect(ghost()).toBeNull();
    up(30, 40);
    expect(onLayoutChange).not.toHaveBeenCalled();
  });

  test('a form control inside a widget whose root is an <a href> still blocks the drag', () => {
    setup();
    retag('B', 'a', { href: '#b' });
    const { onLayoutChange } = grid();
    const input = document.createElement('input');
    el('B').appendChild(input);
    down(input, 200, 40);
    move(30, 40);
    expect(ghost()).toBeNull();
    up(30, 40);
    expect(onLayoutChange).not.toHaveBeenCalled();
  });

  test('a [data-grid-handle] that is a <button> still starts the drag', () => {
    setup();
    const handle = document.createElement('button');
    handle.setAttribute('data-grid-handle', '');
    el('B').appendChild(handle);
    const { onLayoutChange } = grid();
    down(handle, 200, 40);
    move(30, 40);
    expect(ghost()).not.toBeNull();
    up(30, 40);
    expect(order(onLayoutChange.mock.calls[0][0])).toEqual(['B', 'A', 'C', 'D']);
  });

  test('with [data-grid-handle], only the handle starts a drag', () => {
    setup(WIDE, 1000, 'B');
    const { onLayoutChange } = grid();
    const handle = el('B').querySelector('[data-grid-handle]') as HTMLElement;
    expect(handle.style.touchAction).toBe('none');

    down(el('B').querySelector('.content')!, 200, 40);
    move(30, 128);
    expect(ghost()).toBeNull();
    up(30, 128);
    expect(onLayoutChange).not.toHaveBeenCalled();

    down(handle, 200, 40);
    move(30, 40); // left half of A -> before A
    expect(ghost()).not.toBeNull();
    up(30, 40);
    expect(order(onLayoutChange.mock.calls[0][0])).toEqual(['B', 'A', 'C', 'D']);
  });

  test('pointerdown on the resize handle does not start a drag', () => {
    // consistent track width for the resize this starts: clientWidth 424, breakpoint below it
    setup(WIDE, 424);
    const onLayoutChange = vi.fn();
    createGrid(container, { columns: 4, layout: L, breakpoint: 400, onLayoutChange });
    const rh = el('C').querySelector('.dash-resize-handle') as HTMLElement;
    expect(rh).not.toBeNull();
    down(rh, 200, 160);
    move(150, 40);
    // the pointerdown starts a resize instead
    expect(document.querySelector('.dash-resize-preview')).not.toBeNull();
    expect(ghost()).toBeNull();
    expect(el('C').classList.contains('dash-item--placeholder')).toBe(false);
    up(200, 160); // released where it started: C keeps its size
    expect(document.querySelector('.dash-resize-preview')).toBeNull();
    expect(onLayoutChange).not.toHaveBeenCalled();
  });

  test('narrow view: reorder re-renders in the new order without emitting; setLayout restores', () => {
    setup(NARROW, 500);
    const { g, onLayoutChange } = grid();
    expect(container.classList.contains('dash-grid--narrow')).toBe(true);
    expect(row('D')).toBe('4 / span 1');
    down(el('D'), 200, 300);
    move(200, 20); // top half of A
    expect(marker().hidden).toBe(false);
    // horizontal line in narrow view
    expect(marker().style.width).toBe('400px');
    up(200, 20);
    expect(onLayoutChange).not.toHaveBeenCalled();
    expect(row('D')).toBe('1 / span 1');
    expect(row('A')).toBe('2 / span 1');
    expect(row('C')).toBe('4 / span 1');
    expect(order(g.getLayout())).toEqual(['A', 'B', 'C', 'D']);
    g.setLayout(structuredClone(L)); // equal layout: a no-op, the temporary order stays
    expect(row('D')).toBe('1 / span 1');
    g.setLayout(L.map((i) => (i.id === 'B' ? { ...i, w: 2 } : i)));
    expect(row('D')).toBe('4 / span 1');
    expect(row('A')).toBe('1 / span 1');
  });

  test('swap mode: target gets dash-item--swap-target and drop emits the swapped order', () => {
    setup();
    const { onLayoutChange } = grid({ dropMode: 'swap' });
    down(el('C'), 100, 128);
    move(50, 40); // over A
    expect(el('A').classList.contains('dash-item--swap-target')).toBe(true);
    expect(marker().hidden).toBe(true);
    move(300, 40); // over B
    expect(el('A').classList.contains('dash-item--swap-target')).toBe(false);
    expect(el('B').classList.contains('dash-item--swap-target')).toBe(true);
    move(50, 40);
    up(50, 40);
    expect(order(onLayoutChange.mock.calls[0][0])).toEqual(['C', 'B', 'A', 'D']);
    expect(container.querySelector('.dash-item--swap-target')).toBeNull();
  });

  test('sticky marker: a null hit inside the container keeps the last hit', () => {
    setup();
    const { onLayoutChange } = grid();
    down(el('C'), 100, 128);
    move(150, 40); // left half of B
    move(150, 120); // over C's own placeholder -> resolveTarget null
    expect(marker().hidden).toBe(false);
    expect(marker().classList.contains('dash-marker--blocked')).toBe(false);
    up(150, 120);
    expect(order(onLayoutChange.mock.calls[0][0])).toEqual(['A', 'C', 'B', 'D']);
  });

  test('sticky marker: outside the container the hit clears and pointerup cancels', () => {
    setup();
    const { onLayoutChange } = grid();
    down(el('C'), 100, 128);
    move(150, 40);
    move(600, 40); // outside the container rect
    expect(marker().hidden).toBe(true);
    expect(ghost()).not.toBeNull();
    up(600, 40);
    expect(onLayoutChange).not.toHaveBeenCalled();
    expect(ghost()).toBeNull();
  });

  test('requestAnimationFrame: moves are coalesced and pointerup flushes the latest move', () => {
    const queue: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => queue.push(cb));
    vi.stubGlobal('cancelAnimationFrame', (h: number) => { queue[h - 1] = () => {}; });
    setup();
    const { onLayoutChange } = grid();
    down(el('C'), 100, 128);
    move(150, 40);
    move(160, 40);
    move(170, 40);
    expect(ghost()).not.toBeNull();
    expect(queue.length).toBe(1);
    expect(marker().hidden).toBe(true); // not processed yet
    queue.shift()!(0);
    expect(marker().hidden).toBe(false);
    move(30, 40); // left half of A, pending
    up(30, 40);
    expect(order(onLayoutChange.mock.calls[0][0])).toEqual(['C', 'A', 'B', 'D']);
  });

  test('removeItem mid-drag cancels: the stale plan is never committed', () => {
    setup();
    const { g, onLayoutChange } = grid();
    down(el('C'), 100, 128);
    move(150, 40); // left half of B
    g.removeItem('A');
    onLayoutChange.mockClear();
    expect(ghost()).toBeNull();
    move(150, 120); // would be a sticky null hit over C's placeholder
    up(150, 120);
    expect(onLayoutChange).not.toHaveBeenCalled();
    expect(order(g.getLayout())).toEqual(['B', 'C', 'D']);
  });

  test('addItem mid-drag cancels', () => {
    setup();
    const { g, onLayoutChange } = grid();
    down(el('C'), 100, 128);
    move(150, 40);
    g.addItem({ id: 'E', w: 1, h: 1 });
    onLayoutChange.mockClear();
    expect(ghost()).toBeNull();
    up(150, 40);
    expect(onLayoutChange).not.toHaveBeenCalled();
  });

  test('removeItem clears the temporary narrow order', () => {
    setup(NARROW, 500);
    const { g } = grid();
    down(el('D'), 200, 300);
    move(200, 20);
    up(200, 20);
    expect(row('D')).toBe('1 / span 1');
    g.removeItem('B');
    expect(row('D')).toBe('3 / span 1');
    expect(row('A')).toBe('1 / span 1');
  });

  test('pointer capture is taken only once the drag starts', () => {
    setup();
    grid();
    const cap = vi.fn();
    el('C').setPointerCapture = cap;
    down(el('C'), 100, 128);
    expect(cap).not.toHaveBeenCalled();
    move(150, 40);
    expect(cap).toHaveBeenCalledTimes(1);
    up(150, 40);
  });

  test('touch-action: handle only, never handle-less or locked widgets, re-evaluated on render', () => {
    setup(WIDE, 1000, 'B');
    const { g } = grid();
    const handle = el('B').querySelector('[data-grid-handle]') as HTMLElement;
    expect(handle.style.touchAction).toBe('none');
    expect(el('A').style.touchAction).toBe('');
    expect(el('B').style.touchAction).toBe('');
    g.setLayout(L.map((i) => (i.id === 'B' ? { ...i, locked: true } : i)));
    expect(handle.style.touchAction).toBe('');
    g.setLayout(L);
    expect(handle.style.touchAction).toBe('none');
    // a handle added later is picked up on refresh
    const h2 = document.createElement('span');
    h2.setAttribute('data-grid-handle', '');
    el('D').appendChild(h2);
    g.refresh();
    expect(h2.style.touchAction).toBe('none');
    expect(el('D').style.touchAction).toBe('');
  });

  test('touch on a handle-less widget: moving 20px before 400ms does not drag', () => {
    vi.useFakeTimers();
    try {
      setup();
      const { onLayoutChange } = grid();
      down(el('C'), 100, 128, touch);
      vi.advanceTimersByTime(100);
      fire(document, 'pointermove', 100, 108, touch);
      vi.advanceTimersByTime(500);
      expect(ghost()).toBeNull();
      fire(document, 'pointermove', 150, 40, touch);
      expect(ghost()).toBeNull();
      fire(document, 'pointerup', 150, 40, touch);
      expect(onLayoutChange).not.toHaveBeenCalled();
    } finally {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });

  test('touch long-press (400ms) on a handle-less widget starts the drag; page scroll is blocked', () => {
    vi.useFakeTimers();
    try {
      setup();
      const { onLayoutChange } = grid();
      down(el('C'), 100, 128, touch);
      fire(document, 'pointermove', 103, 130, touch); // small jitter is fine
      vi.advanceTimersByTime(400);
      fire(document, 'pointermove', 150, 40, touch);
      expect(ghost()).not.toBeNull();
      const tm = new Event('touchmove', { bubbles: true, cancelable: true });
      document.dispatchEvent(tm);
      expect(tm.defaultPrevented).toBe(true);
      fire(document, 'pointerup', 150, 40, touch);
      expect(order(onLayoutChange.mock.calls[0][0])).toEqual(['A', 'C', 'B', 'D']);
      const tm2 = new Event('touchmove', { bubbles: true, cancelable: true });
      document.dispatchEvent(tm2);
      expect(tm2.defaultPrevented).toBe(false);
    } finally {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });

  test('touch on a handle uses the 4px threshold', () => {
    setup(WIDE, 1000, 'B');
    grid();
    const handle = el('B').querySelector('[data-grid-handle]') as HTMLElement;
    down(handle, 200, 40, touch);
    fire(document, 'pointermove', 30, 40, touch);
    expect(ghost()).not.toBeNull();
    fire(document, 'pointerup', 30, 40, touch);
  });

  test('text selection is suppressed during an active drag', () => {
    setup();
    grid();
    down(el('C'), 100, 128);
    const pre = new Event('selectstart', { bubbles: true, cancelable: true });
    el('C').dispatchEvent(pre);
    expect(pre.defaultPrevented).toBe(false);
    move(150, 40);
    expect(container.classList.contains('dash-grid--dragging')).toBe(true);
    const sel = new Event('selectstart', { bubbles: true, cancelable: true });
    el('C').dispatchEvent(sel);
    expect(sel.defaultPrevented).toBe(true);
    up(150, 40);
    expect(container.classList.contains('dash-grid--dragging')).toBe(false);
    const post = new Event('selectstart', { bubbles: true, cancelable: true });
    el('C').dispatchEvent(post);
    expect(post.defaultPrevented).toBe(false);
  });

  test('the click after a real drag is swallowed once; a plain click is not', async () => {
    setup();
    grid();
    const onClick = vi.fn();
    el('C').addEventListener('click', onClick);
    down(el('C'), 100, 128);
    move(150, 40);
    up(150, 40);
    el('C').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onClick).not.toHaveBeenCalled();
    el('C').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onClick).toHaveBeenCalledTimes(1);

    // plain click, no drag
    down(el('C'), 100, 128);
    up(100, 128);
    el('C').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onClick).toHaveBeenCalledTimes(2);

    // a suppressor that never fired expires after the release tick
    down(el('C'), 100, 128);
    move(150, 40);
    up(150, 40);
    await new Promise((r) => setTimeout(r, 0));
    el('C').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(onClick).toHaveBeenCalledTimes(3);
  });

  const click = (target: Element) => target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

  test('Escape then pointercancel: the click blocker expires; a later click goes through', () => {
    setup();
    grid();
    const onClick = vi.fn();
    const btn = document.body.appendChild(document.createElement('button')); // outside the grid
    btn.addEventListener('click', onClick);
    down(el('C'), 100, 128);
    move(150, 40);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fire(document, 'pointercancel', 150, 40); // gesture became a scroll / native drag
    down(btn, 600, 600);
    up(600, 600);
    click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('cancel without any release: the next pointerdown ends the blocker', () => {
    setup();
    const { g } = grid();
    const onClick = vi.fn();
    const btn = document.body.appendChild(document.createElement('button')); // outside the grid
    btn.addEventListener('click', onClick);
    down(el('C'), 100, 128);
    move(150, 40);
    g.setLayout(changed); // cancelled while the pointer is down; its pointerup never arrives
    fire(btn, 'pointerdown', 600, 600, { pointerId: 2 } as PointerEventInit);
    click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('cancel while held: the release click is swallowed, the next one is not', () => {
    setup();
    const { g } = grid();
    const onClick = vi.fn();
    el('C').addEventListener('click', onClick);
    down(el('C'), 100, 128);
    move(150, 40);
    g.setLayout(changed);
    up(150, 40);
    click(el('C'));
    expect(onClick).not.toHaveBeenCalled();
    click(el('C'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('cancel while held: the blocker is capped at 1s even with no further pointer events', () => {
    vi.useFakeTimers();
    try {
      setup();
      const { g } = grid();
      const onClick = vi.fn();
      el('C').addEventListener('click', onClick);
      down(el('C'), 100, 128);
      move(150, 40);
      g.setLayout(changed);
      vi.advanceTimersByTime(999);
      vi.advanceTimersByTime(1);
      click(el('C'));
      expect(onClick).toHaveBeenCalledTimes(1);
    } finally {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });

  test('destroy mid-drag: a later click is not swallowed', () => {
    setup();
    const { g } = grid();
    const onClick = vi.fn();
    el('C').addEventListener('click', onClick);
    down(el('C'), 100, 128);
    move(150, 40);
    g.destroy();
    up(150, 40);
    click(el('C'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('ghost option: its element is used as the ghost, positioned and sized by the grid; settable via setOptions', () => {
    setup();
    const custom = document.createElement('section');
    const hook = vi.fn(() => custom);
    const g = createGrid(container, { columns: 4, layout: L });
    g.setOptions({ ghost: hook });
    down(el('C'), 100, 128);
    move(150, 40);
    expect(hook).toHaveBeenCalledWith(el('C'));
    expect(ghost()).toBe(custom);
    expect(custom.classList.contains('dash-ghost')).toBe(true);
    expect(custom.style.position).toBe('fixed');
    expect(custom.style.width).toBe('208px');
    expect(custom.style.left).toBe('50px');
    up(150, 40);
    expect(custom.isConnected).toBe(false);
  });

  test('default ghost: ids and radio names stripped, media replaced by sized boxes, canvas copied', () => {
    setup();
    const c = el('C');
    c.id = 'widget-c';
    c.insertAdjacentHTML(
      'beforeend',
      '<label id="lbl" for="r1">x</label><input type="radio" name="pick" id="r1"><input type="text" name="q">' +
        '<iframe></iframe><video></video><audio></audio><canvas width="10" height="10"></canvas>',
    );
    const frame = c.querySelector('iframe')!;
    frame.getBoundingClientRect = () => rect({ left: 0, top: 0, right: 120, bottom: 60 });
    const canvas = c.querySelector('canvas')!;
    const drawImage = vi.fn();
    const proto = Object.getPrototypeOf(canvas) as HTMLCanvasElement;
    const spy = vi.spyOn(proto, 'getContext').mockImplementation(function () {
      return { drawImage } as unknown as CanvasRenderingContext2D;
    } as never);
    try {
      grid();
      down(c, 100, 128);
      move(150, 40);
      const g = ghost() as HTMLElement;
      expect(g.hasAttribute('id')).toBe(false);
      expect(g.querySelector('[id]')).toBeNull();
      expect((g.querySelector('input[type="radio"]') as HTMLInputElement).hasAttribute('name')).toBe(false);
      expect((g.querySelector('input[type="text"]') as HTMLInputElement).name).toBe('q');
      expect(g.querySelector('iframe, video, audio')).toBeNull();
      const boxes = g.querySelectorAll(':scope > div:not(.dash-resize-handle)');
      expect(boxes.length).toBe(3);
      expect((boxes[0] as HTMLElement).style.width).toBe('120px');
      expect((boxes[0] as HTMLElement).style.height).toBe('60px');
      expect(drawImage).toHaveBeenCalledWith(canvas, 0, 0);
      up(150, 40);
    } finally {
      spy.mockRestore();
    }
  });

  test('default ghost: a canvas that cannot be copied is left blank', () => {
    setup();
    el('C').insertAdjacentHTML('beforeend', '<canvas width="10" height="10"></canvas>');
    const proto = Object.getPrototypeOf(el('C').querySelector('canvas')) as HTMLCanvasElement;
    const spy = vi.spyOn(proto, 'getContext').mockImplementation(() => {
      throw new Error('tainted');
    });
    try {
      grid();
      down(el('C'), 100, 128);
      move(150, 40);
      expect((ghost() as HTMLElement).querySelector('canvas')).not.toBeNull();
      up(150, 40);
    } finally {
      spy.mockRestore();
    }
  });

  test('autoscroll: a drag near the bottom of a scrollable parent scrolls it, and the drop commits at the final position', () => {
    setup();
    const queue: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => queue.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const parent = document.createElement('div');
    parent.style.overflowY = 'auto';
    Object.defineProperty(parent, 'scrollHeight', { configurable: true, value: 1000 });
    Object.defineProperty(parent, 'clientHeight', { configurable: true, value: 400 });
    parent.getBoundingClientRect = () => rect({ left: 0, top: -100, right: 424, bottom: 400 });
    parent.appendChild(container);
    document.body.appendChild(parent);
    const { onLayoutChange } = grid();
    down(el('C'), 100, 128);
    move(150, 395); // inside the container, within 48px of the parent's bottom
    for (let i = 0; i < 3; i++) queue.shift()?.(0); // hit-test frame, then autoscroll steps
    expect(parent.scrollTop).toBeGreaterThan(0);
    move(150, 40);
    up(150, 40);
    expect(order(onLayoutChange.mock.calls[0]![0])).toEqual(['A', 'C', 'B', 'D']);
  });

  test('grid.css: the ghost opacity variable has a fallback (the ghost lives on body)', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/styles/grid.css', 'utf8');
    expect(css).toMatch(/\.dash-ghost\s*{[^}]*opacity:\s*var\(--dash-ghost-opacity,\s*0\.85\)/);
  });

  test('grid.css has no dead .dash-marker--swap rule', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync('src/styles/grid.css', 'utf8');
    expect(css).not.toContain('dash-marker--swap');
    expect(css).toContain('.dash-grid--dragging');
  });
});
