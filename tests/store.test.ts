import { expect, test } from 'vitest';
import { createStore, type StoreDeps } from '../src/background/store';
import { addNode } from '../src/core/tree';
import { DEFAULT_SETTINGS, EMPTY_STATE, type TreeState } from '../src/core/types';

function memoryDeps() {
  let saved: TreeState = EMPTY_STATE;
  let changes = 0;
  const deps: StoreDeps = {
    // yield so a naive implementation would interleave its load/save pairs
    load: async () => { await Promise.resolve(); return saved; },
    save: async (s) => { await Promise.resolve(); saved = s; },
    settings: async () => DEFAULT_SETTINGS,
    onChange: () => { changes++; },
  };
  return { deps, saved: () => saved, changes: () => changes };
}

test('two concurrent mutations both apply, in order', async () => {
  const m = memoryDeps();
  const store = createStore(m.deps);
  await Promise.all([
    store.mutate((s) => addNode(s, { parentId: null, url: 'https://x/a', tabId: 1 }).state),
    store.mutate((s) => addNode(s, { parentId: null, url: 'https://x/b', tabId: 2 }).state),
  ]);
  const urls = Object.values(m.saved().nodes).map((n) => n.url).sort();
  expect(urls).toEqual(['https://x/a', 'https://x/b']);
  expect(m.changes()).toBe(2);
});

test('a failing mutation does not block later ones', async () => {
  const m = memoryDeps();
  const store = createStore(m.deps);
  await store.mutate(() => { throw new Error('boom'); }).catch(() => {});
  await store.mutate((s) => addNode(s, { parentId: null, url: 'https://x/c', tabId: 3 }).state);
  expect(Object.keys(m.saved().nodes)).toHaveLength(1);
});
