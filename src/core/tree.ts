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

/** Display order: hand-set order first (small numbers), otherwise creation time, so new siblings land last. */
export const byOrder = (a: TreeNode, b: TreeNode): number =>
  (a.order ?? a.createdAt) - (b.order ?? b.createdAt) || a.createdAt - b.createdAt || a.id.localeCompare(b.id);

/** The node's siblings, itself included, in display order. A node whose parent is gone counts as a root. */
export function orderedSiblings(s: TreeState, id: NodeId): NodeId[] {
  const parentOf = (n: TreeNode) => (n.parentId && s.nodes[n.parentId] ? n.parentId : null);
  const me = s.nodes[id];
  if (!me) return [];
  const parent = parentOf(me);
  return Object.values(s.nodes).filter((n) => parentOf(n) === parent).sort(byOrder).map((n) => n.id);
}

export type MovePosition = 'before' | 'after';

/** Places `id` just before or after a sibling. Anything that is not a real change returns the state untouched. */
export function moveNode(s: TreeState, id: NodeId, targetId: NodeId, position: MovePosition): TreeState {
  if (id === targetId) return s;
  const list = orderedSiblings(s, id);
  if (!list.includes(targetId)) return s;
  const rest = list.filter((x) => x !== id);
  const at = rest.indexOf(targetId) + (position === 'after' ? 1 : 0);
  const next = [...rest.slice(0, at), id, ...rest.slice(at)];
  if (next.every((x, i) => x === list[i])) return s;
  const nodes = { ...s.nodes };
  next.forEach((nid, i) => { nodes[nid] = { ...nodes[nid], order: i }; });
  return { ...s, nodes };
}

/** The neighbour to move beside for a one-step move left (-1) or right (1), or null at the ends. */
export function stepTarget(s: TreeState, id: NodeId, dir: -1 | 1): { targetId: NodeId; position: MovePosition } | null {
  const list = orderedSiblings(s, id);
  const i = list.indexOf(id);
  if (i < 0) return null;
  if (dir < 0) return i > 0 ? { targetId: list[i - 1], position: 'before' } : null;
  return i < list.length - 1 ? { targetId: list[i + 1], position: 'after' } : null;
}

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
  /** Only remove nodes created before this time (the post-restart wipe leaves this session's nodes alone). */
  createdBefore?: number;
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
    .filter((n) => n.tabId === null && !keep.has(n.id) && (opts.createdBefore === undefined || n.createdAt < opts.createdBefore))
    .map((n) => n.id);
  return deleteNodes(s, doomed, false);
}

export const setFavourite = (s: TreeState, id: NodeId, v: boolean): TreeState =>
  patchNode(s, id, { favourite: v });

export const setNote = (s: TreeState, id: NodeId, note: string): TreeState =>
  patchNode(s, id, { note });

/** Gives a node a name of the user's choosing; an empty name goes back to following the page title. */
export function renameNode(s: TreeState, id: NodeId, title: string): TreeState {
  const node = s.nodes[id];
  if (!node) return s;
  const name = title.trim();
  if (name) return patchNode(s, id, { customTitle: name });
  const { customTitle: _dropped, ...rest } = node;
  return { ...s, nodes: { ...s.nodes, [id]: rest } };
}

export function createGroup(
  s: TreeState,
  name: string,
  colour: string,
  nodeIds: NodeId[],
): { state: TreeState; id: string } {
  const id = crypto.randomUUID();
  return { state: { ...s, groups: { ...s.groups, [id]: { id, name, colour, nodeIds: [...new Set(nodeIds)] } } }, id };
}

const GROUP_COLOUR = /^#[0-9a-f]{6}$/i;

/** Only plain #rrggbb values are accepted as colours (group colours, the glow colour); they end up in inline styles. */
export const isHexColour = (c: string): boolean => GROUP_COLOUR.test(c);

/** Removes the group itself; the nodes it covered are untouched. */
export function deleteGroup(s: TreeState, groupId: string): TreeState {
  if (!s.groups[groupId]) return s;
  const { [groupId]: _gone, ...groups } = s.groups;
  return { ...s, groups };
}

export function renameGroup(s: TreeState, groupId: string, name: string): TreeState {
  const g = s.groups[groupId];
  const clean = name.trim();
  if (!g || !clean) return s;
  return { ...s, groups: { ...s.groups, [groupId]: { ...g, name: clean } } };
}

export function setGroupColour(s: TreeState, groupId: string, colour: string): TreeState {
  const g = s.groups[groupId];
  if (!g || !isHexColour(colour)) return s;
  return { ...s, groups: { ...s.groups, [groupId]: { ...g, colour } } };
}

/** Takes nodes out of a group; a group left with no members goes away. */
export function removeFromGroup(s: TreeState, groupId: string, nodeIds: NodeId[]): TreeState {
  const g = s.groups[groupId];
  if (!g) return s;
  const gone = new Set(nodeIds);
  const rest = g.nodeIds.filter((id) => !gone.has(id));
  if (rest.length === g.nodeIds.length) return s;
  if (!rest.length) return deleteGroup(s, groupId);
  return { ...s, groups: { ...s.groups, [groupId]: { ...g, nodeIds: rest } } };
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
    [n.title, n.url, n.note, n.customTitle ?? ''].some((f) => f.toLowerCase().includes(q)),
  );
}
