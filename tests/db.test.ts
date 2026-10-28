import 'fake-indexeddb/auto';
import { expect, test } from 'vitest';
import { loadState, saveState } from '../src/storage/db';
import { addNode } from '../src/core/tree';
import { EMPTY_STATE } from '../src/core/types';

test('loadState on an empty database returns the empty state', async () => {
  expect(await loadState()).toEqual(EMPTY_STATE);
});

test('saveState then loadState round-trips a node', async () => {
  const { state, id } = addNode(EMPTY_STATE, { parentId: null, url: 'https://x/a', tabId: 4 });
  await saveState(state);
  const loaded = await loadState();
  expect(loaded.nodes[id].url).toBe('https://x/a');
  expect(loaded.nodes[id].tabId).toBe(4);
});
