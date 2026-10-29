import { ChangeDetectionStrategy, Component, computed, signal, viewChildren } from '@angular/core';
import type { ElementRef } from '@angular/core';
import { GmGrid, GmWidget, type LayoutItem } from '@grid-master/angular';
import { DEMO_LAYOUT, MODES } from '@grid-master/demo-kit';
import { DemoBlock } from './block';

@Component({
  selector: 'app-root',
  imports: [GmGrid, GmWidget, DemoBlock],
  templateUrl: './app.html',
  styleUrl: './app.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly modes = MODES;
  protected readonly layout = signal<LayoutItem[]>(structuredClone(DEMO_LAYOUT));
  protected readonly modeIndex = signal(0);
  protected readonly current = computed(() => MODES[this.modeIndex()]!);
  private readonly radios = viewChildren<ElementRef<HTMLButtonElement>>('radio');

  protected select(index: number): void {
    this.modeIndex.set(index);
  }

  /** Arrow/Home/End navigation of the radiogroup, same keys as the vanilla `createModeSwitch`. */
  protected onKeyDown(e: KeyboardEvent): void {
    const n = MODES.length;
    const index = this.modeIndex();
    let to: number;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        to = (index + 1) % n;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        to = (index + n - 1) % n;
        break;
      case 'Home':
        to = 0;
        break;
      case 'End':
        to = n - 1;
        break;
      default:
        return;
    }
    e.preventDefault();
    this.select(to);
    this.radios()[to]?.nativeElement.focus();
  }
}
