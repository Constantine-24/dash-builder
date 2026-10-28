import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  NgZone,
  afterNextRender,
  afterRenderEffect,
  computed,
  contentChildren,
  effect,
  inject,
  input,
  model,
  output,
  untracked,
} from '@angular/core';
import { addItem as planAdd, createGrid, removeItem as planRemove } from '@grid-master/core';
import type { DropMode, DropResult, GridController, GridOptions, LayoutItem, RejectReason } from '@grid-master/core';
import { GmWidget } from './widget.directive';

/**
 * A dashboard grid around the `@grid-master/core` controller. The host element is
 * the grid container; projected `[gmWidget]` elements are its widgets.
 */
@Component({
  selector: 'gm-grid',
  template: '<ng-content />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GmGrid {
  readonly layout = model.required<LayoutItem[]>();
  readonly columns = input.required<number>();
  readonly dropMode = input<DropMode>('insert');
  readonly maxRows = input<number | undefined>();
  readonly rowHeight = input(80);
  readonly gap = input(8);
  readonly breakpoint = input(640);
  readonly ghost = input<GridOptions['ghost']>();

  readonly reject = output<RejectReason>();

  private readonly zone = inject(NgZone);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly widgets = contentChildren(GmWidget);
  private grid?: GridController;

  private readonly options = computed(() => ({
    columns: this.columns(),
    dropMode: this.dropMode(),
    maxRows: this.maxRows(),
    rowHeight: this.rowHeight(),
    gap: this.gap(),
    breakpoint: this.breakpoint(),
    ghost: this.ghost(),
  }));

  constructor() {
    afterNextRender(() => {
      this.grid = this.zone.runOutsideAngular(() =>
        createGrid(this.host, {
          ...untracked(this.options),
          layout: untracked(this.layout),
          onLayoutChange: (l) => this.zone.run(() => this.layout.set(l)),
          onReject: (r) => this.zone.run(() => this.reject.emit(r)),
        }),
      );
    });
    inject(DestroyRef).onDestroy(() => {
      this.grid?.destroy();
      this.grid = undefined;
    });

    // Every controller call binds or unbinds DOM listeners, so all of them run outside the zone.
    effect(() => {
      const opts = this.options();
      this.outside((g) => g.setOptions(opts));
    });
    // No-op on the echo of our own layoutChange: the core skips equal layouts.
    effect(() => {
      const layout = this.layout();
      this.outside((g) => g.setLayout(layout));
    });
    // After the DOM update: bind added, re-id'd or reordered widgets, release removed ones.
    afterRenderEffect(() => {
      this.widgets().map((w) => w.gmWidget());
      this.outside((g) => g.refresh());
    });
  }

  /**
   * Adds `item` at `index` (default: append), enforcing `maxRows`. On success the
   * layout is updated and `layoutChange` emits; otherwise `reject` emits the reason.
   */
  addItem(item: LayoutItem, index?: number): DropResult {
    const config = { columns: this.columns(), maxRows: this.maxRows(), mode: this.dropMode() };
    const result = planAdd(this.layout(), config, item, index);
    if (result.ok) this.layout.set(result.layout);
    else this.reject.emit(result.reason);
    return result;
  }

  /** Removes the item with `id`; an unknown id changes nothing and emits nothing. */
  removeItem(id: string): void {
    const current = this.layout();
    const next = planRemove(current, id);
    if (next !== current) this.layout.set(next);
  }

  private outside(fn: (grid: GridController) => void): void {
    const grid = this.grid;
    if (grid) this.zone.runOutsideAngular(() => fn(grid));
  }
}
