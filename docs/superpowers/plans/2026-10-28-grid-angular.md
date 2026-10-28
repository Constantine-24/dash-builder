# Core Follow-ups + Angular Wrapper + Angular Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the approved core follow-ups, then ship `@grid-master/angular` (a `gm-grid` component plus `gmWidget` and `gmHandle` directives) and an Angular demo app with dummy blocks that exercises every v1 feature.

**Architecture:** Tasks 1–4 change `packages/core` only: engine rules, then DOM interaction. Tasks 5–7 add `packages/angular`, a single Angular CLI workspace with two projects: the library `grid-angular` (published as `@grid-master/angular`, built with ng-packagr) and the app `demo`. The wrapper is thin. The component's host element is the core container, its template is just `<ng-content />` (so projected widgets are real DOM children of the host), and signals push inputs into the core controller.

**Tech Stack:** TypeScript (core: TS 7, NodeNext; Angular workspace: TS ~6.0), Angular 22.2 (standalone, signals, zoneless), ng-packagr via `@angular/build:ng-packagr`, Vitest 5 + happy-dom, pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-10-28-grid-design.md`. Read "My calls" in full: the 2026-10-28 entries define Tasks 1–4.

## Global Constraints

- Core is framework-free: no Angular/React imports anywhere in `packages/core`. Core has no runtime dependencies.
- The layout is an **ordered list**: array order is position, and input never carries x/y.
- Layout item: required `id`, `w`, `h`; optional `minW`, `minH` (default 1, never below 1 after normalizing), `locked` (default false).
- Exactly one drop mode is active: `'insert' | 'block' | 'shrink' | 'swap'`, changeable at runtime. Resize follows the same mode (`swap` resizes like `block`).
- **No widget other than the dragged one moves during a drag.** The layout changes only on drop or resize release. Autoscroll moves the page, not widgets.
- Locked widgets are pinned to their list index. They can't be dragged, resized or swapped with.
- A fixed row count (`maxRows`), when set, is a hard limit for drops, resizes and adds (refused only when the result is taller than both `maxRows` and the current layout).
- Narrow view (container width < `breakpoint`, default 640px): a single column in list order. Reordering there is temporary and never emits.
- Input is mouse and touch via Pointer Events. Keyboard is out of scope.
- `packages/core`: TypeScript strict, NodeNext; every relative import uses a `.js` specifier.
- `packages/angular`: Angular `22.2.x`. `typescript ~6.0` (required by `@angular/build@22`), CLI-generated tsconfigs (don't extend `tsconfig.base.json`). The library declares `peerDependencies` `@angular/core` and `@angular/common` `^22.0.0` and `@grid-master/core` `0.x`, with no `dependencies`. It must be zoneless-safe (signals only, no `ChangeDetectorRef`) and zone-safe (core listeners run outside the Angular zone).
- Every package's `test` script is non-watch (root `pnpm -r test` must terminate).

## Review Focus

1. **The Angular `@for` re-renders and reorders widget DOM nodes after a drop.** Per-element bindings must survive, so a second drag still works. The test is in Task 6.
2. **Changing `columns` at runtime** re-normalizes widths and emits `layoutChange` exactly once, with no echo loop through the `[(layout)]` model. The test is in Task 6.
3. **Destroying the component mid-drag** leaves no ghost in `body` and no listener behind. The test is in Task 6.
4. **Changing a `gmWidget` id** on an existing element rebinds it under the new id; the `contentChildren` list alone doesn't change. The test is in Task 6.
5. **Moving a widget within its own row in Block or Shrink** is never refused and never shrinks anything when it fits. The property test is in Task 1.

## Rulings made while planning

- **Baseline for Block and Shrink:** "either baseline", not "seen-only". Requiring every other widget to keep its *visible* row would refuse almost every cross-row move in Block, because the gap the widget leaves gets refilled. So the rule tries the as-seen rows first, then the closed-up rows (the current rule). Cost if wrong: one function (`keepsRows`) and its tests.
- **Peer range `^22.0.0`:** it's the only range I can verify. The author's real dashboard version is unknown; widen the range once it is known.
- **`gmWidget` is a directive, not a component,** so it can sit on `mat-card` or the app's own components. Its value is the id, so a DOM `id` attribute never collides.

---

### Task 1: Engine: as-seen baseline for Block and Shrink drops; shrink onto the previous row's end

**Files:**
- Modify: `packages/core/src/engine/drop.ts`
- Test: `packages/core/test/engine/drop.test.ts`, `packages/core/test/engine/baseline.property.test.ts` (new)
- Modify: `packages/core/README.md` ("Drop modes" section)

**Interfaces:**
- Consumes: `rowsWithout(layout, columns, id)` and `computeFlow` from `rows.ts` and `flow.ts`; `shrinkRowToFit(row, fixedId, columns)`.
- Produces: unchanged `planDrop(layout, config, dragId, target): DropResult`; the behavior below.

Definitions (4 columns in every example). **As-seen rows:** `rowsWithout(layout, columns, dragId)`. **Closed-up rows:** `rowsWithout(rest, columns, dragId)`, the current baseline. A candidate *keeps rows against a baseline* when it has the same number of rows (after `rowsWithout(candidate, …, dragId)`) and every non-dragged id has the same row number.

Algorithm for the mode rule:
```
block:  allowed = keepsRows(asSeen) || keepsRows(closedUp)
shrink: for baseline in [asSeen, closedUp]:
          targetRow = ids in the baseline row that holds refId   // refId as today: rest[index-1] if after && index>0, else rest[min(index, rest.length-1)]
          dragged must land in that row: in `order`, its position is between two targetRow members or directly before the first / after the last; else try next baseline
          shrink the slice of `order` spanning targetRow ∪ {dragged} with shrinkRowToFit; if it fits and the shrunk candidate keepsRows(baseline) → accept this candidate
        none accepted → no-room
```
Short-circuit change: in shrink mode, an `after` target whose `rest[index-1]` sits in a different as-seen row than the dragged item is **not** a no-op, even when `layout[index]` is the dragged item. The "candidate maps back to the layout" no-op check compares with `layoutsEqual`, so ids *and* widths count.

- [ ] **Step 1: Write the failing tests** in `drop.test.ts` (`L2 = [A,B,C,D]`, all `w:2,h:1`):
  - `block: in-row reorder is allowed`: `planDrop(L2, {columns:4, mode:'block'}, 'A', {index:1, after:true})` → `ok`, ids `[B,A,C,D]`.
  - `shrink: in-row reorder shrinks nothing`: same target with mode `'shrink'` → `ok`, ids `[B,A,C,D]`, every `w === 2`.
  - `block: cross-row move whose gap is refilled is still allowed`: mode `'block'`, `{index:3, after:true}` → ok, `[B,C,D,A]`.
  - `block: a move that changes another row is refused`: `[A1,B3,C2,D2]`, drag `C` to `{index:1}` → `{ok:false, reason:'no-room'}`.
  - `shrink: drop onto the end of the previous row shrinks that row`: `[A2,B1,C2]`, drag `C` to `{index:2, after:true}`, shrink → ok, `[A1,B1,C2]`. The same target in `'insert'` → ok and `layout` returned unchanged (the same reference).
  - `locked: adjacent locked pair`: `[A1, L1🔒, M1🔒, B1]`, insert, drag A to `{index:3, after:true}` → `[B,L,M,A]`.
  - `locked: locked item last`: `[A1,B1,L1🔒]`, insert, drag A to `{index:2, after:true}` → `[B,A,L]`.
  - `shrink: pinning moves the dragged item off the marker's row → no-room`: build a layout with a locked item in which `pinnedInsert` places the dragged item outside the marker's row under both baselines, and assert `reason: 'no-room'`. Write the case's derivation in a comment.
- [ ] **Step 2: Run** `pnpm --filter @grid-master/core exec vitest run test/engine/drop.test.ts`. Expect the in-row block and shrink tests and the previous-row-end test to FAIL. The rest may pass already, since they pin current behavior.
- [ ] **Step 3: Write the property test** `baseline.property.test.ts`. Use a seeded PRNG (mulberry32, seed 1) and 300 cases: 3–8 unlocked items with every `w` equal (randomly 1 or 2 for the whole case), random `h` 1–3, 4 columns. For each item pick a random target index inside its own as-seen row (both `after` forms). Assert block and shrink both return `ok`, and shrink changes no width.
- [ ] **Step 4: Implement** the algorithm in `drop.ts`. Update the `planDrop` doc comment (check order, step 6) and the README "Drop modes" bullets for block and shrink to describe the two baselines in plain words.
- [ ] **Step 5: Run** `pnpm --filter @grid-master/core test`. Expect all to pass (165 existing plus the new ones). If an existing test contradicts the new rule, change it only when the spec's 2026-10-28 entry decides the case, and list it in the report.
- [ ] **Step 6: Commit** `feat(core): block/shrink judge drops against the rows the user sees; shrink onto previous row end`

### Task 2: Engine: shrink-mode resize narrowing; minimum sizes ≥ 1

**Files:**
- Modify: `packages/core/src/engine/resize.ts`, `packages/core/src/engine/normalize.ts`
- Test: `packages/core/test/engine/resize.test.ts`, `packages/core/test/engine/normalize.test.ts`

**Interfaces:** unchanged signatures (`planResize`, `normalizeLayout`).

- [ ] **Step 1: Write the failing tests**
  - `shrink resize: narrowing lets a later widget move up`: `planResize([A3,B1,C2], {columns:4, mode:'shrink'}, 'A', {w:1,h:1})` → ok, widths `A1,B1,C2`.
  - `shrink resize: growing still refuses when a narrowed neighbour would change rows`: keep or add a case where `shrinkRowToFit` narrows a neighbour and the result moves another widget to a different row → `no-room`.
  - `normalize: minW/minH below 1 become 1`: `normalizeLayout([{id:'a',w:2,h:2,minW:0,minH:-3}], 4)` → `minW:1, minH:1`. A non-finite `minW` also → 1.
- [ ] **Step 2: Run** the two test files and confirm the first and third FAIL.
- [ ] **Step 3: Implement.** In `planResize` shrink mode, run the other-rows check only when some neighbour's `w` in `fitted` differs from `resized`. Otherwise the candidate is `resized`, which behaves like insert. In `normalizeLayout`, clamp a present `minW` to `[1, columns]` and a present `minH` to `≥ 1`. Update the doc comments.
- [ ] **Step 4: Run** `pnpm --filter @grid-master/core test`. Expect all to pass.
- [ ] **Step 5: Commit** `fix(core): shrink resize narrowing; minimum sizes at least 1`

### Task 3: DOM: marker at the landing spot next to locked widgets; form controls don't start drags

**Files:**
- Modify: `packages/core/src/engine/hit.ts` (pure helper), `packages/core/src/dom/drag.ts`, `packages/core/README.md`
- Test: `packages/core/test/engine/hit.test.ts`, `packages/core/test/dom/drag.test.ts`

**Interfaces:**
- Produces (in `hit.ts`, not exported from `index.ts`): `landingMarker(rects: ItemRect[], order: string[], dragId: string, axis: 'x' | 'y'): Marker | null`. Given the planned order, it returns the line after the rect of the nearest item before `dragId` in `order` that has a rect. If there is none, it returns the line before the nearest item after it. If neither exists, null.
- `NO_DRAG = 'input, textarea, select, button, option, label, a[href], [contenteditable]:not([contenteditable="false"]), [data-grid-no-drag]'`, a constant in `drag.ts`.

- [ ] **Step 1: Write the failing tests**
  - `hit.test.ts`: `landingMarker` returns the after-line of the preceding item, the before-line of the following item when the dragged item is first, and null for a lone item.
  - `drag.test.ts` (WIDE geometry, layout `[A1, B3🔒, C2, D2]`): drag D and release the pointer in the left half of B. The hit says "before B", but pinning lands D after B. Assert that during the drag the marker's `left` is `424 - 2` (B's right edge minus half the line), and on drop `onLayoutChange` gets `[A,B,D,C]`.
  - `drag.test.ts`: in a handle-less widget, pointerdown on a `<button>` inside it plus a 20px move makes no ghost. The same holds for an element with `data-grid-no-drag`. In a widget whose `[data-grid-handle]` *is* a `<button>`, the drag starts.
- [ ] **Step 2: Run** `pnpm --filter @grid-master/core exec vitest run test/engine/hit.test.ts test/dom/drag.test.ts`. Expect the new tests to FAIL.
- [ ] **Step 3: Implement.**
  - In `update()`: when `plan.ok`, the target is an index and the dragged item's neighbours in `plan.layout` differ from its neighbours in `insertAt(rest, dragged, index)`, replace the hit's marker with `landingMarker(rects, plan.layout ids, id, axis)`.
  - In `onDown`: when the widget has no handle and `target.closest(NO_DRAG)` lies inside the widget, return.
  - README: add a "Marker" sentence to the "Drop modes" locked paragraph and a bullet to "Interaction".
- [ ] **Step 4: Run** `pnpm --filter @grid-master/core test`. Expect all to pass.
- [ ] **Step 5: Commit** `feat(core): marker shows the landing spot beside locked widgets; form controls never start a drag`

### Task 4: DOM: edge autoscroll during drag and resize

**Files:**
- Create: `packages/core/src/dom/autoscroll.ts`
- Modify: `packages/core/src/dom/drag.ts`, `packages/core/src/dom/resize.ts`, `packages/core/README.md`
- Test: `packages/core/test/dom/autoscroll.test.ts` (new), plus one case each in `drag.test.ts` and `resize.test.ts`

**Interfaces:**
- Produces:
  - `scrollStep(pointerY: number, top: number, bottom: number, zone = 48, max = 16): number`. A pure function returning px per frame: negative near the top, positive near the bottom, 0 outside the zone, and growing linearly to `±max` at the edge or beyond it.
  - `createAutoScroll(container: HTMLElement, onScroll: (dy: number) => void): { move(clientY: number): void; stop(): void }`. The scroll target is the nearest ancestor of `container` whose computed `overflow-y` is `auto` or `scroll` and whose `scrollHeight > clientHeight`. Otherwise it is `document.scrollingElement`, with the viewport (`0..innerHeight`) as its edges. While `move` leaves a non-zero step, it keeps one rAF loop scrolling by that step (clamped to the scroll range). It calls `onScroll(actualDelta)` after each step that moved, and `stop()` cancels it.
- Consumers: in drag, after `start()`, `move(e.clientY)` on every pointermove; `onScroll` → `schedule(s)` (re-hit-test); `stop()` in `cleanup`. In resize, `move` on pointermove; `onScroll(dy)` adds `dy` to the session's accumulated scroll and calls `update` with the last pointer position, and `update`'s vertical delta includes the accumulated scroll; `stop()` in `cleanup`.

- [ ] **Step 1: Write the failing tests**
  - `autoscroll.test.ts` (node env): `scrollStep(500, 0, 500)` → `16`; `scrollStep(476, 0, 500)` → `8`; `scrollStep(250, 0, 500)` → `0`; `scrollStep(0, 0, 500)` → `-16`; `scrollStep(-30, 0, 500)` → `-16`.
  - `autoscroll.test.ts` (happy-dom, rAF stubbed with a manual queue): a scrollable parent with `scrollHeight 1000, clientHeight 400` and its rect at 0..400. `move(395)`, run one frame: `scrollTop` increased and `onScroll` was called with that delta. `stop()` then runs no more frames. At the bottom of the range, no move and no `onScroll`.
  - `drag.test.ts`: during a started drag, a pointer within 48px of a scrollable parent's bottom scrolls it, and the drop still commits the hit at the final position.
  - `resize.test.ts`: a resize that autoscrolls by 88px (one row plus gap) previews and commits `h + 1` with the pointer held still.
- [ ] **Step 2: Run** the three files and confirm FAIL.
- [ ] **Step 3: Implement** `autoscroll.ts` and wire it in as described. README "Interaction": add "Dragging or resizing near the top or bottom edge of the scrolling area scrolls it."
- [ ] **Step 4: Run** `pnpm --filter @grid-master/core test && pnpm --filter @grid-master/core typecheck && pnpm --filter @grid-master/core test:smoke`. Expect all to pass.
- [ ] **Step 5: Commit** `feat(core): autoscroll near the scroll edges during drag and resize`

### Task 5: Angular workspace, `gmWidget` and `gmHandle`, packaging

**Files:**
- Create: `packages/angular/` via the CLI (see Step 1): `package.json`, `angular.json`, `tsconfig.json`, `projects/grid-angular/{package.json,ng-package.json,tsconfig.lib.json,tsconfig.lib.prod.json,tsconfig.spec.json}`, `projects/grid-angular/src/public-api.ts`
- Create: `projects/grid-angular/src/lib/widget.directive.ts`, `projects/grid-angular/src/lib/handle.directive.ts`, `projects/grid-angular/src/lib/directives.spec.ts`, `packages/angular/scripts/smoke.mjs`
- Modify: `.gitignore` (add `packages/angular/.angular/`; `dist` is already ignored)

**Interfaces:**
- Produces:
  - `GmWidget`: `@Directive({ selector: '[gmWidget]', host: { '[attr.data-grid-id]': 'gmWidget()' } })` with `readonly gmWidget = input.required<string>()`.
  - `GmHandle`: `@Directive({ selector: '[gmHandle]', host: { 'data-grid-handle': '' } })`.
  - `public-api.ts` exports `GmWidget`, `GmHandle`, and `export type { LayoutItem, DropMode, RejectReason, DropResult } from '@grid-master/core'`.

- [ ] **Step 1: Scaffold** from the repo root:
  ```bash
  pnpm dlx @angular/cli@22.2.5 new grid-angular --directory packages/angular --no-create-application --skip-git --skip-install --package-manager pnpm
  cd packages/angular && pnpm dlx @angular/cli@22.2.5 generate library grid-angular --prefix gm
  ```
  Then make these edits:
  - `packages/angular/package.json`:
    - `"name": "@grid-master/angular-workspace"`, `"private": true`
    - devDependencies: `"@grid-master/core": "workspace:*"`, `typescript ~6.0`, `vitest ^5.0.5`, `happy-dom ^21.0.4`
    - scripts:
      - `"build": "ng build grid-angular"`
      - `"test": "ng test grid-angular --watch=false"`
      - `"typecheck": "tsc --noEmit -p projects/grid-angular/tsconfig.lib.json"`
      - `"test:smoke": "pnpm build && node scripts/smoke.mjs"`
  - `projects/grid-angular/package.json`:
    - `"name": "@grid-master/angular"`, `"version": "0.0.0"`, `"license": "MIT"`, `"sideEffects": false`
    - the peerDependencies from Global Constraints, and no `dependencies`
  - Keep the CLI-generated `test` target (Vitest runner). Use the DOM environment it configures.
  - Delete generated sample component and service files.
- [ ] **Step 2: Write the failing test** `directives.spec.ts`. A host component renders `<div [gmWidget]="id()"><span gmHandle>h</span></div>`. Assert `data-grid-id="a"` and `data-grid-handle=""`. After `id.set('b')` and `fixture.detectChanges()`, assert `data-grid-id="b"`.
- [ ] **Step 3: Run** `pnpm install && pnpm --filter @grid-master/angular-workspace test`. Expect a FAIL (the directives don't exist yet).
- [ ] **Step 4: Implement** the two directives and `public-api.ts`.
- [ ] **Step 5: Write** `scripts/smoke.mjs`. It imports `../dist/grid-angular/fesm2022/grid-master-angular.mjs` (adjust to the file ng-packagr emits and name it in the report). It asserts each name in `['GmWidget','GmHandle']` is exported, and that `dist/grid-angular/package.json` has `name: '@grid-master/angular'` and the peerDependencies. It exits non-zero on failure.
- [ ] **Step 6: Run** `pnpm --filter @grid-master/core build && pnpm --filter @grid-master/angular-workspace test && pnpm --filter @grid-master/angular-workspace typecheck && pnpm --filter @grid-master/angular-workspace test:smoke`. Expect all to pass. Then run root `pnpm -r build && pnpm -r test` and expect both to terminate green.
- [ ] **Step 7: Commit** `feat(angular): workspace, gmWidget and gmHandle directives, packaging smoke`

### Task 6: `gm-grid` component

**Files:**
- Create: `projects/grid-angular/src/lib/grid.component.ts`, `projects/grid-angular/src/lib/grid.component.spec.ts`, `projects/grid-angular/README.md`
- Modify: `projects/grid-angular/src/public-api.ts` (export `GmGrid`), `scripts/smoke.mjs` (add `'GmGrid'`), `projects/grid-angular/ng-package.json` (copy README via `assets` if not default)

**Interfaces:**
- Consumes: `createGrid`, `addItem as planAdd`, `removeItem as planRemove`, `GridController`, `GridOptions`, `LayoutItem`, `DropMode`, `RejectReason`, `DropResult` from `@grid-master/core`; `GmWidget`.
- Produces `GmGrid`, a standalone component:
  - `selector: 'gm-grid'`, `template: '<ng-content />'`, `ChangeDetectionStrategy.OnPush`.
  - `layout = model.required<LayoutItem[]>()`, giving `[(layout)]` and `(layoutChange)`.
  - Inputs:
    - `columns = input.required<number>()`
    - `dropMode = input<DropMode>('insert')`
    - `maxRows = input<number | undefined>()`
    - `rowHeight = input(80)`, `gap = input(8)`, `breakpoint = input(640)`
    - `ghost = input<GridOptions['ghost']>()`
  - `reject = output<RejectReason>()`.
  - Methods:
    - `addItem(item: LayoutItem, index?: number): DropResult`. It plans with the core `addItem` against the current layout and config. If ok, `layout.set(result.layout)`; if not, `reject.emit(reason)`. It returns the result.
    - `removeItem(id: string): void`. Calls `layout.set(planRemove(...))` when that changes anything.
- Lifecycle (exactly this):
  - `afterNextRender` creates the controller on the host element inside `NgZone.runOutsideAngular`:
    - options come from the current input values;
    - `layout` comes from `untracked(this.layout)`;
    - `onLayoutChange: (l) => zone.run(() => this.layout.set(l))`;
    - `onReject: (r) => zone.run(() => this.reject.emit(r))`.
  - `DestroyRef.onDestroy` → `destroy()`.
  - Effect A reads all option inputs → `grid?.setOptions({...})`.
  - Effect B reads `layout()` → `grid?.setLayout(...)`. This is a no-op on the model echo, because core skips equal layouts.
  - An `afterRenderEffect` reads `widgets().map(w => w.gmWidget())`, where `widgets = contentChildren(GmWidget)` → `grid?.refresh()`. That way added, removed, reordered or re-id'd elements bind after the DOM update.
  - Nothing touches `document` or `window` outside `afterNextRender` (SSR-safe).

Test setup note: in happy-dom `clientWidth` is 0, so the core renders the narrow view. Every test that asserts positions binds `[breakpoint]="0"` (or stubs `clientWidth` as `packages/core/test/dom/drag.test.ts` does). Test host template: `<gm-grid [columns]="cols()" [dropMode]="mode()" [maxRows]="maxRows()" [breakpoint]="0" [(layout)]="layout" (layoutChange)="changes.push($event)" (reject)="rejects.push($event)">@for (i of layout(); track i.id) {<div [gmWidget]="i.id">{{ i.id }}</div>}</gm-grid>`.

- [ ] **Step 1: Write the failing tests** in `grid.component.spec.ts`:
  - `positions widgets from the layout`: layout `[a w2, b w1]`, 4 columns. `a` has `--gm-col: 1 / span 2` and `b` has `3 / span 1`; the host has class `gm-grid`.
  - `setting layout from outside re-renders without emitting`.
  - `addItem appends and emits; refused add emits reject`: with `maxRows` 1 and a full row, `addItem({id:'z',w:1,h:1})` returns `{ok:false, reason:'max-rows'}`, `rejects` is `['max-rows']` and the layout is unchanged. Without `maxRows` it succeeds, `changes` has one entry and `z` gets a `--gm-col`.
  - `removeItem emits and the widget goes away`.
  - `columns change emits the normalized layout exactly once` (Review Focus 2): a `w3` item, `cols.set(2)` → `changes.length === 1` and the item has `w === 2`.
  - `drag works end to end, and again after @for reorders the DOM` (Review Focus 1). Stub rects and dispatch pointer events with the helpers pattern from `packages/core/test/dom/drag.test.ts`. Set `mode` to `'swap'` at runtime, swap a↔b, then assert the change and the new DOM order. Re-stub the rects for the new order and swap again; assert the second change.
  - `destroy mid-drag leaves no ghost` (Review Focus 3): start a drag past the threshold, `fixture.destroy()`, then `document.querySelector('.gm-ghost')` is null and the host lacks `gm-grid`.
  - `re-id'd widget rebinds` (Review Focus 4): the host renders `[gmWidget]="ids()[0]"` with the layout `[b]`; start with `'x'`, then set it to `'b'` → the element gets `--gm-col`.
  - `core runs outside the Angular zone`: `vi.spyOn(TestBed.inject(NgZone), 'runOutsideAngular')` before creating the fixture, then assert it was called.
- [ ] **Step 2: Run** `pnpm --filter @grid-master/angular-workspace test` and confirm FAIL.
- [ ] **Step 3: Implement** `GmGrid` as specified and export it.
- [ ] **Step 4: Write the README** for `@grid-master/angular`. Cover:
  - Install, including the peer `@grid-master/core`.
  - Styles: `@import '@grid-master/core/grid.css';` in the global `styles.css`.
  - The template snippet with `[(layout)]`, `@for` over the layout, `gmWidget`, and `gmHandle`.
  - Inputs, outputs and methods.
  - Why `addItem` should be used instead of pushing to the layout yourself: it enforces `maxRows` and reports `reject`, while a plain `layout.update()` bypasses that.
  - Narrow-view behavior, and a pointer to the core README for drop modes.
- [ ] **Step 5: Run** `pnpm --filter @grid-master/angular-workspace test && pnpm --filter @grid-master/angular-workspace typecheck && pnpm --filter @grid-master/angular-workspace test:smoke`. Expect all to pass.
- [ ] **Step 6: Commit** `feat(angular): gm-grid component with two-way layout, options, add/remove and reject`

### Task 7: Angular demo app with dummy blocks

**Files:**
- Create via the CLI: `pnpm dlx @angular/cli@22.2.5 generate application demo --style css --ssr false --skip-tests` in `packages/angular` → `projects/demo/...`
- Create/modify: `projects/demo/src/app/app.ts`, `app.html`, `app.css`, `projects/demo/src/app/blocks.ts`, `projects/demo/src/styles.css`
- Modify: `tsconfig.json` (paths `"@grid-master/angular": ["./dist/grid-angular"]`, if the CLI didn't add it), `packages/angular/package.json` scripts (`"build": "ng build grid-angular && ng build demo"`, `"start": "ng build grid-angular && ng serve demo"`)

**Interfaces:**
- Consumes: `GmGrid`, `GmWidget`, `GmHandle`, types from `@grid-master/angular`.
- Produces: `blocks.ts` with `DEFAULT_LAYOUT: LayoutItem[]` (12 items, 4 columns, mixed `w` 1–4 and `h` 1–3, one `locked`) and `BLOCKS: Record<string, { title: string; kind: 'number' | 'chart' | 'list' | 'map' | 'form' | 'note'; color: string }>`. Content lives only in `BLOCKS`; the layout JSON stays content-agnostic.

The demo covers spec §"v1 scope" item 3, one control or block per item:
- **Toolbar:**
  - Drop mode `<select>` (insert / block / shrink / swap; changes at runtime).
  - "Limit to 6 rows" checkbox (`maxRows`).
  - "Add block" (`grid.addItem` with the next id and a random `w` 1–2; a refusal shows the reason in a status line from `(reject)`).
  - "Remove last unlocked".
  - "Save" (localStorage key `gm-demo-layout`), "Restore", "Reset".
  - "Narrow preview" toggle (wraps the grid in a 480px-wide frame, so stacking is testable without resizing the window).
- **Blocks:**
  - `@for (item of layout(); track item.id)` over `<article [gmWidget]="item.id">` with `@switch` on the block kind.
  - The `map` block has a `gmHandle` grip (its body is a fake pannable area).
  - The `form` block has an `<input>` and a `<button>`, to show controls don't start drags.
  - The locked block is visibly striped.
  - Blocks show their `w×h`.
- Below the grid, a `<pre>` shows the live layout JSON.
- `styles.css` starts with `@import '@grid-master/core/grid.css';`.
- The page is long enough (12 blocks with `rowHeight` 100) for autoscroll to matter on a laptop screen.

- [ ] **Step 1: Generate the app** and set up the paths and scripts as listed.
- [ ] **Step 2: Implement** `blocks.ts`, `app.ts` (signals: `layout`, `mode`, `limit`, `narrow`, `status`; initial layout from localStorage when valid JSON, else `DEFAULT_LAYOUT`), the template and the CSS.
- [ ] **Step 3: Run** `pnpm --filter @grid-master/core build && pnpm --filter @grid-master/angular-workspace build`. Expect success with no warnings from `grid.css` resolution. Then run root `pnpm -r build && pnpm -r test && pnpm -r typecheck`. Expect all green.
- [ ] **Step 4: Manual browser check** (the controller runs this with Chrome DevTools against `pnpm --filter @grid-master/angular-workspace start`). It checks:
  - Each mode: one allowed drop and one refused drop. The marker turns red and nothing changes.
  - An in-row reorder in block and in shrink.
  - Drag next to the locked block: the marker shows the landing spot.
  - Resize grow and shrink in shrink mode.
  - Handle-only drag on the map.
  - The input and button in the form block work and don't drag.
  - Add until refused with the limit on.
  - Save, Reset, Restore round-trip.
  - The narrow preview stacks, and a narrow reorder doesn't change the JSON.
  - Autoscroll while dragging to the bottom.
  - No console errors.

  Record the results in the task report.
- [ ] **Step 5: Commit** `feat(angular): demo app with dummy blocks covering every v1 feature`

After Task 7, a real-device touch check (long-press drag, handle drag, resize, autoscroll on a phone) remains a **manual step for the author**. It is not a task gate.
