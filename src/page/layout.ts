import type { NodeId, TreeNode, TreeState } from '../core/types';

export interface LayoutOpts {
  nodeW: number;
  nodeH: number;
  gapX: number;
  gapY: number;
}

export interface LayoutResult {
  /** Top-left corner of each node's box. */
  pos: Record<NodeId, { x: number; y: number }>;
  width: number;
  height: number;
}

export const DEFAULT_LAYOUT: LayoutOpts = { nodeW: 210, nodeH: 36, gapX: 28, gapY: 52 };
export const ROOT_GAP = 60;

/** Tidy-tree layout: roots left to right, children centred under their parent, depth grows downward. */
export function layoutForest(s: TreeState, opts: LayoutOpts = DEFAULT_LAYOUT): LayoutResult {
  const { nodeW, nodeH, gapX, gapY } = opts;
  const all = Object.values(s.nodes).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  if (!all.length) return { pos: {}, width: 0, height: 0 };

  // a node whose parent no longer exists is treated as a root
  const kids = new Map<NodeId | null, TreeNode[]>();
  for (const n of all) {
    const parent = n.parentId && s.nodes[n.parentId] ? n.parentId : null;
    const list = kids.get(parent);
    if (list) list.push(n);
    else kids.set(parent, [n]);
  }

  const pos: LayoutResult['pos'] = {};
  let maxDepth = 0;

  function place(id: NodeId, left: number, depth: number): { cx: number; right: number } {
    maxDepth = Math.max(maxDepth, depth);
    const children = kids.get(id) ?? [];
    let cx: number;
    let right: number;
    if (!children.length) {
      cx = left + nodeW / 2;
      right = left + nodeW;
    } else {
      const centres: number[] = [];
      let cursor = left;
      right = left;
      for (const c of children) {
        const r = place(c.id, cursor, depth + 1);
        centres.push(r.cx);
        right = r.right;
        cursor = r.right + gapX;
      }
      cx = (centres[0] + centres[centres.length - 1]) / 2;
      right = Math.max(right, cx + nodeW / 2);
    }
    pos[id] = { x: cx - nodeW / 2, y: depth * (nodeH + gapY) };
    return { cx, right };
  }

  let cursor = 0;
  let width = 0;
  for (const root of kids.get(null) ?? []) {
    const r = place(root.id, cursor, 0);
    width = r.right;
    cursor = r.right + ROOT_GAP;
  }
  return { pos, width, height: maxDepth * (nodeH + gapY) + nodeH };
}
