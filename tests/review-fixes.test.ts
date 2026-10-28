import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  activateNode, onCommitted, onStartup, onTabCreated, onTabRemoved, onTabUpdated,
} from '../src/background/handlers';
import { addNode, nodeForTab, setFavourite } from '../src/core/tree';
import { memoryStore, tabIdsAreUnique, type MemoryStore } from './helpers';

const commit = (m: MemoryStore, tabId: number, url: string, extra: Partial<Parameters<typeof onCommitted>[1]> = {}) =>
  onCommitted(m.store, { tabId, url, transitionType: 'link', qualifiers: [], fromHistoryState: false, ...extra });

const urls = (m: MemoryStore) => Object.values(m.state().nodes).map((n) => n.url);
const typed = { transitionType: 'typed' };

describe('Critical: events arriving together keep their lineage', () => {
  test('onCreated and onCommitted fired back to back (slow storage) still file the tab under its opener', async () => {
    const m = memoryStore({}, 5);
    await commit(m, 1, 'https://x/a', typed);
    await Promise.all([
      onTabCreated(m.store, { tabId: 2, openerTabId: 1 }),
      commit(m, 2, 'https://x/b'),
    ]);
    const a = nodeForTab(m.state(), 1)!;
    expect(nodeForTab(m.state(), 2)!.parentId).toBe(a.id);
    expect(tabIdsAreUnique(m.state())).toBe(true);
  });
});

describe('Important: Azure Portal fragment routes', () => {
  const home = 'https://portal.azure.com/#home';
  const blade = 'https://portal.azure.com/#view/HubsExtension/BrowseResourceGroups';
  const rg = 'https://portal.azure.com/#@contoso.onmicrosoft.com/resource/subscriptions/1/resourceGroups/rg-prod-uk';

  test('route-style fragment changes are recorded as nodes, each distinct route once', async () => {
    const m = memoryStore();
    await commit(m, 1, home, typed);
    for (const u of [blade, rg, rg, rg]) await commit(m, 1, u, { fromHistoryState: true });
    expect(urls(m).sort()).toEqual([blade, home, rg].sort());
  });

  test('a plain in-page anchor is still ignored', async () => {
    const m = memoryStore();
    await commit(m, 1, 'https://x/page', typed);
    await commit(m, 1, 'https://x/page#section-2', { fromHistoryState: true });
    expect(urls(m)).toEqual(['https://x/page']);
  });
});

describe('Important: Back and Forward move the open marker', () => {
  test('Back returns the tab to the earlier node and later links file under it', async () => {
    const m = memoryStore();
    await commit(m, 1, 'https://x/a', typed);
    await commit(m, 1, 'https://x/b');
    await commit(m, 1, 'https://x/a', { qualifiers: ['forward_back'] });
    const nodes = Object.values(m.state().nodes);
    const a = nodes.find((n) => n.url === 'https://x/a')!;
    const b = nodes.find((n) => n.url === 'https://x/b')!;
    expect(a.tabId).toBe(1);
    expect(b.tabId).toBeNull();
    await commit(m, 1, 'https://x/c');
    expect(Object.values(m.state().nodes).find((n) => n.url === 'https://x/c')!.parentId).toBe(a.id);
    expect(tabIdsAreUnique(m.state())).toBe(true);
  });

  test('Back to a page with no node nearby updates the current node and adds nothing', async () => {
    const m = memoryStore();
    await commit(m, 1, 'https://x/a', typed);
    await commit(m, 1, 'https://elsewhere/z', { qualifiers: ['forward_back'] });
    expect(urls(m)).toEqual(['https://elsewhere/z']);
  });
});

describe('Important: re-attaching by URL only happens during a restart', () => {
  test('typing a URL that matches an old hollow node starts a new root', async () => {
    const m = memoryStore();
    m.set(addNode(m.state(), { parentId: null, url: 'https://dev.azure.com/org', tabId: null }).state);
    await commit(m, 5, 'https://dev.azure.com/org', typed);
    expect(Object.keys(m.state().nodes)).toHaveLength(2);
    expect(nodeForTab(m.state(), 5)!.parentId).toBeNull();
  });
});

describe('Important: restart ordering and timing', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  const seedTwo = (m: MemoryStore) => {
    const keep = addNode(m.state(), { parentId: null, url: 'https://x/open', tabId: 1 });
    const gone = addNode(keep.state, { parentId: null, url: 'https://x/gone', tabId: 2 });
    m.set(gone.state);
    return { keep: keep.id, gone: gone.id };
  };

  test('startup adopts tabs that are already open by URL', async () => {
    const m = memoryStore();
    const ids = seedTwo(m);
    await onStartup(m.store, [{ tabId: 5, url: 'https://x/open' }]);
    expect(m.state().nodes[ids.keep].tabId).toBe(5);
    expect(m.state().nodes[ids.gone].tabId).toBeNull();
  });

  test('a tab created during the restore window with a matching URL re-attaches (lazy-restored tab)', async () => {
    const m = memoryStore();
    const ids = seedTwo(m);
    await onStartup(m.store);
    await onTabCreated(m.store, { tabId: 9, url: 'https://x/open' });
    expect(m.state().nodes[ids.keep].tabId).toBe(9);
    expect(Object.keys(m.state().nodes)).toHaveLength(2);
  });

  test('the wipe is skipped if no tab opens within ten minutes of startup', async () => {
    const m = memoryStore();
    const ids = seedTwo(m);
    await onStartup(m.store);
    await vi.advanceTimersByTimeAsync(11 * 60 * 1000);
    await onTabCreated(m.store, { tabId: 9 });
    await vi.advanceTimersByTimeAsync(5000);
    expect(m.state().nodes[ids.gone]).toBeDefined();
    expect(m.state().pendingWipe).toBe(false);
  });
});

describe('Important: one tab, one node', () => {
  test('reopening a hollow node never leaves two nodes on the same tab', async () => {
    const m = memoryStore();
    let s = m.state();
    const twin = addNode(s, { parentId: null, url: 'https://x/a', tabId: null }); s = twin.state;
    const clicked = addNode(s, { parentId: null, url: 'https://x/a', tabId: null }); s = clicked.state;
    m.set(s);
    const api = {
      focusTab: vi.fn(async () => {}),
      openTab: vi.fn(async () => { await commit(m, 7, 'https://x/a', typed); return 7; }),
    };
    await activateNode(m.store, clicked.id, api);
    expect(tabIdsAreUnique(m.state())).toBe(true);
    expect(m.state().nodes[clicked.id].tabId).toBe(7);
    expect(Object.keys(m.state().nodes).sort()).toEqual([twin.id, clicked.id].sort());
  });
});

describe('Important: in-page navigation keeps the icon and title', () => {
  test('a child made by a history-state change starts with its parent\'s title and favicon', async () => {
    const m = memoryStore();
    await commit(m, 1, 'https://dev.azure.com/o', typed);
    await onTabUpdated(m.store, 1, { title: 'Repos', favIconUrl: 'https://dev.azure.com/f.ico' });
    await commit(m, 1, 'https://dev.azure.com/o/p/_git/r', { fromHistoryState: true });
    const child = nodeForTab(m.state(), 1)!;
    expect(child.url).toBe('https://dev.azure.com/o/p/_git/r');
    expect(child.title).toBe('Repos');
    expect(child.favIconUrl).toBe('https://dev.azure.com/f.ico');
  });
});

describe('Important: InPrivate is never recorded', () => {
  test('the manifest does not allow the extension in incognito windows', () => {
    const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
    expect(manifest.incognito).toBe('not_allowed');
  });
});

// keep imports used even if a test above is edited
void onTabRemoved; void setFavourite;
