import { byOrder } from '../core/tree';
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

export const DEFAULT_LAYOUT: LayoutOpts = { nodeW: 268, nodeH: 64, gapX: 24, gapY: 64 };
export const ROOT_GAP = 60;
/** The note box sits to the right of its card: this much gap, then this much width. */
export const NOTE_BOX = { w: 208, gap: 12 };

/**
 * Tidy-tree layout: roots left to right, children centred under their parent, depth grows downward.
 * With `withNotes`, a node that has a note reserves room beside its card for the note box.
 */
export function layoutForest(s: TreeState, opts: LayoutOpts = DEFAULT_LAYOUT, withNotes = false): LayoutResult {
  const { nodeW, nodeH, gapX, gapY } = opts;
  const all = Object.values(s.nodes).sort(byOrder);
  if (!all.length) return { pos: {}, width: 0, height: 0 };

  // the card plus, when it has a note and boxes are on, the box beside it
  const slotW = (n: TreeNode) => nodeW + (withNotes && n.note?.trim() ? NOTE_BOX.gap + NOTE_BOX.w : 0);

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

  function place(node: TreeNode, left: number, depth: number): { cx: number; right: number } {
    maxDepth = Math.max(maxDepth, depth);
    const children = kids.get(node.id) ?? [];
    let cx: number;
    let right: number;
    if (!children.length) {
      cx = left + nodeW / 2;
      right = left + slotW(node);
    } else {
      const centres: number[] = [];
      let cursor = left;
      right = left;
      for (const c of children) {
        const r = place(c, cursor, depth + 1);
        centres.push(r.cx);
        right = r.right;
        cursor = r.right + gapX;
      }
      cx = (centres[0] + centres[centres.length - 1]) / 2;
      right = Math.max(right, cx - nodeW / 2 + slotW(node));
    }
    pos[node.id] = { x: cx - nodeW / 2, y: depth * (nodeH + gapY) };
    return { cx, right };
  }

  let cursor = 0;
  let width = 0;
  for (const root of kids.get(null) ?? []) {
    const r = place(root, cursor, 0);
    width = r.right;
    cursor = r.right + ROOT_GAP;
  }
  return { pos, width, height: maxDepth * (nodeH + gapY) + nodeH };
}
