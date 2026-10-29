import { computeFlow, createGrid, totalRows } from '@grid-master/core';
import type { GridController, LayoutItem } from '@grid-master/core';
import { DEMO_LAYOUT, GRID_OPTIONS, MODES } from '@grid-master/demo-kit';
import { createModeSwitch } from './mode-switch.js';
import { renderBlock } from './blocks-dom.js';

const LIMIT_NOTE = 'Drops that would add a row are refused.';

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
export function mountHero(
  root: HTMLElement,
  options: { onLayoutChange?: (layout: LayoutItem[]) => void } = {},
): { grid: GridController; destroy(): void } {
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
  const group = createModeSwitch((mode, index) => {
    hint.textContent = MODES[index]!.hint;
    grid.setOptions({ dropMode: mode });
  }, signal);
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
  const limit = toggle('Lock row count');
  // Always in the DOM (a live region is only announced reliably if it exists before its text changes).
  const limitNote = el('span', 'tool-note');
  limitNote.setAttribute('aria-live', 'polite');
  const phone = toggle('Phone preview');
  const reset = el('button', 'button', 'Reset');
  reset.type = 'button';
  const tools = el('div', 'hero-tools');
  tools.append(limit.label, limitNote, phone.label, reset);

  root.append(headline, group, hint, stage, tools);

  // "Lock row count" caps rows at the current height; re-applied after every layout change while on.
  function applyLock(layout: LayoutItem[]): void {
    const on = limit.input.checked;
    const note = on ? LIMIT_NOTE : '';
    if (limitNote.textContent !== note) limitNote.textContent = note;
    grid.setOptions({ maxRows: on ? totalRows(computeFlow(layout, GRID_OPTIONS.columns)) : undefined });
  }

  const grid = createGrid(container, {
    ...GRID_OPTIONS,
    layout: cloneLayout(),
    dropMode: MODES[0]!.mode,
    onLayoutChange: (layout) => {
      applyLock(layout);
      options.onLayoutChange?.(layout);
    },
  });

  limit.input.addEventListener('change', () => applyLock(grid.getLayout()), { signal });
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
      applyLock(grid.getLayout());
      group.select(0);
      options.onLayoutChange?.(grid.getLayout());
    },
    { signal },
  );

  hint.textContent = MODES[0]!.hint;

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
