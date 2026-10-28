import { searchNodes } from '../core/tree';
import type { NodeId, TreeState } from '../core/types';

export const GROUP_COLOURS = ['#4da3ff', '#f5c542', '#7bd88f', '#ff7b72', '#c69cff', '#ffa657'];

/** Colour for the next new group: cycles through the palette. */
export const nextGroupColour = (s: TreeState): string =>
  GROUP_COLOURS[Object.keys(s.groups).length % GROUP_COLOURS.length];

/** Members of a group that still exist in the tree. */
export const groupMembers = (s: TreeState, groupId: string): NodeId[] =>
  (s.groups[groupId]?.nodeIds ?? []).filter((id) => s.nodes[id]);

/**
 * The nodes to highlight (everything else is dimmed), or null for no highlighting.
 * A search and a focused group combine: only matches inside the group stay lit.
 */
export function computeMatches(s: TreeState, query: string, focusGroupId: string | null): Set<NodeId> | null {
  const members = focusGroupId && s.groups[focusGroupId] ? new Set(groupMembers(s, focusGroupId)) : null;
  const hits = query.trim() ? new Set(searchNodes(s, query).map((n) => n.id)) : null;
  if (hits && members) return new Set([...hits].filter((id) => members.has(id)));
  return hits ?? members;
}
