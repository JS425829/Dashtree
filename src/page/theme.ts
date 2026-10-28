import type { Theme } from '../core/types';

const KEY = 'dashtree-theme';

export function effectiveTheme(setting: Theme, systemDark: boolean): 'light' | 'dark' {
  return setting === 'system' ? (systemDark ? 'dark' : 'light') : setting;
}

export const systemPrefersDark = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;

function setAttribute(setting: Theme): void {
  const root = document.documentElement;
  if (setting === 'system') root.removeAttribute('data-theme');
  else root.dataset.theme = setting;
}

/** Applies the theme to the page and remembers it, so the next load can paint the right colours straight away. */
export function applyTheme(setting: Theme): void {
  setAttribute(setting);
  try { localStorage.setItem(KEY, setting); } catch { /* storage unavailable: the setting still applies this load */ }
}

/** Called first thing on load, before the background has answered. */
export function applyCachedTheme(): void {
  try {
    const cached = localStorage.getItem(KEY);
    if (cached === 'light' || cached === 'dark') setAttribute(cached);
  } catch { /* nothing cached */ }
}
