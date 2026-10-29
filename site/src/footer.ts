import { docsLinks } from '@grid-master/demo-kit';
import type { SiteConfig } from '@grid-master/demo-kit';

const INSTALLS = [
  { label: 'Vanilla JS', pkg: '@grid-master/core', cmd: 'pnpm add @grid-master/core' },
  { label: 'Angular', pkg: '@grid-master/angular', cmd: 'pnpm add @grid-master/angular @grid-master/core' },
  { label: 'React', pkg: '@grid-master/react', cmd: 'pnpm add @grid-master/react @grid-master/core react react-dom' },
] as const;

/** The copy shortcut for this platform: Cmd+C on Apple devices, Ctrl+C elsewhere. */
export function copyShortcut(): string {
  const nav = (globalThis.navigator ?? {}) as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform ?? nav.platform ?? nav.userAgent ?? '';
  return /mac|iphone|ipad|ipod/i.test(platform) ? 'Cmd+C' : 'Ctrl+C';
}

function selectText(node: HTMLElement): void {
  const selection = window.getSelection?.();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(node);
  selection.removeAllRanges();
  selection.addRange(range);
}

/** Copies `text`; uses the async clipboard API and falls back to a hidden textarea. Resolves to success. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const ok = typeof document.execCommand === 'function' && document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/**
 * A "Copy" button (plus a polite live region) that shows "Copied" for a moment after a successful copy.
 * If copying fails, the visible `select` element's text is selected so the person can press Ctrl+C (Cmd+C on a Mac).
 */
export function copyButton(getText: () => string, opts: { name: string; select?: HTMLElement }): DocumentFragment {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'copy';
  btn.textContent = 'Copy';
  btn.setAttribute('aria-label', `Copy ${opts.name}`);
  const status = document.createElement('span');
  status.className = 'sr-only';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  let timer: ReturnType<typeof setTimeout> | undefined;
  btn.addEventListener('click', async () => {
    const ok = await copyText(getText());
    clearTimeout(timer);
    if (!ok && opts.select) selectText(opts.select);
    const keys = copyShortcut();
    btn.textContent = ok ? 'Copied' : `Press ${keys}`;
    status.textContent = ok ? 'Copied' : `Copy failed. The text is selected: press ${keys}.`;
    btn.classList.toggle('copy--done', ok);
    timer = setTimeout(() => {
      btn.textContent = 'Copy';
      status.textContent = '';
      btn.classList.remove('copy--done');
    }, 1800);
  });
  const frag = document.createDocumentFragment();
  frag.append(btn, status);
  return frag;
}

function link(href: string, label: string): HTMLAnchorElement {
  const a = document.createElement('a');
  a.href = href;
  a.textContent = label;
  if (/^https?:/.test(href)) a.rel = 'noopener';
  return a;
}

/** Install lines with copy buttons, docs/GitHub/npm links and the licence. */
export function mountFooter(root: HTMLElement, site: SiteConfig): void {
  const install = document.createElement('div');
  install.className = 'install';
  const h2 = document.createElement('h2');
  h2.textContent = 'Get started';
  install.append(h2);
  for (const i of INSTALLS) {
    const row = document.createElement('div');
    row.className = 'install__row';
    const label = document.createElement('span');
    label.className = 'install__label';
    label.textContent = i.label;
    const code = document.createElement('code');
    code.textContent = i.cmd;
    row.append(label, code, copyButton(() => i.cmd, { name: `install command for ${i.label}`, select: code }));
    install.append(row);
  }

  const links = document.createElement('nav');
  links.className = 'footer__links';
  links.setAttribute('aria-label', 'Project links');
  const docs = docsLinks(site.repoUrl);
  if (docs) {
    links.append(link(docs.core, 'Docs: core'), link(docs.angular, 'Docs: Angular'), link(docs.react, 'Docs: React'));
  }
  if (site.repoUrl) links.append(link(site.repoUrl, 'GitHub'));
  if (site.showNpm) {
    for (const i of INSTALLS) links.append(link(`https://www.npmjs.com/package/${i.pkg}`, `npm: ${i.pkg}`));
  }

  const bottom = document.createElement('div');
  bottom.className = 'footer__bottom';
  const license = document.createElement('span');
  license.textContent = `${site.name} · MIT licensed`;
  bottom.append(license);
  if (links.childElementCount > 0) bottom.append(links);

  const inner = document.createElement('div');
  inner.className = 'footer__inner';
  inner.append(install, bottom);
  root.append(inner);
}
