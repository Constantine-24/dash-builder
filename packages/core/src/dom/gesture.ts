// Small helpers shared by the drag and resize interactions.

function preventNative(e: Event): void {
  e.preventDefault();
}

/**
 * While a gesture is active: no text selection (container class + body style +
 * selectstart) and no page scroll on touch. Returns the function that undoes it.
 */
export function holdGesture(doc: Document, container: HTMLElement, cls: string): () => void {
  container.classList.add(cls);
  const prevUserSelect = doc.body.style.userSelect;
  doc.body.style.userSelect = 'none';
  doc.addEventListener('selectstart', preventNative);
  doc.addEventListener('touchmove', preventNative, { passive: false });
  return () => {
    container.classList.remove(cls);
    doc.body.style.userSelect = prevUserSelect;
    doc.removeEventListener('selectstart', preventNative);
    doc.removeEventListener('touchmove', preventNative);
  };
}

/** Try to capture / release a pointer; synthetic or already-gone pointers throw and are ignored. */
export function capturePointer(el: Element, pointerId: number | undefined, on: boolean): void {
  if (pointerId === undefined) return;
  const fn = on ? el.setPointerCapture : el.releasePointerCapture;
  if (typeof fn !== 'function') return;
  try {
    fn.call(el, pointerId);
  } catch {
    // not an active pointer (synthetic event) or capture never taken; document listeners still work
  }
}

export interface ClickSwallow {
  /**
   * Swallow the next click. `released`: the gesture ended with pointerup, so the
   * blocker lives one tick. Otherwise (cancelled while the pointer is still down)
   * it expires one tick after the next pointerup, immediately on pointercancel or
   * a new pointerdown, and at the latest after 1s.
   */
  arm(released: boolean): void;
  disarm(): void;
}

// The release of a gesture must not activate buttons/links in the widget. One
// capture-phase click listener swallows the next click, and it always expires.
const PENDING_CAP_MS = 1000;

export function createClickSwallow(doc: Document): ClickSwallow {
  let armed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function swallowClick(e: Event): void {
    e.preventDefault();
    e.stopImmediatePropagation();
    disarm();
  }

  function expireAfterRelease(): void {
    removePendingListeners();
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(disarm, 0);
  }

  function removePendingListeners(): void {
    doc.removeEventListener('pointerup', expireAfterRelease, true);
    doc.removeEventListener('pointercancel', disarm, true);
    doc.removeEventListener('pointerdown', disarm, true);
  }

  function arm(released: boolean): void {
    disarm();
    armed = true;
    doc.addEventListener('click', swallowClick, true);
    if (released) {
      timer = setTimeout(disarm, 0);
      return;
    }
    doc.addEventListener('pointerup', expireAfterRelease, true);
    doc.addEventListener('pointercancel', disarm, true);
    doc.addEventListener('pointerdown', disarm, true);
    timer = setTimeout(disarm, PENDING_CAP_MS);
  }

  function disarm(): void {
    if (!armed) return;
    armed = false;
    doc.removeEventListener('click', swallowClick, true);
    removePendingListeners();
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  return { arm, disarm };
}
