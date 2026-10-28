import { Directive, input } from '@angular/core';

/** Marks an element as a grid widget; the id is read by the core via `data-grid-id`. */
@Directive({
  selector: '[gmWidget]',
  host: { '[attr.data-grid-id]': 'gmWidget()' },
})
export class GmWidget {
  readonly gmWidget = input.required<string>();
}
