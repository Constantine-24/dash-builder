import { useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ComponentPropsWithoutRef, ReactNode, Ref } from 'react';
import { addItem as planAdd, createGrid, normalizeLayout, removeItem as planRemove } from '@dash-builder/core';
import type { DropMode, DropResult, GridController, GridOptions, LayoutItem, RejectReason } from '@dash-builder/core';
import { GridContext } from './context.js';
import type { GridContextValue } from './context.js';

export interface GridProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
  columns: number;
  /** The layout, owned by the parent: update it from `onLayoutChange`. */
  layout: LayoutItem[];
  onLayoutChange?: (layout: LayoutItem[]) => void;
  /** Default `'insert'`. */
  dropMode?: DropMode;
  maxRows?: number;
  /** Default 80 (px). */
  rowHeight?: number;
  /** Default 8 (px). */
  gap?: number;
  /** Below this container width the grid stacks in one column. Default 640 (px). */
  breakpoint?: number;
  ghost?: GridOptions['ghost'];
  onReject?: (reason: RejectReason) => void;
  children?: ReactNode;
  ref?: Ref<GridHandle>;
}

export interface GridHandle {
  /**
   * Adds `item` at `index` (default: append), enforcing `maxRows`. On success
   * `onLayoutChange` is called with the new layout; otherwise `onReject` gets the reason.
   */
  addItem(item: LayoutItem, index?: number): DropResult;
  /** Removes the item with `id`; an unknown id changes nothing and calls nothing. */
  removeItem(id: string): void;
}

function shallowEqual(a: CSSProperties | undefined, b: CSSProperties | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a) as (keyof CSSProperties)[];
  return ka.length === Object.keys(b).length && ka.every((k) => Object.is(a[k], b[k]));
}

/**
 * A dashboard grid around the `@dash-builder/core` controller. The rendered div is the
 * grid container; its direct `<Widget>` children are the widgets. Controlled: the
 * parent owns `layout`.
 */
export function Grid(props: GridProps) {
  const {
    columns,
    layout,
    onLayoutChange,
    dropMode = 'insert',
    maxRows,
    rowHeight = 80,
    gap = 8,
    breakpoint = 640,
    ghost,
    onReject,
    children,
    ref,
    className,
    style,
    ...divProps
  } = props;
  const opts = { columns, dropMode, maxRows, rowHeight, gap, breakpoint, ghost };

  const container = useRef<HTMLDivElement>(null);
  const controller = useRef<GridController | undefined>(undefined);
  /** The layout last handed to the controller. */
  const applied = useRef<LayoutItem[] | undefined>(undefined);
  /** Set while setOptions runs before a new layout replaces the current one. */
  const superseded = useRef(false);
  /** A widget committed (or unmounted) since the controller last rendered. */
  const dirty = useRef(false);
  /** The className and style the container was last rendered with. */
  const lastLook = useRef({ className, style });
  /**
   * The newest committed props, so callbacks never go stale and never re-create the
   * controller. addItem/removeItem also advance `layout` to what they emitted, so calls
   * chained before the parent re-renders compose; the next commit overwrites it.
   */
  const latest = useRef({ opts, layout, onLayoutChange, onReject });

  // Widgets call this after each of their commits and when they unmount. When the Grid
  // commits too, its sync effect below (which runs after its children's effects) refreshes
  // at once; otherwise (a wrapper's own state, a Suspense boundary resolving) the queued
  // microtask does, before the browser paints. Many requests make one refresh. Once the
  // controller is destroyed (unmount), a queued refresh finds none and does nothing.
  const [context] = useState<GridContextValue>(() => {
    let queued = false;
    return {
      requestRefresh() {
        dirty.current = true;
        if (queued) return;
        queued = true;
        queueMicrotask(() => {
          queued = false;
          if (!dirty.current || !controller.current) return;
          dirty.current = false;
          controller.current.refresh();
        });
      },
    };
  });

  // Declared first, so the effects below and anything after the commit see these props.
  useLayoutEffect(() => {
    latest.current = { opts, layout, onLayoutChange, onReject };
  });

  useLayoutEffect(() => {
    const el = container.current!;
    const { opts: o, layout: l } = latest.current;
    applied.current = l;
    controller.current = createGrid(el, {
      ...o,
      layout: l,
      onLayoutChange: (next) => {
        if (!superseded.current) latest.current.onLayoutChange?.(next);
      },
      onReject: (r) => latest.current.onReject?.(r),
    });
    dirty.current = false; // createGrid has bound and placed the widgets
    return () => {
      controller.current?.destroy();
      controller.current = undefined;
    };
  }, []);

  // After every commit: apply options and layout, then refresh if a widget committed or the
  // container was restyled. The core skips equal options and layouts.
  useLayoutEffect(() => {
    const g = controller.current;
    if (!g) return;
    if (layout !== applied.current) {
      applied.current = layout;
      // The layout re-normalized for new columns is about to be replaced: don't emit it.
      superseded.current = true;
      try {
        g.setOptions(opts);
      } finally {
        superseded.current = false;
      }
      g.setLayout(layout); // normalized against the new columns; no-op on our own echo
    } else {
      g.setOptions(opts); // a columns change may normalize the layout and emit
    }
    // A className or style change makes React rewrite the class attribute or style keys,
    // dropping what core set imperatively; core's render restores dash-grid--narrow and the
    // --dash-* variables (dash-grid and display: grid are rendered by React below).
    // dash-grid--dragging, set during a drag, is not restored: a className change mid-drag
    // drops it until the next drag (it only disables text selection / page scroll).
    const look = lastLook.current;
    const restyled = className !== look.className || !shallowEqual(style, look.style);
    lastLook.current = { className, style };
    // Every widget added, removed or re-id'd commits (or unmounts) itself, so `dirty` covers
    // what scanning the children's ids here would; a reorder needs no refresh (the core
    // places widgets by layout order, not DOM order).
    if (dirty.current || restyled) {
      dirty.current = false;
      g.refresh();
    }
  });

  useImperativeHandle(
    ref,
    () => ({
      addItem(item, index) {
        const { opts: o, layout: l, onLayoutChange: change, onReject: reject } = latest.current;
        const config = { columns: o.columns, maxRows: o.maxRows, mode: o.dropMode };
        // Plan on what the core renders (normalized), so maxRows holds for e.g. minH > h.
        const result = planAdd(normalizeLayout(l, o.columns), config, item, index);
        if (result.ok) {
          latest.current.layout = result.layout; // a following add/remove builds on this
          change?.(result.layout);
        } else {
          reject?.(result.reason);
        }
        return result;
      },
      removeItem(id) {
        const { layout: l, onLayoutChange: change } = latest.current;
        const next = planRemove(l, id);
        if (next === l) return;
        latest.current.layout = next; // a following add/remove builds on this
        change?.(next);
      },
    }),
    [],
  );

  return (
    <div
      {...divProps}
      // Core styles hang off dash-grid and need display: grid; rendering them here keeps them
      // when React rewrites the class attribute or style (and applies them in SSR markup).
      className={className ? `dash-grid ${className}` : 'dash-grid'}
      style={{ ...style, display: 'grid' }}
      ref={container}
    >
      <GridContext value={context}>{children}</GridContext>
    </div>
  );
}
