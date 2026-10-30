import { Directive, input } from '@angular/core';

/** Marks an element as a grid widget; the id is read by the core via `data-grid-id`. */
@Directive({
  selector: '[dashWidget]',
  host: { '[attr.data-grid-id]': 'dashWidget()' },
})
export class DashWidget {
  readonly dashWidget = input.required<string>();
}
