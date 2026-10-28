import { Component, computed, signal, viewChild } from '@angular/core';
import { GmGrid, GmHandle, GmWidget, type DropMode, type LayoutItem, type RejectReason } from '@grid-master/angular';
import { BLOCKS, DEFAULT_LAYOUT, type Block } from './blocks';

const STORAGE_KEY = 'gm-demo-layout';
const COLORS = ['#fde68a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#ddd6fe', '#fed7aa'];

function parseLayout(raw: string | null): LayoutItem[] | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (
      Array.isArray(v) &&
      v.every((i) => i && typeof i.id === 'string' && typeof i.w === 'number' && typeof i.h === 'number')
    ) {
      return v as LayoutItem[];
    }
  } catch {
    // invalid JSON: fall through
  }
  return null;
}

function readSaved(): LayoutItem[] | null {
  try {
    return parseLayout(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

@Component({
  selector: 'app-root',
  imports: [GmGrid, GmWidget, GmHandle],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly grid = viewChild.required(GmGrid);

  protected readonly layout = signal<LayoutItem[]>(readSaved() ?? structuredClone(DEFAULT_LAYOUT));
  protected readonly mode = signal<DropMode>('insert');
  protected readonly limit = signal(false);
  protected readonly narrow = signal(false);
  protected readonly status = signal('Ready.');
  protected readonly maxRows = computed(() => (this.limit() ? 6 : undefined));
  protected readonly json = computed(() => JSON.stringify(this.layout(), null, 2));
  protected readonly modes: DropMode[] = ['insert', 'block', 'shrink', 'swap'];

  /** Content for blocks added at runtime; the layout JSON stays content-only. */
  private readonly extra = signal<Record<string, Block>>({});
  private nextId = 1;

  protected block(id: string): Block {
    return BLOCKS[id] ?? this.extra()[id] ?? { title: id, kind: 'note', color: '#e5e7eb' };
  }

  protected setMode(event: Event) {
    this.mode.set((event.target as HTMLSelectElement).value as DropMode);
  }

  protected setLimit(event: Event) {
    this.limit.set((event.target as HTMLInputElement).checked);
  }

  protected add() {
    let id: string;
    do {
      id = `new-${this.nextId++}`;
    } while (this.layout().some((i) => i.id === id));
    const w = 1 + Math.floor(Math.random() * 2);
    const color = COLORS[this.nextId % COLORS.length];
    this.extra.update((m) => ({ ...m, [id]: { title: `New ${id}`, kind: 'note', color } }));
    const result = this.grid().addItem({ id, w, h: 1 });
    // A refusal also arrives through (reject), which sets the reason in the status line.
    if (result.ok) this.status.set(`Added ${id} (${w}x1).`);
  }

  protected onReject(reason: RejectReason) {
    this.status.set(`Add refused: ${reason}`);
  }

  protected removeLast() {
    const item = [...this.layout()].reverse().find((i) => !i.locked);
    if (!item) {
      this.status.set('Nothing to remove.');
      return;
    }
    this.grid().removeItem(item.id);
    this.status.set(`Removed ${item.id}.`);
  }

  protected save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.layout()));
      this.status.set('Layout saved.');
    } catch {
      this.status.set('Save failed (storage unavailable).');
    }
  }

  protected restore() {
    const saved = readSaved();
    if (saved) {
      this.layout.set(saved);
      this.status.set('Layout restored.');
    } else {
      this.status.set('No saved layout.');
    }
  }

  protected reset() {
    this.layout.set(structuredClone(DEFAULT_LAYOUT));
    this.status.set('Layout reset.');
  }
}
