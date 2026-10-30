import {
  Component,
  Injector,
  NgZone,
  Type,
  afterEveryRender,
  provideZoneChangeDetection,
  signal,
  viewChild,
} from '@angular/core';
import { ComponentFixture, ComponentFixtureAutoDetect, TestBed } from '@angular/core/testing';
import type { DropMode, LayoutItem, RejectReason } from '@dash-builder/core';
import { DashGrid } from './grid.component';
import { DashWidget } from './widget.directive';

@Component({
  imports: [DashGrid, DashWidget],
  template: `<dash-grid [columns]="cols()" [dropMode]="mode()" [maxRows]="maxRows()" [breakpoint]="0" [(layout)]="layout" (layoutChange)="changes.push($event)" (reject)="rejects.push($event)">@for (i of layout(); track i.id) {<div [dashWidget]="i.id">{{ i.id }}</div>}</dash-grid>`,
})
class Host {
  readonly grid = viewChild.required(DashGrid);
  readonly cols = signal(4);
  readonly mode = signal<DropMode>('insert');
  readonly maxRows = signal<number | undefined>(undefined);
  readonly layout = signal<LayoutItem[]>([
    { id: 'a', w: 2, h: 1 },
    { id: 'b', w: 1, h: 1 },
  ]);
  readonly changes: LayoutItem[][] = [];
  readonly rejects: RejectReason[] = [];
}

@Component({
  imports: [DashGrid, DashWidget],
  template: `<dash-grid [columns]="4" [breakpoint]="0" [(layout)]="layout"><div [dashWidget]="ids()[0]">w</div></dash-grid>`,
})
class ReIdHost {
  readonly ids = signal(['x']);
  readonly layout = signal<LayoutItem[]>([{ id: 'b', w: 1, h: 1 }]);
}

@Component({
  imports: [DashGrid, DashWidget],
  template: `<dash-grid columns="2" maxRows="3" rowHeight="50" gap="4" breakpoint="0" [(layout)]="layout">@for (i of layout(); track i.id) {<div [dashWidget]="i.id">{{ i.id }}</div>}</dash-grid>`,
})
class StaticAttrHost {
  readonly grid = viewChild.required(DashGrid);
  readonly layout = signal<LayoutItem[]>([
    { id: 'a', w: 1, h: 1 },
    { id: 'b', w: 1, h: 1 },
    { id: 'c', w: 1, h: 1 },
  ]);
}

type Box = { left: number; top: number; right: number; bottom: number };
const PE: typeof MouseEvent = typeof PointerEvent !== 'undefined' ? PointerEvent : MouseEvent;

function rect(b: Box): DOMRect {
  return { ...b, x: b.left, y: b.top, width: b.right - b.left, height: b.bottom - b.top, toJSON() {} } as DOMRect;
}
const fire = (target: EventTarget, type: string, x: number, y: number) =>
  target.dispatchEvent(new PE(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0 }));
const down = (target: EventTarget, x: number, y: number) => fire(target, 'pointerdown', x, y);
const move = (x: number, y: number) => fire(document, 'pointermove', x, y);
const up = (x: number, y: number) => fire(document, 'pointerup', x, y);

const host = (f: ComponentFixture<unknown>) => f.nativeElement.querySelector('dash-grid') as HTMLElement;
const el = (f: ComponentFixture<unknown>, id: string) =>
  host(f).querySelector(`[data-grid-id="${id}"]`) as HTMLElement | null;
const col = (f: ComponentFixture<unknown>, id: string) => el(f, id)?.style.getPropertyValue('--dash-col') ?? '';
const domOrder = (f: ComponentFixture<unknown>) =>
  Array.from(host(f).querySelectorAll('[data-grid-id]')).map((n) => n.getAttribute('data-grid-id'));
const ids = (l: LayoutItem[]) => l.map((i) => i.id);

/** Two 1-wide widgets side by side in a 4-column grid, in the given DOM order. */
function stubRects(f: ComponentFixture<unknown>, order: string[]): void {
  host(f).getBoundingClientRect = () => rect({ left: 0, top: 0, right: 424, bottom: 400 });
  order.forEach((id, i) => {
    const left = i * 108;
    el(f, id)!.getBoundingClientRect = () => rect({ left, right: left + 100, top: 0, bottom: 80 });
  });
}

async function create<T>(type: Type<T>): Promise<ComponentFixture<T>> {
  const fixture = TestBed.createComponent(type);
  await fixture.whenStable();
  return fixture;
}

beforeEach(() => {
  // the core hit-tests synchronously when rAF is absent; Angular's scheduler falls back to setTimeout
  vi.stubGlobal('requestAnimationFrame', undefined);
  vi.stubGlobal('cancelAnimationFrame', undefined);
});
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // let post-drag click suppressors expire so they cannot leak into the next test
  await new Promise((r) => setTimeout(r, 0));
});

describe('dash-grid', () => {
  it('positions widgets from the layout', async () => {
    const f = await create(Host);
    expect(host(f).classList.contains('dash-grid')).toBe(true);
    expect(col(f, 'a')).toBe('1 / span 2');
    expect(col(f, 'b')).toBe('3 / span 1');
  });

  it('numeric inputs accept static attributes; maxRows stays undefined when bound to undefined', async () => {
    const f = await create(StaticAttrHost);
    const g = f.componentInstance.grid();
    expect([g.columns(), g.maxRows(), g.rowHeight(), g.gap(), g.breakpoint()]).toEqual([2, 3, 50, 4, 0]);
    expect(host(f).style.getPropertyValue('--dash-columns')).toBe('2');
    expect(host(f).style.getPropertyValue('--dash-row-height')).toBe('50px');
    expect(host(f).style.getPropertyValue('--dash-gap')).toBe('4px');
    expect(col(f, 'c')).toBe('1 / span 1'); // wraps at 2 columns

    const unset = await create(Host);
    expect(unset.componentInstance.grid().maxRows()).toBeUndefined();
  });

  it('setting layout from outside re-renders without emitting', async () => {
    const f = await create(Host);
    f.componentInstance.layout.set([
      { id: 'b', w: 1, h: 1 },
      { id: 'a', w: 2, h: 1 },
    ]);
    await f.whenStable();
    expect(col(f, 'b')).toBe('1 / span 1');
    expect(col(f, 'a')).toBe('2 / span 2');
    expect(f.componentInstance.changes).toEqual([]);
  });

  it('addItem appends and emits; refused add emits reject', async () => {
    const f = await create(Host);
    const h = f.componentInstance;
    h.layout.set([
      { id: 'a', w: 2, h: 1 },
      { id: 'b', w: 2, h: 1 },
    ]);
    h.maxRows.set(1);
    await f.whenStable();
    const before = h.layout();

    expect(h.grid().addItem({ id: 'z', w: 1, h: 1 })).toEqual({ ok: false, reason: 'max-rows' });
    await f.whenStable();
    expect(h.rejects).toEqual(['max-rows']);
    expect(h.layout()).toBe(before);
    expect(h.changes).toEqual([]);

    h.maxRows.set(undefined);
    await f.whenStable();
    const result = h.grid().addItem({ id: 'z', w: 1, h: 1 });
    expect(result.ok).toBe(true);
    await f.whenStable();
    expect(h.changes.length).toBe(1);
    expect(ids(h.changes[0]!)).toEqual(['a', 'b', 'z']);
    expect(col(f, 'z')).toBe('1 / span 1');
  });

  it('removeItem emits and the widget goes away', async () => {
    const f = await create(Host);
    const h = f.componentInstance;
    h.grid().removeItem('a');
    await f.whenStable();
    expect(h.changes.length).toBe(1);
    expect(ids(h.changes[0]!)).toEqual(['b']);
    expect(el(f, 'a')).toBeNull();
    expect(col(f, 'b')).toBe('1 / span 1');

    h.grid().removeItem('nope');
    await f.whenStable();
    expect(h.changes.length).toBe(1);
  });

  it('columns change emits the normalized layout exactly once', async () => {
    const f = await create(Host);
    const h = f.componentInstance;
    h.layout.set([{ id: 'a', w: 3, h: 1 }]);
    await f.whenStable();
    h.cols.set(2);
    await f.whenStable();
    expect(h.changes.length).toBe(1);
    expect(ids(h.changes[0]!)).toEqual(['a']);
    expect(h.changes[0]![0]!.w).toBe(2);
    expect(h.layout()[0]!.w).toBe(2);
    expect(col(f, 'a')).toBe('1 / span 2');
  });

  it('a columns change and a new layout in the same tick keep the new layout', async () => {
    const f = await create(Host);
    const h = f.componentInstance;
    h.layout.set([{ id: 'a', w: 3, h: 1 }]);
    await f.whenStable();
    h.layout.set([{ id: 'b', w: 1, h: 1 }]);
    h.cols.set(2);
    await f.whenStable();
    expect(ids(h.layout())).toEqual(['b']);
    expect(h.changes).toEqual([]);
    expect(el(f, 'a')).toBeNull();
    expect(col(f, 'b')).toBe('1 / span 1');
  });

  it('growing columns with a wider new layout in the same tick uses the new column count', async () => {
    const f = await create(Host);
    const h = f.componentInstance;
    h.cols.set(2);
    h.layout.set([{ id: 'a', w: 2, h: 1 }]);
    await f.whenStable();
    h.layout.set([{ id: 'a', w: 3, h: 1 }]);
    h.cols.set(4);
    await f.whenStable();
    expect(col(f, 'a')).toBe('1 / span 3');
    expect(h.changes).toEqual([]);
  });

  it('addItem enforces maxRows against the normalized layout (minH > h)', async () => {
    const f = await create(Host);
    const h = f.componentInstance;
    h.maxRows.set(3);
    h.layout.set([{ id: 'a', w: 4, h: 1, minH: 3 }]); // renders 3 rows tall
    await f.whenStable();
    const before = h.layout();
    expect(h.grid().addItem({ id: 'z', w: 1, h: 1 })).toEqual({ ok: false, reason: 'max-rows' });
    await f.whenStable();
    expect(h.rejects).toEqual(['max-rows']);
    expect(h.layout()).toBe(before);
    expect(h.changes).toEqual([]);
  });

  it('drag works end to end, and again after @for reorders the DOM', async () => {
    const f = await create(Host);
    const h = f.componentInstance;
    h.layout.set([
      { id: 'a', w: 1, h: 1 },
      { id: 'b', w: 1, h: 1 },
    ]);
    h.mode.set('swap');
    await f.whenStable();

    stubRects(f, ['a', 'b']);
    down(el(f, 'a')!, 50, 40);
    move(158, 40); // over b
    up(158, 40);
    await f.whenStable();
    expect(h.changes.length).toBe(1);
    expect(ids(h.changes[0]!)).toEqual(['b', 'a']);
    expect(domOrder(f)).toEqual(['b', 'a']);
    expect(col(f, 'b')).toBe('1 / span 1');
    expect(col(f, 'a')).toBe('2 / span 1');

    await new Promise((r) => setTimeout(r, 0)); // post-drag click suppressor
    stubRects(f, ['b', 'a']);
    down(el(f, 'a')!, 158, 40);
    move(50, 40); // over b
    up(50, 40);
    await f.whenStable();
    expect(h.changes.length).toBe(2);
    expect(ids(h.changes[1]!)).toEqual(['a', 'b']);
    expect(domOrder(f)).toEqual(['a', 'b']);
  });

  it('destroy mid-drag leaves no ghost', async () => {
    const f = await create(Host);
    stubRects(f, ['a', 'b']);
    const gridEl = host(f);
    down(el(f, 'a')!, 50, 40);
    move(158, 40);
    expect(document.querySelector('.dash-ghost')).not.toBeNull();
    f.destroy();
    expect(document.querySelector('.dash-ghost')).toBeNull();
    expect(gridEl.classList.contains('dash-grid')).toBe(false);
  });

  it("re-id'd widget rebinds", async () => {
    const f = await create(ReIdHost);
    const w = host(f).querySelector('[data-grid-id]') as HTMLElement;
    expect(w.style.getPropertyValue('--dash-col')).toBe('');
    f.componentInstance.ids.set(['b']);
    await f.whenStable();
    expect(w.getAttribute('data-grid-id')).toBe('b');
    expect(w.style.getPropertyValue('--dash-col')).toBe('1 / span 1');
  });

  it('core runs outside the Angular zone', async () => {
    const spy = vi.spyOn(TestBed.inject(NgZone), 'runOutsideAngular');
    await create(Host);
    // createGrid itself is the body of one of the calls: that call returns the controller
    const returned = spy.mock.results.map((r) => r.value as { setLayout?: unknown } | undefined);
    expect(returned.some((v) => typeof v?.setLayout === 'function')).toBe(true);
  });
});

// zone.js is loaded for the whole suite by the unit-test builder (it is a devDependency);
// test-providers.ts keeps the other specs zoneless, this block opts into zone change detection.
describe('dash-grid with zone.js', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZoneChangeDetection(), { provide: ComponentFixtureAutoDetect, useValue: true }],
    });
  });

  it('pointermoves during a drag run outside the zone and tick nothing; the drop emits', async () => {
    const f = await create(Host);
    const h = f.componentInstance;
    const zone = TestBed.inject(NgZone);
    const settle = () => new Promise((r) => setTimeout(r, 0)); // let anything scheduled run
    let entered = 0; // Angular-zone entries
    let ticks = 0; // application ticks (afterEveryRender runs once per ApplicationRef tick)
    const sub = zone.onUnstable.subscribe(() => entered++);
    afterEveryRender(() => ticks++, { injector: TestBed.inject(Injector) });

    // positive control (a real zone, not the zoneless no-op): work inside the zone ticks the app
    zone.run(() => {});
    await settle();
    expect(entered).toBe(1);
    expect(ticks).toBe(1);

    entered = 0;
    ticks = 0;
    stubRects(f, ['a', 'b']);
    down(el(f, 'a')!, 50, 40);
    move(80, 40);
    move(120, 40);
    move(158, 40); // over b
    expect(document.querySelector('.dash-ghost')).not.toBeNull();
    await settle();
    expect(entered).toBe(0);
    expect(ticks).toBe(0);

    up(158, 40);
    await f.whenStable();
    expect(entered).toBeGreaterThan(0);
    expect(ticks).toBeGreaterThan(0);
    expect(h.changes.length).toBe(1);
    expect(ids(h.changes[0]!)).toEqual(['b', 'a']);
    sub.unsubscribe();
  });
});
