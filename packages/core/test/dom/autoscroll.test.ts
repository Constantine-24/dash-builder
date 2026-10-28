// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createAutoScroll, scrollStep } from '../../src/dom/autoscroll.js';

describe('scrollStep', () => {
  test('ramps linearly inside the zone and clamps at the edge', () => {
    expect(scrollStep(500, 0, 500)).toBe(16);
    expect(scrollStep(476, 0, 500)).toBe(8);
    expect(scrollStep(250, 0, 500)).toBe(0);
    expect(scrollStep(0, 0, 500)).toBe(-16);
    expect(scrollStep(-30, 0, 500)).toBe(-16);
    expect(scrollStep(600, 0, 500)).toBe(16);
  });
});

describe('createAutoScroll', () => {
  let queue: FrameRequestCallback[];
  let parent: HTMLElement;
  let container: HTMLElement;
  const frame = () => queue.shift()?.(0);

  beforeEach(() => {
    document.body.innerHTML = '';
    queue = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => queue.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => {
      queue.length = 0;
    });
    parent = document.createElement('div');
    parent.style.overflowY = 'auto';
    Object.defineProperty(parent, 'scrollHeight', { configurable: true, value: 1000 });
    Object.defineProperty(parent, 'clientHeight', { configurable: true, value: 400 });
    parent.getBoundingClientRect = () => ({ left: 0, right: 300, top: 0, bottom: 400, width: 300, height: 400 }) as DOMRect;
    container = document.createElement('div');
    parent.appendChild(container);
    document.body.appendChild(parent);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('scrolls the scrollable ancestor near its bottom edge and reports the delta', () => {
    const onScroll = vi.fn();
    const a = createAutoScroll(container, onScroll);
    a.move(395);
    frame();
    expect(parent.scrollTop).toBeGreaterThan(0);
    expect(onScroll).toHaveBeenCalledWith(parent.scrollTop);
    a.stop();
    const before = parent.scrollTop;
    frame();
    expect(parent.scrollTop).toBe(before);
    expect(queue).toHaveLength(0);
  });

  test('keeps scrolling frame after frame while the pointer stays in the zone', () => {
    const onScroll = vi.fn();
    const a = createAutoScroll(container, onScroll);
    a.move(400);
    frame();
    frame();
    expect(parent.scrollTop).toBe(32);
    expect(onScroll).toHaveBeenCalledTimes(2);
    a.stop();
  });

  test('does nothing outside the zone, and stops at the end of the range', () => {
    const onScroll = vi.fn();
    const a = createAutoScroll(container, onScroll);
    a.move(200);
    expect(queue).toHaveLength(0);
    parent.scrollTop = 600; // max scroll
    a.move(400);
    frame();
    expect(parent.scrollTop).toBe(600);
    expect(onScroll).not.toHaveBeenCalled();
    a.stop();
  });

  test('scrolls up near the top edge, clamped at 0', () => {
    const onScroll = vi.fn();
    parent.scrollTop = 10;
    const a = createAutoScroll(container, onScroll);
    a.move(0);
    frame();
    expect(parent.scrollTop).toBe(0);
    expect(onScroll).toHaveBeenCalledWith(-10);
    a.stop();
  });
});
