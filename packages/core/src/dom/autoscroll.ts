// Edge autoscroll shared by the drag and resize interactions.

const ZONE = 48; // px from the scroll area's top/bottom edge in which scrolling starts
const MAX_STEP = 16; // px per frame at (or beyond) the edge

/**
 * Px to scroll per frame for a pointer at `pointerY` in a scroll area spanning
 * `top`..`bottom`: negative near the top, positive near the bottom, 0 elsewhere,
 * growing linearly to ±max at the edge or beyond it.
 */
export function scrollStep(pointerY: number, top: number, bottom: number, zone = ZONE, max = MAX_STEP): number {
  if (pointerY < top + zone) return -max * Math.min(1, (top + zone - pointerY) / zone);
  if (pointerY > bottom - zone) return max * Math.min(1, (pointerY - (bottom - zone)) / zone);
  return 0;
}

export interface AutoScroll {
  /** Pointer position changed: start, retarget or end the scroll loop. */
  move(clientY: number): void;
  stop(): void;
}

/** Nearest ancestor that scrolls vertically, else the document's scrolling element. */
function findScroller(container: HTMLElement): HTMLElement | null {
  const view = container.ownerDocument.defaultView;
  for (let node = container.parentElement; node; node = node.parentElement) {
    const overflow = view?.getComputedStyle(node).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight) return node;
  }
  return container.ownerDocument.scrollingElement as HTMLElement | null;
}

/**
 * While the pointer is within the edge zone of the scroll target, scrolls it once
 * per animation frame and reports each step that actually moved (`onScroll(delta)`).
 */
export function createAutoScroll(container: HTMLElement, onScroll: (dy: number) => void): AutoScroll {
  const doc = container.ownerDocument;
  const target = findScroller(container);
  let y = 0;
  let frame: number | null = null;

  function edges(): [number, number] {
    if (!target || target === doc.scrollingElement) return [0, doc.defaultView?.innerHeight ?? 0];
    const r = target.getBoundingClientRect();
    return [r.top, r.bottom];
  }

  /** The step for the current pointer, 0 when outside the zone or already at that end of the range. */
  function pending(): number {
    if (!target) return 0;
    const [top, bottom] = edges();
    const step = scrollStep(y, top, bottom);
    const max = Math.max(0, target.scrollHeight - target.clientHeight);
    return (step < 0 && target.scrollTop <= 0) || (step > 0 && target.scrollTop >= max) ? 0 : step;
  }

  function tick(): void {
    frame = null;
    const step = pending();
    if (!target || step === 0) return; // the next move() restarts the loop
    const before = target.scrollTop;
    const max = Math.max(0, target.scrollHeight - target.clientHeight);
    target.scrollTop = Math.min(max, Math.max(0, before + step));
    const delta = target.scrollTop - before;
    if (delta === 0) return;
    onScroll(delta);
    request();
  }

  function request(): void {
    const raf = globalThis.requestAnimationFrame;
    if (frame === null && typeof raf === 'function') frame = raf(tick);
  }

  function move(clientY: number): void {
    y = clientY;
    if (pending() !== 0) request();
  }

  function stop(): void {
    if (frame === null) return;
    const caf = globalThis.cancelAnimationFrame;
    if (typeof caf === 'function') caf(frame);
    frame = null;
  }

  return { move, stop };
}
