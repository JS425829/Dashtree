import { describe, expect, test } from 'vitest';
import {
  addNode, addToGroup, clearHollow, closeTab, createGroup, deleteNodes, hollowDescendants,
  nodeForTab, protectedIds, reuseOrAddChild, searchNodes, setFavourite, setNote, updateNode,
} from '../src/core/tree';
import { DEFAULT_SETTINGS, EMPTY_STATE, type NodeId, type TreeState } from '../src/core/types';

const add = (s: TreeState, parentId: NodeId | null, url: string, tabId: number | null = null) =>
  addNode(s, { parentId, url, tabId });

/** A(open 1) -> B(open 2) -> C(open 3) */
function chain() {
  const a = add(EMPTY_STATE, null, 'https://x/a', 1);
  const b = add(a.state, a.id, 'https://x/b', 2);
  const c = add(b.state, b.id, 'https://x/c', 3);
  return { s: c.state, a: a.id, b: b.id, c: c.id };
}

describe('adding and reusing nodes', () => {
  test('a root has no parent and a child points at its parent', () => {
    const { s, a, b } = chain();
    expect(s.nodes[a].parentId).toBeNull();
    expect(s.nodes[b].parentId).toBe(a);
  });

  test('revisiting a URL under the same parent reuses the node, ignoring #hash', () => {
    const root = add(EMPTY_STATE, null, 'https://x/', 1);
    const first = reuseOrAddChild(root.state, root.id, { url: 'https://x/a#1', tabId: 1 });
    const second = reuseOrAddChild(first.state, root.id, { url: 'https://x/a#2', tabId: 1 });
    expect(second.id).toBe(first.id);
    expect(Object.keys(second.state.nodes)).toHaveLength(2);
  });

  test('reusing a hollow child attaches the tab to it', () => {
    const root = add(EMPTY_STATE, null, 'https://x/', 1);
    const first = reuseOrAddChild(root.state, root.id, { url: 'https://x/a', tabId: null });
    const again = reuseOrAddChild(first.state, root.id, { url: 'https://x/a', tabId: 7 });
    expect(again.state.nodes[first.id].tabId).toBe(7);
  });

  test('different Portal route fragments are different children; the same route is reused', () => {
    const root = add(EMPTY_STATE, null, 'https://portal.azure.com/', 1);
    const a = reuseOrAddChild(root.state, root.id, { url: 'https://portal.azure.com/#view/A/x', tabId: null });
    const b = reuseOrAddChild(a.state, root.id, { url: 'https://portal.azure.com/#view/B/y', tabId: null });
    const a2 = reuseOrAddChild(b.state, root.id, { url: 'https://portal.azure.com/#view/A/x', tabId: null });
    expect(b.id).not.toBe(a.id);
    expect(a2.id).toBe(a.id);
  });

  test('with fragments not treated as pages, Portal routes under one URL are reused as one child', () => {
    const root = add(EMPTY_STATE, null, 'https://portal.azure.com/', 1);
    const a = reuseOrAddChild(root.state, root.id, { url: 'https://portal.azure.com/#view/A/x', tabId: null });
    const b = reuseOrAddChild(a.state, root.id, { url: 'https://portal.azure.com/#view/B/y', tabId: null }, undefined, false);
    expect(b.id).toBe(a.id);
  });

  test('reuse does not steal a child that another open tab is showing', () => {
    const root = add(EMPTY_STATE, null, 'https://x/', 1);
    const first = reuseOrAddChild(root.state, root.id, { url: 'https://x/a', tabId: 2 });
    const second = reuseOrAddChild(first.state, root.id, { url: 'https://x/a', tabId: 3 });
    expect(second.id).not.toBe(first.id);
    expect(second.state.nodes[first.id].tabId).toBe(2);
    expect(second.state.nodes[second.id].tabId).toBe(3);
  });

  test('nodeForTab finds the node showing a tab and updateNode patches it', () => {
    const { s, b } = chain();
    expect(nodeForTab(s, 2)?.id).toBe(b);
    const s2 = updateNode(s, b, { title: 'Bee' });
    expect(s2.nodes[b].title).toBe('Bee');
  });
});

describe('closing tabs', () => {
  test('with hollowOnTabClose the node goes hollow', () => {
    const { s, b } = chain();
    const s2 = closeTab(s, 2, DEFAULT_SETTINGS);
    expect(s2.nodes[b].tabId).toBeNull();
  });

  test('without hollowOnTabClose the node is removed and its children re-attach', () => {
    const { s, a, b, c } = chain();
    const s2 = closeTab(s, 2, { ...DEFAULT_SETTINGS, hollowOnTabClose: false });
    expect(s2.nodes[b]).toBeUndefined();
    expect(s2.nodes[c].parentId).toBe(a);
  });

  test('a favourite stays hollow even when hollowOnTabClose is off', () => {
    const { s, b } = chain();
    const s2 = closeTab(setFavourite(s, b, true), 2, { ...DEFAULT_SETTINGS, hollowOnTabClose: false });
    expect(s2.nodes[b].tabId).toBeNull();
  });
});

describe('deleting', () => {
  test('Delete re-attaches children to the parent and never touches other tabs', () => {
    const { s, a, b, c } = chain();
    const s2 = deleteNodes(s, [b], false);
    expect(s2.nodes[b]).toBeUndefined();
    expect(s2.nodes[c].parentId).toBe(a);
    expect(s2.nodes[c].tabId).toBe(3);
  });

  test('deleting a root makes its children roots', () => {
    const { s, a, b } = chain();
    const s2 = deleteNodes(s, [a], false);
    expect(s2.nodes[b].parentId).toBeNull();
  });

  test('Delete with children removes the whole subtree', () => {
    const { s, a, b, c } = chain();
    const s2 = deleteNodes(s, [b], true);
    expect(Object.keys(s2.nodes)).toEqual([a]);
    expect(s2.nodes[c]).toBeUndefined();
  });

  test('deleting keeps other state fields such as pendingWipe', () => {
    const { s, b } = chain();
    expect(deleteNodes({ ...s, pendingWipe: true }, [b], false).pendingWipe).toBe(true);
  });

  test('deleting a node removes it from groups, and empty groups disappear', () => {
    const { s, a, b } = chain();
    const g = createGroup(s, 'Both', '#f00', [a, b]);
    const g2 = createGroup(g.state, 'Just B', '#0f0', [b]);
    const s2 = deleteNodes(g2.state, [b], false);
    expect(s2.groups[g.id].nodeIds).toEqual([a]);
    expect(s2.groups[g2.id]).toBeUndefined();
  });
});

describe('hollow nodes, favourites and clearing', () => {
  test('hollowDescendants returns only hollow nodes below the node', () => {
    const { s, a, b, c } = chain();
    const s2 = closeTab(closeTab(s, 3, DEFAULT_SETTINGS), 1, DEFAULT_SETTINGS);
    expect(hollowDescendants(s2, a)).toEqual([c]);
    expect(hollowDescendants(s2, b)).toEqual([c]);
    expect(hollowDescendants(s2, c)).toEqual([]);
  });

  test('protectedIds keeps a favourite with its ancestors and descendants, not unrelated nodes', () => {
    const { s, a, b, c } = chain();
    const d = add(s, null, 'https://x/d');
    const p = protectedIds(setFavourite(d.state, b, true));
    expect([...p].sort()).toEqual([a, b, c].sort());
    expect(p.has(d.id)).toBe(false);
  });

  test('clearHollow removes unprotected hollow nodes, keeps open and protected ones', () => {
    const { s, a, b } = chain();
    const d = add(s, null, 'https://x/d');
    const e = add(d.state, null, 'https://x/e');
    const s2 = clearHollow(setFavourite(e.state, e.id, true));
    expect(s2.nodes[d.id]).toBeUndefined();
    expect(s2.nodes[e.id]).toBeDefined();
    expect(s2.nodes[a]).toBeDefined();
    expect(s2.nodes[b]).toBeDefined();
  });

  test('the Clear button mode removes a favourite\'s hollow children but keeps the favourite and open children', () => {
    const fav = add(EMPTY_STATE, null, 'https://x/fav', null);
    const hollowKid = add(fav.state, fav.id, 'https://x/kid', null);
    const openKid = add(hollowKid.state, fav.id, 'https://x/open-kid', 9);
    const deep = add(openKid.state, hollowKid.id, 'https://x/deep', null);
    const s = setFavourite(deep.state, fav.id, true);
    const cleared = clearHollow(s, { clearFavouriteChildren: true });
    expect(cleared.nodes[fav.id]).toBeDefined();
    expect(cleared.nodes[openKid.id]).toBeDefined();
    expect(cleared.nodes[hollowKid.id]).toBeUndefined();
    expect(cleared.nodes[deep.id]).toBeUndefined();
  });

  test('without that option (the post-restart wipe) a favourite\'s hollow children are still kept', () => {
    const fav = add(EMPTY_STATE, null, 'https://x/fav', null);
    const kid = add(fav.state, fav.id, 'https://x/kid', null);
    const s = setFavourite(kid.state, fav.id, true);
    expect(clearHollow(s).nodes[kid.id]).toBeDefined();
  });

  test('clearing never removes a favourite that sits below another favourite', () => {
    const top = add(EMPTY_STATE, null, 'https://x/top', null);
    const inner = add(top.state, top.id, 'https://x/inner', null);
    const s = setFavourite(setFavourite(inner.state, top.id, true), inner.id, true);
    const cleared = clearHollow(s, { clearFavouriteChildren: true });
    expect(cleared.nodes[top.id]).toBeDefined();
    expect(cleared.nodes[inner.id]).toBeDefined();
  });

  test('clearHollow of a hollow parent promotes its open child to a root', () => {
    const { s, a, b } = chain();
    const s2 = clearHollow(closeTab(s, 1, DEFAULT_SETTINGS));
    expect(s2.nodes[a]).toBeUndefined();
    expect(s2.nodes[b].parentId).toBeNull();
  });
});

describe('notes, groups, search', () => {
  test('setNote stores the note', () => {
    const { s, a } = chain();
    expect(setNote(s, a, 'hello').nodes[a].note).toBe('hello');
  });

  test('addToGroup adds without duplicating', () => {
    const { s, a, b } = chain();
    const g = createGroup(s, 'G', '#00f', [a]);
    const s2 = addToGroup(addToGroup(g.state, g.id, [a, b]), g.id, [b]);
    expect(s2.groups[g.id].nodeIds).toEqual([a, b]);
  });

  test('searchNodes matches URL and note, case-insensitively', () => {
    const rg = add(EMPTY_STATE, null, 'https://portal.azure.com/rg-prod-uk', 1);
    const other = add(rg.state, null, 'https://x/other', 2);
    const noted = setNote(other.state, other.id, 'check RG-PROD later');
    const hits = searchNodes(noted, 'RG-prod').map((n) => n.id);
    expect(hits.sort()).toEqual([rg.id, other.id].sort());
    expect(searchNodes(noted, 'nothing-like-this')).toEqual([]);
  });
});
