import { computeFlow, stackForNarrow } from '../engine/flow.js';
import { addItem as engineAddItem, removeItem as engineRemoveItem } from '../engine/mutate.js';
import { layoutsEqual, normalizeLayout } from '../engine/normalize.js';
import type { DropMode, DropResult, LayoutItem, PlacedItem, RejectReason } from '../engine/types.js';

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

  // ---- interaction hook points (filled in by drag / resize tasks) ----------
  // Cancel any active drag or resize and drop transient state (e.g. the temporary
  // narrow reorder). Called from setLayout, setOptions and destroy.
  function cancelInteraction(): void {}
  // Called once per widget element after it is scanned and rendered; pointerdown
  // listeners for drag (on [data-grid-handle] or the whole widget) and for the
  // resize handle attach here. Must be idempotent across refresh() calls.
  function bindItem(_el: HTMLElement, _id: string): void {}
  // Called when a widget element leaves the managed set (refresh / destroy).
  function unbindItem(_el: HTMLElement): void {}
  // ---------------------------------------------------------------------------

  const config = () => ({ columns: opts.columns, maxRows: opts.maxRows, mode: opts.dropMode ?? 'insert' });
  const emit = () => opts.onLayoutChange?.(layout.map((i) => ({ ...i })));

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
    narrow = measureNarrow();
    container.classList.toggle('gm-grid--narrow', narrow);
    container.style.setProperty('--gm-columns', String(narrow ? 1 : opts.columns));
    container.style.setProperty('--gm-row-height', `${opts.rowHeight ?? 80}px`);
    container.style.setProperty('--gm-gap', `${opts.gap ?? 8}px`);

    const placed: PlacedItem[] = narrow ? stackForNarrow(layout) : computeFlow(layout, opts.columns);
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
      cancelInteraction(); // also clears the temporary narrow order
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
      layout = next;
      render();
      emit();
    },
    getLayout: () => layout.map((i) => ({ ...i })),
    refresh: render,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelInteraction();
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
