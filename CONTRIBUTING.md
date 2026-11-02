# Contributing

Thanks for your interest in improving **dash-builder**! Bug reports, docs fixes and pull requests are all welcome.

## Getting started

```bash
git clone https://github.com/Constantine-24/dash-builder.git
cd dash-builder
nvm use               # Node version from .nvmrc
corepack enable       # pnpm version from package.json "packageManager"
pnpm install
pnpm build
```

## Project layout

| Path                                     | What                                                                  |
| ---------------------------------------- | --------------------------------------------------------------------- |
| `packages/core/`                         | `@dash-builder/core`: the framework-agnostic engine, no dependencies  |
| `packages/angular/projects/grid-angular` | `@dash-builder/angular`: the Angular wrapper (in an Angular CLI workspace, with the `demo` and `site-demo` apps) |
| `packages/react/`                        | `@dash-builder/react`: the React wrapper (and its dev demo)           |
| `packages/demo-kit/`                     | Private: blocks, layout and theme shared by the demo site's grids     |
| `site/`                                  | The demo site, deployed to GitHub Pages                               |

## Development loop

```bash
pnpm build                               # the tests import each package's built dist
pnpm test                                # everything
pnpm typecheck
pnpm test:smoke                          # each built package loads through its exports
pnpm pack:check                          # tarball contents, workspace: ranges, type resolution
pnpm --filter @dash-builder/react demo   # React dev demo
pnpm --filter @dash-builder/angular-workspace start   # Angular dev demo
```

## Demo site

`site/` is the GitHub Pages demo: a landing page with a draggable hero grid plus Vanilla JS, Angular and React tabs (the Angular and React apps are served from `/angular/` and `/react/`). Build and preview it locally:

```bash
export GITHUB_REPOSITORY=Constantine-24/dash-builder
pnpm build:site && pnpm --filter @dash-builder/site preview
```

`pnpm build:site` builds all packages, assembles `site/dist` and runs a dist check. Environment variables:

- `GITHUB_REPOSITORY=<owner>/<repo>`: base path `/<repo>/` and the GitHub links (set automatically by GitHub Actions; without it the base is `/`).
- `SHOW_NPM=1`: show the npm links (once the packages are on npm).

The README screenshot is `docs/images/demo.png`: the live site's first screen at 1280×800 (2× DPR).

## Pull requests

1. Open an issue first for anything beyond a small fix, so we can agree on the API.
2. Branch from `main` (`feat/…`, `fix/…`, `docs/…`).
3. Write a failing test first. A change to one wrapper comes with the same change in the other.
4. Add a changeset (`pnpm changeset`) for any user-visible change to a published package.
5. Use [Conventional Commits](https://www.conventionalcommits.org/) (`fix(core): …`, `feat(react): …`).

`main` is protected: changes land through pull requests (squash or rebase, linear history) once CI is green (build, type-check, tests, smoke tests, hook tests, package check, site build). Force-pushes and branch deletion are blocked.

## Releases

Releases are automated with [Changesets](https://github.com/changesets/changesets) from `.github/workflows/release.yml`. Pushing to `main` with pending changesets opens or updates a "Version Packages" PR that bumps versions and writes each package's `CHANGELOG.md`; merging that PR publishes to npm with provenance, through npm trusted publishing (no npm token is stored).

- **Lockstep versions:** `@dash-builder/core`, `@dash-builder/angular` and `@dash-builder/react` are `fixed` in `.changeset/config.json`, so every release moves all three to the same version.
- **Pre-1.0 semver:** breaking changes are a minor bump (with migration notes), features minor, fixes patch.
- **Peer range on core:** the wrappers declare `workspace:0.x` (published as `0.x`), together with `onlyUpdatePeerDependentsWhenOutOfRange`. Don't change it to `workspace:^`: pre-1.0, `^0.1.0` excludes `0.2.0` and Changesets would answer with a major bump. Run `pnpm changeset status --verbose` after touching the config. At 1.0 the range becomes `workspace:^`.
- `@dash-builder/angular` publishes from `packages/angular/dist/grid-angular` (`publishConfig.directory`); pnpm rewrites `workspace:` ranges at pack time, and `pnpm pack:check` proves it.
- Each package carries a byte-identical copy of the root `LICENSE` (CI compares them).
- The Version Packages PR is opened with `GITHUB_TOKEN`, so it shows no CI checks: `pnpm release` re-runs the build, type-check, tests, smoke tests and `pack:check` before publishing, and an admin merges it through the ruleset's pull-request bypass.
- The release job runs only in `Constantine-24/dash-builder`, never in forks.
- **Agents never publish or push tags.** `.claude/hooks/block-raw-tooling.js` (registered in `.claude/settings.json`, tested in CI with `pnpm test:hooks`) blocks publishing, `npm deprecate`/`dist-tag`, tag pushes and `gh release create`. The maintainer runs those by hand when needed.

### Trusted publishing (maintainer)

Each package's trusted publisher on npmjs.com (Settings → Trusted Publisher) names GitHub owner `Constantine-24`, repository `dash-builder`, workflow `release.yml`, no environment, and allows direct `npm publish`. Every field is case-sensitive.

npm expires a trusted publisher **48 hours after it is created** unless a CI publish uses it first; after one successful publish it is permanent. So whenever a trusted publisher is (re)created, merge the next Version Packages PR within 48 hours. Editing an entry doesn't reset the clock: delete and recreate it. An expired or mismatched trusted publisher makes the Release run fail at publish with `404 Not Found`.

0.1.0 was published by hand (no provenance) before trusted publishing existed for these packages; every later version comes from `release.yml` with provenance.

### GitHub Pages (once)

In the repository **Settings → Pages**, set **Source: GitHub Actions**. `.github/workflows/pages.yml` then deploys the demo site on every push to `main`. The site build step in `pages.yml` sets `SHOW_NPM=1`, so the deployed site shows the npm links.
