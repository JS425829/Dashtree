// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from 'vitest';
import { applyTheme, effectiveTheme } from '../src/page/theme';

describe('effectiveTheme', () => {
  test('an explicit choice wins over the system setting', () => {
    expect(effectiveTheme('light', true)).toBe('light');
    expect(effectiveTheme('dark', false)).toBe('dark');
  });

  test('"system" follows the system setting', () => {
    expect(effectiveTheme('system', true)).toBe('dark');
    expect(effectiveTheme('system', false)).toBe('light');
  });
});

describe('applyTheme', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    localStorage.clear();
  });

  test('an explicit theme is set on the page and remembered for the next load', () => {
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('dashtree-theme')).toBe('dark');
  });

  test('"system" removes the override', () => {
    applyTheme('light');
    applyTheme('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});
