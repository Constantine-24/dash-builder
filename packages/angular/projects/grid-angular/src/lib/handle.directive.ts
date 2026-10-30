import { Directive } from '@angular/core';

/** Restricts drag start to this element within a widget (`data-grid-handle`). */
@Directive({
  selector: '[dashHandle]',
  host: { 'data-grid-handle': '' },
})
export class DashHandle {}
