# @dash-builder/angular

Angular bindings for [`@dash-builder/core`](https://www.npmjs.com/package/@dash-builder/core), a dashboard grid where widgets flow left to right into a fixed number of columns and can be dragged and resized. The layout is an ordered list: array order is position, there are no x/y coordinates.

Requires Angular 22. Works with and without zone.js: the grid's DOM listeners run outside the Angular zone, and state flows through signals.

## Install

`@dash-builder/core` is a peer dependency, so install both:

```sh
pnpm add @dash-builder/angular @dash-builder/core
# or: npm install @dash-builder/angular @dash-builder/core
```

## Styles

Import the grid stylesheet once, in your global `styles.css`:

```css
@import '@dash-builder/core/grid.css';
```

## Usage

```ts
import { Component, signal } from '@angular/core';
import { DashGrid, DashHandle, DashWidget, type LayoutItem } from '@dash-builder/angular';

@Component({
  selector: 'app-dashboard',
  imports: [DashGrid, DashWidget, DashHandle],
  template: `
    <dash-grid [columns]="4" dropMode="insert" [(layout)]="layout" (layoutChange)="save($event)">
      @for (item of layout(); track item.id) {
        <div [dashWidget]="item.id">
          <header dashHandle>{{ item.id }}</header>
          <p>Widget content</p>
        </div>
      }
    </dash-grid>
  `,
})
export class Dashboard {
  readonly layout = signal<LayoutItem[]>([
    { id: 'a', w: 2, h: 2 },
    { id: 'b', w: 1, h: 1 },
    { id: 'c', w: 1, h: 1, locked: true },
  ]);

  save(layout: LayoutItem[]) {
    localStorage.setItem('dashboard-layout', JSON.stringify(layout));
  }
}
```

- `<dash-grid>` is the grid container. Each projected element with `[dashWidget]="id"` is a widget; the id must match a layout entry. Widgets must be direct children of `<dash-grid>` (an `@for` block directly inside it is fine). Widgets rendered through `ngTemplateOutlet`, or inside a wrapper component's own template, are not direct children (Angular content projection only sees what the template using `<dash-grid>` places directly in it) and are not picked up.
- `dashHandle` marks the only element a widget can be dragged by. Without one, the whole widget is the drag surface.
- Render widgets from the layout with `@for (item of layout(); track item.id)`. Widgets that are added, removed, reordered or given a new id are picked up after Angular updates the DOM. Don't use `track item` (object identity): the grid emits copies of the items, so every widget would be destroyed and recreated after each drop.

## API

### `DashGrid` (`<dash-grid>`)

| Input | Type | Default | Description |
| --- | --- | --- | --- |
| `layout` | `LayoutItem[]` | required | Two-way: `[(layout)]` or `[layout]` + `(layoutChange)`. |
| `columns` | `number` | required | Number of columns. |
| `dropMode` | `'insert' \| 'block' \| 'shrink' \| 'swap'` | `'insert'` | Changeable at runtime. |
| `maxRows` | `number \| undefined` | none | Hard row limit for drops, resizes and `addItem`. |
| `rowHeight` | `number` | `80` | Row height in px. |
| `gap` | `number` | `8` | Gap between cells in px. |
| `breakpoint` | `number` | `640` | Container width in px below which the narrow view is used. |
| `ghost` | `(el: HTMLElement) => HTMLElement` | sanitized clone | Builds the drag ghost (see the core README). |

The numeric inputs (`columns`, `maxRows`, `rowHeight`, `gap`, `breakpoint`) also accept static attributes, e.g. `columns="4"`.

| Output | Payload | When |
| --- | --- | --- |
| `layoutChange` | `LayoutItem[]` | A drop or resize is released, `addItem` / `removeItem` succeed, or a `columns` change normalizes widths. Setting `layout` from outside never emits. |
| `reject` | `RejectReason` | An `addItem` is refused (`'max-rows'`, `'duplicate'` or `'invalid'`). |

| Method | Description |
| --- | --- |
| `addItem(item: LayoutItem, index?: number): DropResult` | Inserts at `index` (default: append). On success updates `layout` and emits `layoutChange`; otherwise emits `reject` and returns `{ ok: false, reason }`. |
| `removeItem(id: string): void` | Removes the item and emits `layoutChange`; an unknown id does nothing. |

Get the instance with `viewChild.required(DashGrid)`.

### `DashWidget` (`[dashWidget]`) and `DashHandle` (`[dashHandle]`)

`dashWidget` takes the widget id (required) and sets `data-grid-id`; `dashHandle` sets `data-grid-handle`.

### Adding widgets: use `addItem`

Prefer `grid.addItem(item)` over pushing to the layout yourself:

```ts
readonly grid = viewChild.required(DashGrid);

add() {
  const result = this.grid().addItem({ id: crypto.randomUUID(), w: 1, h: 1 });
  if (!result.ok) console.warn('not added:', result.reason);
}
```

`addItem` enforces `maxRows`, refuses duplicate ids and reports the refusal through `reject`. A plain `layout.update((l) => [...l, item])` bypasses all of that: the grid shows whatever layout it is given.

## Narrow view

When `<dash-grid>` is narrower than `breakpoint` (default 640 px), widgets stack in a single column in list order and resizing is disabled. Dragging still reorders them, but only temporarily: a narrow-view reorder never emits `layoutChange`, so the saved layout is untouched. Set `[breakpoint]="0"` to turn the narrow view off.

## Drop modes

`insert`, `block`, `shrink` and `swap` are described in the [core README](https://www.npmjs.com/package/@dash-builder/core#drop-modes), together with locked widgets, `maxRows` and the layout JSON format.

## License

MIT
