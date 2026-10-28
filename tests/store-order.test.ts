import { expect, test } from 'vitest';
import { memoryStore } from './helpers';
import { addNode } from '../src/core/tree';

test('queued mutations run in call order, even with slow storage', async () => {
  const m = memoryStore({}, 5);
  const order: string[] = [];
  await Promise.all(
    ['a', 'b', 'c'].map((k) =>
      m.store.mutate((s) => { order.push(k); return addNode(s, { parentId: null, url: `https://x/${k}`, tabId: null }).state; }),
    ),
  );
  expect(order).toEqual(['a', 'b', 'c']);
  expect(Object.keys(m.state().nodes)).toHaveLength(3);
});
