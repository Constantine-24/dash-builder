import { docsLinks } from '@grid-master/demo-kit';
import type { SiteConfig } from '@grid-master/demo-kit';

const INSTALLS = [
  { label: 'Vanilla JS', pkg: '@grid-master/core', cmd: 'pnpm add @grid-master/core' },
  { label: 'Angular', pkg: '@grid-master/angular', cmd: 'pnpm add @grid-master/angular @grid-master/core' },
  { label: 'React', pkg: '@grid-master/react', cmd: 'pnpm add @grid-master/react @grid-master/core react react-dom' },
] as const;

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

/** A "Copy" button that shows "Copied" for a moment after a successful copy. */
export function copyButton(getText: () => string, label = 'Copy'): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'copy';
  btn.textContent = label;
  let timer: ReturnType<typeof setTimeout> | undefined;
  btn.addEventListener('click', async () => {
    const ok = await copyText(getText());
    clearTimeout(timer);
    btn.textContent = ok ? 'Copied' : 'Press Ctrl+C';
    btn.classList.toggle('copy--done', ok);
    timer = setTimeout(() => {
      btn.textContent = label;
      btn.classList.remove('copy--done');
    }, 1800);
  });
  return btn;
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
    row.append(label, code, copyButton(() => i.cmd));
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
