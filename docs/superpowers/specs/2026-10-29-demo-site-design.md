# Demo Site (GitHub Pages) — Design

Date: 2026-10-29
Status: Draft for review

## Intent

A public demo site for the grid library, published on GitHub Pages, for **developers who are looking for a dashboard grid library** and comparing options (gridstack, react-grid-layout and the like).

**Why:** the existing demos (`packages/core/examples/vanilla.html`, the Angular demo app, the React Vite demo) are test pages. The library needs one good-looking page that shows what makes it different in the first seconds, and shows that it works the same in vanilla JS, Angular and React.

**What a visitor must try first (author):** dragging, and the **drop-mode switch** (Insert / Block / Shrink to fit / Swap). The calm drag, where nothing moves until you drop, is the library's main selling point.

## Goals

1. **One site, one landing page** *(author)*, with framework tabs. Not three separate sites.
2. **Look: "clean light"** *(author picked option A of three)*. A docs-site feel similar to Linear or Vercel: a white background, thin slate borders and one blue accent (`#2563eb`). The marker uses the accent colour and a refused drop uses red, as in the core defaults.
3. **Page structure, top to bottom** *(author approved)*:
   1. **Nav bar:** library name; links to Demo (#), Frameworks (#), Docs (the READMEs on GitHub) and GitHub.
   2. **Hero, "try it now":**
      - The headline (a draft: "A dashboard grid that stays calm while you drag") and a one-line subline naming Vanilla JS, Angular and React.
      - The **drop-mode segmented control**.
      - A **one-line hint** that explains the current mode and changes with the switch.
      - A **live grid** (vanilla core) that can be dragged immediately. It includes one block with a drag handle and one locked block.
      - Small toggles under the grid: **row limit**, **narrow view** (phone stacking preview) and **reset**.
   3. **Features at a glance:** six cards, for drag handles, locked widgets, resize (same rules as drop), row limit, phone stacking, and layout as JSON. Each card shows a tiny looping animation or a one-line "try it in the grid above".
   4. **Pick your framework:** tabs for Vanilla JS, Angular and React. Each tab shows that framework's **setup code** next to the **same dashboard running in that framework**.
   5. **Install and links:** the npm install line per framework; links to GitHub, npm and the three READMEs; MIT.
4. **The Angular and React tabs run the real packages** *(author approved my recommendation)*: `@grid-master/angular` and `@grid-master/react`, not the vanilla grid styled to look like them. Each runs as a small standalone app shown inside the tab's demo area through an **iframe** *(my call)*. That keeps Angular and React from clashing on one page and keeps the landing page light. All three framework demos use the same blocks and look as the hero grid.
5. **Publishing:**
   - A **GitHub Actions workflow** builds core, both wrappers, the two framework mini-apps and the landing page on every push to `main`, then deploys to GitHub Pages using the official Pages actions *(my call, author approved)*.
   - The URL base path is taken from the **repository name** at build time, so the site works under `https://<user>.github.io/<repo>/` without editing anything.
   - The author switches Pages to "GitHub Actions" once in the repo settings; the README should say so.
6. **The library name** on the page is "grid-master" (the working name), set in **one place** so it can change before publishing *(my call, author approved)*.
7. **The existing test demos stay untouched.** They remain development tools. The site is new code.

## Non-goals

- A docs site: "Docs" links to the READMEs on GitHub.
- Analytics, cookies or tracking.
- A custom domain.
- Publishing the packages to npm. The install line shows the package names, which only work once they are published.
- Dark mode. *(My call: the author chose the light look; a dark theme can come later.)*
- A keyboard-accessible grid. The library itself doesn't support keyboard reordering yet, but the page chrome (nav, tabs, toggles) must be keyboard-usable.

## Anti-goals

- A hero that needs reading before trying: the grid must be draggable on first view, above the fold on a laptop screen.
- A heavy landing page: the hero must not wait for Angular or React to load.
- Demos that disagree: the four grids (hero, Vanilla, Angular, React tabs) must show the same blocks and the same behaviour.
- Anything that looks like a test page: no debug JSON dumps in the hero. A small "layout JSON" view belongs to the "layout is JSON" feature card or a collapsible panel.

## Constraints

- **Where it lives:** `site/` at the repo root, a new pnpm workspace package (private, never published). It depends on the workspace packages, so it always shows the current code.
- **Tools:** Vite for the landing page *(my call)*. The Angular mini-app uses the Angular CLI (the workspace already exists under `packages/angular`), and the React mini-app uses Vite. The builder decides how each mini-app is laid out on disk.
- **Static only:** the output is plain files that GitHub Pages can serve, and every URL respects the base path.
- **Versions:** use the newest versions that the repo's pnpm `minimumReleaseAge` policy accepts, as elsewhere in the repo.
- **Phones:** the site is responsive. On a phone the hero grid shows the narrow (stacked) view, and dragging still works (long-press or handle).
- **No secrets:** the workflow uses only the built-in `GITHUB_TOKEN` / Pages permissions.

## Framework tabs: own controls *(author, 2026-10-29)*

The hero's controls (drop mode, row limit, narrow view, reset) drive **only the hero grid**. Each framework tab's mini-app has **its own small drop-mode switch**, the same segmented control in the same look, inside its demo area. The page never syncs state into the iframes, so each tab stands alone as "this is how it runs in this framework".

## My calls (not explicitly confirmed by the author)

- The iframes for the framework tabs; Vite for the landing page.
- **The narrow-view toggle** shows the hero grid inside a phone-width frame (480 px, below the 640 px default breakpoint), as in the existing demos. It does not change `breakpoint`, so real phones still get the narrow view naturally.
- **Base path and links:**
  - The base path and the GitHub URLs come from `GITHUB_REPOSITORY` at build time. A local build without it uses base `/` and leaves out the GitHub link.
  - "Docs" links to the three READMEs on GitHub (`blob/main/packages/…/README.md`).
  - npm links are hidden behind one flag until the packages are published. The install lines stay as they are.
- **CI:**
  - The workflow uses Node 22 and pnpm 12.11.2, the versions this repo already uses, and runs `pnpm install --frozen-lockfile`.
  - It can't be run until a remote exists. Acceptance is a local build with `GITHUB_REPOSITORY=<user>/<repo>` set, served from that sub-path and checked in a browser.
- **The Angular tab's app** is a third project in the existing `packages/angular` workspace (`angular.json`). The existing `demo` project is left untouched.
- **The React tab's app** is a second Vite entry in `site/` (or in `packages/react`), whichever is simpler. The existing React demo is left untouched.
- **The setup code in each tab** is a short quickstart. It uses the same API calls as that tab's mini-app (props/inputs, `onLayoutChange`/`[(layout)]`, a handle), so the snippet and the running demo can't disagree in shape.
- The exact headline wording is a draft and can be changed freely.
- Dark mode is a non-goal for now.
- The feature-card animations should stay small: CSS or a tiny scripted loop, with no animation library.

## Left to the builder

- Copywriting beyond the headline, including the per-mode hint texts. These must match the core README's description of each mode.
- How the dummy blocks look (a KPI number, a mini chart, a list, a map with a grip, a locked "pinned" block, a small form), keeping them shared across the four grids.
- The feature-card animations.
- How code snippets are highlighted (a static pre-highlighted block or a tiny highlighter).
- The build orchestration (root script names) and how the workflow caches pnpm.
- Iframe sizing and loading (lazy loading when a tab is first opened).
