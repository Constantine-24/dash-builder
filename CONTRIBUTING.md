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

## Pull requests

1. Open an issue first for anything beyond a small fix, so we can agree on the API.
2. Branch from `main` (`feat/…`, `fix/…`, `docs/…`).
3. Write a failing test first. A change to one wrapper comes with the same change in the other.
4. Add a changeset (`pnpm changeset`) for any user-visible change to a published package.
5. Use [Conventional Commits](https://www.conventionalcommits.org/) (`fix(core): …`, `feat(react): …`).

CI must be green (build, type-check, tests, smoke tests, package check, site build) before merge.

## Releases

Releases are automated with [Changesets](https://github.com/changesets/changesets) from `.github/workflows/release.yml`. Pushing to `main` with pending changesets opens or updates a "Version Packages" PR that bumps versions and writes each package's `CHANGELOG.md`; merging that PR publishes to npm with provenance, through npm trusted publishing (no npm token is stored).

- **Lockstep versions:** `@dash-builder/core`, `@dash-builder/angular` and `@dash-builder/react` are `fixed` in `.changeset/config.json`, so every release moves all three to the same version.
- **Pre-1.0 semver:** breaking changes are a minor bump (with migration notes), features minor, fixes patch.
- **Peer range on core:** the wrappers declare `workspace:0.x` (published as `0.x`), together with `onlyUpdatePeerDependentsWhenOutOfRange`. Don't change it to `workspace:^`: pre-1.0, `^0.1.0` excludes `0.2.0` and Changesets would answer with a major bump. Run `pnpm changeset status --verbose` after touching the config. At 1.0 the range becomes `workspace:^`.
- `@dash-builder/angular` publishes from `packages/angular/dist/grid-angular` (`publishConfig.directory`); pnpm rewrites `workspace:` ranges at pack time, and `pnpm pack:check` proves it.
- Each package carries a byte-identical copy of the root `LICENSE` (CI compares them).
- The Version Packages PR is opened with `GITHUB_TOKEN`, so it shows no CI checks; `pnpm release` re-runs the build, tests and `pack:check` before publishing.

### First publish (maintainer, once)

npm trusted publishers can only be added to packages that already exist, so the first version is published by hand:

1. Merge the first "Version Packages" PR (it takes all three packages to 0.1.0). Its publish step fails for lack of a trusted publisher; that is expected.
2. Locally, on an up-to-date `main`: `npm login` (an account in the `dash-builder` npm org), then `pnpm build && pnpm changeset publish`.
3. On npmjs.com, for each package → Settings → Trusted Publisher: GitHub owner `Constantine-24`, repository `dash-builder`, workflow `release.yml`, no environment, allow `npm publish`.
4. From then on, `release.yml` publishes through OIDC with provenance.

### GitHub Pages (once)

In the repository **Settings → Pages**, set **Source: GitHub Actions**. `.github/workflows/pages.yml` then deploys the demo site on every push to `main`. After the first npm publish, add `SHOW_NPM=1` to the site build step in `pages.yml` to show the npm links.
