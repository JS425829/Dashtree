import { normalizeSite } from '../core/rules';
import { searchNodes } from '../core/tree';
import type { NodeId, Settings, Theme, TreeState } from '../core/types';
import type { Command } from '../shared/messages';
import { effectiveTheme, systemPrefersDark } from './theme';

export function matchIds(s: TreeState, query: string): Set<NodeId> {
  return new Set(searchNodes(s, query).map((n) => n.id));
}

type BooleanSetting = 'sameTabAddsNode' | 'wipeHollowAfterRestart' | 'hollowOnTabClose';

const SETTING_LABELS: [BooleanSetting, string][] = [
  ['sameTabAddsNode', 'Clicking a link in the same tab adds a new node (off: update the current node)'],
  ['wipeHollowAfterRestart', 'After a restart, wipe hollow nodes once a tab is opened (favourites are kept)'],
  ['hollowOnTabClose', 'When a tab closes, keep its node as a hollow node (off: remove it)'],
];

const SVG_NS = 'http://www.w3.org/2000/svg';
const SUN = 'M12 7a5 5 0 100 10 5 5 0 000-10zM12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4';
const MOON = 'M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z';

function icon(path: string, cls: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', cls);
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', path);
  svg.append(p);
  return svg;
}

/** One site per line; pasted URLs and wildcards are reduced to host names, blanks and duplicates dropped. */
function parseSites(text: string): string[] {
  return [...new Set(text.split('\n').map(normalizeSite).filter(Boolean))];
}

export interface TopBar {
  update(settings: Settings): void;
}

export function renderTopBar(
  el: HTMLElement,
  settings: Settings,
  send: (c: Command) => unknown,
  onQuery: (q: string) => void,
): TopBar {
  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = 'Search tabs, URLs and notes…';
  search.setAttribute('aria-label', 'Search tabs, URLs and notes');
  search.addEventListener('input', () => onQuery(search.value));

  const spacer = document.createElement('span');
  spacer.className = 'spacer';

  // light/dark switch: shows the sun while dark (click for light) and the moon while light
  let current: Theme = settings.theme;
  const shown = () => effectiveTheme(current, systemPrefersDark());
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'theme-toggle';
  toggle.setAttribute('role', 'switch');
  toggle.setAttribute('aria-label', 'Dark mode');
  toggle.append(icon(SUN, 'sun'), icon(MOON, 'moon'));
  toggle.addEventListener('click', () => {
    void send({ type: 'setSettings', settings: { theme: shown() === 'dark' ? 'light' : 'dark' } });
  });

  const clear = document.createElement('button');
  clear.textContent = 'Clear hollow nodes';
  clear.title = 'Remove every hollow node except favourites (and the nodes kept with them)';
  clear.addEventListener('click', () => {
    if (confirm('Remove all hollow nodes except favourites?')) void send({ type: 'clearHollow' });
  });

  const gear = document.createElement('button');
  gear.textContent = 'Settings';
  const popover = document.createElement('div');
  popover.className = 'popover';
  popover.id = 'settings-popover';
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-label', 'Settings');
  popover.hidden = true;
  gear.setAttribute('aria-expanded', 'false');
  gear.setAttribute('aria-controls', popover.id);
  const setOpen = (open: boolean) => {
    popover.hidden = !open;
    gear.setAttribute('aria-expanded', String(open));
  };
  gear.addEventListener('click', () => setOpen(Boolean(popover.hidden)));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !popover.hidden) {
      setOpen(false);
      gear.focus();
    }
  });

  const boxes = new Map<BooleanSetting, HTMLInputElement>();
  for (const [key, text] of SETTING_LABELS) {
    const row = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.addEventListener('change', () => void send({ type: 'setSettings', settings: { [key]: box.checked } }));
    row.append(box, ` ${text}`);
    popover.append(row);
    boxes.set(key, box);
  }

  const themeRow = document.createElement('label');
  themeRow.className = 'field';
  const themeSelect = document.createElement('select');
  themeSelect.setAttribute('aria-label', 'Theme');
  for (const [value, text] of [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']]) {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = text;
    themeSelect.append(o);
  }
  themeSelect.addEventListener('change', () => void send({ type: 'setSettings', settings: { theme: themeSelect.value as Theme } }));
  themeRow.append('Theme ', themeSelect);

  const sitesRow = document.createElement('label');
  sitesRow.className = 'field stacked';
  const sites = document.createElement('textarea');
  sites.rows = 4;
  sites.spellcheck = false;
  sites.placeholder = 'bank.example\nmail.example.com';
  sites.setAttribute('aria-label', 'Ignored sites');
  sites.addEventListener('change', () => void send({ type: 'setSettings', settings: { ignoredSites: parseSites(sites.value) } }));
  sitesRow.append('Ignored sites: never recorded (one per line; subdomains included)', sites);

  popover.append(themeRow, sitesRow);
  el.append(search, spacer, toggle, clear, gear);
  document.body.append(popover);

  const bar: TopBar = {
    update(s) {
      current = s.theme;
      toggle.setAttribute('aria-checked', String(shown() === 'dark'));
      for (const [key, box] of boxes) box.checked = s[key];
      themeSelect.value = s.theme;
      // never overwrite what the user is in the middle of typing
      if (document.activeElement !== sites) sites.value = s.ignoredSites.join('\n');
    },
  };
  bar.update(settings);
  return bar;
}
