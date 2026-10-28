// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { addNode } from '../src/core/tree';
import { EMPTY_STATE, type TreeState } from '../src/core/types';
import { buildMenu, ignoreCandidates, type InteractCtx } from '../src/page/interact';
import { DEFAULT_LAYOUT, layoutForest } from '../src/page/layout';
import type { MenuItem } from '../src/page/menu';

function stateWith(...urls: string[]) {
  let s: TreeState = EMPTY_STATE;
  const ids: string[] = [];
  for (const url of urls) {
    const r = addNode(s, { parentId: null, url, tabId: null });
    s = r.state;
    ids.push(r.id);
  }
  return { s, ids };
}

const ctxFor = (s: TreeState, ignoredSites: string[] = []): InteractCtx => ({
  state: s, layout: layoutForest(s), opts: DEFAULT_LAYOUT, confirmDelete: true, ignoredSites, selected: new Set(),
});

const labels = (items: MenuItem[]) => items.filter((i) => i !== 'separator').map((i) => (i as { label: string }).label);
const find = (items: MenuItem[], label: string) => items.find((i) => i !== 'separator' && i.label === label) as { label: string; action: () => void };

describe('ignoreCandidates', () => {
  test('gives the site of each selected node, once each, in order', () => {
    const { s, ids } = stateWith('https://Portal.Azure.com/a', 'https://portal.azure.com/b', 'https://github.com/x');
    expect(ignoreCandidates(s, ids, [])).toEqual(['portal.azure.com', 'github.com']);
  });

  test('skips sites that are already covered, including by a parent domain', () => {
    const { s, ids } = stateWith('https://portal.azure.com/a', 'https://github.com/x');
    expect(ignoreCandidates(s, ids, ['azure.com'])).toEqual(['github.com']);
  });

  test('skips nodes with no real site: empty URLs and browser pages', () => {
    const { s, ids } = stateWith('', 'edge://settings', 'chrome-extension://abc/page.html');
    expect(ignoreCandidates(s, ids, [])).toEqual([]);
  });
});

describe('the Ignore item in the node menu', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  test('names the site for a single node and adds it to the ignored list when clicked', () => {
    const { s, ids } = stateWith('https://portal.azure.com/a');
    const send = vi.fn();
    const items = buildMenu(ids, ctxFor(s, ['bank.example']), send, () => {});
    find(items, 'Ignore portal.azure.com').action();
    expect(send).toHaveBeenCalledWith({ type: 'setSettings', settings: { ignoredSites: ['bank.example', 'portal.azure.com'] } });
  });

  test('says how many sites for a selection that spans several', () => {
    const { s, ids } = stateWith('https://portal.azure.com/a', 'https://github.com/x');
    const send = vi.fn();
    const items = buildMenu(ids, ctxFor(s), send, () => {});
    find(items, 'Ignore 2 sites').action();
    expect(send).toHaveBeenCalledWith({ type: 'setSettings', settings: { ignoredSites: ['portal.azure.com', 'github.com'] } });
  });

  test('is not offered when the site is already ignored or the node has no site', () => {
    const a = stateWith('https://portal.azure.com/a');
    expect(labels(buildMenu(a.ids, ctxFor(a.s, ['azure.com']), vi.fn(), () => {})).some((l) => l.startsWith('Ignore'))).toBe(false);
    const b = stateWith('');
    expect(labels(buildMenu(b.ids, ctxFor(b.s), vi.fn(), () => {})).some((l) => l.startsWith('Ignore'))).toBe(false);
  });

  test('confirms with a message saying what happened and what did not', () => {
    const { s, ids } = stateWith('https://portal.azure.com/a');
    find(buildMenu(ids, ctxFor(s), vi.fn(), () => {}), 'Ignore portal.azure.com').action();
    const toast = document.querySelector('[role=status]')!;
    expect(toast.textContent).toContain('portal.azure.com');
    expect(toast.textContent).toContain('already in the tree');
  });

  test('the existing menu items are all still there', () => {
    const { s, ids } = stateWith('https://portal.azure.com/a');
    expect(labels(buildMenu(ids, ctxFor(s), vi.fn(), () => {}))).toEqual([
      'Delete', 'Delete with children', 'Add notes', 'Select hollow children', 'Create group…', 'Ignore portal.azure.com',
    ]);
  });
});
