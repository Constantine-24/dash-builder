import { useImperativeHandle, useLayoutEffect, useRef } from 'react';
import type { ComponentPropsWithoutRef, ReactNode, Ref } from 'react';
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
  /** The newest props, so callbacks never go stale and never re-create the controller. */
  const latest = useRef({ opts, layout, onLayoutChange, onReject });
  latest.current = { opts, layout, onLayoutChange, onReject };

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
    if (ids !== lastIds.current) {
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
        if (result.ok) change?.(result.layout);
        else reject?.(result.reason);
        return result;
      },
      removeItem(id) {
        const { layout: l, onLayoutChange: change } = latest.current;
        const next = planRemove(l, id);
        if (next !== l) change?.(next);
      },
    }),
    [],
  );

  return (
    <div {...divProps} ref={container}>
      {children}
    </div>
  );
}
