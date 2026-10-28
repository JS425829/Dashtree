import { describe, expect, test } from 'vitest';
import { handleCommand } from '../src/background/handlers';
import { addNode, moveNode, orderedSiblings, stepTarget } from '../src/core/tree';
import { EMPTY_STATE, type NodeId, type TreeState } from '../src/core/types';
import { layoutForest } from '../src/page/layout';
import { memoryStore } from './helpers';

/** Three roots A, B, C created in that order, plus a child X under A. */
function roots() {
  let s: TreeState = EMPTY_STATE;
  const make = (parentId: NodeId | null, url: string, createdAt: number) => {
    const r = addNode(s, { parentId, url, tabId: null }, createdAt);
    s = r.state;
    return r.id;
  };
  const a = make(null, 'https://x/a', 1);
  const b = make(null, 'https://x/b', 2);
  const c = make(null, 'https://x/c', 3);
  const x = make(a, 'https://x/x', 4);
  return { s: () => s, set: (n: TreeState) => { s = n; }, a, b, c, x, make };
}

describe('sibling order', () => {
  test('by default siblings are in the order they were created', () => {
    const { s, a, b, c } = roots();
    expect(orderedSiblings(s(), b)).toEqual([a, b, c]);
  });

  test('moving C before A', () => {
    const { s, a, b, c } = roots();
    expect(orderedSiblings(moveNode(s(), c, a, 'before'), a)).toEqual([c, a, b]);
  });

  test('moving A after C', () => {
    const { s, a, b, c } = roots();
    expect(orderedSiblings(moveNode(s(), a, c, 'after'), a)).toEqual([b, c, a]);
  });

  test('moving into the middle', () => {
    const { s, a, b, c } = roots();
    expect(orderedSiblings(moveNode(s(), c, b, 'before'), a)).toEqual([a, c, b]);
  });

  test('only siblings can be reordered: another parent\'s child, itself, or an unknown node change nothing', () => {
    const { s, a, x } = roots();
    expect(moveNode(s(), a, x, 'before')).toBe(s());
    expect(moveNode(s(), a, a, 'after')).toBe(s());
    expect(moveNode(s(), a, 'nope', 'after')).toBe(s());
  });

  test('moving a node to where it already is changes nothing', () => {
    const { s, a, b } = roots();
    expect(moveNode(s(), a, b, 'before')).toBe(s());
  });

  test('reordering one set of siblings leaves every other node untouched', () => {
    const { s, a, c, x } = roots();
    const after = moveNode(s(), c, a, 'before');
    expect(after.nodes[x].order).toBeUndefined();
    expect(after.nodes[x].parentId).toBe(a);
  });

  test('a sibling added after a reorder goes to the end', () => {
    const r = roots();
    r.set(moveNode(r.s(), r.c, r.a, 'before'));
    const d = r.make(null, 'https://x/d', 5);
    expect(orderedSiblings(r.s(), d).at(-1)).toBe(d);
  });

  test('the same works for the children of a node', () => {
    const r = roots();
    const y = r.make(r.a, 'https://x/y', 6);
    expect(orderedSiblings(moveNode(r.s(), y, r.x, 'before'), y)).toEqual([y, r.x]);
  });

  test('children whose parent has gone count as roots, like the layout treats them', () => {
    const r = roots();
    const orphan = r.make('missing-parent', 'https://x/o', 7);
    expect(orderedSiblings(r.s(), orphan)).toContain(r.a);
  });
});

describe('one step left or right', () => {
  test('gives the neighbour to move beside, or null at the ends', () => {
    const { s, a, b, c } = roots();
    expect(stepTarget(s(), b, -1)).toEqual({ targetId: a, position: 'before' });
    expect(stepTarget(s(), b, 1)).toEqual({ targetId: c, position: 'after' });
    expect(stepTarget(s(), a, -1)).toBeNull();
    expect(stepTarget(s(), c, 1)).toBeNull();
  });
});

describe('the tree page follows the order', () => {
  test('the layout puts siblings left to right in their set order', () => {
    const { s, a, b, c } = roots();
    const moved = moveNode(s(), c, a, 'before');
    const { pos } = layoutForest(moved);
    expect(pos[c].x).toBeLessThan(pos[a].x);
    expect(pos[a].x).toBeLessThan(pos[b].x);
  });

  test('the move command works through the background', async () => {
    const m = memoryStore();
    const r = roots();
    m.set(r.s());
    await handleCommand(m.store, { type: 'move', id: r.c, targetId: r.a, position: 'before' });
    expect(orderedSiblings(m.state(), r.a)).toEqual([r.c, r.a, r.b]);
  });
});
