import { computeFlow, stackForNarrow } from '../engine/flow.js';
import { addItem as engineAddItem, removeItem as engineRemoveItem } from '../engine/mutate.js';
import { normalizeLayout } from '../engine/normalize.js';
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
    const seen = new Set<string>();
    for (const child of Array.from(container.children)) {
      const id = child.getAttribute(ID_ATTR);
      if (id === null || !(child instanceof HTMLElement)) continue;
      seen.add(id);
      if (items.get(id) !== child) {
        const old = items.get(id);
        if (old) unbindItem(old);
        items.set(id, child);
        child.classList.add('gm-item');
        bindItem(child, id);
      }
    }
    for (const [id, node] of Array.from(items)) {
      if (!seen.has(id) || node.parentElement !== container) {
        unbindItem(node);
        items.delete(id);
        clearItem(node);
      }
    }
  }

  function clearItem(node: HTMLElement): void {
    node.classList.remove('gm-item');
    node.style.removeProperty('--gm-col');
    node.style.removeProperty('--gm-row');
    node.querySelector(':scope > .gm-resize-handle')?.remove();
    if (hiddenByUs.delete(node)) node.hidden = false;
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
        node.hidden = true;
        hiddenByUs.add(node);
        node.style.removeProperty('--gm-col');
        node.style.removeProperty('--gm-row');
        node.querySelector(':scope > .gm-resize-handle')?.remove();
        continue;
      }
      if (hiddenByUs.delete(node)) node.hidden = false;
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
      if (patch.columns !== undefined) layout = normalizeLayout(layout, opts.columns);
      render();
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
      for (const node of items.values()) {
        unbindItem(node);
        clearItem(node);
      }
      items.clear();
      marker.remove();
      container.classList.remove('gm-grid', 'gm-grid--narrow');
      container.style.display = prevInline.display;
      for (const p of ['--gm-columns', '--gm-row-height', '--gm-gap']) container.style.removeProperty(p);
    },
  };
}
