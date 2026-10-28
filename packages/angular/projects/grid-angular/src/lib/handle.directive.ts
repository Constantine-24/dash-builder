import { Directive } from '@angular/core';

/** Restricts drag start to this element within a widget (`data-grid-handle`). */
@Directive({
  selector: '[gmHandle]',
  host: { 'data-grid-handle': '' },
})
export class GmHandle {}
