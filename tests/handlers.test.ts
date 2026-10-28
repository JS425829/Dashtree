import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  RESTORE_GRACE_MS, activateNode, handleCommand, onCommitted, onStartup, onTabCreated, onTabRemoved, onTabUpdated,
} from '../src/background/handlers';
import { addNode, nodeForTab, setFavourite } from '../src/core/tree';
import { memoryStore, type MemoryStore } from './helpers';

const commit = (m: MemoryStore, tabId: number, url: string, extra: Partial<Parameters<typeof onCommitted>[1]> = {}) =>
  onCommitted(m.store, { tabId, url, transitionType: 'link', qualifiers: [], fromHistoryState: false, ...extra });

const urls = (m: MemoryStore) => Object.values(m.state().nodes).map((n) => n.url);

describe('building the tree', () => {
  test('a link opened in a new tab becomes a child of the opener tab\'s node', async () => {
    const m = memoryStore();
    await commit(m, 1, 'https://x/a', { transitionType: 'typed' });
    await onTabCreated(m.store, { tabId: 2, openerTabId: 1 });
    await commit(m, 2, 'https://x/b');
    const a = nodeForTab(m.state(), 1)!;
    const b = nodeForTab(m.state(), 2)!;
    expect(a.parentId).toBeNull();
    expect(b.parentId).toBe(a.id);
    expect(b.url).toBe('https://x/b');
  });

  test('a first commit in an untracked tab creates a root', async () => {
    const m = memoryStore();
    await commit(m, 1, 'https://x/a', { transitionType: 'typed' });
    expect(nodeForTab(m.state(), 1)!.parentId).toBeNull();
  });

  test('Azure-style storm of identical history-state events adds exactly one node', async () => {
    const m = memoryStore();
    await commit(m, 1, 'https://portal.azure.com/', { transitionType: 'typed' });
    for (let i = 0; i < 20; i++) {
      await commit(m, 1, 'https://portal.azure.com/rg/1', { fromHistoryState: true });
    }
    expect(Object.keys(m.state().nodes)).toHaveLength(2);
  });

  test('same-tab link navigation adds a child and the old page goes hollow', async () => {
    const m = memoryStore();
    await commit(m, 1, 'https://x/a', { transitionType: 'typed' });
    await commit(m, 1, 'https://x/b');
    const nodes = Object.values(m.state().nodes);
    const a = nodes.find((n) => n.url === 'https://x/a')!;
    const b = nodes.find((n) => n.url === 'https://x/b')!;
    expect(a.tabId).toBeNull();
    expect(b.tabId).toBe(1);
    expect(b.parentId).toBe(a.id);
  });

  test('with the setting off, same-tab navigation updates the node instead', async () => {
    const m = memoryStore({ sameTabAddsNode: false });
    await commit(m, 1, 'https://x/a', { transitionType: 'typed' });
    await commit(m, 1, 'https://x/b');
    expect(urls(m)).toEqual(['https://x/b']);
  });

  test('reload and back/forward add nothing', async () => {
    const m = memoryStore();
    await commit(m, 1, 'https://x/a', { transitionType: 'typed' });
    await commit(m, 1, 'https://x/b', { transitionType: 'reload' });
    await commit(m, 1, 'https://x/c', { qualifiers: ['forward_back'] });
    expect(urls(m)).toEqual(['https://x/a']);
  });

  test('a client redirect updates the current node instead of adding an intermediate node', async () => {
    const m = memoryStore();
    await commit(m, 1, 'https://x/a', { transitionType: 'typed' });
    await commit(m, 1, 'https://x/b');
    await commit(m, 1, 'https://x/b-final', { qualifiers: ['client_redirect'] });
    expect(urls(m).sort()).toEqual(['https://x/a', 'https://x/b-final']);
  });

  test('a typed URL in a tracked tab starts a new root and the old node goes hollow', async () => {
    const m = memoryStore();
    await commit(m, 1, 'https://x/a', { transitionType: 'typed' });
    await commit(m, 1, 'https://x/b', { transitionType: 'typed' });
    const nodes = Object.values(m.state().nodes);
    const a = nodes.find((n) => n.url === 'https://x/a')!;
    const b = nodes.find((n) => n.url === 'https://x/b')!;
    expect(b.parentId).toBeNull();
    expect(b.tabId).toBe(1);
    expect(a.tabId).toBeNull();
  });

  test('opening the same link twice from one page reuses the hollow child', async () => {
    const m = memoryStore();
    await commit(m, 1, 'https://x/a', { transitionType: 'typed' });
    await onTabCreated(m.store, { tabId: 2, openerTabId: 1 });
    await commit(m, 2, 'https://x/b');
    await onTabRemoved(m.store, 2);
    await onTabCreated(m.store, { tabId: 3, openerTabId: 1 });
    await commit(m, 3, 'https://x/b');
    expect(urls(m).sort()).toEqual(['https://x/a', 'https://x/b']);
    expect(nodeForTab(m.state(), 3)!.url).toBe('https://x/b');
  });

  test('edge:// and extension pages are never recorded', async () => {
    const m = memoryStore();
    await commit(m, 1, 'edge://newtab/', { transitionType: 'typed' });
    await commit(m, 2, 'chrome-extension://abc/index.html', { transitionType: 'typed' });
    expect(urls(m)).toEqual([]);
  });

  test('navigating a tracked tab to an unrecorded page hollows its node and records nothing new', async () => {
    const m = memoryStore();
    await commit(m, 1, 'https://x/a', { transitionType: 'typed' });
    await commit(m, 1, 'edge://settings/', { transitionType: 'typed' });
    expect(nodeForTab(m.state(), 1)).toBeUndefined();
    expect(urls(m)).toEqual(['https://x/a']);
  });

  test('onTabUpdated stores title and favicon on the tab\'s node', async () => {
    const m = memoryStore();
    await commit(m, 1, 'https://x/a', { transitionType: 'typed' });
    await onTabUpdated(m.store, 1, { title: 'A page', favIconUrl: 'https://x/f.ico' });
    const n = nodeForTab(m.state(), 1)!;
    expect(n.title).toBe('A page');
    expect(n.favIconUrl).toBe('https://x/f.ico');
  });
});

describe('closing tabs', () => {
  test('closing a tab makes its node hollow by default', async () => {
    const m = memoryStore();
    await commit(m, 1, 'https://x/a', { transitionType: 'typed' });
    await onTabRemoved(m.store, 1);
    expect(urls(m)).toEqual(['https://x/a']);
    expect(nodeForTab(m.state(), 1)).toBeUndefined();
  });

  test('with hollowOnTabClose off the node is removed', async () => {
    const m = memoryStore({ hollowOnTabClose: false });
    await commit(m, 1, 'https://x/a', { transitionType: 'typed' });
    await onTabRemoved(m.store, 1);
    expect(urls(m)).toEqual([]);
  });
});

describe('restart', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function seed(m: MemoryStore) {
    let s = m.state();
    const fav = addNode(s, { parentId: null, url: 'https://x/fav', tabId: 1 }); s = setFavourite(fav.state, fav.id, true);
    const gone = addNode(s, { parentId: null, url: 'https://x/gone', tabId: 2 }); s = gone.state;
    const back = addNode(s, { parentId: null, url: 'https://x/back', tabId: 3 }); s = back.state;
    m.set(s);
    return { fav: fav.id, gone: gone.id, back: back.id };
  }

  test('startup hollows every node', async () => {
    const m = memoryStore();
    seed(m);
    await onStartup(m.store);
    expect(Object.values(m.state().nodes).every((n) => n.tabId === null)).toBe(true);
  });

  test('after the grace period the first new tab wipes unprotected hollow nodes, keeping favourites and re-attached tabs', async () => {
    const m = memoryStore();
    const ids = seed(m);
    await onStartup(m.store);
    await onTabCreated(m.store, { tabId: 9 });
    await commit(m, 9, 'https://x/back', { transitionType: 'typed' });
    await vi.advanceTimersByTimeAsync(RESTORE_GRACE_MS);
    const nodes = m.state().nodes;
    expect(nodes[ids.fav]).toBeDefined();
    expect(nodes[ids.back].tabId).toBe(9);
    expect(nodes[ids.gone]).toBeUndefined();
  });

  test('nothing is wiped when the setting is off', async () => {
    const m = memoryStore({ wipeHollowAfterRestart: false });
    const ids = seed(m);
    await onStartup(m.store);
    await onTabCreated(m.store, { tabId: 9 });
    await vi.advanceTimersByTimeAsync(RESTORE_GRACE_MS);
    expect(m.state().nodes[ids.gone]).toBeDefined();
  });

  test('the wipe happens only once', async () => {
    const m = memoryStore();
    seed(m);
    await onStartup(m.store);
    await onTabCreated(m.store, { tabId: 9 });
    await vi.advanceTimersByTimeAsync(RESTORE_GRACE_MS);
    const later = addNode(m.state(), { parentId: null, url: 'https://x/later', tabId: null });
    m.set(later.state);
    await onTabCreated(m.store, { tabId: 10 });
    await vi.advanceTimersByTimeAsync(RESTORE_GRACE_MS);
    expect(m.state().nodes[later.id]).toBeDefined();
  });
});

describe('activating a node', () => {
  test('an open node focuses its tab and does not open a new one', async () => {
    const m = memoryStore();
    await commit(m, 1, 'https://x/a', { transitionType: 'typed' });
    const id = nodeForTab(m.state(), 1)!.id;
    const api = { focusTab: vi.fn(async () => {}), openTab: vi.fn(async () => 50) };
    await activateNode(m.store, id, api);
    expect(api.focusTab).toHaveBeenCalledWith(1);
    expect(api.openTab).not.toHaveBeenCalled();
  });

  test('a hollow node reopens its URL and takes the new tab id', async () => {
    const m = memoryStore();
    await commit(m, 1, 'https://x/a', { transitionType: 'typed' });
    const id = nodeForTab(m.state(), 1)!.id;
    await onTabRemoved(m.store, 1);
    const api = { focusTab: vi.fn(async () => {}), openTab: vi.fn(async () => 50) };
    await activateNode(m.store, id, api);
    expect(api.openTab).toHaveBeenCalledWith('https://x/a');
    expect(m.state().nodes[id].tabId).toBe(50);
  });

  test('a stale tab id (focus rejects) falls back to reopening', async () => {
    const m = memoryStore();
    await commit(m, 1, 'https://x/a', { transitionType: 'typed' });
    const id = nodeForTab(m.state(), 1)!.id;
    const api = { focusTab: vi.fn(async () => { throw new Error('No tab with id: 1'); }), openTab: vi.fn(async () => 77) };
    await activateNode(m.store, id, api);
    expect(api.openTab).toHaveBeenCalledWith('https://x/a');
    expect(m.state().nodes[id].tabId).toBe(77);
  });
});

describe('commands', () => {
  test('delete removes the nodes and favourite/note commands update them', async () => {
    const m = memoryStore();
    await commit(m, 1, 'https://x/a', { transitionType: 'typed' });
    const id = nodeForTab(m.state(), 1)!.id;
    await handleCommand(m.store, { type: 'setFavourite', id, value: true });
    await handleCommand(m.store, { type: 'setNote', id, note: 'hi' });
    expect(m.state().nodes[id].favourite).toBe(true);
    expect(m.state().nodes[id].note).toBe('hi');
    await handleCommand(m.store, { type: 'delete', ids: [id], withChildren: false });
    expect(m.state().nodes[id]).toBeUndefined();
  });

  test('createGroup then addToGroup via commands', async () => {
    const m = memoryStore();
    await commit(m, 1, 'https://x/a', { transitionType: 'typed' });
    await commit(m, 2, 'https://x/b', { transitionType: 'typed' });
    const [a, b] = [nodeForTab(m.state(), 1)!.id, nodeForTab(m.state(), 2)!.id];
    await handleCommand(m.store, { type: 'createGroup', name: 'G', colour: '#f00', nodeIds: [a] });
    const gid = Object.keys(m.state().groups)[0];
    await handleCommand(m.store, { type: 'addToGroup', groupId: gid, nodeIds: [b] });
    expect(m.state().groups[gid].nodeIds).toEqual([a, b]);
  });
});
