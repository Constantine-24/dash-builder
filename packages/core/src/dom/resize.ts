import { layoutsEqual } from '../engine/normalize.js';
import { planResize } from '../engine/resize.js';
import type { DropResult, EngineConfig, LayoutItem } from '../engine/types.js';
import { createAutoScroll } from './autoscroll.js';
import type { AutoScroll } from './autoscroll.js';
import { capturePointer, createClickSwallow, holdGesture } from './gesture.js';

/** The slice of controller state the resize interaction needs. */
export interface ResizeContext {
  container: HTMLElement;
  /** Managed widget elements by id. */
  items: ReadonlyMap<string, HTMLElement>;
  isNarrow(): boolean;
  /** The wide-view layout. */
  getLayout(): LayoutItem[];
  /** Wide-view engine config (columns, maxRows and drop mode). */
  config(): EngineConfig;
  /** Row height and gap in px. */
  metrics(): { rowHeight: number; gap: number };
  /** Adopt the new layout, render and emit. */
  commit(next: LayoutItem[]): void;
  /** Another interaction (drag) is active: refuse to start. */
  isBusy(): boolean;
}

export interface ResizeInteraction {
  /** The element leaves the managed set: cancel if it is the one being resized. */
  unbind(el: HTMLElement): void;
  /** Abort an active resize without changing anything. */
  cancel(): void;
  /** Teardown: abort, remove the delegated listener and any pending click blocker. */
  destroy(): void;
  isActive(): boolean;
}

const HANDLE = '.dash-resize-handle';
const CLICK_SLOP = 4; // px of pointer travel after which the release click is swallowed

interface Session {
  el: HTMLElement;
  handle: HTMLElement;
  id: string;
  pointerId: number | undefined;
  startX: number;
  startY: number;
  startW: number;
  startH: number;
  /** Pointer travelled at least CLICK_SLOP: the release must not click. */
  moved: boolean;
  w: number;
  h: number;
  plan: DropResult | null;
  preview: HTMLElement;
  release: () => void;
  auto: AutoScroll;
  /** Last pointer position, replayed when autoscroll moves the page under a still pointer. */
  lastX: number;
  lastY: number;
  /** Px autoscrolled since the gesture began; counts as pointer travel. */
  scrolled: number;
}

export function createResize(ctx: ResizeContext): ResizeInteraction {
  const { container } = ctx;
  const doc = container.ownerDocument;
  const clicks = createClickSwallow(doc);
  let s: Session | null = null;

  container.addEventListener('pointerdown', onDown);

  function onDown(e: PointerEvent): void {
    if (s || e.button !== 0 || ctx.isBusy() || ctx.isNarrow()) return;
    const target = e.target instanceof Element ? e.target : null;
    const handle = target?.closest<HTMLElement>(HANDLE);
    const el = handle?.parentElement;
    if (!handle || !el) return;
    // only our own handles: a direct child of a managed widget (not a nested grid's)
    const id = el.getAttribute('data-grid-id');
    if (id === null || ctx.items.get(id) !== el || el.hidden) return;
    const item = ctx.getLayout().find((i) => i.id === id);
    if (!item || item.locked) return;

    const r = el.getBoundingClientRect();
    const preview = doc.createElement('div');
    preview.className = 'dash-resize-preview';
    s = {
      el,
      handle,
      id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startW: r.width,
      startH: r.height,
      moved: false,
      w: item.w,
      h: item.h,
      plan: null,
      preview,
      release: holdGesture(doc, container, 'dash-grid--resizing'),
      auto: createAutoScroll(container, (dy) => {
        if (!s) return;
        s.scrolled += dy;
        update(s, s.lastX, s.lastY);
      }),
      lastX: e.clientX,
      lastY: e.clientY,
      scrolled: 0,
    };
    e.preventDefault(); // no focus change / native drag from the handle
    clicks.disarm();
    capturePointer(handle, e.pointerId, true);
    doc.addEventListener('pointermove', onMove);
    doc.addEventListener('pointerup', onUp);
    doc.addEventListener('pointercancel', onCancel);
    doc.addEventListener('keydown', onKey);
    doc.addEventListener('contextmenu', preventNative); // long-press menu on touch
    update(s, e.clientX, e.clientY);
  }

  const samePointer = (e: PointerEvent) =>
    s !== null && (s.pointerId === undefined || e.pointerId === undefined || e.pointerId === s.pointerId);

  function onMove(e: PointerEvent): void {
    if (!s || !samePointer(e)) return;
    e.preventDefault();
    update(s, e.clientX, e.clientY);
    s.auto.move(e.clientY);
  }

  function onUp(e: PointerEvent): void {
    if (!s || !samePointer(e)) return;
    const cur = s;
    update(cur, e.clientX, e.clientY);
    const list = ctx.getLayout();
    const plan = planResize(list, ctx.config(), cur.id, { w: cur.w, h: cur.h });
    cleanup();
    if (cur.moved) clicks.arm(true);
    if (plan.ok && !layoutsEqual(plan.layout, list)) ctx.commit(plan.layout);
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

  /** Content-box width of the container (no borders, scrollbar or padding): the width the grid tracks share. */
  function trackWidth(): number {
    const cs = doc.defaultView?.getComputedStyle(container);
    const pad = (v: string | undefined) => {
      const n = parseFloat(v ?? '');
      return Number.isFinite(n) ? n : 0;
    };
    return container.clientWidth - pad(cs?.paddingLeft) - pad(cs?.paddingRight);
  }

  /** Recomputes the candidate size for a pointer position and refreshes the preview. */
  function update(cur: Session, x: number, y: number): void {
    cur.lastX = x;
    cur.lastY = y;
    const dx = x - cur.startX;
    const dy = y - cur.startY + cur.scrolled;
    if (Math.hypot(dx, dy) >= CLICK_SLOP) cur.moved = true;
    const cfg = ctx.config();
    const { rowHeight, gap } = ctx.metrics();
    const colWidth = (trackWidth() - gap * (cfg.columns - 1)) / cfg.columns;
    const item = ctx.getLayout().find((i) => i.id === cur.id);
    if (!item) return;
    // same clamp planResize applies, so the preview shows the size that would be committed
    const w = Math.min(cfg.columns, Math.max(item.minW ?? 1, Math.round((cur.startW + dx + gap) / (colWidth + gap))));
    const h = Math.max(item.minH ?? 1, Math.round((cur.startH + dy + gap) / (rowHeight + gap)));
    if (cur.plan && w === cur.w && h === cur.h) return;
    cur.w = w;
    cur.h = h;
    cur.plan = planResize(ctx.getLayout(), cfg, cur.id, { w, h });
    showPreview(cur, colWidth, rowHeight, gap);
  }

  function showPreview(cur: Session, colWidth: number, rowHeight: number, gap: number): void {
    // container-relative coordinates in the preview's containing block (padding box, scrolled)
    const c = container.getBoundingClientRect();
    const ox = c.left + container.clientLeft - container.scrollLeft;
    const oy = c.top + container.clientTop - container.scrollTop;
    const r = cur.el.getBoundingClientRect();
    const p = cur.preview;
    Object.assign(p.style, {
      left: `${r.left - ox}px`,
      top: `${r.top - oy}px`,
      width: `${cur.w * colWidth + (cur.w - 1) * gap}px`,
      height: `${cur.h * rowHeight + (cur.h - 1) * gap}px`,
    });
    p.classList.toggle('dash-resize-preview--blocked', cur.plan !== null && !cur.plan.ok);
    if (p.parentElement !== container) container.appendChild(p);
  }

  function cleanup(): void {
    const cur = s;
    if (!cur) return;
    s = null;
    cur.auto.stop();
    doc.removeEventListener('pointermove', onMove);
    doc.removeEventListener('pointerup', onUp);
    doc.removeEventListener('pointercancel', onCancel);
    doc.removeEventListener('keydown', onKey);
    doc.removeEventListener('contextmenu', preventNative);
    capturePointer(cur.handle, cur.pointerId, false);
    cur.release();
    cur.preview.remove();
  }

  /** Programmatic / Escape cancel. A resize whose pointer moved and is still down swallows its release click. */
  function cancel(): void {
    const cur = s;
    cleanup();
    if (cur?.moved) clicks.arm(false);
  }

  function unbind(el: HTMLElement): void {
    if (s?.el === el) cancel();
  }

  function destroy(): void {
    cleanup();
    clicks.disarm();
    container.removeEventListener('pointerdown', onDown);
  }

  return { unbind, cancel, destroy, isActive: () => s !== null };
}
