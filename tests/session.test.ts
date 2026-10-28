import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { RESTORE_GRACE_MS, onCommitted, onSessionStart, onTabCreated, onTabRemoved } from '../src/background/handlers';
import { addNode, clearHollow, nodeForTab } from '../src/core/tree';
import { EMPTY_STATE } from '../src/core/types';
import { memoryStore, restart, type MemoryStore } from './helpers';

const OLD = 1; // a node left over from a previous session is much older than the current one

function seedOld(m: MemoryStore, nodes: { url: string; tabId: number | null }[]) {
  let s = m.state();
  const ids: string[] = [];
  for (const n of nodes) {
    const r = addNode(s, { parentId: null, url: n.url, tabId: n.tabId }, OLD);
    s = r.state;
    ids.push(r.id);
  }
  m.set(s);
  return ids;
}

describe('reloading or updating the extension is not a browser restart', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  test('opening a tab afterwards never wipes the saved tree', async () => {
    const m = memoryStore();
    const [old] = seedOld(m, [{ url: 'https://x/old', tabId: null }]);
    await onSessionStart(m.store, []); // the extension started; no browser-start event
    await onTabCreated(m.store, { tabId: 9 });
    await vi.advanceTimersByTimeAsync(RESTORE_GRACE_MS * 3);
    expect(m.state().nodes[old]).toBeDefined();
    expect(m.state().pendingWipe).toBeFalsy();
  });
});

describe('a new session keeps tabs that are still open', () => {
  test('a node keeps its tab id when that tab still exists showing the same page; others go hollow', async () => {
    const m = memoryStore();
    const [alive, moved, closed] = seedOld(m, [
      { url: 'https://x/alive', tabId: 11 },
      { url: 'https://x/moved', tabId: 12 },
      { url: 'https://x/closed', tabId: 13 },
    ]);
    await onSessionStart(m.store, [
      { tabId: 11, url: 'https://x/alive' },
      { tabId: 12, url: 'https://x/somewhere-else' },
    ]);
    expect(m.state().nodes[alive].tabId).toBe(11);
    expect(m.state().nodes[moved].tabId).toBeNull(); // same id, but a different page now: it is some other tab
    expect(m.state().nodes[closed].tabId).toBeNull();
  });

  test('a hollow node still adopts a different open tab that shows its page', async () => {
    const m = memoryStore();
    const [n] = seedOld(m, [{ url: 'https://x/page', tabId: 12 }]);
    await onSessionStart(m.store, [{ tabId: 12, url: 'https://x/other' }, { tabId: 14, url: 'https://x/page' }]);
    expect(m.state().nodes[n].tabId).toBe(14);
  });

  test('two open tabs on the same page are not both given to one node', async () => {
    const m = memoryStore();
    const [n] = seedOld(m, [{ url: 'https://x/page', tabId: null }]);
    await onSessionStart(m.store, [{ tabId: 20, url: 'https://x/page' }, { tabId: 21, url: 'https://x/page' }]);
    const holders = Object.values(m.state().nodes).filter((x) => x.tabId !== null);
    expect(holders).toHaveLength(1);
    expect(holders[0].id).toBe(n);
  });
});

describe('the wipe after a browser restart only touches the previous session', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  test('hollow nodes made during this session survive, however soon the wipe runs', async () => {
    const m = memoryStore();
    const [old] = seedOld(m, [{ url: 'https://x/old', tabId: null }]);
    await restart(m);
    vi.setSystemTime(Date.now() + 500);
    await onCommitted(m.store, { tabId: 5, url: 'https://x/new', transitionType: 'typed', qualifiers: [], fromHistoryState: false });
    await onTabRemoved(m.store, 5); // hollow, but made in this session
    await onTabCreated(m.store, { tabId: 9 }); // arms the wipe
    await vi.advanceTimersByTimeAsync(RESTORE_GRACE_MS);
    expect(m.state().nodes[old]).toBeUndefined();
    expect(Object.values(m.state().nodes).map((n) => n.url)).toEqual(['https://x/new']);
    expect(nodeForTab(m.state(), 5)).toBeUndefined();
  });
});

describe('clearHollow can be limited to older nodes', () => {
  test('createdBefore keeps newer hollow nodes and removes older ones', () => {
    const a = addNode(EMPTY_STATE, { parentId: null, url: 'https://x/a', tabId: null }, 10);
    const b = addNode(a.state, { parentId: null, url: 'https://x/b', tabId: null }, 100);
    const cleared = clearHollow(b.state, { createdBefore: 50 });
    expect(cleared.nodes[a.id]).toBeUndefined();
    expect(cleared.nodes[b.id]).toBeDefined();
  });
});
