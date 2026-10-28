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
  /** Re-apply touch-action to every bound widget (handles added/removed, lock changes). Called after render. */
  sync(): void;
  /** Teardown: abort any drag and remove every document listener, including a pending click blocker. */
  destroy(): void;
}

const THRESHOLD = 4; // px the pointer must travel before a drag starts
const LONG_PRESS_MS = 400; // touch on a handle-less widget: hold this long to arm
const LONG_PRESS_SLOP = 8; // px of movement that aborts a pending long-press (the page scrolls instead)
const LINE = 4; // marker line thickness in px
const HANDLE = '[data-grid-handle]';

interface Binding {
  id: string;
  onDown: (e: PointerEvent) => void;
  /** Handle element we set touch-action on, and its previous inline value. */
  touchEl: HTMLElement | null;
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
  /** Touch on a handle-less widget: starts after a long-press instead of the move threshold. */
  longPress: boolean;
  pressTimer: ReturnType<typeof setTimeout> | null;
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
  let bodyUserSelect = '';

  function bind(el: HTMLElement, id: string): void {
    unbind(el);
    const b: Binding = { id, onDown: (e) => onDown(el, e), touchEl: null, prevTouch: '' };
    el.addEventListener('pointerdown', b.onDown as EventListener);
    bindings.set(el, b);
    syncTouch(el, b);
  }

  function unbind(el: HTMLElement): void {
    const b = bindings.get(el);
    if (!b) return;
    if (s?.el === el) cancel();
    el.removeEventListener('pointerdown', b.onDown as EventListener);
    setTouchEl(b, null);
    bindings.delete(el);
  }

  /**
   * Only an unlocked widget's handle gets `touch-action: none`. Whole widgets keep
   * the browser default so touch scrolling works; they drag after a long-press.
   */
  function syncTouch(el: HTMLElement, b: Binding): void {
    const handle = el.querySelector<HTMLElement>(HANDLE);
    const locked = ctx.getList().find((i) => i.id === b.id)?.locked === true;
    setTouchEl(b, handle && !locked ? handle : null);
  }

  function setTouchEl(b: Binding, next: HTMLElement | null): void {
    if (b.touchEl === next) return;
    if (b.touchEl) b.touchEl.style.touchAction = b.prevTouch;
    b.touchEl = next;
    if (next) {
      b.prevTouch = next.style.touchAction;
      next.style.touchAction = 'none';
    }
  }

  function sync(): void {
    for (const [el, b] of bindings) syncTouch(el, b);
  }

  function onDown(el: HTMLElement, e: PointerEvent): void {
    if (s || e.button !== 0 || el.hidden) return;
    const b = bindings.get(el);
    const target = e.target instanceof Element ? e.target : null;
    if (!b || !target || !el.contains(target)) return;
    const resize = target.closest('.gm-resize-handle');
    if (resize && el.contains(resize)) return;
    const hasHandle = el.querySelector(HANDLE) !== null;
    if (hasHandle) {
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
      longPress: e.pointerType === 'touch' && !hasHandle,
      pressTimer: null,
      started: false,
      ghost: null,
      hit: null,
      plan: null,
      swapTarget: null,
      frame: null,
    };
    const cur = s;
    if (cur.longPress) {
      cur.pressTimer = setTimeout(() => {
        cur.pressTimer = null;
        if (s === cur && !cur.started) begin(cur);
      }, LONG_PRESS_MS);
    }
    disarmClickSwallow();
    doc.addEventListener('pointermove', onMove);
    doc.addEventListener('pointerup', onUp);
    doc.addEventListener('pointercancel', onCancel);
    doc.addEventListener('keydown', onKey);
    doc.addEventListener('contextmenu', preventNative); // long-press menu on touch
    el.addEventListener('dragstart', preventNative);
  }

  const samePointer = (e: PointerEvent) =>
    s !== null && (s.pointerId === undefined || e.pointerId === undefined || e.pointerId === s.pointerId);

  function onMove(e: PointerEvent): void {
    if (!s || !samePointer(e)) return;
    s.x = e.clientX;
    s.y = e.clientY;
    if (!s.started) {
      const dist = Math.hypot(s.x - s.startX, s.y - s.startY);
      if (s.longPress) {
        if (dist > LONG_PRESS_SLOP) cleanup(); // a scroll gesture, not a drag
        return;
      }
      if (dist < THRESHOLD) return;
      start(s);
    }
    e.preventDefault();
    placeGhost(s);
    schedule(s);
  }

  /** Long-press completed: start in place. */
  function begin(cur: Session): void {
    start(cur);
    placeGhost(cur);
    schedule(cur);
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
    if (cur.started) armClickSwallow(true);
    if (!plan?.ok || layoutsEqual(plan.layout, list)) return;
    if (narrow) ctx.setNarrowOrder(plan.layout.map((i) => i.id));
    else ctx.commit(plan.layout);
  }

  function onCancel(e: PointerEvent): void {
    if (samePointer(e)) cleanup(); // the browser took the pointer: no click follows
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
    if (cur.pointerId !== undefined && typeof cur.el.setPointerCapture === 'function') {
      try {
        cur.el.setPointerCapture(cur.pointerId);
      } catch {
        // not an active pointer (synthetic event); document listeners still work
      }
    }
    ctx.container.classList.add('gm-grid--dragging');
    bodyUserSelect = doc.body.style.userSelect;
    doc.body.style.userSelect = 'none';
    doc.addEventListener('selectstart', preventNative);
    doc.addEventListener('touchmove', preventNative, { passive: false }); // no page scroll mid-drag
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
    doc.removeEventListener('contextmenu', preventNative);
    cur.el.removeEventListener('dragstart', preventNative);
    if (cur.pressTimer !== null) clearTimeout(cur.pressTimer);
    if (cur.started) {
      if (cur.pointerId !== undefined && typeof cur.el.releasePointerCapture === 'function') {
        try {
          cur.el.releasePointerCapture(cur.pointerId);
        } catch {
          // capture was never taken
        }
      }
      ctx.container.classList.remove('gm-grid--dragging');
      doc.body.style.userSelect = bodyUserSelect;
      doc.removeEventListener('selectstart', preventNative);
      doc.removeEventListener('touchmove', preventNative);
    }
    cur.ghost?.remove();
    cur.el.classList.remove('gm-item--placeholder');
    cur.swapTarget?.classList.remove('gm-item--swap-target', 'gm-item--swap-blocked');
    ctx.marker.hidden = true;
    ctx.marker.classList.remove('gm-marker--blocked');
  }

  /** Programmatic / Escape cancel. A started drag whose pointer is still down swallows the click its release makes. */
  function cancel(): void {
    const cur = s;
    cleanup();
    if (cur?.started) armClickSwallow(false);
  }

  /** Teardown: abort without arming a click blocker, and drop any armed one. */
  function destroy(): void {
    cleanup();
    disarmClickSwallow();
  }

  // ---- click suppression after a real drag --------------------------------
  // The release of a drag must not activate buttons/links in the widget. One
  // capture-phase click listener swallows the next click. It always expires:
  // - after a pointerup ending the drag: one tick later;
  // - after a cancel while the pointer is still down: one tick after that
  //   pointer's pointerup, immediately on pointercancel (no click follows) or on
  //   any new pointerdown (a new gesture), and at the latest after PENDING_CAP_MS.
  const PENDING_CAP_MS = 1000;
  let swallowArmed = false;
  let swallowTimer: ReturnType<typeof setTimeout> | null = null;

  function swallowClick(e: Event): void {
    e.preventDefault();
    e.stopImmediatePropagation();
    disarmClickSwallow();
  }

  function expireAfterRelease(): void {
    removePendingListeners();
    if (swallowTimer !== null) clearTimeout(swallowTimer);
    swallowTimer = setTimeout(disarmClickSwallow, 0);
  }

  function removePendingListeners(): void {
    doc.removeEventListener('pointerup', expireAfterRelease, true);
    doc.removeEventListener('pointercancel', disarmClickSwallow, true);
    doc.removeEventListener('pointerdown', disarmClickSwallow, true);
  }

  function armClickSwallow(released: boolean): void {
    disarmClickSwallow();
    swallowArmed = true;
    doc.addEventListener('click', swallowClick, true);
    if (released) {
      swallowTimer = setTimeout(disarmClickSwallow, 0);
      return;
    }
    doc.addEventListener('pointerup', expireAfterRelease, true);
    doc.addEventListener('pointercancel', disarmClickSwallow, true);
    doc.addEventListener('pointerdown', disarmClickSwallow, true);
    swallowTimer = setTimeout(disarmClickSwallow, PENDING_CAP_MS);
  }

  function disarmClickSwallow(): void {
    if (!swallowArmed) return;
    swallowArmed = false;
    doc.removeEventListener('click', swallowClick, true);
    removePendingListeners();
    if (swallowTimer !== null) clearTimeout(swallowTimer);
    swallowTimer = null;
  }

  return { bind, unbind, cancel, sync, destroy };
}
