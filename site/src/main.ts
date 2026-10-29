import '@grid-master/core/grid.css';
import './styles.css';
import { SITE, docsLinks } from '@grid-master/demo-kit';
import { site } from './config.js';
import { mountHero } from './hero.js';

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

byId('brand').textContent = SITE.name;

function setLink(id: string, href: string | undefined): void {
  const a = byId<HTMLAnchorElement>(id);
  if (href) {
    a.href = href;
    a.hidden = false;
  } else {
    a.hidden = true;
  }
}
setLink('nav-docs', docsLinks(site.repoUrl)?.core);
setLink('nav-github', site.repoUrl ?? undefined);

mountHero(byId('demo'));
