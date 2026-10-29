// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { BLOCKS, DEMO_LAYOUT, MODES } from '@grid-master/demo-kit';
import { mountHero } from '../src/hero.js';

const WIDE = 1000;
const PHONE = 480;
const ROW_HEIGHT = 72;
const GAP = 10;

const PE: typeof MouseEvent = typeof PointerEvent !== 'undefined' ? PointerEvent : MouseEvent;

let root: HTMLElement;
let hero: ReturnType<typeof mountHero>;

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;
const grid = () => $('.hero-grid');
const el = (id: string) => grid().querySelector(`[data-grid-id="${id}"]`) as HTMLElement;
const radio = (label: string) =>
  [...root.querySelectorAll<HTMLElement>('[role="radio"]')].find((r) => r.textContent?.trim() === label)!;
const toggle = (label: string) =>
  [...root.querySelectorAll('label')].find((l) => l.textContent?.includes(label))!.querySelector('input') as HTMLInputElement;
const resetButton = () => [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Reset')!;
const order = () => hero.grid.getLayout().map((i) => i.id);

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} } as DOMRect;
}

/** Rects derived from the grid's current --gm-col / --gm-row, so they follow every re-render. */
function stubRects(container: HTMLElement) {
  const cell = (WIDE - 3 * GAP) / 4;
  container.getBoundingClientRect = () => rect(0, 0, WIDE, 6 * (ROW_HEIGHT + GAP));
  for (const item of Array.from(container.querySelectorAll<HTMLElement>('[data-grid-id]'))) {
    item.getBoundingClientRect = () => {
      const [c, cs] = item.style.getPropertyValue('--gm-col').split(' / span ').map(Number);
      const [r, rs] = item.style.getPropertyValue('--gm-row').split(' / span ').map(Number);
      return rect((c! - 1) * (cell + GAP), (r! - 1) * (ROW_HEIGHT + GAP), cs! * cell + (cs! - 1) * GAP, rs! * ROW_HEIGHT + (rs! - 1) * GAP);
    };
  }
}

const center = (id: string) => {
  const r = el(id).getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2] as const;
};
const fire = (target: EventTarget, type: string, x: number, y: number) =>
  target.dispatchEvent(new PE(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0 }));

/** Drags `from` to `to`; `frac` is the horizontal point of the target (0.5 = middle, 0.1 = its left edge). */
function startDrag(from: string, to: string, frac = 0.5) {
  const [fx, fy] = center(from);
  const t = el(to).getBoundingClientRect();
  const tx = t.left + t.width * frac;
  const ty = t.top + t.height / 2;
  fire(el(from), 'pointerdown', fx, fy);
  fire(document, 'pointermove', fx + 10, fy + 10);
  fire(document, 'pointermove', tx, ty);
  return () => fire(document, 'pointerup', tx, ty);
}
const drag = (from: string, to: string, frac?: number) => startDrag(from, to, frac)();
/** A drop swallows the next click for a tick (core's click suppressor); wait it out like a person would. */
const settle = () => new Promise((r) => setTimeout(r, 0));
const click = (target: HTMLElement) => target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
const key = (target: HTMLElement, k: string) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

beforeEach(() => {
  document.body.innerHTML = '';
  vi.stubGlobal('requestAnimationFrame', undefined);
  vi.stubGlobal('cancelAnimationFrame', undefined);
  // layout width: 480 inside the phone frame, 1000 otherwise
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
    return this.closest('.phone-frame') ? PHONE : WIDE;
  });
  root = document.createElement('div');
  document.body.appendChild(root);
  hero = mountHero(root);
  stubRects(grid());
});
afterEach(async () => {
  hero.destroy();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  // let post-drag click suppressors expire so they cannot leak into the next test
  await new Promise((r) => setTimeout(r, 0));
});

describe('hero', () => {
  test('renders DEMO_LAYOUT blocks with their accents; map has a handle; pinned has demo-block--locked', () => {
    expect(root.querySelector('h1')?.textContent).toBe('A dashboard grid that stays calm while you drag');
    expect(order()).toEqual(DEMO_LAYOUT.map((i) => i.id));
    for (const { id } of DEMO_LAYOUT) {
      expect(el(id).classList.contains('demo-block')).toBe(true);
      expect(el(id).style.getPropertyValue('--block-accent')).toBe(BLOCKS[id]!.accent);
    }
    expect(el('map').querySelector('[data-grid-handle].demo-block__grip')).not.toBeNull();
    expect(el('revenue').querySelector('[data-grid-handle]')).toBeNull();
    expect(el('pinned').classList.contains('demo-block--locked')).toBe(true);
    expect(el('revenue').classList.contains('demo-block--locked')).toBe(false);
    expect(el('contact').querySelector('input')).not.toBeNull();
    expect(el('contact').querySelector('button')).not.toBeNull();
    expect(grid().classList.contains('gm-grid')).toBe(true);
  });

  test('mode switch sets dropMode and the hint', () => {
    expect($('[role="radiogroup"]')).not.toBeNull();
    expect(radio('Insert').getAttribute('aria-checked')).toBe('true');
    expect($('.hero-hint').textContent).toBe(MODES[0]!.hint);
    expect($('.hero-hint').getAttribute('aria-live')).toBe('polite');

    click(radio('Swap'));
    const checked = [...root.querySelectorAll('[role="radio"]')].filter((r) => r.getAttribute('aria-checked') === 'true');
    expect(checked).toEqual([radio('Swap')]);
    expect($('.hero-hint').textContent).toBe(MODES[3]!.hint);

    drag('revenue', 'users');
    expect(order().slice(0, 2)).toEqual(['users', 'revenue']);
    expect(order()).toHaveLength(DEMO_LAYOUT.length);
  });

  test('arrow keys move the mode selection', () => {
    key(radio('Insert'), 'ArrowRight');
    expect(radio('Block').getAttribute('aria-checked')).toBe('true');
    expect(radio('Insert').getAttribute('aria-checked')).toBe('false');
    expect($('.hero-hint').textContent).toBe(MODES[1]!.hint);
    key(radio('Block'), 'ArrowLeft');
    key(radio('Insert'), 'ArrowLeft'); // wraps to the last
    expect(radio('Swap').getAttribute('aria-checked')).toBe('true');
    key(radio('Swap'), 'ArrowRight'); // wraps to the first
    expect(radio('Insert').getAttribute('aria-checked')).toBe('true');
    // roving tabindex: only the checked radio is in the tab order
    expect(radio('Insert').tabIndex).toBe(0);
    expect(radio('Block').tabIndex).toBe(-1);
  });

  test('lock row count: refuses an insert drop that would add a row; off commits it', async () => {
    const marker = () => $('.gm-marker');
    const setLock = (on: boolean) => {
      toggle('Lock row count').checked = on;
      toggle('Lock row count').dispatchEvent(new Event('change', { bubbles: true }));
    };
    const note = () => $('.tool-note');
    expect(note().hidden).toBe(true);

    // Lock on at 6 rows. Moving revenue before notes closes a row (5 rows); the lock re-caps at 5.
    setLock(true);
    expect(note().hidden).toBe(false);
    drag('revenue', 'notes', 0.1);
    expect(order()).toEqual(['users', 'traffic', 'tasks', 'pinned', 'map', 'contact', 'revenue', 'notes']);
    await settle();

    // Moving revenue back to the front would need a 6th row: refused.
    const before = order();
    const finish = startDrag('revenue', 'users', 0.1);
    expect(marker().hidden).toBe(false);
    expect(marker().classList.contains('gm-marker--blocked')).toBe(true);
    finish();
    expect(order()).toEqual(before);
    await settle();

    // Lock off: the same drag is allowed and commits.
    setLock(false);
    expect(note().hidden).toBe(true);
    const finishFree = startDrag('revenue', 'users', 0.1);
    expect(marker().classList.contains('gm-marker--blocked')).toBe(false);
    finishFree();
    expect(order()[0]).toBe('revenue');
  });

  test('phone preview: container narrower than 640 gets gm-grid--narrow', () => {
    expect(grid().classList.contains('gm-grid--narrow')).toBe(false);
    expect(grid().closest('.phone-frame')).toBeNull();
    toggle('Phone preview').checked = true;
    toggle('Phone preview').dispatchEvent(new Event('change', { bubbles: true }));
    expect(grid().closest('.phone-frame')).not.toBeNull();
    expect(grid().classList.contains('gm-grid--narrow')).toBe(true);
    toggle('Phone preview').checked = false;
    toggle('Phone preview').dispatchEvent(new Event('change', { bubbles: true }));
    expect(grid().closest('.phone-frame')).toBeNull();
    expect(grid().classList.contains('gm-grid--narrow')).toBe(false);
  });

  test('reset restores DEMO_LAYOUT order and insert mode', async () => {
    click(radio('Swap'));
    drag('revenue', 'users');
    expect(order()[0]).toBe('users');
    await settle();
    click(resetButton());
    expect(order()).toEqual(DEMO_LAYOUT.map((i) => i.id));
    expect(radio('Insert').getAttribute('aria-checked')).toBe('true');
    expect($('.hero-hint').textContent).toBe(MODES[0]!.hint);
    // the grid really is back in insert mode: dragging revenue onto users inserts instead of swapping
    drag('users', 'revenue', 0.1);
    expect(order().slice(0, 2)).toEqual(['users', 'revenue']);
    expect(el('users').style.getPropertyValue('--gm-col')).toBe('1 / span 1');
  });

  test('destroy() removes listeners and the gm-grid class', () => {
    hero.destroy();
    expect(grid().classList.contains('gm-grid')).toBe(false);
    click(radio('Swap'));
    expect(radio('Swap').getAttribute('aria-checked')).toBe('false');
    expect($('.hero-hint').textContent).toBe(MODES[0]!.hint);
    key(radio('Insert'), 'ArrowRight');
    expect(radio('Insert').getAttribute('aria-checked')).toBe('true');
    hero.destroy(); // idempotent
  });
});
