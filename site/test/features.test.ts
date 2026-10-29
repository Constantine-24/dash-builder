// @vitest-environment happy-dom
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { siteConfig } from '@grid-master/demo-kit';
import { mountFeatures } from '../src/features.js';
import { copyShortcut, mountFooter } from '../src/footer.js';
import { SNIPPETS, highlight } from '../src/snippets.js';

let root: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
});

describe('features', () => {
  test('six cards', () => {
    mountFeatures(root);
    const titles = [...root.querySelectorAll('.feature h3')].map((h) => h.textContent);
    expect(root.querySelector('.feature__json')!.getAttribute('tabindex')).toBe('0');
    expect(titles).toEqual([
      'Drag handles',
      'Locked widgets',
      'Resize, same rules',
      'Row limit',
      'Phone stacking',
      'Layout is JSON',
    ]);
  });

  test('JSON details shows the layout passed to its update callback', () => {
    const f = mountFeatures(root);
    const details = root.querySelector('details')!;
    expect(details).not.toBeNull();
    f.setLayout([
      { id: 'a', w: 2, h: 1 },
      { id: 'b', w: 1, h: 1, locked: true },
    ]);
    const shown = JSON.parse(details.querySelector('pre')!.textContent!);
    expect(shown).toEqual([
      { id: 'a', w: 2, h: 1 },
      { id: 'b', w: 1, h: 1, locked: true },
    ]);
    f.setLayout([{ id: 'z', w: 1, h: 1 }]);
    expect(JSON.parse(details.querySelector('pre')!.textContent!)).toEqual([{ id: 'z', w: 1, h: 1 }]);
  });
});

describe('snippets', () => {
  test('highlight escapes HTML', () => {
    const out = highlight('<a>', 'html');
    expect(out).toContain('&lt;a');
    expect(out).not.toContain('<a>');
    expect(highlight('x & "<b>"', 'ts')).not.toContain('<b>');
  });

  test('snippets mention the API each demo uses', () => {
    expect(SNIPPETS.vanilla).toContain('createGrid');
    expect(SNIPPETS.vanilla).toContain('data-grid-handle');
    expect(SNIPPETS.vanilla).toContain('data-grid-id');
    expect(SNIPPETS.angular).toContain('gmWidget');
    expect(SNIPPETS.angular).toContain('[(layout)]');
    expect(SNIPPETS.angular).toContain('gmHandle');
    expect(SNIPPETS.react).toContain('onLayoutChange');
    expect(SNIPPETS.react).toContain('Widget.Handle');
    // names used in the snippets are declared in them
    expect(SNIPPETS.react).toMatch(/const initial\b/);
    expect(SNIPPETS.vanilla).toMatch(/const save\b/);
    expect(SNIPPETS.vanilla).toMatch(/bundler/);
  });
});

describe('footer', () => {
  const base = siteConfig({ GITHUB_REPOSITORY: 'o/grid-master' });
  const hrefs = () => [...root.querySelectorAll('a')].map((a) => a.getAttribute('href'));

  test('showNpm false hides npm links; repo links and MIT are shown', () => {
    mountFooter(root, base);
    expect(hrefs().some((h) => h!.includes('npmjs.com'))).toBe(false);
    expect(hrefs()).toContain('https://github.com/o/grid-master');
    expect(hrefs().some((h) => h!.includes('/blob/main/'))).toBe(true);
    expect(root.textContent).toContain('MIT');
    expect(root.textContent).toContain('pnpm add @grid-master/core');
    expect(root.textContent).toContain('pnpm add @grid-master/angular @grid-master/core');
    expect(root.textContent).toContain('pnpm add @grid-master/react @grid-master/core');
  });

  test('showNpm true adds npm links', () => {
    mountFooter(root, { ...base, showNpm: true });
    expect(hrefs()).toContain('https://www.npmjs.com/package/@grid-master/core');
    expect(hrefs()).toContain('https://www.npmjs.com/package/@grid-master/angular');
    expect(hrefs()).toContain('https://www.npmjs.com/package/@grid-master/react');
  });

  test('repoUrl null has no GitHub or Docs links', () => {
    mountFooter(root, { ...base, repoUrl: null });
    expect(hrefs()).toEqual([]);
    expect(root.textContent).toContain('MIT');
    expect(root.textContent).not.toContain('GitHub');
    expect(root.textContent).not.toContain('Docs');
  });

  test('copy button writes to the clipboard and shows Copied', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    mountFooter(root, base);
    const btn = root.querySelector<HTMLButtonElement>('.copy')!;
    btn.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith('pnpm add @grid-master/core');
    expect(btn.textContent).toBe('Copied');
    expect(btn.getAttribute('aria-label')).toBe('Copy install command for Vanilla JS');
    expect(root.querySelector('[role="status"]')!.textContent).toBe('Copied');
    vi.unstubAllGlobals();
  });

  test('copy falls back gracefully without clipboard', async () => {
    vi.stubGlobal('navigator', {});
    mountFooter(root, base);
    const btn = root.querySelector<HTMLButtonElement>('.copy')!;
    expect(() => btn.click()).not.toThrow();
    vi.unstubAllGlobals();
  });

  test('copy shortcut follows the platform', () => {
    vi.stubGlobal('navigator', { platform: 'MacIntel' });
    expect(copyShortcut()).toBe('Cmd+C');
    vi.stubGlobal('navigator', { userAgentData: { platform: 'Windows' } });
    expect(copyShortcut()).toBe('Ctrl+C');
    vi.stubGlobal('navigator', {});
    expect(copyShortcut()).toBe('Ctrl+C');
    vi.unstubAllGlobals();
  });
});
