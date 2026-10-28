import type { ComponentPropsWithRef } from 'react';

export type WidgetProps = { id: string } & Omit<ComponentPropsWithRef<'div'>, 'id'>;

/** A grid widget. `id` is the layout item id; it is exposed as `data-grid-id`, not as a DOM `id`. */
export function Widget({ id, ...rest }: WidgetProps) {
  return <div data-grid-id={id} {...rest} />;
}

/** Marks the part of a widget that starts a drag (when the grid uses handles). */
export function WidgetHandle(props: ComponentPropsWithRef<'span'>) {
  return <span data-grid-handle="" {...props} />;
}

Widget.Handle = WidgetHandle;
