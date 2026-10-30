import { computeFlow, stackForNarrow } from '../engine/flow.js';
import { addItem as engineAddItem, removeItem as engineRemoveItem } from '../engine/mutate.js';
import { layoutsEqual, normalizeLayout } from '../engine/normalize.js';
import type { DropMode, DropResult, LayoutItem, PlacedItem, RejectReason } from '../engine/types.js';
import { createDrag } from './drag.js';
import { createResize } from './resize.js';

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
  /**
   * Builds the drag ghost from the widget element. The grid adds `dash-ghost`,
   * positions and sizes it, appends it to body and removes it on drop. Default:
   * a sanitized deep clone (see README).
   */
  ghost?: (el: HTMLElement) => HTMLElement;
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

/** Options the geometry or the drop rules depend on; changing one cancels an interaction. */
const GEOMETRY_KEYS = ['columns', 'dropMode', 'maxRows', 'breakpoint', 'rowHeight', 'gap'] as const;
type GeometryKey = (typeof GEOMETRY_KEYS)[number];
const DEFAULTS: Partial<Record<GeometryKey, unknown>> = { dropMode: 'insert', rowHeight: 80, gap: 8, breakpoint: 640 };
const effective = (o: Partial<GridOptions>, k: GeometryKey): unknown => o[k] ?? DEFAULTS[k];

export function createGrid(container: HTMLElement, options: GridOptions): GridController {
  const opts = { ...options };
  let layout: LayoutItem[] = normalizeLayout(opts.layout, opts.columns);
  let narrow = false;
  // Temporary narrow-view order (ids) from a narrow drag; never emitted, cleared by a setLayout that changes the layout.
  let narrowOrder: string[] | null = null;
  let destroyed = false;

  const items = new Map<string, HTMLElement>(); // widgets currently managed, by id
  const bound = new Map<HTMLElement, string>(); // element -> id it is bound under
  const hiddenByUs = new Set<HTMLElement>();
  const prevInline = {
    display: container.style.display,
  };
  const marker = document.createElement('div');
  marker.className = 'dash-marker';
  marker.hidden = true;

  container.classList.add('dash-grid');
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
  function commit(next: LayoutItem[]): void {
    layout = next;
    render();
    emit();
  }
  // Only one interaction at a time: each refuses to start while the other is active.
  const drag = createDrag({
    container,
    marker,
    items,
    isNarrow: () => narrow,
    getList: () => (narrow ? narrowList() : layout),
    config,
    commit,
    setNarrowOrder(ids) {
      narrowOrder = ids;
      render();
    },
    isBusy: () => resize.isActive(),
    ghost: () => opts.ghost,
  });
  const resize = createResize({
    container,
    items,
    isNarrow: () => narrow,
    getLayout: () => layout,
    config,
    metrics: () => ({ rowHeight: opts.rowHeight ?? 80, gap: opts.gap ?? 8 }),
    commit,
    isBusy: () => drag.isActive(),
  });
  // Cancel any active drag or resize. Called from setLayout (when the layout changes),
  // setOptions (when a geometry option changes), addItem, removeItem and from render when the view flips between wide and narrow
  // (destroy uses drag.destroy() / resize.destroy(), which also drop any pending click blocker).
  function cancelInteraction(): void {
    drag.cancel();
    resize.cancel();
  }
  // Called once per element when it becomes managed (or is rebound under a new id).
  function bindItem(el: HTMLElement, id: string): void {
    drag.bind(el, id);
  }
  // Called when an element leaves the managed set or before it is rebound.
  function unbindItem(el: HTMLElement): void {
    drag.unbind(el);
    resize.unbind(el);
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
        node.classList.add('dash-item');
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
    node.classList.remove('dash-item');
    node.style.removeProperty('--dash-col');
    node.style.removeProperty('--dash-row');
    node.querySelector(':scope > .dash-resize-handle')?.remove();
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
    container.classList.toggle('dash-grid--narrow', narrow);
    container.style.setProperty('--dash-columns', String(narrow ? 1 : opts.columns));
    container.style.setProperty('--dash-row-height', `${opts.rowHeight ?? 80}px`);
    container.style.setProperty('--dash-gap', `${opts.gap ?? 8}px`);

    const placed: PlacedItem[] = narrow ? stackForNarrow(narrowList()) : computeFlow(layout, opts.columns);
    const byId = new Map(placed.map((p) => [p.id, p]));
    for (const [id, node] of items) {
      const p = byId.get(id);
      if (!p) {
        hide(node);
        node.style.removeProperty('--dash-col');
        node.style.removeProperty('--dash-row');
        node.querySelector(':scope > .dash-resize-handle')?.remove();
        continue;
      }
      unhide(node);
      node.style.setProperty('--dash-col', `${p.x + 1} / span ${p.w}`);
      node.style.setProperty('--dash-row', `${p.y + 1} / span ${p.h}`);
      const handle = node.querySelector(':scope > .dash-resize-handle');
      if (p.locked) {
        handle?.remove();
      } else if (!handle) {
        const h = document.createElement('div');
        h.className = 'dash-resize-handle';
        h.style.touchAction = 'none'; // touch resize starts at once; no long-press, no page scroll
        node.appendChild(h);
      }
    }
    drag.sync(); // touch-action follows handles and lock state
    // keep the marker last so it never interleaves with widgets
    if (container.lastElementChild !== marker) container.appendChild(marker);
  }

  let observer: ResizeObserver | undefined;
  let frame: number | null = null; // pending narrow re-check
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => {
      if (destroyed) return;
      // Rendering here changes the container size inside the observer callback, which the
      // browser reports as "ResizeObserver loop completed with undelivered notifications".
      // Defer to a frame instead (one at a time); render at once only without rAF.
      if (typeof requestAnimationFrame === 'undefined') {
        if (measureNarrow() !== narrow) render();
        return;
      }
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        if (!destroyed && measureNarrow() !== narrow) render();
      });
    });
    observer.observe(container);
  }

  render();

  return {
    setLayout(next) {
      if (destroyed) return;
      const normalized = normalizeLayout(next, opts.columns);
      if (layoutsEqual(normalized, layout)) return; // nothing changes: keep any interaction and the narrow order
      cancelInteraction();
      narrowOrder = null;
      layout = normalized;
      render();
    },
    setOptions(patch) {
      if (destroyed) return;
      // Only a change to something the geometry or an in-flight plan depends on cancels.
      const changed = GEOMETRY_KEYS.some((k) => k in patch && effective(patch, k) !== effective(opts, k));
      Object.assign(opts, patch);
      if (!changed) return; // callbacks / equal values: nothing to re-render
      cancelInteraction();
      let layoutChanged = false;
      if (patch.columns !== undefined) {
        const next = normalizeLayout(layout, opts.columns);
        layoutChanged = !layoutsEqual(layout, next);
        layout = next;
      }
      render();
      if (layoutChanged) emit();
    },
    addItem(item, index) {
      if (destroyed) return { ok: false, reason: 'invalid' };
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
      if (destroyed) return;
      const next = engineRemoveItem(layout, id);
      if (next === layout) return;
      cancelInteraction(); // an in-flight plan was computed against the old list
      narrowOrder = null;
      layout = next;
      render();
      emit();
    },
    getLayout: () => layout.map((i) => ({ ...i })),
    refresh() {
      if (!destroyed) render();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      drag.destroy(); // like cancelInteraction, but leaves no click blocker behind
      resize.destroy(); // also removes the delegated pointerdown listener
      observer?.disconnect();
      if (frame !== null) {
        cancelAnimationFrame(frame);
        frame = null;
      }
      for (const node of Array.from(bound.keys())) {
        unbindItem(node);
        clearItem(node);
      }
      for (const node of Array.from(hiddenByUs)) unhide(node);
      bound.clear();
      items.clear();
      marker.remove();
      container.classList.remove('dash-grid', 'dash-grid--narrow');
      container.style.display = prevInline.display;
      for (const p of ['--dash-columns', '--dash-row-height', '--dash-gap']) container.style.removeProperty(p);
    },
  };
}
