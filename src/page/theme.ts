import { isHexColour } from '../core/tree';
import type { Theme } from '../core/types';

// Pre-rename storage key, kept so existing users' remembered theme still applies.
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

const GLOW_KEY = 'histo-tree-glow';

/** What the colour picker shows while no glow colour has been chosen (the light theme's own glow). */
export const DEFAULT_GLOW = '#1f9d84';

function setGlowProperty(colour: string): void {
  const root = document.documentElement;
  if (isHexColour(colour)) root.style.setProperty('--glow', colour);
  else root.style.removeProperty('--glow'); // empty or not a plain #rrggbb colour: use the theme's own glow
}

/** Applies the glow colour and remembers it. Only plain #rrggbb colours get through, as it ends up in a style. */
export function applyGlow(colour: string): void {
  setGlowProperty(colour);
  try { localStorage.setItem(GLOW_KEY, isHexColour(colour) ? colour : ''); } catch { /* storage unavailable */ }
}

/** Called first thing on load, before the background has answered. */
export function applyCachedGlow(): void {
  try {
    const cached = localStorage.getItem(GLOW_KEY);
    if (cached) setGlowProperty(cached);
  } catch { /* nothing cached */ }
}
