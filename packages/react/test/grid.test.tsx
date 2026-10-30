import { StrictMode, Suspense, createRef, use, useState } from 'react';
import type { CSSProperties, ReactElement, Ref } from 'react';
import { renderToString } from 'react-dom/server';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Grid, Widget } from '../src/index.js';
import type { DropMode, GridHandle, LayoutItem, RejectReason } from '../src/index.js';

type Box = { left: number; top: number; right: number; bottom: number };
const PE: typeof MouseEvent = typeof PointerEvent !== 'undefined' ? PointerEvent : MouseEvent;

function rect(b: Box): DOMRect {
  return { ...b, x: b.left, y: b.top, width: b.right - b.left, height: b.bottom - b.top, toJSON() {} } as DOMRect;
}
const fire = (target: EventTarget, type: string, x: number, y: number) =>
  target.dispatchEvent(new PE(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0 }));
const down = (target: EventTarget, x: number, y: number) => fire(target, 'pointerdown', x, y);
const move = (x: number, y: number) => fire(document, 'pointermove', x, y);
const up = (x: number, y: number) => act(() => void fire(document, 'pointerup', x, y));

let root: HTMLElement;
const grid = () => root.firstElementChild as HTMLElement;
const el = (id: string) => root.querySelector(`[data-grid-id="${id}"]`) as HTMLElement | null;
const col = (id: string) => el(id)?.style.getPropertyValue('--dash-col') ?? '';
const domOrder = () => Array.from(grid().querySelectorAll('[data-grid-id]')).map((n) => n.getAttribute('data-grid-id'));
const ids = (l: LayoutItem[]) => l.map((i) => i.id);

/** 1-wide widgets side by side in a 4-column grid, in the given DOM order. */
function stubRects(order: string[]): void {
  grid().getBoundingClientRect = () => rect({ left: 0, top: 0, right: 424, bottom: 400 });
  order.forEach((id, i) => {
    const left = i * 108;
    el(id)!.getBoundingClientRect = () => rect({ left, right: left + 100, top: 0, bottom: 80 });
  });
}

/** Swaps the two widgets (side by side, in `order`) by dragging the second onto the first. */
function swap(order: [string, string]): void {
  stubRects(order);
  down(el(order[1])!, 158, 40);
  move(50, 40); // over the first
  up(50, 40);
}

interface HostProps {
  initial: LayoutItem[];
  columns?: number;
  dropMode?: DropMode;
  maxRows?: number;
  changes: LayoutItem[][];
  rejects?: RejectReason[];
  gridRef?: Ref<GridHandle>;
  /** Called on every render; returns the onLayoutChange recorder for that render. */
  onRender?: () => (l: LayoutItem[]) => void;
  /** Pass a new inline ghost factory on every render. */
  inlineGhost?: boolean;
}

let bump: () => void = () => {};

/** Holds the layout in state. A new `initial` prop replaces it in the same render. */
function Host({ initial, columns = 4, dropMode, maxRows, changes, rejects, gridRef, onRender, inlineGhost }: HostProps) {
  const [layout, setLayout] = useState(initial);
  const [prev, setPrev] = useState(initial);
  const [, setTick] = useState(0);
  bump = () => setTick((n) => n + 1);
  if (prev !== initial) {
    setPrev(initial);
    setLayout(initial);
  }
  const record = onRender?.();
  return (
    <Grid
      ref={gridRef}
      columns={columns}
      dropMode={dropMode}
      maxRows={maxRows}
      breakpoint={0}
      layout={layout}
      onLayoutChange={(l) => {
        changes.push(l);
        record?.(l);
        setLayout(l);
      }}
      onReject={(r) => rejects?.push(r)}
      ghost={inlineGhost ? () => Object.assign(document.createElement('div'), { className: 'my-ghost' }) : undefined}
    >
      {layout.map((i) => (
        <Widget key={i.id} id={i.id}>
          {i.id}
        </Widget>
      ))}
    </Grid>
  );
}

function mount(ui: ReactElement) {
  const r = render(ui);
  root = r.container;
  return r;
}

const AB: LayoutItem[] = [
  { id: 'a', w: 2, h: 1 },
  { id: 'b', w: 1, h: 1 },
];
const SMALL: LayoutItem[] = [
  { id: 'a', w: 1, h: 1 },
  { id: 'b', w: 1, h: 1 },
];

let errors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // the core hit-tests synchronously when rAF is absent
  vi.stubGlobal('requestAnimationFrame', undefined);
  vi.stubGlobal('cancelAnimationFrame', undefined);
  errors = vi.spyOn(console, 'error');
});
afterEach(async () => {
  cleanup();
  // no React warnings (act, keys, unknown props, ...) in any test
  expect(errors).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // let post-drag click suppressors expire so they cannot leak into the next test
  await new Promise((r) => setTimeout(r, 0));
});

describe('Grid', () => {
  it('positions widgets from the layout', () => {
    mount(<Host initial={AB} changes={[]} />);
    expect(grid().classList.contains('dash-grid')).toBe(true);
    expect(col('a')).toBe('1 / span 2');
    expect(col('b')).toBe('3 / span 1');
  });

  it('a new layout prop re-renders without emitting', () => {
    const changes: LayoutItem[][] = [];
    const { rerender } = mount(<Host initial={AB} changes={changes} />);
    rerender(
      <Host
        initial={[
          { id: 'b', w: 1, h: 1 },
          { id: 'a', w: 2, h: 1 },
        ]}
        changes={changes}
      />,
    );
    expect(col('b')).toBe('1 / span 1');
    expect(col('a')).toBe('2 / span 2');
    expect(changes).toEqual([]);
  });

  it('addItem via ref appends and emits; a refused add calls onReject', () => {
    const changes: LayoutItem[][] = [];
    const rejects: RejectReason[] = [];
    const ref = createRef<GridHandle>();
    const full: LayoutItem[] = [
      { id: 'a', w: 2, h: 1 },
      { id: 'b', w: 2, h: 1 },
    ];
    const props = { initial: full, changes, rejects, gridRef: ref };
    const { rerender } = mount(<Host {...props} maxRows={1} />);

    let result;
    act(() => void (result = ref.current!.addItem({ id: 'z', w: 1, h: 1 })));
    expect(result).toEqual({ ok: false, reason: 'max-rows' });
    expect(rejects).toEqual(['max-rows']);
    expect(changes).toEqual([]);
    expect(el('z')).toBeNull();

    // planned on the normalized layout: minH 3 renders a 3 rows tall
    const tall: LayoutItem[] = [{ id: 'a', w: 4, h: 1, minH: 3 }];
    rerender(<Host {...props} initial={tall} maxRows={3} />);
    act(() => void (result = ref.current!.addItem({ id: 'z', w: 1, h: 1 })));
    expect(result).toEqual({ ok: false, reason: 'max-rows' });
    expect(rejects).toEqual(['max-rows', 'max-rows']);
    expect(changes).toEqual([]);

    rerender(<Host {...props} />);
    act(() => void (result = ref.current!.addItem({ id: 'z', w: 1, h: 1 })));
    expect(result!.ok).toBe(true);
    expect(changes.length).toBe(1);
    expect(ids(changes[0]!)).toEqual(['a', 'b', 'z']);
    expect(col('z')).toBe('1 / span 1');
  });

  it('chained addItem/removeItem calls in one handler compose', () => {
    const changes: LayoutItem[][] = [];
    const ref = createRef<GridHandle>();
    mount(<Host initial={SMALL} changes={changes} gridRef={ref} />);
    act(() => {
      ref.current!.addItem({ id: 'x', w: 1, h: 1 });
      ref.current!.addItem({ id: 'y', w: 1, h: 1 });
    });
    expect(changes.map(ids)).toEqual([
      ['a', 'b', 'x'],
      ['a', 'b', 'x', 'y'],
    ]);
    expect(domOrder()).toEqual(['a', 'b', 'x', 'y']);
    expect(col('y')).toBe('4 / span 1');

    act(() => {
      ref.current!.addItem({ id: 'z', w: 1, h: 1 });
      ref.current!.removeItem('a');
    });
    expect(ids(changes.at(-1)!)).toEqual(['b', 'x', 'y', 'z']);
    expect(domOrder()).toEqual(['b', 'x', 'y', 'z']);
    expect(col('b')).toBe('1 / span 1');
  });

  it('removeItem via ref emits and the widget goes away', () => {
    const changes: LayoutItem[][] = [];
    const ref = createRef<GridHandle>();
    mount(<Host initial={AB} changes={changes} gridRef={ref} />);
    act(() => ref.current!.removeItem('a'));
    expect(changes.length).toBe(1);
    expect(ids(changes[0]!)).toEqual(['b']);
    expect(el('a')).toBeNull();
    expect(col('b')).toBe('1 / span 1');

    act(() => ref.current!.removeItem('nope'));
    expect(changes.length).toBe(1);
  });

  it('columns change emits the normalized layout exactly once', () => {
    const changes: LayoutItem[][] = [];
    const initial = [{ id: 'a', w: 3, h: 1 }];
    const { rerender } = mount(<Host initial={initial} changes={changes} />);
    rerender(<Host initial={initial} columns={2} changes={changes} />);
    expect(changes.length).toBe(1);
    expect(ids(changes[0]!)).toEqual(['a']);
    expect(changes[0]![0]!.w).toBe(2);
    expect(col('a')).toBe('1 / span 2');
  });

  it('columns change plus a new layout keeps the new layout', () => {
    const changes: LayoutItem[][] = [];
    const { rerender } = mount(<Host initial={[{ id: 'a', w: 3, h: 1 }]} changes={changes} />);
    rerender(<Host initial={[{ id: 'b', w: 1, h: 1 }]} columns={2} changes={changes} />);
    expect(changes).toEqual([]);
    expect(el('a')).toBeNull();
    expect(col('b')).toBe('1 / span 1');
    expect(grid().style.getPropertyValue('--dash-columns')).toBe('2');

    // growing columns with a wider new layout uses the new column count
    rerender(<Host initial={[{ id: 'b', w: 3, h: 1 }]} columns={4} changes={changes} />);
    expect(changes).toEqual([]);
    expect(col('b')).toBe('1 / span 3');
    expect(grid().style.getPropertyValue('--dash-columns')).toBe('4');
  });

  it('drag works end to end, and again after React reorders the DOM', async () => {
    const changes: LayoutItem[][] = [];
    mount(<Host initial={SMALL} dropMode="swap" changes={changes} />);

    swap(['a', 'b']);
    expect(changes.length).toBe(1);
    expect(ids(changes[0]!)).toEqual(['b', 'a']);
    expect(domOrder()).toEqual(['b', 'a']);
    expect(col('b')).toBe('1 / span 1');
    expect(col('a')).toBe('2 / span 1');

    await new Promise((r) => setTimeout(r, 0)); // post-drag click suppressor
    swap(['b', 'a']);
    expect(changes.length).toBe(2);
    expect(ids(changes[1]!)).toEqual(['a', 'b']);
    expect(domOrder()).toEqual(['a', 'b']);
    expect(col('a')).toBe('1 / span 1');
  });

  it("a parent re-render during a drag doesn't disturb it", () => {
    const changes: LayoutItem[][] = [];
    mount(<Host initial={SMALL} dropMode="swap" changes={changes} inlineGhost />);
    stubRects(['a', 'b']);
    down(el('b')!, 158, 40);
    move(120, 40); // past the threshold
    expect(document.querySelector('.dash-ghost.my-ghost')).not.toBeNull();
    act(() => bump()); // also passes a new ghost function
    expect(document.querySelector('.dash-ghost.my-ghost')).not.toBeNull();
    expect(document.querySelector('.dash-ghost')).not.toBeNull();
    move(50, 40); // over a
    up(50, 40);
    expect(changes.length).toBe(1);
    expect(ids(changes[0]!)).toEqual(['b', 'a']);
    expect(domOrder()).toEqual(['b', 'a']);
  });

  it('StrictMode: one controller', () => {
    const changes: LayoutItem[][] = [];
    mount(
      <StrictMode>
        <Host initial={SMALL} dropMode="swap" changes={changes} />
      </StrictMode>,
    );
    expect(col('a')).toBe('1 / span 1');
    expect(grid().querySelectorAll('.dash-marker').length).toBe(1);
    swap(['a', 'b']);
    expect(changes.length).toBe(1);
    expect(ids(changes[0]!)).toEqual(['b', 'a']);
    expect(domOrder()).toEqual(['b', 'a']);
    expect(grid().querySelectorAll('.dash-marker').length).toBe(1);
  });

  it('inline callbacks: no re-create, newest callback wins', () => {
    const changes: LayoutItem[][] = [];
    const calledBy: number[] = [];
    let renders = 0;
    const onRender = () => {
      const n = ++renders;
      return () => calledBy.push(n);
    };
    const { rerender } = mount(<Host initial={SMALL} dropMode="swap" changes={changes} onRender={onRender} />);
    const container = grid();
    const marker = container.querySelector('.dash-marker');
    rerender(<Host initial={SMALL} dropMode="swap" changes={changes} onRender={onRender} />);
    rerender(<Host initial={SMALL} dropMode="swap" changes={changes} onRender={onRender} />);
    expect(renders).toBe(3);
    expect(container.classList.contains('dash-grid')).toBe(true);
    expect(container.querySelector('.dash-marker')).toBe(marker); // same controller

    swap(['a', 'b']);
    expect(calledBy).toEqual([3]);
    expect(changes.length).toBe(1);
    expect(container.classList.contains('dash-grid')).toBe(true);
  });

  it('unmount mid-drag leaves no ghost', () => {
    const { unmount } = mount(<Host initial={SMALL} changes={[]} />);
    stubRects(['a', 'b']);
    down(el('a')!, 50, 40);
    move(158, 40);
    expect(document.querySelector('.dash-ghost')).not.toBeNull();
    unmount();
    expect(document.querySelector('.dash-ghost')).toBeNull();
  });

  it('a className change keeps the core classes and variables', () => {
    const layout = [{ id: 'a', w: 2, h: 1 }];
    const ui = (cls: string, breakpoint: number) => (
      <Grid columns={4} breakpoint={breakpoint} layout={layout} className={cls}>
        <Widget id="a">a</Widget>
      </Grid>
    );
    // wide (breakpoint 0)
    const { rerender, unmount } = mount(ui('one', 0));
    rerender(ui('two', 0));
    expect(grid().classList.contains('dash-grid')).toBe(true);
    expect(grid().classList.contains('two')).toBe(true);
    expect(grid().classList.contains('one')).toBe(false);
    expect(grid().classList.contains('dash-grid--narrow')).toBe(false);
    expect(grid().style.getPropertyValue('--dash-columns')).toBe('4');
    expect(grid().style.display).toBe('grid');
    expect(col('a')).toBe('1 / span 2');
    unmount();

    // narrow (happy-dom's clientWidth is 0, below the default 640 breakpoint)
    const narrow = mount(ui('one', 640));
    expect(grid().classList.contains('dash-grid--narrow')).toBe(true);
    narrow.rerender(ui('two', 640));
    expect(grid().classList.contains('dash-grid')).toBe(true);
    expect(grid().classList.contains('dash-grid--narrow')).toBe(true);
    expect(grid().classList.contains('two')).toBe(true);
    expect(grid().style.getPropertyValue('--dash-columns')).toBe('1');
  });

  it('a style change that drops display keeps display: grid and the variables', () => {
    const layout = [{ id: 'a', w: 1, h: 1 }];
    const ui = (style: CSSProperties) => (
      <Grid columns={3} breakpoint={0} layout={layout} style={style}>
        <Widget id="a">a</Widget>
      </Grid>
    );
    const { rerender } = mount(ui({ display: 'block', color: 'red', ['--dash-gap' as string]: '1px' }));
    expect(grid().style.display).toBe('grid');
    rerender(ui({ color: 'blue' }));
    expect(grid().style.display).toBe('grid');
    expect(grid().style.color).toBe('blue');
    expect(grid().style.getPropertyValue('--dash-columns')).toBe('3');
    expect(grid().style.getPropertyValue('--dash-gap')).toBe('8px');
    expect(grid().classList.contains('dash-grid')).toBe(true);
  });

  it('widget id change rebinds', () => {
    const layout = [{ id: 'b', w: 1, h: 1 }];
    const ui = (id: string) => (
      <Grid columns={4} breakpoint={0} layout={layout}>
        <Widget id={id}>w</Widget>
      </Grid>
    );
    const { rerender } = mount(ui('x'));
    const w = root.querySelector('[data-grid-id]') as HTMLElement;
    expect(w.style.getPropertyValue('--dash-col')).toBe('');
    rerender(ui('b'));
    expect(root.querySelector('[data-grid-id]')).toBe(w);
    expect(w.getAttribute('data-grid-id')).toBe('b');
    expect(w.style.getPropertyValue('--dash-col')).toBe('1 / span 1');
  });

  it('wrapper component renders a direct child', () => {
    function Card({ id }: { id: string }) {
      return (
        <Widget id={id}>
          <p>card {id}</p>
        </Widget>
      );
    }
    mount(
      <Grid columns={4} breakpoint={0} layout={[{ id: 'a', w: 2, h: 1 }]}>
        <Card id="a" />
      </Grid>,
    );
    expect(col('a')).toBe('1 / span 2');
  });
});

describe('Widget inside Grid', () => {
  const handle = (id: string) => el(id)!.querySelector(':scope > .dash-resize-handle');

  it('a Widget className change keeps dash-item and the placement', () => {
    const layout = [{ id: 'a', w: 2, h: 1 }];
    const ui = (cls?: string) => (
      <Grid columns={4} breakpoint={0} layout={layout}>
        <Widget id="a" className={cls}>
          a
        </Widget>
      </Grid>
    );
    const { rerender } = mount(ui('one'));
    expect(el('a')!.classList.contains('dash-item')).toBe(true);
    rerender(ui('two'));
    expect(el('a')!.classList.contains('dash-item')).toBe(true);
    expect(el('a')!.classList.contains('two')).toBe(true);
    expect(el('a')!.classList.contains('one')).toBe(false);
    expect(col('a')).toBe('1 / span 2');
    rerender(ui(undefined));
    expect(el('a')!.classList.contains('dash-item')).toBe(true);
    expect(el('a')!.classList.contains('two')).toBe(false);
    expect(col('a')).toBe('1 / span 2');
  });

  it('a text child update keeps the resize handle; so does an element <-> text switch', () => {
    const layout = [{ id: 'a', w: 1, h: 1 }];
    const ui = (child: ReactElement | string | number) => (
      <Grid columns={4} breakpoint={0} layout={layout}>
        <Widget id="a">{child}</Widget>
      </Grid>
    );
    const { rerender } = mount(ui('one'));
    expect(handle('a')).not.toBeNull();
    rerender(ui('two'));
    expect(el('a')!.firstChild!.textContent).toBe('two');
    expect(handle('a')).not.toBeNull();
    rerender(ui(3));
    expect(handle('a')).not.toBeNull();
    rerender(ui(<p>element</p>));
    expect(el('a')!.querySelector('p')).not.toBeNull();
    expect(handle('a')).not.toBeNull();
    rerender(ui('text again'));
    expect(el('a')!.querySelector('p')).toBeNull();
    expect(handle('a')).not.toBeNull();
  });

  it('a wrapper that mounts its Widget from its own state gets it bound and placed', async () => {
    let show: (v: boolean) => void = () => {};
    function Late({ id }: { id: string }) {
      const [on, setOn] = useState(false);
      show = setOn;
      return on ? <Widget id={id}>{id}</Widget> : null;
    }
    mount(
      <Grid columns={4} breakpoint={0} layout={SMALL}>
        <Widget id="a">a</Widget>
        <Late id="b" />
      </Grid>,
    );
    expect(el('b')).toBeNull();
    await act(async () => show(true));
    expect(el('b')!.classList.contains('dash-item')).toBe(true);
    expect(col('b')).toBe('2 / span 1');
    expect(handle('b')).not.toBeNull();

    // unmounting and remounting it from its own state binds the new element
    await act(async () => show(false));
    expect(el('b')).toBeNull();
    await act(async () => show(true));
    expect(col('b')).toBe('2 / span 1');
    expect(handle('b')).not.toBeNull();
  });

  it('a wrapper changing its Widget id from its own state rebinds it', async () => {
    let setId: (id: string) => void = () => {};
    function Reid() {
      const [id, set] = useState('x'); // not in the layout: the core hides it
      setId = set;
      return <Widget id={id}>{id}</Widget>;
    }
    mount(
      <Grid columns={4} breakpoint={0} layout={SMALL}>
        <Widget id="a">a</Widget>
        <Reid />
      </Grid>,
    );
    expect(el('x')!.hidden).toBe(true);
    await act(async () => setId('b'));
    expect(el('b')!.hidden).toBe(false);
    expect(col('b')).toBe('2 / span 1');
    expect(handle('b')).not.toBeNull();
  });

  it('Suspense inside the grid: the resolved widget replaces the fallback and is placed', async () => {
    let resolve!: (v: string) => void;
    const text = new Promise<string>((r) => (resolve = r));
    function Loaded({ id }: { id: string }) {
      return <Widget id={id}>{use(text)}</Widget>;
    }
    await act(async () => {
      mount(
        <Grid columns={4} breakpoint={0} layout={SMALL}>
          <Widget id="a">a</Widget>
          <Suspense
            fallback={
              <Widget id="b" className="fallback">
                loading
              </Widget>
            }
          >
            <Loaded id="b" />
          </Suspense>
        </Grid>,
      );
    });
    expect(el('b')!.classList.contains('fallback')).toBe(true);
    expect(col('b')).toBe('2 / span 1');
    await act(async () => {
      resolve('ready');
      await text;
    });
    const b = el('b')!;
    expect(b.textContent).toBe('ready');
    expect(b.classList.contains('fallback')).toBe(false);
    expect(b.classList.contains('dash-item')).toBe(true);
    expect(col('b')).toBe('2 / span 1');
    expect(handle('b')).not.toBeNull();

    // the core drags the real element, not a detached fallback
    stubRects(['a', 'b']);
    down(b, 158, 40);
    move(50, 40);
    expect(b.classList.contains('dash-item--placeholder')).toBe(true);
    up(50, 40);
  });

  it("a widget's own text changing mid-drag doesn't disturb the drag; the drop commits", async () => {
    let tick: () => void = () => {};
    function Ticking({ id }: { id: string }) {
      const [n, setN] = useState(0);
      tick = () => setN((x) => x + 1);
      return <Widget id={id}>{`${id} ${n}`}</Widget>;
    }
    const changes: LayoutItem[][] = [];
    function Board() {
      const [layout, setLayout] = useState(SMALL);
      return (
        <Grid
          columns={4}
          breakpoint={0}
          dropMode="swap"
          layout={layout}
          onLayoutChange={(l) => {
            changes.push(l);
            setLayout(l);
          }}
        >
          {layout.map((i) =>
            i.id === 'b' ? (
              <Ticking key="b" id="b" />
            ) : (
              <Widget key={i.id} id={i.id}>
                {i.id}
              </Widget>
            ),
          )}
        </Grid>
      );
    }
    mount(<Board />);
    stubRects(['a', 'b']);
    down(el('b')!, 158, 40);
    move(120, 40); // past the threshold
    expect(el('b')!.classList.contains('dash-item--placeholder')).toBe(true);
    await act(async () => tick());
    expect(el('b')!.firstChild!.textContent).toBe('b 1');
    expect(handle('b')).not.toBeNull();
    expect(el('b')!.classList.contains('dash-item--placeholder')).toBe(true);
    expect(document.querySelector('.dash-ghost')).not.toBeNull();
    move(50, 40); // over a
    up(50, 40);
    expect(changes.length).toBe(1);
    expect(ids(changes[0]!)).toEqual(['b', 'a']);
    expect(domOrder()).toEqual(['b', 'a']);
    expect(handle('b')).not.toBeNull();
  });

  it('SSR: renders to a string', () => {
    const html = renderToString(
      <Grid columns={4} layout={[{ id: 'a', w: 1, h: 1 }]}>
        <Widget id="a" />
      </Grid>,
    );
    expect(html).toContain('class="dash-item" data-grid-id="a"');
  });
});
