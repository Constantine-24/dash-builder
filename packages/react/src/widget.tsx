import { useContext, useLayoutEffect } from 'react';
import type { ComponentPropsWithRef } from 'react';
import { GridContext } from './context.js';

export type WidgetProps = { id: string } & Omit<ComponentPropsWithRef<'div'>, 'id'>;

/**
 * A grid widget. `id` is the layout item id; it is exposed as `data-grid-id`, not as a DOM `id`.
 *
 * React owns the element, so a commit can undo what the core set on it imperatively:
 * - `gm-item` is rendered here, because a `className` change rewrites the class attribute
 *   and the core adds `gm-item` only when it first binds an element. The drag-state classes
 *   (`gm-item--placeholder`, `--swap-target`, `--swap-blocked`) are set by the active drag,
 *   not by the core's render, so a `className` change in the middle of a drag drops them:
 *   the swap-target classes come back on the next pointer move, the placeholder class
 *   only with the next drag. The drag itself and its drop are unaffected.
 * - Text children are written with `textContent`, which deletes the core's resize handle.
 * - The widget may mount, unmount or change id without the `<Grid>` re-rendering (a wrapper
 *   with its own state, a Suspense boundary resolving).
 * So after every commit, and when it unmounts, a widget asks the grid for a refresh: the
 * core rescans its children and re-renders placement and handles. Requests coalesce into
 * one refresh, which does not cancel an active drag or resize.
 */
export function Widget({ id, className, ...rest }: WidgetProps) {
  const { requestRefresh } = useContext(GridContext);
  useLayoutEffect(() => {
    requestRefresh();
    return requestRefresh;
  });
  return <div {...rest} className={className ? `gm-item ${className}` : 'gm-item'} data-grid-id={id} />;
}

/** Marks the part of a widget that starts a drag (when the grid uses handles). */
export function WidgetHandle(props: ComponentPropsWithRef<'span'>) {
  return <span {...props} data-grid-handle="" />;
}

Widget.Handle = WidgetHandle;
