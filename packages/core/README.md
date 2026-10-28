# @grid-master/core

A framework-free TypeScript dashboard grid. Widgets flow left to right into a fixed number of columns, wrap into rows, and can be dragged and resized. There are no free x/y coordinates: the layout is an ordered list, and the grid positions the widgets from it.

## Install

```sh
pnpm add @grid-master/core
# or: npm install @grid-master/core
```

The package is ESM-only (`"type": "module"`, no CommonJS build): use `import`, not `require`.

## Usage

The grid reads widgets from the DOM. Each direct child of the container that has a `data-grid-id` attribute is a widget, and its id must match an entry in `layout`.

```html
<div id="grid">
  <div data-grid-id="a">Widget A</div>
  <div data-grid-id="b"><span data-grid-handle>drag here</span> Widget B</div>
  <div data-grid-id="c">Widget C</div>
</div>
```

```ts
import { createGrid } from '@grid-master/core';
import '@grid-master/core/grid.css';
import type { LayoutItem } from '@grid-master/core';

const save = (layout: LayoutItem[]) => localStorage.setItem('dashboard-layout', JSON.stringify(layout));

const grid = createGrid(document.getElementById('grid')!, {
  columns: 4,
  layout: [
    { id: 'a', w: 2, h: 2 },
    { id: 'b', w: 1, h: 1 },
    { id: 'c', w: 1, h: 1, locked: true },
  ],
  dropMode: 'insert',
  onLayoutChange: (layout) => save(layout),
});
```

### DOM contract

- Widgets are direct children of the container with a `data-grid-id` attribute. The first element with a given id wins; later duplicates are hidden. Widgets without a layout entry are hidden.
- A widget containing a `[data-grid-handle]` element can only be dragged by that element. Without one, the whole widget is the drag surface.
- The controller scans the container on every render. After you add or remove widget elements yourself, call `grid.refresh()` so it binds new elements and releases removed ones.
- The container gets the `gm-grid` class and `display: grid`; widgets get `gm-item`. Both are removed again by `destroy()`.

### Options

| Option | Default | Description |
| --- | --- | --- |
| `columns` | required | Number of columns. |
| `layout` | required | Ordered list of `LayoutItem`s. |
| `dropMode` | `'insert'` | `'insert'`, `'block'`, `'shrink'` or `'swap'`. |
| `maxRows` | none | Refuse a drop, resize or `addItem` whose result needs more rows than both `maxRows` and the current layout (see below). |
| `rowHeight` | `80` | Row height in px. |
| `gap` | `8` | Gap between widgets in px. |
| `breakpoint` | `640` | Container width in px below which the narrow view is used. |
| `onLayoutChange` | none | Called with a copy of the layout after a drop, a resize, `addItem`, `removeItem`, or when `setOptions({ columns })` changes widths. |
| `onReject` | none | Called with a `RejectReason` when `addItem` is refused. |
| `ghost` | sanitized clone | `(el: HTMLElement) => HTMLElement`: builds the element that follows the pointer during a drag. The grid adds the `gm-ghost` class, sizes and positions it, appends it to `body` and removes it on drop. |

The default ghost is a deep clone of the widget with every `id` attribute removed, `name` removed from radio inputs (so the clone can't steal the original's checked state), each `iframe`, `video` and `audio` replaced by an empty box of the same rendered size (no reload, no second playback), and each `canvas` given a copy of the original's pixels (left blank if the canvas can't be read, for example when it is tainted). Pass `ghost` when you want something lighter, such as a plain box with a title.

### Controller

```ts
grid.setLayout(layout);           // replace the layout (no onLayoutChange); a no-op if it equals the current one
grid.setOptions({ dropMode: 'swap' }); // change options at runtime (any option except layout, including callbacks and ghost)
grid.addItem({ id: 'd', w: 1, h: 1 }, index?); // returns { ok: true, layout } or { ok: false, reason }
grid.removeItem('d');
grid.getLayout();                 // a copy of the current layout
grid.refresh();                   // re-scan the DOM and re-render
grid.destroy();                   // remove listeners, classes and inline styles
```

Notes:

- `addItem` only inserts into the layout. Create the element with its `data-grid-id` and append it to the container before calling `addItem`; remove it again if the result is not `ok`. For `removeItem`, call it first, then remove the element and call `refresh()`.
- `addItem` and `removeItem` cancel an active drag or resize. So does `setLayout`, but only when the new layout differs from the current one after normalizing (an equal layout changes nothing, and a temporary narrow-view order is kept). `setOptions` cancels only when `columns`, `dropMode`, `maxRows`, `breakpoint`, `rowHeight` or `gap` actually changes value; changing callbacks or `ghost`, or passing equal values, never interrupts the user.
- `addItem(item, index)` may shift a locked widget's index. Locks constrain the user's drags, not your own calls; the same goes for `removeItem` and `setLayout`.
- `setLayout` (and `createGrid`) normalize the layout silently: widths are clamped to `[minW, columns]`, heights to at least `minH`, sizes are truncated to integers and non-finite values become their minimum. The normalized layout is not emitted; you see it in `getLayout()` and in the next `onLayoutChange`.
- `setOptions({ columns })` re-normalizes widths to the new column count and calls `onLayoutChange` if that changed any width.
- After `destroy()`, `setLayout`, `setOptions`, `addItem` (returns `{ ok: false, reason: 'invalid' }`), `removeItem` and `refresh` do nothing; `getLayout()` still returns a copy of the last layout and `destroy()` can be called again safely.
- `onLayoutChange` is the only notification of change. Treat it as the source of truth for saving state.

## Layout JSON

```ts
interface LayoutItem {
  id: string;       // matches data-grid-id
  w: number;        // width in columns, clamped to [minW ?? 1, columns]
  h: number;        // height in rows, at least minH ?? 1
  minW?: number;
  minH?: number;
  locked?: boolean; // cannot be dragged or resized, and keeps its position in the order
}
```

```json
[
  { "id": "a", "w": 2, "h": 2 },
  { "id": "b", "w": 1, "h": 1, "minW": 1 },
  { "id": "c", "w": 1, "h": 1, "locked": true }
]
```

The array order is the flow order: items fill each row left to right and wrap when the next one does not fit.

## Drop modes

- `insert`: the dragged widget is inserted at the target position and everything after it moves on.
- `block`: the drop is refused if it would change which widgets share a row; widgets elsewhere keep their rows.
- `shrink`: the widgets of the row the marker is on are narrowed (nearest first, down to their `minW`) to make room. The drop is refused if they cannot fit, or if shrinking would move any widget into a different row (for example a narrowed neighbour jumping onto the row above). Resizing in this mode follows the same rule.
- `swap`: the dragged widget trades places with the widget it is dropped on.

In every mode a locked widget keeps its place in the order and a drop that would break that is refused. With `maxRows`, a drop, resize or `addItem` is refused when the result needs more rows than both `maxRows` and the current layout. A layout that is already taller than `maxRows` (for example after lowering it) can still be rearranged as long as it doesn't grow. Refused drops show the marker in the blocked colour and change nothing. Nothing else moves during a drag: only a marker (or, in swap mode, an outline on the target) shows where the widget will land, and `onLayoutChange` fires once on drop.

The engine is also exported for use without the DOM: `planDrop`, `planResize`, `addItem`, `removeItem`, `normalizeLayout`, `layoutsEqual`, `computeFlow`, `rowsOf`, `totalRows`, `stackForNarrow`, and the types `LayoutItem`, `PlacedItem`, `DropMode`, `EngineConfig`, `DropTarget`, `RejectReason` and `DropResult`.

`planDrop` takes a `DropTarget`: `{ swapWith: id }` in swap mode, otherwise `{ index, after? }`, where `index` is the position in the list without the dragged widget. Set `after: true` when the marker is drawn after a widget (its right half, the empty space beside it, or the end of the list): shrink mode then makes room in the row of the widget before `index` rather than the one at `index`. Insert and block ignore `after`.

## Interaction

- Mouse: press on the widget (or its handle) and move to drag. Resize with the corner handle (`.gm-resize-handle`) at the bottom right of unlocked widgets.
- Touch: a widget with a `[data-grid-handle]` drags immediately from the handle. A widget without one needs a 400 ms long-press before it drags, so normal scrolling still works. Resize handles start at once.
- Escape cancels an active drag or resize.

## Narrow view

When the container is narrower than `breakpoint` (default 640 px) the grid switches to a single column: widgets are stacked, one per row, and resizing is disabled (the resize handles are hidden). Dragging still works, but reordering in the narrow view is temporary. It is a temporary display order that is cleared by `addItem`, `removeItem` or a `setLayout` that changes the layout; it never calls `onLayoutChange` or changes `getLayout()`, so the saved layout is untouched.

## Styling

Import `@grid-master/core/grid.css` and override these CSS custom properties on the container. The exception is `--gm-ghost-opacity`: the ghost is appended to `body`, outside the container, so set that one on `:root` or `body`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `--gm-marker-color` | `#3b82f6` | Drop marker, swap outline and resize preview. |
| `--gm-marker-blocked-color` | `#ef4444` | Same, when the drop or resize is refused. |
| `--gm-placeholder-border` | `2px dashed #94a3b8` | Border of the placeholder left at the origin during a drag. |
| `--gm-ghost-opacity` | `0.85` | Opacity of the widget following the pointer. Set on `:root` or `body`. |

The controller sets `--gm-columns`, `--gm-row-height` and `--gm-gap` on the container from its options; do not set these yourself.

## Development

```sh
pnpm build        # tsc + copy grid.css into dist/
pnpm test         # unit tests
pnpm test:smoke   # builds, then imports the built package in Node and checks its exports
```

`examples/vanilla.html` is a manual smoke page. Serve the repository root (for example `npx serve .`) and open `/packages/core/examples/vanilla.html` after building.

## License

MIT
