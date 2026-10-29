// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { MODES, siteConfig } from '@grid-master/demo-kit';
import { mountFrameworks } from '../src/frameworks.js';
import { mountHero } from '../src/hero.js';

const site = siteConfig({});

let root: HTMLElement;
let cleanup: Array<() => void> = [];

const click = (target: HTMLElement) => target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
const key = (target: HTMLElement, k: string) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const tab = (label: string) =>
  [...root.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) => t.textContent?.trim() === label)!;
const panelOf = (t: HTMLElement) => document.getElementById(t.getAttribute('aria-controls')!)!;
const iframes = () => [...root.querySelectorAll('iframe')];

beforeEach(() => {
  document.body.innerHTML = '';
  vi.stubGlobal('requestAnimationFrame', undefined);
  vi.stubGlobal('cancelAnimationFrame', undefined);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000);
  root = document.createElement('div');
  document.body.appendChild(root);
});
afterEach(() => {
  cleanup.forEach((c) => c());
  cleanup = [];
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mount(s = site) {
  const f = mountFrameworks(root, s);
  cleanup.push(() => f.destroy());
  return f;
}

describe('framework tabs', () => {
  test('tabs switch panels with aria-selected and arrow keys', () => {
    mount();
    const list = root.querySelector('[role="tablist"]')!;
    expect(list).not.toBeNull();
    const labels = [...root.querySelectorAll('[role="tab"]')].map((t) => t.textContent?.trim());
    expect(labels).toEqual(['Vanilla JS', 'Angular', 'React']);

    expect(tab('Vanilla JS').getAttribute('aria-selected')).toBe('true');
    expect(panelOf(tab('Vanilla JS')).hidden).toBe(false);
    expect(panelOf(tab('Angular')).hidden).toBe(true);
    expect(tab('Angular').tabIndex).toBe(-1);

    click(tab('Angular'));
    expect(tab('Angular').getAttribute('aria-selected')).toBe('true');
    expect(tab('Vanilla JS').getAttribute('aria-selected')).toBe('false');
    expect(panelOf(tab('Angular')).hidden).toBe(false);
    expect(panelOf(tab('Vanilla JS')).hidden).toBe(true);
    expect(panelOf(tab('Angular')).getAttribute('role')).toBe('tabpanel');

    key(tab('Angular'), 'ArrowRight');
    expect(tab('React').getAttribute('aria-selected')).toBe('true');
    expect(panelOf(tab('React')).hidden).toBe(false);
    key(tab('React'), 'ArrowRight'); // wraps
    expect(tab('Vanilla JS').getAttribute('aria-selected')).toBe('true');
    key(tab('Vanilla JS'), 'ArrowLeft'); // wraps back
    expect(tab('React').getAttribute('aria-selected')).toBe('true');
    key(tab('React'), 'Home');
    expect(tab('Vanilla JS').getAttribute('aria-selected')).toBe('true');
    key(tab('Vanilla JS'), 'End');
    expect(tab('React').getAttribute('aria-selected')).toBe('true');
    expect(tab('React').tabIndex).toBe(0);
  });

  test('iframes are created on first open with src under the base and never reloaded', () => {
    mount();
    expect(iframes()).toHaveLength(0);

    click(tab('Angular'));
    expect(iframes()).toHaveLength(1);
    const angular = iframes()[0]!;
    expect(angular.title).toBe('Angular demo');
    expect(angular.getAttribute('loading')).toBe('lazy');
    expect(angular.getAttribute('src')).toBe('/angular/');

    click(tab('React'));
    expect(iframes()).toHaveLength(2);
    const react = iframes()[1]!;
    expect(react.title).toBe('React demo');
    expect(react.getAttribute('src')).toBe('/react/');

    click(tab('Angular'));
    expect(iframes()).toHaveLength(2);
    expect(iframes()[0]).toBe(angular);
    expect(angular.isConnected).toBe(true);
    expect(angular.getAttribute('src')).toBe('/angular/');
    expect(iframes()[1]).toBe(react);
  });

  test('base is respected', () => {
    mount({ ...site, base: '/grid-master/' });
    click(tab('Angular'));
    click(tab('React'));
    expect(iframes().map((f) => f.getAttribute('src'))).toEqual(['/grid-master/angular/', '/grid-master/react/']);
  });

  test('vanilla panel has its own mode switch independent from the hero', () => {
    const heroRoot = document.createElement('div');
    document.body.appendChild(heroRoot);
    const hero = mountHero(heroRoot);
    cleanup.push(() => hero.destroy());
    mount();
    const heroHint = () => heroRoot.querySelector('.hero-hint')!.textContent;
    const panel = panelOf(tab('Vanilla JS'));
    const radio = (label: string) =>
      [...panel.querySelectorAll<HTMLElement>('[role="radio"]')].find((r) => r.textContent?.trim() === label)!;

    expect(panel.querySelector('[role="radiogroup"]')).not.toBeNull();
    expect(panel.querySelector('.gm-grid')).not.toBeNull();
    expect(heroHint()).toBe(MODES[0]!.hint);
    click(radio('Swap'));
    expect(radio('Swap').getAttribute('aria-checked')).toBe('true');
    expect(panel.querySelector('.demo-hint')!.textContent).toBe(MODES[3]!.hint);
    expect(heroHint()).toBe(MODES[0]!.hint);
    const heroSwap = [...heroRoot.querySelectorAll('[role="radio"]')].find((r) => r.textContent?.trim() === 'Swap')!;
    expect(heroSwap.getAttribute('aria-checked')).toBe('false');
  });

  test('each panel shows a highlighted code block', () => {
    mount();
    expect(panelOf(tab('Vanilla JS')).querySelector('pre code')!.textContent).toContain('createGrid');
    expect(panelOf(tab('Angular')).querySelector('pre code')!.textContent).toContain('gmWidget');
    expect(panelOf(tab('React')).querySelector('pre code')!.textContent).toContain('Widget.Handle');
    const pre = panelOf(tab('Vanilla JS')).querySelector('pre')!;
    expect(pre.getAttribute('role')).toBe('region');
    expect(pre.getAttribute('aria-label')).toBe('Vanilla JS example code');
    expect(pre.tabIndex).toBe(0);
  });
});
