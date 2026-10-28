import type { DropMode, DropTarget } from './types.js';

/** Container-relative pixel rect of a rendered item. */
export interface ItemRect { id: string; left: number; top: number; right: number; bottom: number }

export type Marker =
  | { kind: 'line'; left: number; top: number; width: number; height: number } // width 0 = vertical line, height 0 = horizontal
  | { kind: 'outline'; id: string };

export interface Hit { target: DropTarget; marker: Marker }

type Axis = 'x' | 'y';

function lineBefore(r: ItemRect, axis: Axis): Marker {
  return axis === 'x'
    ? { kind: 'line', left: r.left, top: r.top, width: 0, height: r.bottom - r.top }
    : { kind: 'line', left: r.left, top: r.top, width: r.right - r.left, height: 0 };
}

function lineAfter(r: ItemRect, axis: Axis): Marker {
  return axis === 'x'
    ? { kind: 'line', left: r.right, top: r.top, width: 0, height: r.bottom - r.top }
    : { kind: 'line', left: r.left, top: r.bottom, width: r.right - r.left, height: 0 };
}

/**
 * Line at the spot the dragged item lands in `order` (the planned order): after the
 * nearest item before it that has a rect, else before the nearest one after it.
 */
export function landingMarker(rects: ItemRect[], order: string[], dragId: string, axis: Axis): Marker | null {
  const at = order.indexOf(dragId);
  if (at < 0) return null;
  const rectOf = (id: string) => rects.find((r) => r.id === id);
  for (let i = at - 1; i >= 0; i--) {
    const r = rectOf(order[i]!);
    if (r) return lineAfter(r, axis);
  }
  for (let i = at + 1; i < order.length; i++) {
    const r = rectOf(order[i]!);
    if (r) return lineBefore(r, axis);
  }
  return null;
}

/**
 * Turns a pointer position into a drop target plus marker geometry.
 * `rects` are in list order and include the dragged item, which is skipped.
 * Indexes are positions in the list without the dragged item. Targets drawn as
 * an "after" line (right/lower half, beside an item, end of list) carry `after: true`.
 */
export function resolveTarget(
  rects: ItemRect[],
  point: { x: number; y: number },
  dragId: string,
  mode: DropMode,
  axis: Axis,
): Hit | null {
  const others = rects.filter((r) => r.id !== dragId);
  const { x, y } = point;

  const insideIdx = others.findIndex((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);

  if (mode === 'swap') {
    if (insideIdx < 0) return null;
    const id = others[insideIdx]!.id;
    return { target: { swapWith: id }, marker: { kind: 'outline', id } };
  }

  if (insideIdx >= 0) {
    const r = others[insideIdx]!;
    const before = axis === 'x' ? x < (r.left + r.right) / 2 : y < (r.top + r.bottom) / 2;
    return before
      ? { target: { index: insideIdx }, marker: lineBefore(r, axis) }
      : { target: { index: insideIdx + 1, after: true }, marker: lineAfter(r, axis) };
  }

  if (axis === 'x') {
    let best = -1;
    others.forEach((r, i) => {
      if (y >= r.top && y <= r.bottom && r.right <= x && (best < 0 || r.right >= others[best]!.right)) best = i;
    });
    if (best >= 0) return { target: { index: best + 1, after: true }, marker: lineAfter(others[best]!, axis) };
  }

  if (others.length === 0) {
    return { target: { index: 0 }, marker: { kind: 'line', left: 0, top: 0, width: 0, height: 0 } };
  }
  if (y > Math.max(...others.map((r) => r.bottom))) {
    return { target: { index: others.length, after: true }, marker: lineAfter(others[others.length - 1]!, axis) };
  }
  return null;
}
