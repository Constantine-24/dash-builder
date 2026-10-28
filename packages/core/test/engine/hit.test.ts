import { describe, expect, test } from 'vitest';
import { landingMarker, resolveTarget } from '../../src/engine/hit.js';
import type { ItemRect } from '../../src/engine/hit.js';

const rects: ItemRect[] = [
  { id: 'A', left: 0, right: 100, top: 0, bottom: 80 },
  { id: 'B', left: 108, right: 424, top: 0, bottom: 80 },
  { id: 'C', left: 0, right: 208, top: 88, bottom: 168 },
  { id: 'D', left: 216, right: 424, top: 88, bottom: 168 },
];

const stacked: ItemRect[] = [
  { id: 'A', left: 0, right: 200, top: 0, bottom: 80 },
  { id: 'B', left: 0, right: 200, top: 88, bottom: 168 },
];

describe('resolveTarget', () => {
  test('left half of A while dragging C -> index 0, line at left 0', () => {
    expect(resolveTarget(rects, { x: 30, y: 40 }, 'C', 'insert', 'x')).toEqual({
      target: { index: 0 },
      marker: { kind: 'line', left: 0, top: 0, width: 0, height: 80 },
    });
  });

  test('right half of B while dragging C -> index 2, line at left 424', () => {
    expect(resolveTarget(rects, { x: 380, y: 40 }, 'C', 'insert', 'x')).toEqual({
      target: { index: 2, after: true },
      marker: { kind: 'line', left: 424, top: 0, width: 0, height: 80 },
    });
  });

  test('below everything while dragging A -> end of list', () => {
    expect(resolveTarget(rects, { x: 300, y: 500 }, 'A', 'insert', 'x')).toEqual({
      target: { index: 3, after: true },
      marker: { kind: 'line', left: 424, top: 88, width: 0, height: 80 },
    });
  });

  test('swap mode over B while dragging C -> swapWith B with outline', () => {
    expect(resolveTarget(rects, { x: 200, y: 40 }, 'C', 'swap', 'x')).toEqual({
      target: { swapWith: 'B' },
      marker: { kind: 'outline', id: 'B' },
    });
  });

  test('swap mode over empty space -> null', () => {
    expect(resolveTarget(rects, { x: 300, y: 500 }, 'C', 'swap', 'x')).toBeNull();
  });

  test('axis y, lower half of first stacked item -> index 1, horizontal line', () => {
    expect(resolveTarget(stacked, { x: 50, y: 70 }, 'X', 'insert', 'y')).toEqual({
      target: { index: 1, after: true },
      marker: { kind: 'line', left: 0, top: 80, width: 200, height: 0 },
    });
  });

  test('beside an item in empty space (axis x) -> drop after nearest left item', () => {
    expect(resolveTarget(rects, { x: 300, y: 40 }, 'B', 'insert', 'x')).toEqual({
      target: { index: 1, after: true },
      marker: { kind: 'line', left: 100, top: 0, width: 0, height: 80 },
    });
  });

  test('empty list -> index 0 with zero line', () => {
    expect(resolveTarget([], { x: 10, y: 10 }, 'X', 'insert', 'x')).toEqual({
      target: { index: 0 },
      marker: { kind: 'line', left: 0, top: 0, width: 0, height: 0 },
    });
  });

  test('pointer over the dragged item itself falls through to empty-space rules', () => {
    expect(resolveTarget(rects, { x: 150, y: 120 }, 'C', 'insert', 'x')).toBeNull();
  });

  test('after is set only for after-lines: right half yes, left half no', () => {
    const right = resolveTarget(rects, { x: 380, y: 40 }, 'C', 'insert', 'x')!;
    const left = resolveTarget(rects, { x: 150, y: 40 }, 'C', 'insert', 'x')!;
    expect(right.target).toEqual({ index: 2, after: true });
    expect(left.target).toEqual({ index: 1 });
    expect('after' in left.target).toBe(false);
  });
});

describe('landingMarker', () => {
  test('line after the rect of the item before the dragged one in the planned order', () => {
    expect(landingMarker(rects, ['A', 'B', 'D', 'C'], 'D', 'x')).toEqual({
      kind: 'line', left: 424, top: 0, width: 0, height: 80,
    });
  });

  test('dragged item first: line before the following item', () => {
    expect(landingMarker(rects, ['D', 'A', 'B', 'C'], 'D', 'x')).toEqual({
      kind: 'line', left: 0, top: 0, width: 0, height: 80,
    });
  });

  test('stacked axis: horizontal line below the previous item', () => {
    expect(landingMarker(stacked, ['A', 'B'], 'B', 'y')).toEqual({
      kind: 'line', left: 0, top: 80, width: 200, height: 0,
    });
  });

  test('skips items without a rect; null for a lone item', () => {
    expect(landingMarker(rects, ['A', 'X', 'D'], 'D', 'x')).toEqual({ kind: 'line', left: 100, top: 0, width: 0, height: 80 });
    expect(landingMarker([rects[3]!], ['D'], 'D', 'x')).toBeNull();
  });
});
