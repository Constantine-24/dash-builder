# React Wrapper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@grid-master/react`, a thin React wrapper over `@grid-master/core` with the API from the spec snippet (`<Grid>`, `<Widget>`, `<Widget.Handle>`), plus a small Vite demo for a manual check.

**Architecture:** A new pnpm package, `packages/react`, built with `tsc` like core (ESM-only, NodeNext, `.js` specifiers, TS 7). `<Grid>` renders one container `<div>`. On mount it creates the core controller in a layout effect, and after each commit it syncs props to the controller the same way the reviewed Angular component does: options and layout together in one step, with a guard so a stale normalization emit can't overwrite a new layout. It refreshes only when the set or order of the widget DOM children changed. Callbacks are read through refs, so prop identity never re-creates the controller. `addItem` and `removeItem` are exposed through a ref.

**Tech Stack:** React 19, TypeScript 7 (`jsx: react-jsx`), Vitest 5 + happy-dom + @testing-library/react 16, Vite 8 + @vitejs/plugin-react 6 (demo only), pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-10-28-grid-design.md`. Goal 12 is the target developer experience: the React snippet there is the API. "v1 scope" item 4 covers React, and "Constraints" lists the packages.

**Reference implementation:** `packages/angular/projects/grid-angular/src/lib/grid.component.ts`. It is the reviewed Angular wrapper; the React sync logic must keep the same guarantees.

## Global Constraints

- Core is framework-free: no React imports in `packages/core`. Core is unchanged by this plan.
- `packages/react`: TypeScript strict, `module`/`moduleResolution` NodeNext (extends `tsconfig.base.json`), `jsx: react-jsx`, and a `.js` specifier on every relative import. ESM-only (`"type": "module"`), MIT license.
- `@grid-master/react` declares `peerDependencies` `react` and `react-dom` `^19.0.0` and `@grid-master/core` `0.x`, with no `dependencies`.
- The layout is an ordered list (array order is position) and the component is **controlled**. The parent owns `layout` and updates it from `onLayoutChange`. The grid never stores the layout anywhere else.
- **No widget other than the dragged one moves during a drag.** React must not re-render during a drag: nothing in the wrapper sets React state on pointer events.
- `maxRows` is a hard limit for adds. `addItem` plans on the *normalized* layout and reports refusals through `onReject` and its return value.
- SSR-safe: nothing touches `document` or `window` during render. Everything DOM-related happens in effects.
- Works under `<StrictMode>`: a mount, unmount and remount leaves one live controller and one set of listeners.
- Use the newest versions that the repo's pnpm `minimumReleaseAge` policy accepts. Don't relax the policy.
- Every package's `test` script is non-watch.

## Review Focus

1. **`<StrictMode>`'s double mount** must leave exactly one controller: one drag gives exactly one `onLayoutChange`. Tested in Task 2.
2. **A parent re-rendering during a drag** (unrelated state change) must not cancel or disturb the drag. Tested in Task 2.
3. **A `columns` change plus a new `layout` in one render** keeps the new layout and emits nothing, and a `columns` change alone emits exactly once. Tested in Task 2.
4. **New `onLayoutChange`/`onReject` function identities on every render** (inline arrows, the common case) must neither re-create the controller nor call stale callbacks. Tested in Task 2.
5. **Widgets wrapped in a parent's own component** (`<Card id=…>` that renders a `<Widget>`): the element is still a direct DOM child, so it must work. A widget nested inside an extra wrapper `<div>` is not a direct child, and the README must say so. Tested in Task 2 and documented in Task 3.

---

### Task 1: Package scaffold, `Widget`, `Widget.Handle`, packaging smoke

**Files:**
- Create: `packages/react/package.json`, `packages/react/tsconfig.json`, `packages/react/tsconfig.build.json`, `packages/react/vitest.config.ts`, `packages/react/LICENSE` (copy of `packages/core/LICENSE`), `packages/react/src/index.ts`, `packages/react/src/widget.tsx`, `packages/react/test/widget.test.tsx`, `packages/react/scripts/smoke.mjs`

**Interfaces:**
- Produces:
  - `Widget`:
    - `function Widget(props: WidgetProps): JSX.Element`, where `WidgetProps = { id: string } & Omit<ComponentPropsWithRef<'div'>, 'id'>`.
    - It renders `<div data-grid-id={id} {...rest}>` and forwards `ref` (a React 19 ref prop).
    - It sets no DOM `id` attribute.
  - `Widget.Handle`:
    - `(props: ComponentPropsWithRef<'span'>) => JSX.Element`.
    - It renders `<span data-grid-handle="" {...props}>`.
    - Attach it as a static property: `Widget.Handle = WidgetHandle`. Also export `WidgetHandle`.
  - `index.ts` exports `Widget`, `WidgetHandle`, and the types `WidgetProps`, plus `export type { LayoutItem, DropMode, RejectReason, DropResult } from '@grid-master/core'`.

- [ ] **Step 1: Scaffold `package.json`:**
  - `"name": "@grid-master/react"`, `"version": "0.0.0"`, `"type": "module"`, `"license": "MIT"`, `"sideEffects": false`.
  - `exports` `"."` → `{ types: ./dist/index.d.ts, import: ./dist/index.js }`.
  - `files: ["dist","README.md","LICENSE"]`.
  - `peerDependencies` as in Global Constraints.
  - devDependencies: `@grid-master/core: workspace:*`, `react`, `react-dom`, `@types/react`, `@types/react-dom`, `@testing-library/react`, `happy-dom` (same range as core), `typescript` (same as core), `vitest` (same as core).
  - Scripts:
    - `"build": "tsc -p tsconfig.build.json"`
    - `"test": "vitest run"`
    - `"typecheck": "tsc --noEmit -p tsconfig.json"`
    - `"test:smoke": "pnpm build && node scripts/smoke.mjs"`

  `tsconfig.json` extends `../../tsconfig.base.json` and adds `"jsx": "react-jsx"`. It includes `src`, `test` and `vitest.config.ts`. `tsconfig.build.json` covers `src` only and emits `dist` with declarations. `vitest.config.ts` uses environment `happy-dom` and includes `test/**/*.test.tsx`.
- [ ] **Step 2: Write the failing test** `test/widget.test.tsx`:
  - `render(<Widget id="a" className="x"><Widget.Handle>h</Widget.Handle></Widget>)` gives a div with `data-grid-id="a"`, class `x`, no `id` attribute, and a child span with `data-grid-handle=""`.
  - A ref passed to `Widget` receives the div.
- [ ] **Step 3: Run** `pnpm install && pnpm --filter @grid-master/react test` and expect a FAIL.
- [ ] **Step 4: Implement** `widget.tsx` and `index.ts`.
- [ ] **Step 5: Write `scripts/smoke.mjs`:**
  - Import `../dist/index.js` and assert that `Widget`, `WidgetHandle` and `Widget.Handle` exist.
  - Read `package.json` and assert the name and the exact peers.
  - Assert that `LICENSE` exists.
  - Exit non-zero on failure.
- [ ] **Step 6: Run** `pnpm --filter @grid-master/react test && pnpm --filter @grid-master/react typecheck && pnpm --filter @grid-master/react test:smoke`, then the root `pnpm -r build && pnpm -r test`. Expect all green.
- [ ] **Step 7: Commit** `feat(react): package scaffold, Widget and Widget.Handle, packaging smoke`

### Task 2: `<Grid>` component

**Files:**
- Create: `packages/react/src/grid.tsx`, `packages/react/test/grid.test.tsx`
- Modify: `packages/react/src/index.ts` (export `Grid`, `GridProps`, `GridHandle`), `scripts/smoke.mjs` (add `Grid`)

**Interfaces:**
- Consumes:
  - From `@grid-master/core`: `createGrid`, `addItem as planAdd`, `removeItem as planRemove`, `normalizeLayout`, `GridController`, `GridOptions`, `LayoutItem`, `DropMode`, `RejectReason`, `DropResult`.
- Produces:
  - `GridProps`:
    ```ts
    interface GridProps extends Omit<ComponentPropsWithoutRef<'div'>, 'children'> {
      columns: number;
      layout: LayoutItem[];
      onLayoutChange?: (layout: LayoutItem[]) => void;
      dropMode?: DropMode;          // default 'insert'
      maxRows?: number;
      rowHeight?: number;           // default 80
      gap?: number;                 // default 8
      breakpoint?: number;          // default 640
      ghost?: GridOptions['ghost'];
      onReject?: (reason: RejectReason) => void;
      children?: ReactNode;
      ref?: Ref<GridHandle>;
    }
    interface GridHandle {
      addItem(item: LayoutItem, index?: number): DropResult;
      removeItem(id: string): void;
    }
    ```
  - `function Grid(props: GridProps): JSX.Element` renders `<div {...divProps} ref={container}>{children}</div>`.

Behavior (exactly this):
- **Refs:**
  - `controller`, `applied` (the layout last handed to the controller), `superseded` (a boolean) and `lastIds` (a string).
  - `latest`: a ref updated on every render with the current props, so callbacks always read the newest `onLayoutChange`/`onReject`.
- **Mount** (a `useLayoutEffect` with `[]` deps):
  - Call `createGrid(container, { ...options from latest props, layout })`.
  - `onLayoutChange: (l) => { if (!superseded.current) latest.current.onLayoutChange?.(l) }`.
  - `onReject: (r) => latest.current.onReject?.(r)`.
  - Set `applied = layout`.
  - On cleanup, call `destroy()` and set `controller = undefined`.
- **Sync** (a `useLayoutEffect` with no deps, so it runs after every commit, declared after mount):
  - If the controller exists:
    - If `layout !== applied`: set `applied = layout`, then `superseded = true; try { setOptions(opts) } finally { superseded = false }`, then `setLayout(layout)`.
    - Otherwise: `setOptions(opts)`.
  - Then compute `ids` from the container's direct children carrying `data-grid-id`, joined with `\n`. If `ids !== lastIds`, set `lastIds = ids` and call `refresh()`.
  - Core skips equal options and equal layouts, so a render that changes nothing does nothing.
- **`useImperativeHandle`** exposes:
  - `addItem`:
    - `planAdd(normalizeLayout(latest.layout, columns), { columns, maxRows, mode }, item, index)`.
    - On ok: `latest.onLayoutChange?.(result.layout)`.
    - Otherwise: `latest.onReject?.(result.reason)`.
    - Return the result.
  - `removeItem`: `const next = planRemove(layout, id)`. If `next !== layout`, call `onLayoutChange(next)`.
- No state setters and no effects that depend on pointer events.

Test setup: copy the rect-stub and pointer helpers from `packages/core/test/dom/drag.test.ts`. In happy-dom `clientWidth` is 0, so tests that assert positions pass `breakpoint={0}`. The test harness is a `Host` component holding `layout` in `useState`. It renders `{layout.map(i => <Widget key={i.id} id={i.id}>{i.id}</Widget>)}` and records every `onLayoutChange` call.

- [ ] **Step 1: Write the failing tests** in `test/grid.test.tsx`:
  - `positions widgets from the layout`: `[a w2, b w1]`, 4 columns. `a` has `--gm-col` `1 / span 2`, `b` has `3 / span 1`, and the container has class `gm-grid`.
  - `a new layout prop re-renders without emitting`.
  - `addItem via ref appends and emits; a refused add calls onReject`:
    - With `maxRows={1}` and a full row: `{ok:false, reason:'max-rows'}`, `onReject('max-rows')`, and no change.
    - With `maxRows={3}` and `[{id:'a',w:4,h:1,minH:3}]`, adding `{id:'z',w:1,h:1}` is refused (`max-rows`). This is the normalized-layout case.
    - Without `maxRows`: ok, one change, and `z` gets `--gm-col`.
  - `removeItem via ref emits and the widget goes away`.
  - `columns change emits the normalized layout exactly once` (Review Focus 3): a `w3` item, rerender with `columns={2}` → exactly one call, with `w === 2`.
  - `columns change plus a new layout keeps the new layout` (Review Focus 3): from a `w3` layout, one `rerender` with `columns={2}` and layout `[{id:'b',w:1,h:1}]` → no calls, `b` positioned, and the old item gone. Also cover growing columns `2→4` with a `w3` new layout → `b` gets `1 / span 3`.
  - `drag works end to end, and again after React reorders the DOM`: set `dropMode="swap"`, swap a↔b, assert the change and the new DOM order. Re-stub rects and swap again.
  - `a parent re-render during a drag doesn't disturb it` (Review Focus 2): start a drag past the threshold, trigger an unrelated `setState` in Host, finish the drop, and assert exactly one change with the expected order.
  - `StrictMode: one controller` (Review Focus 1): render Host inside `<StrictMode>`, do one swap, and assert exactly one `onLayoutChange` call. The container also has exactly one `.gm-marker` element.
  - `inline callbacks: no re-create, newest callback wins` (Review Focus 4): Host passes a new arrow each render that records into a counter captured by render number. After a rerender, a drop calls only the newest callback, and the container keeps its `gm-grid` class across rerenders (it isn't destroyed).
  - `unmount mid-drag leaves no ghost`: start a drag, `unmount()`, then `document.querySelector('.gm-ghost')` is null.
  - `widget id change rebinds`: render one `<Widget id={x}>` with layout `[b]`, start with `'x'`, rerender with `'b'` → the element gets `--gm-col`.
  - `wrapper component renders a direct child` (Review Focus 5): `function Card({id}) { return <Widget id={id}>…</Widget> }` used as `<Card id="a" />` positions `a`.
  - `SSR`: `renderToString(<Grid columns={4} layout={[{id:'a',w:1,h:1}]}><Widget id="a" /></Grid>)` from `react-dom/server` doesn't throw and contains `data-grid-id="a"`.
- [ ] **Step 2: Run** `pnpm --filter @grid-master/react test` and confirm FAIL.
- [ ] **Step 3: Implement** `grid.tsx` as specified and export it.
- [ ] **Step 4: Run** `pnpm --filter @grid-master/react test && pnpm --filter @grid-master/react typecheck && pnpm --filter @grid-master/react test:smoke`. Expect all green, with no React `act()` warnings in the output.
- [ ] **Step 5: Commit** `feat(react): Grid component with controlled layout, options, add/remove via ref`

### Task 3: README and Vite demo

**Files:**
- Create: `packages/react/README.md`, `packages/react/demo/index.html`, `packages/react/demo/main.tsx`, `packages/react/demo/app.tsx`, `packages/react/demo/blocks.ts`, `packages/react/demo/styles.css`, `packages/react/vite.config.ts`
- Modify: `packages/react/package.json` (devDependencies `vite`, `@vitejs/plugin-react`; scripts `"demo": "vite"`, `"build:demo": "vite build"`), `tsconfig.json` (include `demo`, `vite.config.ts`)

**Interfaces:**
- Consumes: `Grid`, `Widget`, `GridHandle` from `../src/index.js`; `@grid-master/core/grid.css`.

- [ ] **Step 1: Write the README** for `@grid-master/react`:
  - Install, including the peers `react`, `react-dom` and `@grid-master/core`.
  - `import '@grid-master/core/grid.css'`.
  - The spec snippet adapted to the real API: `useState` layout, `onLayoutChange={setLayout}`, `layout.map(... key={i.id})`, and `Widget.Handle`.
  - A props table.
  - The ref API (`addItem`/`removeItem`), and why to use it instead of setting the layout yourself: it enforces `maxRows` and reports `onReject`.
  - **Rules:**
    - The layout is controlled.
    - Widgets must be direct DOM children of the grid, so a wrapper component is fine as long as it renders the `Widget` element itself, while an extra wrapper `<div>` is not.
    - Key widgets by id.
    - Interactive controls inside a widget don't start drags; use `data-grid-no-drag` or a handle for custom controls.
  - Narrow-view behaviour, and a pointer to the core README for drop modes.
- [ ] **Step 2: Build the demo** (`vite.config.ts` with `root: 'demo'` and the react plugin). It is a smaller twin of the Angular demo:
  - 8 blocks in `blocks.ts`. The layout holds content-free items, and titles, kinds and colors live in a separate `BLOCKS` record keyed with `Object.hasOwn`. One block is locked, one has a `Widget.Handle` grip, and one has an `<input>` and a `<button>`.
  - A toolbar: a drop-mode `<select>`, a "Limit to 6 rows" checkbox, "Add block" (via `ref.addItem`, with the refusal reason in a status line), "Remove last unlocked" (via `ref.removeItem`), and a "Narrow preview" toggle (a 480px frame).
  - A live `<pre>` with the layout JSON.
- [ ] **Step 3: Run** `pnpm --filter @grid-master/core build && pnpm --filter @grid-master/react build:demo`. Expect success with no warnings. Then run the root `pnpm -r build && pnpm -r test && pnpm -r typecheck && pnpm -r test:smoke`. Expect all green.
- [ ] **Step 4: Manual browser check.** The controller runs this with Chrome DevTools against `pnpm --filter @grid-master/react demo`. It checks:
  - Each mode: one allowed drop and one refused drop.
  - A grip-only drag.
  - The input and button don't drag.
  - A shrink-mode resize.
  - An add refused by the limit.
  - Remove.
  - The narrow preview stacks, and a narrow reorder leaves the JSON unchanged.
  - Autoscroll.
  - No console errors or React warnings.

  Record the results in the task report.
- [ ] **Step 5: Commit** `feat(react): README and Vite demo`
