// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/core/types';
import { DEFAULT_GLOW, applyCachedGlow, applyGlow } from '../src/page/theme';
import { renderTopBar } from '../src/page/topbar';

const root = () => document.documentElement;

describe('applying the glow colour', () => {
  beforeEach(() => {
    root().style.removeProperty('--glow');
    localStorage.clear();
  });

  test('a valid colour becomes the page\'s glow and is remembered for the next load', () => {
    applyGlow('#ff00aa');
    expect(root().style.getPropertyValue('--glow')).toBe('#ff00aa');
    expect(localStorage.getItem('histo-tree-glow')).toBe('#ff00aa');
  });

  test('an empty colour goes back to the theme\'s own glow', () => {
    applyGlow('#ff00aa');
    applyGlow('');
    expect(root().style.getPropertyValue('--glow')).toBe('');
    expect(localStorage.getItem('histo-tree-glow')).toBe('');
  });

  test('anything that is not a plain #rrggbb colour is refused, so it can never reach the styling', () => {
    applyGlow('red; background:url(//evil)');
    applyGlow('#fff');
    applyGlow('url(x)');
    expect(root().style.getPropertyValue('--glow')).toBe('');
    expect(root().getAttribute('style') ?? '').not.toContain('evil');
  });

  test('the remembered colour is applied straight away on the next load, but only if it is valid', () => {
    localStorage.setItem('histo-tree-glow', '#112233');
    applyCachedGlow();
    expect(root().style.getPropertyValue('--glow')).toBe('#112233');
    root().style.removeProperty('--glow');
    localStorage.setItem('histo-tree-glow', 'not a colour');
    applyCachedGlow();
    expect(root().style.getPropertyValue('--glow')).toBe('');
  });
});

describe('the glow colour setting', () => {
  function setup(glowColour = '') {
    document.body.innerHTML = '<header id="bar"></header>';
    const send = vi.fn();
    const bar = renderTopBar(document.getElementById('bar')!, { ...DEFAULT_SETTINGS, glowColour }, send, () => {});
    return { send, bar };
  }
  const picker = () => document.querySelector<HTMLInputElement>('input[type=color][aria-label="Glow colour"]')!;
  const reset = () => [...document.querySelectorAll('button')].find((b) => b.textContent === 'Reset glow')!;

  test('is a colour picker in Appearance, showing the default colour until one is chosen', () => {
    setup();
    expect(picker().value).toBe(DEFAULT_GLOW);
  });

  test('shows the chosen colour', () => {
    setup('#ff00aa');
    expect(picker().value).toBe('#ff00aa');
  });

  test('picking a colour sends it', () => {
    const { send } = setup();
    picker().value = '#3366ff';
    picker().dispatchEvent(new Event('change'));
    expect(send).toHaveBeenCalledWith({ type: 'setSettings', settings: { glowColour: '#3366ff' } });
  });

  test('Reset glow clears the choice, and is disabled when there is nothing to reset', () => {
    const { send, bar } = setup();
    expect((reset() as HTMLButtonElement).disabled).toBe(true);
    bar.update({ ...DEFAULT_SETTINGS, glowColour: '#ff00aa' });
    expect((reset() as HTMLButtonElement).disabled).toBe(false);
    reset().click();
    expect(send).toHaveBeenCalledWith({ type: 'setSettings', settings: { glowColour: '' } });
  });

  test('follows changes from the background', () => {
    const { bar } = setup();
    bar.update({ ...DEFAULT_SETTINGS, glowColour: '#abcdef' });
    expect(picker().value).toBe('#abcdef');
    bar.update({ ...DEFAULT_SETTINGS, glowColour: '' });
    expect(picker().value).toBe(DEFAULT_GLOW);
  });
});

describe('the stylesheet uses the glow colour', () => {
  const css = readFileSync('src/page/index.html', 'utf8');
  const rule = (selector: string) => new RegExp(`${selector.replace(/[.]/g, '\\.')}\\s*\\{[^}]*\\}`).exec(css)?.[0] ?? '';

  test('it defaults to the theme accent and drives every glow: dots, lines, selection, matches, open cards, logo', () => {
    expect(css).toMatch(/--glow:\s*var\(--accent\)/);
    for (const sel of ['.connectors .link.open', '.connectors .dot.open', '.node.selected', '.node.match', '.node.open', '#topbar .logo']) {
      expect(rule(sel), sel).toContain('var(--glow)');
    }
  });
});
