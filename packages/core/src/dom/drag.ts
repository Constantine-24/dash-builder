import { planDrop } from '../engine/drop.js';
import { resolveTarget } from '../engine/hit.js';
import type { Hit, ItemRect } from '../engine/hit.js';
import { layoutsEqual } from '../engine/normalize.js';
import type { DropResult, DropTarget, EngineConfig, LayoutItem } from '../engine/types.js';

/** The slice of controller state the drag interaction needs. */
export interface DragContext {
  container: HTMLElement;
  marker: HTMLElement;
  /** Managed widget elements by id. */
  items: ReadonlyMap<string, HTMLElement>;
  isNarrow(): boolean;
  /** The list being dragged in, in render order: the narrow order in narrow view, else the layout. */
  getList(): LayoutItem[];
  /** Wide-view engine config (active columns, maxRows and drop mode). */
  config(): EngineConfig;
  /** Wide view: adopt the new layout, render and emit. */
  commit(next: LayoutItem[]): void;
  /** Narrow view: store a temporary order and render, without emitting. */
  setNarrowOrder(ids: string[]): void;
}

export interface DragInteraction {
  bind(el: HTMLElement, id: string): void;
  unbind(el: HTMLElement): void;
  /** Abort any armed or active drag without changing anything. */
  cancel(): void;
}

const THRESHOLD = 4; // px the pointer must travel before a drag starts
const LINE = 4; // marker line thickness in px
const HANDLE = '[data-grid-handle]';

interface Binding {
  id: string;
  onDown: (e: PointerEvent) => void;
  touchEl: HTMLElement;
  prevTouch: string;
}

interface Session {
  el: HTMLElement;
  id: string;
  pointerId: number | undefined;
  startX: number;
  startY: number;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  narrow: boolean;
  started: boolean;
  ghost: HTMLElement | null;
  hit: Hit | null;
  plan: DropResult | null;
  swapTarget: HTMLElement | null;
  frame: number | null;
}

export function createDrag(ctx: DragContext): DragInteraction {
  const bindings = new Map<HTMLElement, Binding>();
  let s: Session | null = null;
  const doc = ctx.container.ownerDocument;

  function bind(el: HTMLElement, id: string): void {
    unbind(el);
    const handle = el.querySelector<HTMLElement>(HANDLE);
    const touchEl = handle ?? el;
    const b: Binding = { id, onDown: (e) => onDown(el, e), touchEl, prevTouch: touchEl.style.touchAction };
    touchEl.style.touchAction = 'none';
    el.addEventListener('pointerdown', b.onDown as EventListener);
    bindings.set(el, b);
  }

  function unbind(el: HTMLElement): void {
    const b = bindings.get(el);
    if (!b) return;
    if (s?.el === el) cancel();
    el.removeEventListener('pointerdown', b.onDown as EventListener);
    b.touchEl.style.touchAction = b.prevTouch;
    bindings.delete(el);
  }

  function onDown(el: HTMLElement, e: PointerEvent): void {
    if (s || e.button !== 0 || el.hidden) return;
    const b = bindings.get(el);
    const target = e.target instanceof Element ? e.target : null;
    if (!b || !target || !el.contains(target)) return;
    const resize = target.closest('.gm-resize-handle');
    if (resize && el.contains(resize)) return;
    if (el.querySelector(HANDLE)) {
      const handle = target.closest(HANDLE);
      if (!handle || !el.contains(handle)) return;
    }
    const item = ctx.getList().find((i) => i.id === b.id);
    if (!item || item.locked) return;

    const r = el.getBoundingClientRect();
    s = {
      el,
      id: b.id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      offsetX: e.clientX - r.left,
      offsetY: e.clientY - r.top,
      narrow: ctx.isNarrow(),
      started: false,
      ghost: null,
      hit: null,
      plan: null,
      swapTarget: null,
      frame: null,
    };
    if (e.pointerId !== undefined && typeof el.setPointerCapture === 'function') {
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // not an active pointer (synthetic event); document listeners still work
      }
    }
    doc.addEventListener('pointermove', onMove);
    doc.addEventListener('pointerup', onUp);
    doc.addEventListener('pointercancel', onCancel);
    doc.addEventListener('keydown', onKey);
    el.addEventListener('dragstart', preventNative);
  }

  const samePointer = (e: PointerEvent) =>
    s !== null && (s.pointerId === undefined || e.pointerId === undefined || e.pointerId === s.pointerId);

  function onMove(e: PointerEvent): void {
    if (!s || !samePointer(e)) return;
    s.x = e.clientX;
    s.y = e.clientY;
    if (!s.started) {
      if (Math.hypot(s.x - s.startX, s.y - s.startY) < THRESHOLD) return;
      start(s);
    }
    e.preventDefault();
    placeGhost(s);
    schedule(s);
  }

  function onUp(e: PointerEvent): void {
    if (!s || !samePointer(e)) return;
    const cur = s;
    if (cur.started) {
      cur.x = e.clientX;
      cur.y = e.clientY;
      update(cur); // flush: decide on the final pointer position
    }
    const list = ctx.getList();
    const plan = cur.started && cur.hit ? cur.plan : null;
    const narrow = cur.narrow;
    cleanup();
    if (!plan?.ok || layoutsEqual(plan.layout, list)) return;
    if (narrow) ctx.setNarrowOrder(plan.layout.map((i) => i.id));
    else ctx.commit(plan.layout);
  }

  function onCancel(e: PointerEvent): void {
    if (samePointer(e)) cancel();
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') cancel();
  }

  function preventNative(e: Event): void {
    e.preventDefault();
  }

  function start(cur: Session): void {
    cur.started = true;
    const r = cur.el.getBoundingClientRect();
    const ghost = cur.el.cloneNode(true) as HTMLElement;
    ghost.removeAttribute('data-grid-id');
    ghost.removeAttribute('id');
    ghost.classList.add('gm-ghost');
    Object.assign(ghost.style, {
      position: 'fixed',
      pointerEvents: 'none',
      boxSizing: 'border-box',
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
    cur.ghost = ghost;
    cur.el.classList.add('gm-item--placeholder');
    doc.body.appendChild(ghost);
  }

  function placeGhost(cur: Session): void {
    if (!cur.ghost) return;
    cur.ghost.style.left = `${cur.x - cur.offsetX}px`;
    cur.ghost.style.top = `${cur.y - cur.offsetY}px`;
  }

  function schedule(cur: Session): void {
    const raf = globalThis.requestAnimationFrame;
    if (typeof raf !== 'function') {
      update(cur);
      return;
    }
    if (cur.frame !== null) return;
    cur.frame = raf(() => {
      cur.frame = null;
      if (s === cur) update(cur);
    });
  }

  function dropFrame(cur: Session): void {
    if (cur.frame === null) return;
    const caf = globalThis.cancelAnimationFrame;
    if (typeof caf === 'function') caf(cur.frame);
    cur.frame = null;
  }

  /** Hit-tests the current pointer position and refreshes marker / swap target. */
  function update(cur: Session): void {
    dropFrame(cur);
    const { container } = ctx;
    const c = container.getBoundingClientRect();
    if (cur.x < c.left || cur.x > c.right || cur.y < c.top || cur.y > c.bottom) {
      cur.hit = null;
      cur.plan = null;
      showHit(cur);
      return;
    }
    // container-relative coordinates in the marker's containing block (padding box, scrolled)
    const ox = c.left + container.clientLeft - container.scrollLeft;
    const oy = c.top + container.clientTop - container.scrollTop;
    const list = ctx.getList();
    const rects: ItemRect[] = [];
    for (const item of list) {
      const node = ctx.items.get(item.id);
      if (!node || node.hidden) continue;
      const r = node.getBoundingClientRect();
      rects.push({ id: item.id, left: r.left - ox, top: r.top - oy, right: r.right - ox, bottom: r.bottom - oy });
    }
    const cfg = engineConfig(cur);
    const hit = resolveTarget(rects, { x: cur.x - ox, y: cur.y - oy }, cur.id, cfg.mode, cur.narrow ? 'y' : 'x');
    if (!hit) return; // sticky: keep the last valid hit while inside the container
    cur.hit = hit;
    cur.plan = planDrop(list, cfg, cur.id, toListTarget(hit.target, rects, list, cur.id));
    showHit(cur);
  }

  function engineConfig(cur: Session): EngineConfig {
    const cfg = ctx.config();
    if (!cur.narrow) return cfg;
    return { columns: 1, mode: cfg.mode === 'swap' ? 'swap' : 'insert' };
  }

  /**
   * resolveTarget indexes count rendered rects; planDrop indexes count list
   * entries. They differ when a list entry has no (visible) element.
   */
  function toListTarget(target: DropTarget, rects: ItemRect[], list: LayoutItem[], dragId: string): DropTarget {
    if (!('index' in target)) return target;
    const rest = list.filter((i) => i.id !== dragId).map((i) => i.id);
    const others = rects.filter((r) => r.id !== dragId);
    if (others.length === 0) return { index: rest.length };
    if (target.index < others.length) return { index: rest.indexOf(others[target.index]!.id) };
    return { index: rest.indexOf(others[others.length - 1]!.id) + 1 };
  }

  function showHit(cur: Session): void {
    const { marker } = ctx;
    const blocked = cur.plan !== null && !cur.plan.ok;
    const m = cur.hit?.marker;
    const swapEl = m?.kind === 'outline' ? ctx.items.get(m.id) ?? null : null;
    if (cur.swapTarget && cur.swapTarget !== swapEl) {
      cur.swapTarget.classList.remove('gm-item--swap-target', 'gm-item--swap-blocked');
    }
    cur.swapTarget = swapEl;
    if (swapEl) {
      swapEl.classList.add('gm-item--swap-target');
      swapEl.classList.toggle('gm-item--swap-blocked', blocked);
    }
    if (m?.kind !== 'line') {
      marker.hidden = true;
      marker.classList.remove('gm-marker--blocked');
      return;
    }
    const vertical = m.width === 0;
    Object.assign(marker.style, {
      left: `${vertical ? m.left - LINE / 2 : m.left}px`,
      top: `${vertical ? m.top : m.top - LINE / 2}px`,
      width: `${vertical ? LINE : m.width}px`,
      height: `${vertical ? m.height : LINE}px`,
    });
    marker.classList.toggle('gm-marker--blocked', blocked);
    marker.hidden = false;
  }

  function cleanup(): void {
    const cur = s;
    if (!cur) return;
    s = null;
    dropFrame(cur);
    doc.removeEventListener('pointermove', onMove);
    doc.removeEventListener('pointerup', onUp);
    doc.removeEventListener('pointercancel', onCancel);
    doc.removeEventListener('keydown', onKey);
    cur.el.removeEventListener('dragstart', preventNative);
    if (cur.pointerId !== undefined && typeof cur.el.releasePointerCapture === 'function') {
      try {
        cur.el.releasePointerCapture(cur.pointerId);
      } catch {
        // capture was never taken
      }
    }
    cur.ghost?.remove();
    cur.el.classList.remove('gm-item--placeholder');
    cur.swapTarget?.classList.remove('gm-item--swap-target', 'gm-item--swap-blocked');
    ctx.marker.hidden = true;
    ctx.marker.classList.remove('gm-marker--blocked');
  }

  function cancel(): void {
    cleanup();
  }

  return { bind, unbind, cancel };
}
