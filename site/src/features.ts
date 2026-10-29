import type { LayoutItem } from '@grid-master/core';

interface Feature {
  art: string;
  title: string;
  text: string;
  /** number of decorative cells in the animation */
  cells: number;
}

const FEATURES: readonly Feature[] = [
  {
    art: 'handles',
    title: 'Drag handles',
    text: 'Mark one element per widget as the handle. Only it starts a drag, so inputs, charts and maps stay usable.',
    cells: 4,
  },
  {
    art: 'locked',
    title: 'Locked widgets',
    text: 'A locked widget cannot be dragged or resized and keeps its place while everything else flows around it.',
    cells: 4,
  },
  {
    art: 'resize',
    title: 'Resize, same rules',
    text: 'Resizing follows the same row rules as dragging, so a widget never overlaps another or leaves a gap.',
    cells: 4,
  },
  {
    art: 'rows',
    title: 'Row limit',
    text: 'Set a maximum number of rows. Any drop or resize that would add one is refused, with a red marker.',
    cells: 5,
  },
  {
    art: 'stack',
    title: 'Phone stacking',
    text: 'Below a breakpoint the grid becomes a single column in the same order. No second layout to maintain.',
    cells: 3,
  },
  {
    art: 'json',
    title: 'Layout is JSON',
    text: 'The layout is an ordered list of ids and sizes: no x/y coordinates. Save it, load it, diff it.',
    cells: 0,
  },
];

/** One item per line keeps the dump short; it is still valid JSON. */
export function formatLayout(layout: readonly LayoutItem[]): string {
  if (layout.length === 0) return '[]';
  return `[\n${layout.map((i) => `  ${JSON.stringify(i)}`).join(',\n')}\n]`;
}

/** Builds the six feature cards inside `root`. `setLayout` feeds the "Layout is JSON" card. */
export function mountFeatures(root: HTMLElement): { setLayout(layout: readonly LayoutItem[]): void } {
  const head = document.createElement('div');
  head.className = 'section-head';
  const h2 = document.createElement('h2');
  h2.textContent = 'Built for real dashboards';
  const sub = document.createElement('p');
  sub.textContent = 'A small set of rules that never surprise your users.';
  head.append(h2, sub);

  const list = document.createElement('div');
  list.className = 'features';
  let pre: HTMLPreElement | undefined;

  for (const f of FEATURES) {
    const card = document.createElement('article');
    card.className = 'feature';

    const art = document.createElement('div');
    art.className = `art art--${f.art}`;
    art.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < f.cells; i++) art.append(document.createElement('span'));

    const title = document.createElement('h3');
    title.textContent = f.title;
    const text = document.createElement('p');
    text.textContent = f.text;
    card.append(art, title, text);

    if (f.art === 'json') {
      const details = document.createElement('details');
      details.className = 'feature__details';
      const summary = document.createElement('summary');
      summary.textContent = 'Show the live layout';
      pre = document.createElement('pre');
      pre.className = 'feature__json';
      pre.textContent = '[]';
      details.append(summary, pre);
      card.append(details);
    }
    list.append(card);
  }

  root.append(head, list);
  return {
    setLayout(layout) {
      if (pre) pre.textContent = formatLayout(layout);
    },
  };
}
