export interface SiteConfig {
  name: string;
  base: string;
  repoUrl: string | null;
  showNpm: boolean;
}

/** The library name, defined once. */
export const SITE = { name: 'grid-master' };

/**
 * Base path is `/<repo>/` whenever GITHUB_REPOSITORY is `<owner>/<repo>`, else `/`.
 * Deliberately simple: a `<owner>.github.io` repository (served at the domain root)
 * still gets `/<repo>/`.
 */
export function siteConfig(env: { GITHUB_REPOSITORY?: string; SHOW_NPM?: string }): SiteConfig {
  const [owner, repo] = (env.GITHUB_REPOSITORY ?? '').split('/');
  const hasRepo = Boolean(owner && repo);
  return {
    name: SITE.name,
    base: hasRepo ? `/${repo}/` : '/',
    repoUrl: hasRepo ? `https://github.com/${owner}/${repo}` : null,
    showNpm: env.SHOW_NPM === '1',
  };
}

export function docsLinks(repoUrl: string | null): { core: string; angular: string; react: string } | null {
  if (!repoUrl) return null;
  const blob = `${repoUrl}/blob/main`;
  return {
    core: `${blob}/packages/core/README.md`,
    angular: `${blob}/packages/angular/projects/grid-angular/README.md`,
    react: `${blob}/packages/react/README.md`,
  };
}
