import type { ComponentPropsWithRef } from 'react';

export type WidgetProps = { id: string } & Omit<ComponentPropsWithRef<'div'>, 'id'>;

/** A grid widget. `id` is the layout item id; it is exposed as `data-grid-id`, not as a DOM `id`. */
export function Widget({ id, ...rest }: WidgetProps) {
  return <div {...rest} data-grid-id={id} />;
}

/** Marks the part of a widget that starts a drag (when the grid uses handles). */
export function WidgetHandle(props: ComponentPropsWithRef<'span'>) {
  return <span {...props} data-grid-handle="" />;
}

Widget.Handle = WidgetHandle;
