import '@dash-builder/core/grid.css';
import './styles.css';
import { DEMO_LAYOUT, SITE, docsLinks } from '@dash-builder/demo-kit';
import { site } from './config.js';
import { mountFeatures } from './features.js';
import { mountFooter } from './footer.js';
import { mountFrameworks } from './frameworks.js';
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

const features = mountFeatures(byId('features'));
features.setLayout(DEMO_LAYOUT);
mountHero(byId('demo'), { onLayoutChange: (layout) => features.setLayout(layout) });
mountFrameworks(byId('frameworks'), site);
mountFooter(byId('footer'), site);
