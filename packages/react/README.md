# @grid-master/react

React bindings for [`@grid-master/core`](https://www.npmjs.com/package/@grid-master/core), a dashboard grid where widgets flow left to right into a fixed number of columns and can be dragged and resized. The layout is an ordered list: array order is position, there are no x/y coordinates.

Requires React 19. Safe under `<StrictMode>` and for server rendering: the grid touches the DOM only in effects, and React does not re-render while you drag.

## Install

`react`, `react-dom` and `@grid-master/core` are peer dependencies, so install them together:

```sh
pnpm add @grid-master/react @grid-master/core react react-dom
# or: npm install @grid-master/react @grid-master/core react react-dom
```

## Styles

Import the grid stylesheet once, in your entry file:

```ts
import '@grid-master/core/grid.css';
```

## Usage

```tsx
import { useState } from 'react';
import { Grid, Widget, type LayoutItem } from '@grid-master/react';
import '@grid-master/core/grid.css';

export function Dashboard() {
  const [layout, setLayout] = useState<LayoutItem[]>([
    { id: 'a', w: 2, h: 2 },
    { id: 'b', w: 1, h: 1 },
    { id: 'c', w: 1, h: 1, locked: true },
  ]);

  return (
    <Grid columns={4} dropMode="insert" layout={layout} onLayoutChange={setLayout}>
      {layout.map((i) => (
        <Widget key={i.id} id={i.id}>
          <Widget.Handle>{i.id}</Widget.Handle>
          <p>Widget content</p>
        </Widget>
      ))}
    </Grid>
  );
}
```

- `<Grid>` renders the grid container (a `div` with the class `gm-grid` and `display: grid`). Each `<Widget id>` is a widget; the id must match a layout entry.
- `Widget.Handle` marks the only element a widget can be dragged by. Without one, the whole widget is the drag surface.

### Rules

- **The layout is controlled.** You own `layout`; update it from `onLayoutChange`. The grid never keeps its own copy. Changing `layout` from outside never calls `onLayoutChange`.
- **Widgets must be `<Widget>` elements that are direct DOM children of the grid.** A wrapper component is fine as long as it renders the `Widget` element itself (`function Card(p) { return <Widget id={p.id}>...</Widget>; }`), including one that shows, hides or re-ids its widget from its own state, or a `<Suspense>` boundary around widgets: every `Widget` tells the grid when it commits or unmounts, so the grid picks it up without re-rendering. An extra wrapper `<div>` between the grid and the widgets is not fine: those widgets are not found. A plain `<div data-grid-id>` is not a supported widget either.
- **Key widgets by id** (`key={item.id}`). The grid emits copies of the items, so keying by object identity or by index would remount widgets after every drop.
- **Interactive controls don't start drags.** In a widget without a handle, `input`, `textarea`, `select`, `button`, `option`, `label`, `a[href]`, `contenteditable` elements and anything inside `[data-grid-no-drag]` ignore pointer-down for dragging. For a custom control (a canvas, a map), add `data-grid-no-drag` to it, or give the widget a `Widget.Handle`. A widget root that is itself a link, label or button can still be dragged; put `data-grid-no-drag` on the root to opt out.
- **Locked widgets** (`locked: true`) can't be dragged or resized and keep their index.

## API

### `<Grid>`

Extra props (`className`, `style`, `data-*`, ...) go to the container `div`. `className` is appended to `gm-grid`; `display: grid` is always applied, so `<Grid hidden>` stays visible: wrap the grid in an element you hide, or hide it with CSS (`display: none !important`).

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `layout` | `LayoutItem[]` | required | The layout, owned by the parent. |
| `columns` | `number` | required | Number of columns. |
| `onLayoutChange` | `(layout: LayoutItem[]) => void` | none | A drop or resize is released, `addItem` / `removeItem` succeed, or a `columns` change normalizes widths. |
| `dropMode` | `'insert' \| 'block' \| 'shrink' \| 'swap'` | `'insert'` | Changeable at runtime. |
| `maxRows` | `number` | none | Hard row limit for drops, resizes and `addItem`. |
| `rowHeight` | `number` | `80` | Row height in px. |
| `gap` | `number` | `8` | Gap between cells in px. |
| `breakpoint` | `number` | `640` | Container width in px below which the narrow view is used. |
| `ghost` | `(el: HTMLElement) => HTMLElement` | sanitized clone | Builds the drag ghost (see the core README). |
| `onReject` | `(reason: RejectReason) => void` | none | An `addItem` is refused (`'max-rows'`, `'duplicate'` or `'invalid'`). |
| `ref` | `Ref<GridHandle>` | none | Imperative `addItem` / `removeItem`, see below. |

### `<Widget>` and `Widget.Handle`

`<Widget id>` renders a `div` with the class `gm-item` and `data-grid-id={id}` (not a DOM `id`); `Widget.Handle` renders a `span` with `data-grid-handle`. Other props go to the element, but the grid attributes always win: `className` is appended to `gm-item`.

- Changing a widget's `className` while it is being dragged drops the core's drag-state classes (`gm-item--placeholder`, `gm-item--swap-target`, `gm-item--swap-blocked`) until the pointer moves again (swap target) or the next drag (placeholder). The drag and its drop are not affected.
- `dangerouslySetInnerHTML` on a `Widget` is not supported: the grid adds its own resize handle inside the widget, and React's inner HTML replaces the widget's whole content. Set it on an element inside the widget instead.

### Adding widgets: use the ref

```tsx
import { useRef, useState } from 'react';
import { Grid, Widget, type GridHandle, type LayoutItem } from '@grid-master/react';

export function Dashboard() {
  const grid = useRef<GridHandle>(null);
  const [layout, setLayout] = useState<LayoutItem[]>([]);

  function add() {
    const result = grid.current!.addItem({ id: crypto.randomUUID(), w: 1, h: 1 });
    if (!result.ok) console.warn('not added:', result.reason);
  }

  return (
    <>
      <button type="button" onClick={add}>
        Add
      </button>
      <Grid ref={grid} columns={4} layout={layout} onLayoutChange={setLayout}>
        {layout.map((i) => (
          <Widget key={i.id} id={i.id}>
            {i.id}
          </Widget>
        ))}
      </Grid>
    </>
  );
}
```

| Method | Description |
| --- | --- |
| `addItem(item: LayoutItem, index?: number): DropResult` | Inserts at `index` (default: append). On success calls `onLayoutChange` with the new layout; otherwise calls `onReject` and returns `{ ok: false, reason }`. Consecutive calls in one handler build on each other. |
| `removeItem(id: string): void` | Removes the item and calls `onLayoutChange`; an unknown id does nothing. |

Prefer `addItem` over `setLayout([...layout, item])`: it enforces `maxRows`, refuses duplicate ids and reports the refusal through `onReject`. A plain `setLayout` bypasses all of that, because the grid shows whatever layout it is given.

## Narrow view

When the grid is narrower than `breakpoint` (default 640 px), widgets stack in a single column in list order and resizing is disabled. Dragging still reorders them, but only temporarily: a narrow-view reorder never calls `onLayoutChange`, so your layout is untouched. Set `breakpoint={0}` to turn the narrow view off. Near the edges of a scroll container, dragging autoscrolls.

## Drop modes

`insert`, `block`, `shrink` and `swap` are described in the [core README](https://www.npmjs.com/package/@grid-master/core#drop-modes), together with locked widgets, `maxRows` and the layout JSON format.

## Demo

From the repository root: `pnpm --filter @grid-master/core build && pnpm --filter @grid-master/react demo`.

## License

MIT
