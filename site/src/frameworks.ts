import { createGrid } from '@grid-master/core';
import { DEMO_LAYOUT, GRID_OPTIONS, MODES } from '@grid-master/demo-kit';
import type { SiteConfig } from '@grid-master/demo-kit';
import { renderBlock } from './blocks-dom.js';
import { copyButton } from './footer.js';
import { createModeSwitch } from './mode-switch.js';
import { SNIPPETS, SNIPPET_LANG, highlight } from './snippets.js';
import type { Framework } from './snippets.js';

const TABS: readonly { id: Framework; label: string }[] = [
  { id: 'vanilla', label: 'Vanilla JS' },
  { id: 'angular', label: 'Angular' },
  { id: 'react', label: 'React' },
];

let instance = 0;

function codeBlock(framework: Framework): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'code';
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.innerHTML = highlight(SNIPPETS[framework], SNIPPET_LANG[framework]); // escaped by highlight()
  pre.append(code);
  pre.tabIndex = 0; // keyboard-scrollable
  pre.setAttribute('aria-label', `${TABS.find((t) => t.id === framework)!.label} example code`);
  const name = TABS.find((t) => t.id === framework)!.label;
  wrap.append(pre, copyButton(() => SNIPPETS[framework], { name: `${name} example`, select: code }));
  return wrap;
}

/** The Vanilla demo: its own grid, its own drop-mode switch and hint. */
function vanillaDemo(signal: AbortSignal): { el: HTMLElement; destroy(): void } {
  const wrap = document.createElement('div');
  wrap.className = 'demo-area';
  const hint = document.createElement('p');
  hint.className = 'demo-hint';
  hint.setAttribute('aria-live', 'polite');
  hint.textContent = MODES[0]!.hint;
  const container = document.createElement('div');
  container.className = 'demo-grid';
  for (const item of DEMO_LAYOUT) container.append(renderBlock(item.id, item.locked === true));

  const grid = createGrid(container, {
    ...GRID_OPTIONS,
    layout: DEMO_LAYOUT.map((i) => ({ ...i })),
    dropMode: MODES[0]!.mode,
  });
  const modes = createModeSwitch((mode, index) => {
    hint.textContent = MODES[index]!.hint;
    grid.setOptions({ dropMode: mode });
  }, signal);
  wrap.append(modes, hint, container);
  return { el: wrap, destroy: () => grid.destroy() };
}

function iframeDemo(framework: 'angular' | 'react', site: SiteConfig): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'demo-area demo-area--frame';
  const frame = document.createElement('iframe');
  frame.title = `${framework === 'angular' ? 'Angular' : 'React'} demo`;
  frame.setAttribute('loading', 'lazy');
  frame.src = `${site.base}${framework}/`;
  frame.className = 'demo-frame';
  wrap.append(frame);
  return wrap;
}

/** Builds the Vanilla / Angular / React tab bar with code and a live demo per panel. */
export function mountFrameworks(root: HTMLElement, site: SiteConfig): { destroy(): void } {
  const abort = new AbortController();
  const uid = `fw${++instance}`;

  const head = document.createElement('div');
  head.className = 'section-head';
  const h2 = document.createElement('h2');
  h2.textContent = 'One grid, three frameworks';
  const sub = document.createElement('p');
  sub.textContent = 'The same behaviour in every binding. Pick one and try it.';
  head.append(h2, sub);

  const list = document.createElement('div');
  list.className = 'tabs';
  list.setAttribute('role', 'tablist');
  list.setAttribute('aria-label', 'Framework');

  const tabs: HTMLButtonElement[] = [];
  const panels: HTMLElement[] = [];
  const opened = new Set<Framework>();

  const panelsWrap = document.createElement('div');
  panelsWrap.className = 'tab-panels';

  TABS.forEach((t, i) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.id = `${uid}-tab-${t.id}`;
    tab.className = 'tab';
    tab.textContent = t.label;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', `${uid}-panel-${t.id}`);
    tab.addEventListener('click', () => activate(i), { signal: abort.signal });
    tabs.push(tab);

    const panel = document.createElement('div');
    panel.id = `${uid}-panel-${t.id}`;
    panel.className = 'tab-panel';
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    panel.append(codeBlock(t.id));
    panels.push(panel);
    panelsWrap.append(panel);
  });
  list.append(...tabs);
  root.append(head, list, panelsWrap);

  // The Vanilla panel is first and visible from the start, so its grid can measure itself right away.
  const vanilla = vanillaDemo(abort.signal);
  panels[0]!.append(vanilla.el);
  opened.add('vanilla');

  function activate(index: number, focus = false): void {
    tabs.forEach((tab, i) => {
      tab.setAttribute('aria-selected', String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      panels[i]!.hidden = i !== index;
    });
    const id = TABS[index]!.id;
    if (!opened.has(id) && id !== 'vanilla') {
      opened.add(id);
      panels[index]!.append(iframeDemo(id, site));
    }
    if (focus) tabs[index]!.focus();
  }

  list.addEventListener(
    'keydown',
    (e) => {
      const from = tabs.indexOf(e.target as HTMLButtonElement);
      if (from < 0) return;
      const n = tabs.length;
      let to: number;
      switch (e.key) {
        case 'ArrowRight':
          to = (from + 1) % n;
          break;
        case 'ArrowLeft':
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
      activate(to, true);
    },
    { signal: abort.signal },
  );

  activate(0);

  let destroyed = false;
  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      abort.abort();
      vanilla.destroy();
    },
  };
}
