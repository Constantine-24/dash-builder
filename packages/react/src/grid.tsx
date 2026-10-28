import { useImperativeHandle, useLayoutEffect, useRef } from 'react';
import type { CSSProperties, ComponentPropsWithoutRef, ReactNode, Ref } from 'react';
import { addItem as planAdd, createGrid, normalizeLayout, removeItem as planRemove } from '@grid-master/core';
import type { DropMode, DropResult, GridController, GridOptions, LayoutItem, RejectReason } from '@grid-master/core';

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

/** The ids of the container's direct `data-grid-id` children, in DOM order. */
function idSignature(container: HTMLElement): string {
  const ids: string[] = [];
  for (const child of Array.from(container.children)) {
    const id = child.getAttribute('data-grid-id');
    if (id !== null) ids.push(id);
  }
  return ids.join('\n');
}

function shallowEqual(a: CSSProperties | undefined, b: CSSProperties | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a) as (keyof CSSProperties)[];
  return ka.length === Object.keys(b).length && ka.every((k) => Object.is(a[k], b[k]));
}

/**
 * A dashboard grid around the `@grid-master/core` controller. The rendered div is the
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
  /** The widget ids (and order) the controller last saw. */
  const lastIds = useRef('');
  /** The className and style the container was last rendered with. */
  const lastLook = useRef({ className, style });
  /**
   * The newest committed props, so callbacks never go stale and never re-create the
   * controller. addItem/removeItem also advance `layout` to what they emitted, so calls
   * chained before the parent re-renders compose; the next commit overwrites it.
   */
  const latest = useRef({ opts, layout, onLayoutChange, onReject });

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
    lastIds.current = idSignature(el); // createGrid has bound these
    return () => {
      controller.current?.destroy();
      controller.current = undefined;
    };
  }, []);

  // After every commit: apply options and layout, then rebind if widgets were added,
  // removed, re-id'd or reordered. The core skips equal options and layouts.
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
    const ids = idSignature(container.current!);
    // A className or style change makes React rewrite the class attribute or style keys,
    // dropping what core set imperatively; core's render restores gm-grid--narrow and the
    // --gm-* variables (gm-grid and display: grid are rendered by React below).
    // gm-grid--dragging, set during a drag, is not restored: a className change mid-drag
    // drops it until the next drag (it only disables text selection / page scroll).
    const look = lastLook.current;
    const restyled = className !== look.className || !shallowEqual(style, look.style);
    lastLook.current = { className, style };
    if (ids !== lastIds.current || restyled) {
      lastIds.current = ids;
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
      // Core styles hang off gm-grid and need display: grid; rendering them here keeps them
      // when React rewrites the class attribute or style (and applies them in SSR markup).
      className={className ? `gm-grid ${className}` : 'gm-grid'}
      style={{ ...style, display: 'grid' }}
      ref={container}
    >
      {children}
    </div>
  );
}
