# dash-builder

A drag-and-drop dashboard grid with a framework-agnostic core and thin Angular and React wrappers.

**Demo:** https://constantine-24.github.io/dash-builder/

| Package | Description |
| --- | --- |
| [`@dash-builder/core`](packages/core/README.md) | Framework-agnostic grid engine (vanilla JS/TS) |
| [`@dash-builder/react`](packages/react/README.md) | React wrapper |
| [`@dash-builder/angular`](packages/angular/projects/grid-angular/README.md) | Angular wrapper |

## Development

```sh
pnpm install
pnpm build       # build every package (not the demo site: see below)
pnpm test        # run all tests
pnpm typecheck
pnpm pack:check  # pack the three packages as npm would and check the tarballs (after pnpm build)
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow, changesets and releases.

## Demo site

The `site/` workspace is a GitHub Pages demo: a landing page with a draggable hero grid plus
Vanilla JS, Angular and React tabs (the Angular and React demos are served from `/angular/` and `/react/`).

Build and preview locally:

```sh
export GITHUB_REPOSITORY=<owner>/<repo>
pnpm build:site && pnpm --filter @dash-builder/site preview
```

`pnpm build:site` builds all packages, then assembles `site/dist` (the site's own `build:site` script) and runs a dist check. The site base path is
`/<repo>/` when `GITHUB_REPOSITORY` is set, otherwise `/`. The same variable adds the GitHub repository link.

Environment variables:

- `GITHUB_REPOSITORY=<owner>/<repo>`: base path `/<repo>/` and the GitHub links (set automatically by GitHub Actions).
- `SHOW_NPM=1`: show the npm links; use it after the packages are published to npm.

Publish: push to GitHub, then in the repository **Settings -> Pages** set **Source: GitHub Actions**.
The `.github/workflows/pages.yml` workflow builds and deploys the site on every push to `main`
(or run it manually with *workflow_dispatch*).
