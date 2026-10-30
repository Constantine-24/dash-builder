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
  numberAttribute,
  output,
  untracked,
} from '@angular/core';
import { addItem as planAdd, createGrid, normalizeLayout, removeItem as planRemove } from '@dash-builder/core';
import type { DropMode, DropResult, GridController, GridOptions, LayoutItem, RejectReason } from '@dash-builder/core';
import { DashWidget } from './widget.directive';

/** `numberAttribute`, but unset (`undefined`, `null` or an empty attribute) stays `undefined`. */
function optionalNumber(value: unknown): number | undefined {
  return value == null || value === '' ? undefined : numberAttribute(value);
}

/**
 * A dashboard grid around the `@dash-builder/core` controller. The host element is
 * the grid container; projected `[dashWidget]` elements are its widgets.
 */
@Component({
  selector: 'dash-grid',
  template: '<ng-content />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashGrid {
  readonly layout = model.required<LayoutItem[]>();
  readonly columns = input.required<number, unknown>({ transform: numberAttribute });
  readonly dropMode = input<DropMode>('insert');
  readonly maxRows = input<number | undefined, unknown>(undefined, { transform: optionalNumber });
  readonly rowHeight = input<number, unknown>(80, { transform: numberAttribute });
  readonly gap = input<number, unknown>(8, { transform: numberAttribute });
  readonly breakpoint = input<number, unknown>(640, { transform: numberAttribute });
  readonly ghost = input<GridOptions['ghost']>();

  readonly reject = output<RejectReason>();

  private readonly zone = inject(NgZone);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly widgets = contentChildren(DashWidget);
  private grid?: GridController;
  /** The layout last handed to the controller. */
  private applied?: LayoutItem[];
  /** Set while setOptions runs before a new layout replaces the current one. */
  private superseded = false;

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
      const layout = (this.applied = untracked(this.layout));
      this.grid = this.zone.runOutsideAngular(() =>
        createGrid(this.host, {
          ...untracked(this.options),
          layout,
          onLayoutChange: (l) => {
            if (!this.superseded) this.zone.run(() => this.layout.set(l));
          },
          onReject: (r) => this.zone.run(() => this.reject.emit(r)),
        }),
      );
    });
    inject(DestroyRef).onDestroy(() => {
      this.grid?.destroy();
      this.grid = undefined;
    });

    // Options and layout in one effect, so a columns change and a new layout from the
    // same tick are applied together. Every controller call binds or unbinds DOM
    // listeners, so all of them run outside the zone.
    effect(() => {
      const opts = this.options();
      const layout = this.layout();
      this.outside((g) => {
        if (layout === this.applied) {
          g.setOptions(opts); // a columns change may normalize the layout and emit
          return;
        }
        this.applied = layout;
        // The layout re-normalized for new columns is about to be replaced: don't emit it.
        this.superseded = true;
        try {
          g.setOptions(opts);
        } finally {
          this.superseded = false;
        }
        g.setLayout(layout); // normalized against the new columns; no-op on our own echo
      });
    });
    // After the DOM update: bind added, re-id'd or reordered widgets, release removed ones.
    afterRenderEffect(() => {
      this.widgets().forEach((w) => w.dashWidget()); // tracks every widget id
      this.outside((g) => g.refresh());
    });
  }

  /**
   * Adds `item` at `index` (default: append), enforcing `maxRows`. On success the
   * layout is updated and `layoutChange` emits; otherwise `reject` emits the reason.
   */
  addItem(item: LayoutItem, index?: number): DropResult {
    const config = { columns: this.columns(), maxRows: this.maxRows(), mode: this.dropMode() };
    // Plan on what the core renders (normalized), so maxRows holds for e.g. minH > h.
    const result = planAdd(normalizeLayout(this.layout(), config.columns), config, item, index);
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
