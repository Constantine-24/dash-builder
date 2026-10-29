import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { GmHandle } from '@grid-master/angular';
import { CHART_POINTS, blockInfo } from '@grid-master/demo-kit';

/**
 * Fills one grid widget with `blockInfo(id)`, using the same markup as the vanilla and React blocks.
 * It is an attribute component on the `[gmWidget]` element itself, so that element stays a direct child of
 * `<gm-grid>` and carries the `demo-block` classes.
 */
@Component({
  selector: '[demoBlock]',
  imports: [GmHandle],
  host: {
    '[class]': 'hostClass()',
    '[style.--block-accent]': 'info().accent',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let i = info();
    @if (i.kind === 'map') {
      <span class="demo-block__grip" gmHandle><span aria-hidden="true">⠿</span> drag</span>
    }
    <div class="demo-block__title">{{ i.title }}</div>
    @switch (i.kind) {
      @case ('number') {
        @if (i.value) {
          <div class="demo-block__value">{{ i.value }}</div>
        }
      }
      @case ('note') {
        @if (i.value) {
          <div class="demo-block__text">{{ i.value }}</div>
        }
      }
      @case ('chart') {
        <svg class="demo-block__chart" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
          <polygon [attr.points]="areaPoints" fill="currentColor" opacity="0.12" />
          <polyline
            [attr.points]="points"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            vector-effect="non-scaling-stroke"
            stroke-linejoin="round"
          />
        </svg>
      }
      @case ('list') {
        <ul class="demo-block__list">
          @for (item of i.items ?? []; track item) {
            <li>{{ item }}</li>
          }
        </ul>
      }
      @case ('form') {
        <div class="demo-block__form">
          <input type="text" placeholder="Your email" aria-label="Your email" />
          <button type="button" class="demo-block__button">Send</button>
        </div>
      }
      @case ('map') {
        <div class="demo-block__text">Only this handle starts a drag.</div>
      }
    }
  `,
})
export class DemoBlock {
  /** The widget id, passed to `blockInfo`. */
  readonly demoBlock = input.required<string>();
  readonly locked = input(false);

  protected readonly points = CHART_POINTS;
  protected readonly areaPoints = `${this.points} 100,40 0,40`;
  protected readonly info = computed(() => blockInfo(this.demoBlock()));
  protected readonly hostClass = computed(
    () => `demo-block demo-block--${this.info().kind}${this.locked() ? ' demo-block--locked' : ''}`,
  );
}
