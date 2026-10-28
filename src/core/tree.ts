import { routeKey } from './rules';
import type { Group, NodeId, Settings, TreeNode, TreeState } from './types';

export interface NewNode {
  parentId: NodeId | null;
  url: string;
  title?: string;
  favIconUrl?: string;
  tabId: number | null;
}

function childrenOf(s: TreeState, id: NodeId | null): TreeNode[] {
  return Object.values(s.nodes).filter((n) => n.parentId === id);
}

export function descendantIds(s: TreeState, id: NodeId): NodeId[] {
  const out: NodeId[] = [];
  const stack = childrenOf(s, id);
  while (stack.length) {
    const n = stack.pop()!;
    out.push(n.id);
    stack.push(...childrenOf(s, n.id));
  }
  return out;
}

export function ancestorIds(s: TreeState, id: NodeId): NodeId[] {
  const out: NodeId[] = [];
  let p = s.nodes[id]?.parentId ?? null;
  while (p) {
    out.push(p);
    p = s.nodes[p]?.parentId ?? null;
  }
  return out;
}

const patchNode = (s: TreeState, id: NodeId, patch: Partial<TreeNode>): TreeState =>
  s.nodes[id] ? { ...s, nodes: { ...s.nodes, [id]: { ...s.nodes[id], ...patch } } } : s;

export function addNode(s: TreeState, p: NewNode, now = Date.now()): { state: TreeState; id: NodeId } {
  const id = crypto.randomUUID();
  const node: TreeNode = {
    id,
    parentId: p.parentId,
    url: p.url,
    title: p.title ?? '',
    favIconUrl: p.favIconUrl ?? '',
    tabId: p.tabId,
    favourite: false,
    note: '',
    createdAt: now,
  };
  return { state: { ...s, nodes: { ...s.nodes, [id]: node } }, id };
}

export function reuseOrAddChild(
  s: TreeState,
  parentId: NodeId | null,
  p: Omit<NewNode, 'parentId'>,
  now = Date.now(),
  fragmentsAreSeparate = true,
): { state: TreeState; id: NodeId } {
  const existing = childrenOf(s, parentId).find(
    (n) => routeKey(n.url, fragmentsAreSeparate) === routeKey(p.url, fragmentsAreSeparate) && (n.tabId === null || n.tabId === p.tabId),
  );
  if (existing) return { state: patchNode(s, existing.id, { tabId: p.tabId }), id: existing.id };
  return addNode(s, { ...p, parentId }, now);
}

export function updateNode(
  s: TreeState,
  id: NodeId,
  patch: Partial<Pick<TreeNode, 'url' | 'title' | 'favIconUrl' | 'tabId'>>,
): TreeState {
  return patchNode(s, id, patch);
}

export function nodeForTab(s: TreeState, tabId: number): TreeNode | undefined {
  return Object.values(s.nodes).find((n) => n.tabId === tabId);
}

export function deleteNodes(s: TreeState, ids: NodeId[], withChildren: boolean): TreeState {
  const removed = new Set<NodeId>(ids.filter((id) => s.nodes[id]));
  if (withChildren) for (const id of [...removed]) descendantIds(s, id).forEach((d) => removed.add(d));

  const nodes: Record<NodeId, TreeNode> = {};
  for (const n of Object.values(s.nodes)) {
    if (removed.has(n.id)) continue;
    let parentId = n.parentId;
    while (parentId && removed.has(parentId)) parentId = s.nodes[parentId].parentId;
    nodes[n.id] = parentId === n.parentId ? n : { ...n, parentId };
  }

  const groups: Record<string, Group> = {};
  for (const g of Object.values(s.groups)) {
    const nodeIds = g.nodeIds.filter((id) => !removed.has(id));
    if (nodeIds.length) groups[g.id] = { ...g, nodeIds };
  }
  return { ...s, nodes, groups };
}

export function closeTab(s: TreeState, tabId: number, settings: Settings): TreeState {
  const node = nodeForTab(s, tabId);
  if (!node) return s;
  if (settings.hollowOnTabClose || node.favourite) return patchNode(s, node.id, { tabId: null });
  return deleteNodes(s, [node.id], false);
}

export function hollowDescendants(s: TreeState, id: NodeId): NodeId[] {
  return descendantIds(s, id).filter((d) => s.nodes[d].tabId === null);
}

export interface ClearOptions {
  /** The Clear button also removes the hollow children of favourites; the post-restart wipe keeps them. */
  clearFavouriteChildren?: boolean;
}

export function protectedIds(s: TreeState, opts: ClearOptions = {}): Set<NodeId> {
  const keep = new Set<NodeId>();
  for (const n of Object.values(s.nodes)) {
    if (!n.favourite) continue;
    keep.add(n.id);
    ancestorIds(s, n.id).forEach((a) => keep.add(a));
    if (!opts.clearFavouriteChildren) descendantIds(s, n.id).forEach((d) => keep.add(d));
  }
  return keep;
}

export function clearHollow(s: TreeState, opts: ClearOptions = {}): TreeState {
  const keep = protectedIds(s, opts);
  const doomed = Object.values(s.nodes)
    .filter((n) => n.tabId === null && !keep.has(n.id))
    .map((n) => n.id);
  return deleteNodes(s, doomed, false);
}

export const setFavourite = (s: TreeState, id: NodeId, v: boolean): TreeState =>
  patchNode(s, id, { favourite: v });

export const setNote = (s: TreeState, id: NodeId, note: string): TreeState =>
  patchNode(s, id, { note });

export function createGroup(
  s: TreeState,
  name: string,
  colour: string,
  nodeIds: NodeId[],
): { state: TreeState; id: string } {
  const id = crypto.randomUUID();
  return { state: { ...s, groups: { ...s.groups, [id]: { id, name, colour, nodeIds: [...new Set(nodeIds)] } } }, id };
}

export function addToGroup(s: TreeState, groupId: string, nodeIds: NodeId[]): TreeState {
  const g = s.groups[groupId];
  if (!g) return s;
  return { ...s, groups: { ...s.groups, [groupId]: { ...g, nodeIds: [...new Set([...g.nodeIds, ...nodeIds])] } } };
}

export function searchNodes(s: TreeState, query: string): TreeNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return Object.values(s.nodes).filter((n) =>
    [n.title, n.url, n.note].some((f) => f.toLowerCase().includes(q)),
  );
}
