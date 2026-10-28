# Dashboard Grid Library — Design

Date: 2026-10-28
Status: Draft for review

## Intent

An open-source, framework-agnostic dashboard grid published on npm: a TypeScript core engine with thin Angular and React wrappers.

**Why:** existing grid libraries didn't work as expected for the author's dashboards. They needed complex configuration, reordering took a lot of hand-written code, and drag/reorder wasn't smooth. In particular, other widgets jumping around while you drag ("live reflow") is frustrating and unpredictable, especially with mixed widget widths (e.g. a 1-column and a 3-column widget in a 4-column grid).

**What makes it different:** a calm drag interaction (nothing moves until you drop) plus a switchable *drop mode* that decides what happens on drop and on resize, with a configuration small enough to fit in a few lines.

## Prior art (researched 2026-10-28)

No existing library covers this. Summary:

- **gridstack.js** (v14): closest overall: React/Angular/Vue wrappers, resize, JSON, single-column on mobile, runtime-switchable `mode` (covers insert-and-wrap). But drag reflows live, swap is same-size only, no shrink-to-fit.
- **angular-gridster2**: richest drop behaviors (swap, push, shrink-on-resize, mobile breakpoint) but Angular-only, 367 open issues.
- **react-grid-layout**: most popular, React-only, no swap, open reorder bugs.
- **Muuri / Packery**: unmaintained, no resize.
- **Pragmatic drag and drop (Atlassian)**: framework-agnostic DnD primitives with closest-edge hitbox and a thin drop-indicator line, which is exactly the requested drag UX. No layout engine, no resize.

Decision (author): **build our own engine** rather than extend gridstack, because the drag feel is the core reason for the project and gridstack's live reflow would have to be fought.

## Core model: an ordered list (author's decision)

The layout is an **ordered list of widgets that flows** like text: left to right, wrapping to the next row when a widget doesn't fit in the remaining columns. It is **not** free x/y placement.

- There are no deliberate gaps. When a widget is moved or removed, **its old spot closes up** and the rest of the list reflows.
- A widget's position is determined by its **index in the list** plus the widths of the widgets before it. The developer never sets x/y.
- Each widget has a width `w` (columns) and height `h` (row units).
- **Rows with mixed heights** *(my call)*: a row is a horizontal band; a widget joins the current row if its width fits in the remaining columns, otherwise it starts a new row. A row's height is that of its tallest widget, and shorter widgets in the row are top-aligned. This keeps "row" well defined for Insert and Shrink-to-fit and keeps layouts predictable. Packing shorter widgets into the space under them is out of scope for v1.
- Drop targets are **between widgets** (before/after a widget, chosen by the closest edge) and **at the end of the list**. The thin marker is drawn at that boundary.

## Goals (v1)

1. **Grid definition:** a fixed number of columns. Rows are optional; by default the grid grows downward. If a **row count** is set, it is a hard limit (see Constraints).
2. **Drag to reorder** with this interaction:
   - The widget's original position shows an **empty placeholder**.
   - A **ghost** of the widget follows the pointer.
   - A **thin marker** shows the drop position (in Swap mode, the target widget is outlined instead).
   - **No other widget moves until drop.** After the drop, the list reflows (animation allowed then).
3. **Drop modes**, exactly one active at a time, set by the developer and **changeable at runtime**:
   - **Insert:** the widget moves to the marker's index; everything reflows, so a row that no longer fits wraps its last widgets to the next row, and order is preserved.
   - **Block:** the marker only appears at an index where the widget fits in the target row **without changing any other row**; elsewhere it shows not-allowed and dropping does nothing (the widget returns to its placeholder).
   - **Shrink to fit:** the widget moves to the marker's index and neighbors in the target row shrink so the row still fits and nothing wraps.
   - **Swap:** drop onto a widget and the two **trade places in the list**; each **keeps its own size** and rows reflow. The target is outlined rather than shown with a line.
4. **Resizable widgets** (width and height). Resizing follows the **same active drop mode**:
   - Insert: growing a widget's width wraps neighbors per normal flow; growing its height makes the row taller and pushes the rows below down.
   - Block: resize stops where it would change any other widget's row.
   - Shrink to fit: growing a widget's width shrinks its row neighbors.
   - Swap: resize behaves like Block *(my call)*.
5. **Drag handle:** a widget can declare a handle element, and only that element starts a drag (e.g. so a map inside a widget can still be panned). Without a handle, the whole widget is draggable.
6. **Locked widgets:** a widget can be marked locked. It can't be dragged or resized and it can't be a swap target. It is pinned to its **index** in the list; unlocked widgets reorder freely around it, so a widget can be dropped on the other side of a locked one and the unlocked widgets fill the remaining slots in order. *(Author's decision, 2026-10-28. With an ordered-list model a locked widget's row and column can still shift when widgets before it change size.)*
7. **Adding and removing widgets at runtime:** the developer adds or removes items in the layout, and the grid updates. A new widget is appended to the end by default unless the developer inserts it at an index.
8. **Persistence via JSON:** the grid emits the layout on change; the developer stores it and passes it back in. The library does no storage itself.
9. **Responsive:** below a breakpoint, widgets stack into a single column in list order. Dragging still works there, but **reordering on mobile is temporary**: it lasts only for that visit, does not change the saved layout, and does not emit `onLayoutChange`.
10. **Input:** mouse and touch.
11. **Content-agnostic:** the grid knows nothing about what's inside a widget.
12. **Simple setup.** The target developer experience:

    ```tsx
    const [layout, setLayout] = useState(savedLayout);
    // layout = [{ id: 'sales', w: 1, h: 2 }, { id: 'map', w: 3, h: 2, locked: true }]   // order = position

    <Grid columns={4} dropMode="insert" layout={layout} onLayoutChange={setLayout}>
      <Widget id="sales"><SalesChart /></Widget>
      <Widget id="map"><Widget.Handle>⋮⋮</Widget.Handle><MapView /></Widget>
    </Grid>
    ```

    The Angular wrapper should feel equivalent (component inputs/outputs, content projection for widgets, a handle directive).

## Layout JSON

An ordered array; array order **is** the position:

```json
[{ "id": "sales", "w": 1, "h": 2 }, { "id": "map", "w": 3, "h": 2, "minW": 2, "locked": true }]
```

Required: `id`, `w`, `h`. Optional: `minW`, `minH` (default 1), `locked` (default false). *(My call: computed `x`/`y` may also be included in the emitted layout for convenience, but they are ignored on input.)*

## Success criterion

v1 is a success when it can **replace the grid in one of the author's real dashboards**, which is an **Angular** app. That dashboard needs a drag handle, locked widgets, adding/removing widgets at runtime and a fixed row count, so all four are in v1. To prove this without depending on that app, v1 ships with a **demo app using dummy blocks**.

## v1 scope and order

1. Core engine (TypeScript, no framework dependency).
2. Angular wrapper.
3. Demo app (Angular) with dummy widgets exercising all four drop modes, resize, runtime mode switching, drag handle, locked widgets, add/remove, fixed row count, JSON save/restore, and mobile stacking.
4. React wrapper, right after the Angular one. *(My call: the author didn't ask for both together; can ship in the same release if cheap.)*

## Non-goals (v1)

- Free x/y placement or gaps in the layout.
- Packing short widgets under taller ones within a row.
- Keyboard-only reordering/resizing (planned later).
- Persisting mobile reorder or a separate mobile layout.
- Storage, backend sync, or undo history: the developer owns layout state.
- Widget content, chrome, or chart components.
- Multiple drop modes active simultaneously.
- Vue/Svelte/other wrappers.

## Anti-goals (would be a failure even if it technically works)

- Widgets **jumping around during drag**.
- Needing **complex configuration** for the basic case: more than the snippet above.
- Needing **lots of hand-written code to make reordering work**.
- Janky, non-smooth drag.

## Constraints

- **Language:** TypeScript; ship types. *(My call)*
- **Packages:** three npm packages: core, Angular, React (e.g. `@scope/grid-core`, `@scope/grid-angular`, `@scope/grid-react`). Final names/scope: author's choice. *(My call on the split)*
- **License:** MIT. *(My call)*
- **Core is framework-free:** all layout logic (flow, drop modes, resize rules, locking, row limit, responsive stacking) lives in the core; wrappers only bind it to the framework.
- **Minimum size:** each widget has `minW`/`minH` (default 1) so Shrink-to-fit can't squash widgets to nothing.
- **Fixed row count:** when set, any drop, resize or add that would push the layout past the limit is refused (it shows not-allowed during drag/resize; an add beyond the limit is rejected and reported to the developer). *(How the rejection is reported is left to the builder.)*

## My calls (not explicitly confirmed by the author)

- Rows with mixed heights are bands sized by their tallest widget (see Core model).
- Shrink-to-fit: neighbors in the target row shrink **nearest first**, one column at a time, down to their `minW`. The dropped widget keeps its size. If the row still can't fit, the drop is **blocked** (as in Block mode). Shrunk widgets **don't grow back** automatically.
- Resize in Swap mode behaves like Block.
- Locked widgets are pinned to their list index; unlocked widgets reorder freely around them (a drop may cross a locked widget). *(Author's decision, 2026-10-28; earlier: a drop that changed a locked widget's index was refused.)*
- **Which rows "must not change"** in Block and Shrink to fit *(author approved my recommendation, 2026-10-28)*: a drop is allowed when every other widget keeps its row either as the user sees it now (dragged widget still in place) or as it would be with the dragged widget's old spot closed up. The as-seen view is tried first, so moving a widget within its own row never shrinks or refuses anything when it fits. Shrink to fit also honours a drop onto the end of the previous row: that row is shrunk to take the widget.
- **Shrink-to-fit resize** only checks other rows when a neighbour was actually narrowed; making a widget smaller behaves like Insert (later widgets may move up). *(Approved 2026-10-28.)*
- **Marker next to a locked widget** is drawn where the widget will actually land, not where the pointer is. *(Approved 2026-10-28.)*
- **Autoscroll:** during a drag or resize, moving the pointer near the top or bottom edge of the scrolling area scrolls it. *(Approved 2026-10-28.)*
- **Form controls don't start drags:** in a widget without a handle, pressing on a button, link, input, select, textarea, label, editable content or anything marked `data-grid-no-drag` never starts a drag. *(Approved 2026-10-28.)*
- **Minimum sizes** below 1 are raised to 1. *(Approved 2026-10-28.)*
- **Angular wrapper shape** *(my call)*: `<gm-grid [columns] [(layout)] dropMode ...>` with a `gmWidget` directive (so it can sit on any element, such as `mat-card` or the app's own components) and a `gmHandle` directive. Built and tested against Angular 22, the current release; the supported version range can widen once the real dashboard's version is known.
- Mobile stacking follows list order; the breakpoint has a **sensible default**, overridable by the developer.
- **Pragmatic drag and drop** is the leading candidate for the drag mechanics (agnostic core, closest-edge detection, drop indicator), but the builder may choose another approach if it doesn't deliver the required feel.

## Left to the builder

- Internal engine architecture and algorithms.
- Row height / gap configuration and their defaults.
- Resize handle placement and styling; theming approach (CSS variables suggested).
- How a rejected add (row limit) is reported (event, return value, or both).
- Monorepo tooling, build, test setup, and demo app structure.
- Drop animation (allowed after drop; never during drag for non-dragged widgets).
