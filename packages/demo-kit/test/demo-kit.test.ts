import { describe, expect, it } from 'vitest';
import { BLOCKS, DEMO_LAYOUT, MODES, SITE, blockInfo, docsLinks, nextBlockId, siteConfig } from '../src/index.js';

describe('demo layout and blocks', () => {
  it('DEMO_LAYOUT ids are unique and each has a BLOCKS entry', () => {
    const ids = DEMO_LAYOUT.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(8);
    for (const id of ids) expect(Object.hasOwn(BLOCKS, id)).toBe(true);
    expect(Object.keys(BLOCKS).sort()).toEqual([...ids].sort());
  });

  it("exactly one locked block ('pinned'), map is kind 'map', contact is kind 'form'", () => {
    expect(DEMO_LAYOUT.filter((i) => i.locked).map((i) => i.id)).toEqual(['pinned']);
    expect(BLOCKS['map']!.kind).toBe('map');
    expect(BLOCKS['contact']!.kind).toBe('form');
    expect(BLOCKS['revenue']!.value).toBe('$48.2k');
    expect(BLOCKS['users']!.value).toBe('1,284');
  });

  it('layout items carry only id/w/h/minW/minH/locked', () => {
    const allowed = new Set(['id', 'w', 'h', 'minW', 'minH', 'locked']);
    for (const item of DEMO_LAYOUT) for (const k of Object.keys(item)) expect(allowed.has(k)).toBe(true);
  });

  it('blockInfo falls back for unknown and prototype keys', () => {
    expect(blockInfo('constructor').title).toBe('constructor');
    expect(blockInfo('nope')).toEqual({ title: 'nope', kind: 'note', accent: '#e2e8f0' });
    expect(blockInfo('revenue').title).toBe(BLOCKS['revenue']!.title);
  });

  it('nextBlockId skips used ids', () => {
    expect(nextBlockId([])).toBe('new-1');
    expect(nextBlockId([{ id: 'new-1', w: 1, h: 1 }])).toBe('new-2');
    expect(nextBlockId([{ id: 'new-2', w: 1, h: 1 }, { id: 'new-1', w: 1, h: 1 }])).toBe('new-3');
  });
});

describe('MODES', () => {
  it('MODES order and labels', () => {
    expect(MODES.map((m) => m.mode)).toEqual(['insert', 'block', 'shrink', 'swap']);
    expect(MODES.map((m) => m.label)).toEqual(['Insert', 'Block', 'Shrink to fit', 'Swap']);
    for (const m of MODES) {
      expect(m.hint.length).toBeGreaterThan(0);
      expect(m.hint.length).toBeLessThanOrEqual(140);
    }
  });
});

describe('site config', () => {
  it('derives base, repo url and name from the environment', () => {
    expect(SITE.name).toBe('grid-master');
    expect(siteConfig({ GITHUB_REPOSITORY: 'kp/grid-master' })).toEqual({
      name: 'grid-master',
      base: '/grid-master/',
      repoUrl: 'https://github.com/kp/grid-master',
      showNpm: false,
    });
    expect(siteConfig({})).toMatchObject({ base: '/', repoUrl: null, showNpm: false });
    expect(siteConfig({ SHOW_NPM: '1' }).showNpm).toBe(true);
    expect(siteConfig({ SHOW_NPM: '0' }).showNpm).toBe(false);
  });

  it('a <owner>.github.io repo still gets the base /<repo>/', () => {
    const c = siteConfig({ GITHUB_REPOSITORY: 'kp/kp.github.io' });
    expect(c.base).toBe('/kp.github.io/');
    expect(c.repoUrl).toBe('https://github.com/kp/kp.github.io');
  });

  it('docsLinks', () => {
    expect(docsLinks('https://github.com/kp/grid-master')).toEqual({
      core: 'https://github.com/kp/grid-master/blob/main/packages/core/README.md',
      angular: 'https://github.com/kp/grid-master/blob/main/packages/angular/projects/grid-angular/README.md',
      react: 'https://github.com/kp/grid-master/blob/main/packages/react/README.md',
    });
    expect(docsLinks(null)).toBeNull();
  });
});
