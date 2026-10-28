import { computeFlow, stackForNarrow } from '../engine/flow.js';
import { addItem as engineAddItem, removeItem as engineRemoveItem } from '../engine/mutate.js';
import { layoutsEqual, normalizeLayout } from '../engine/normalize.js';
import type { DropMode, DropResult, LayoutItem, PlacedItem, RejectReason } from '../engine/types.js';
import { createDrag } from './drag.js';

export interface GridOptions {
  columns: number;
  layout: LayoutItem[];
  dropMode?: DropMode; // default 'insert'
  maxRows?: number;
  rowHeight?: number; // px, default 80
  gap?: number; // px, default 8
  breakpoint?: number; // px, default 640
  onLayoutChange?: (layout: LayoutItem[]) => void;
  onReject?: (reason: RejectReason) => void; // called when addItem is refused
}

export interface GridController {
  setLayout(layout: LayoutItem[]): void;
  setOptions(opts: Partial<Omit<GridOptions, 'layout'>>): void;
  addItem(item: LayoutItem, index?: number): DropResult;
  removeItem(id: string): void;
  getLayout(): LayoutItem[];
  refresh(): void;
  destroy(): void;
}

const ID_ATTR = 'data-grid-id';

export function createGrid(container: HTMLElement, options: GridOptions): GridController {
  const opts = { ...options };
  let layout: LayoutItem[] = normalizeLayout(opts.layout, opts.columns);
  let narrow = false;
  // Temporary narrow-view order (ids) from a narrow drag; never emitted, cleared by setLayout.
  let narrowOrder: string[] | null = null;
  let destroyed = false;

  const items = new Map<string, HTMLElement>(); // widgets currently managed, by id
  const bound = new Map<HTMLElement, string>(); // element -> id it is bound under
  const hiddenByUs = new Set<HTMLElement>();
  const prevInline = {
    display: container.style.display,
  };
  const marker = document.createElement('div');
  marker.className = 'gm-marker';
  marker.hidden = true;

  container.classList.add('gm-grid');
  container.style.display = 'grid';
  container.appendChild(marker);

  const config = () => ({ columns: opts.columns, maxRows: opts.maxRows, mode: opts.dropMode ?? 'insert' });
  const emit = () => opts.onLayoutChange?.(layout.map((i) => ({ ...i })));

  /** The layout in narrow-view order: the temporary order first, then items it doesn't know. */
  function narrowList(): LayoutItem[] {
    if (!narrowOrder) return layout;
    const byId = new Map(layout.map((i) => [i.id, i]));
    const ordered = narrowOrder.flatMap((id) => byId.get(id) ?? []);
    const seen = new Set(ordered.map((i) => i.id));
    return [...ordered, ...layout.filter((i) => !seen.has(i.id))];
  }

  // ---- interactions --------------------------------------------------------
  const drag = createDrag({
    container,
    marker,
    items,
    isNarrow: () => narrow,
    getList: () => (narrow ? narrowList() : layout),
    config,
    commit(next) {
      layout = next;
      render();
      emit();
    },
    setNarrowOrder(ids) {
      narrowOrder = ids;
      render();
    },
  });
  // Cancel any active drag or resize. Called from setLayout, setOptions, addItem,
  // removeItem and from render when the view flips between wide and narrow
  // (destroy uses drag.destroy(), which also drops any pending click blocker).
  function cancelInteraction(): void {
    drag.cancel();
  }
  // Called once per element when it becomes managed (or is rebound under a new id).
  function bindItem(el: HTMLElement, id: string): void {
    drag.bind(el, id);
  }
  // Called when an element leaves the managed set or before it is rebound.
  function unbindItem(el: HTMLElement): void {
    drag.unbind(el);
  }
  // ---------------------------------------------------------------------------

  function scan(): void {
    const winners = new Map<string, HTMLElement>();
    const dupes: HTMLElement[] = [];
    for (const child of Array.from(container.children)) {
      const id = child.getAttribute(ID_ATTR);
      if (id === null || !(child instanceof HTMLElement)) continue;
      if (winners.has(id)) dupes.push(child); // first in DOM order wins
      else winners.set(id, child);
    }
    const winnerEls = new Set(winners.values());
    // release elements no longer managed (removed, now a duplicate, or id attribute dropped)
    for (const [node, id] of Array.from(bound)) {
      if (!winnerEls.has(node)) {
        unbindItem(node);
        bound.delete(node);
        clearItem(node);
      } else if (winners.get(id) !== node) {
        unbindItem(node); // id attribute changed: rebound below under the new id
        bound.delete(node);
      }
    }
    for (const [id, node] of winners) {
      if (bound.get(node) !== id) {
        bound.set(node, id);
        node.classList.add('gm-item');
        bindItem(node, id);
      }
    }
    items.clear();
    for (const [id, node] of winners) items.set(id, node);
    for (const node of dupes) hide(node);
    // forget hidden-by-us elements that left the container
    for (const node of Array.from(hiddenByUs)) if (node.parentElement !== container) unhide(node);
  }

  function hide(node: HTMLElement): void {
    if (!node.hidden) {
      node.hidden = true;
      hiddenByUs.add(node);
    }
  }
  // Only un-hides what the controller hid; consumer-hidden elements stay hidden.
  function unhide(node: HTMLElement): void {
    if (hiddenByUs.delete(node)) node.hidden = false;
  }

  function clearItem(node: HTMLElement): void {
    node.classList.remove('gm-item');
    node.style.removeProperty('--gm-col');
    node.style.removeProperty('--gm-row');
    node.querySelector(':scope > .gm-resize-handle')?.remove();
    unhide(node);
  }

  function measureNarrow(): boolean {
    return container.clientWidth < (opts.breakpoint ?? 640);
  }

  function render(): void {
    scan();
    const nextNarrow = measureNarrow();
    if (nextNarrow !== narrow) cancelInteraction(); // axis and drop config differ between views
    narrow = nextNarrow;
    container.classList.toggle('gm-grid--narrow', narrow);
    container.style.setProperty('--gm-columns', String(narrow ? 1 : opts.columns));
    container.style.setProperty('--gm-row-height', `${opts.rowHeight ?? 80}px`);
    container.style.setProperty('--gm-gap', `${opts.gap ?? 8}px`);

    const placed: PlacedItem[] = narrow ? stackForNarrow(narrowList()) : computeFlow(layout, opts.columns);
    const byId = new Map(placed.map((p) => [p.id, p]));
    for (const [id, node] of items) {
      const p = byId.get(id);
      if (!p) {
        hide(node);
        node.style.removeProperty('--gm-col');
        node.style.removeProperty('--gm-row');
        node.querySelector(':scope > .gm-resize-handle')?.remove();
        continue;
      }
      unhide(node);
      node.style.setProperty('--gm-col', `${p.x + 1} / span ${p.w}`);
      node.style.setProperty('--gm-row', `${p.y + 1} / span ${p.h}`);
      const handle = node.querySelector(':scope > .gm-resize-handle');
      if (p.locked) {
        handle?.remove();
      } else if (!handle) {
        const h = document.createElement('div');
        h.className = 'gm-resize-handle';
        node.appendChild(h);
      }
    }
    drag.sync(); // touch-action follows handles and lock state
    // keep the marker last so it never interleaves with widgets
    if (container.lastElementChild !== marker) container.appendChild(marker);
  }

  let observer: ResizeObserver | undefined;
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => {
      if (!destroyed && measureNarrow() !== narrow) render();
    });
    observer.observe(container);
  }

  render();

  return {
    setLayout(next) {
      cancelInteraction();
      narrowOrder = null;
      layout = normalizeLayout(next, opts.columns);
      render();
    },
    setOptions(patch) {
      cancelInteraction();
      Object.assign(opts, patch);
      let changed = false;
      if (patch.columns !== undefined) {
        const next = normalizeLayout(layout, opts.columns);
        changed = !layoutsEqual(layout, next);
        layout = next;
      }
      render();
      if (changed) emit();
    },
    addItem(item, index) {
      const result = engineAddItem(layout, config(), item, index);
      if (result.ok) {
        cancelInteraction(); // an in-flight plan was computed against the old list
        narrowOrder = null;
        layout = result.layout;
        render();
        emit();
      } else {
        opts.onReject?.(result.reason);
      }
      return result;
    },
    removeItem(id) {
      const next = engineRemoveItem(layout, id);
      if (next === layout) return;
      cancelInteraction(); // an in-flight plan was computed against the old list
      narrowOrder = null;
      layout = next;
      render();
      emit();
    },
    getLayout: () => layout.map((i) => ({ ...i })),
    refresh: render,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      drag.destroy(); // like cancelInteraction, but leaves no click blocker behind
      observer?.disconnect();
      for (const node of Array.from(bound.keys())) {
        unbindItem(node);
        clearItem(node);
      }
      for (const node of Array.from(hiddenByUs)) unhide(node);
      bound.clear();
      items.clear();
      marker.remove();
      container.classList.remove('gm-grid', 'gm-grid--narrow');
      container.style.display = prevInline.display;
      for (const p of ['--gm-columns', '--gm-row-height', '--gm-gap']) container.style.removeProperty(p);
    },
  };
}
