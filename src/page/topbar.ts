import { searchNodes } from '../core/tree';
import type { NodeId, Settings, TreeState } from '../core/types';
import type { Command } from '../shared/messages';

export function matchIds(s: TreeState, query: string): Set<NodeId> {
  return new Set(searchNodes(s, query).map((n) => n.id));
}

const SETTING_LABELS: [keyof Settings, string][] = [
  ['sameTabAddsNode', 'Clicking a link in the same tab adds a new node (off: update the current node)'],
  ['wipeHollowAfterRestart', 'After a restart, wipe hollow nodes once a tab is opened (favourites are kept)'],
  ['hollowOnTabClose', 'When a tab closes, keep its node as a hollow node (off: remove it)'],
];

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

  const boxes = new Map<keyof Settings, HTMLInputElement>();
  for (const [key, text] of SETTING_LABELS) {
    const row = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.addEventListener('change', () => void send({ type: 'setSettings', settings: { [key]: box.checked } }));
    row.append(box, ` ${text}`);
    popover.append(row);
    boxes.set(key, box);
  }

  el.append(search, spacer, clear, gear);
  document.body.append(popover);

  const bar: TopBar = {
    update(s) {
      for (const [key, box] of boxes) box.checked = s[key];
    },
  };
  bar.update(settings);
  return bar;
}
