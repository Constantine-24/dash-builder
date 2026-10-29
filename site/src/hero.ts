import { createGrid } from '@grid-master/core';
import type { GridController, LayoutItem } from '@grid-master/core';
import { DEMO_LAYOUT, MODES } from '@grid-master/demo-kit';
import { renderBlock } from './blocks-dom.js';

const COLUMNS = 4;
const ROW_HEIGHT = 72;
const GAP = 10;
const ROW_LIMIT = 6;

const cloneLayout = (): LayoutItem[] => DEMO_LAYOUT.map((i) => ({ ...i }));

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  content?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function toggle(label: string): { label: HTMLLabelElement; input: HTMLInputElement } {
  const wrap = el('label', 'switch');
  const input = el('input');
  input.type = 'checkbox';
  const track = el('span', 'switch__track');
  track.setAttribute('aria-hidden', 'true');
  wrap.append(input, track, el('span', 'switch__label', label));
  return { label: wrap, input };
}

/** Builds the hero (headline, drop-mode switch, hint, live grid, toggles) inside `root`. */
export function mountHero(root: HTMLElement): { grid: GridController; destroy(): void } {
  const abort = new AbortController();
  const { signal } = abort;

  const headline = el('div', 'hero-head');
  headline.append(
    el('h1', 'hero-title', 'A dashboard grid that stays calm while you drag'),
    el(
      'p',
      'hero-sub',
      'Nothing moves until you drop. One grid for Vanilla JS, Angular and React. Try it right here.',
    ),
  );

  // Drop-mode segmented control
  const group = el('div', 'segmented');
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', 'Drop mode');
  const radios = MODES.map((m) => {
    const b = el('button', 'segmented__option', m.label);
    b.type = 'button';
    b.setAttribute('role', 'radio');
    return b;
  });
  group.append(...radios);
  const hint = el('p', 'hero-hint');
  hint.setAttribute('aria-live', 'polite');

  // Grid inside an (optionally phone-sized) frame
  const frame = el('div', 'grid-frame');
  const container = el('div', 'hero-grid');
  for (const item of DEMO_LAYOUT) container.append(renderBlock(item.id, item.locked === true));
  frame.append(container);
  const stage = el('div', 'hero-stage');
  stage.append(frame);

  // Toggles
  const limit = toggle(`Limit to ${ROW_LIMIT} rows`);
  const phone = toggle('Phone preview');
  const reset = el('button', 'button', 'Reset');
  reset.type = 'button';
  const tools = el('div', 'hero-tools');
  tools.append(limit.label, phone.label, reset);

  root.append(headline, group, hint, stage, tools);

  const grid = createGrid(container, {
    columns: COLUMNS,
    layout: cloneLayout(),
    dropMode: MODES[0]!.mode,
    rowHeight: ROW_HEIGHT,
    gap: GAP,
  });

  function select(index: number, focus = false): void {
    radios.forEach((r, i) => {
      r.setAttribute('aria-checked', String(i === index));
      r.tabIndex = i === index ? 0 : -1;
    });
    hint.textContent = MODES[index]!.hint;
    grid.setOptions({ dropMode: MODES[index]!.mode });
    if (focus) radios[index]!.focus();
  }
  const selected = () => radios.findIndex((r) => r.getAttribute('aria-checked') === 'true');

  radios.forEach((r, i) => r.addEventListener('click', () => select(i), { signal }));
  group.addEventListener(
    'keydown',
    (e) => {
      const n = radios.length;
      const from = radios.indexOf(e.target as HTMLButtonElement);
      if (from < 0) return;
      let to: number;
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          to = (from + 1) % n;
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
          to = (from + n - 1) % n;
          break;
        case 'Home':
          to = 0;
          break;
        case 'End':
          to = n - 1;
          break;
        default:
          return;
      }
      e.preventDefault();
      select(to, true);
    },
    { signal },
  );

  limit.input.addEventListener(
    'change',
    () => grid.setOptions({ maxRows: limit.input.checked ? ROW_LIMIT : undefined }),
    { signal },
  );
  phone.input.addEventListener(
    'change',
    () => {
      frame.classList.toggle('phone-frame', phone.input.checked);
      grid.refresh(); // re-measure now instead of waiting for the resize observer
    },
    { signal },
  );
  reset.addEventListener(
    'click',
    () => {
      grid.setLayout(cloneLayout());
      select(0);
    },
    { signal },
  );

  select(0);

  let destroyed = false;
  return {
    grid,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      abort.abort();
      grid.destroy();
    },
  };
}
