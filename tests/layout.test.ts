import { describe, expect, test } from 'vitest';
import { layoutForest } from '../src/page/layout';
import type { NodeId, TreeNode, TreeState } from '../src/core/types';

const OPTS = { nodeW: 100, nodeH: 30, gapX: 20, gapY: 40 };

function build(edges: [string, string | null][]): TreeState {
  const nodes: Record<NodeId, TreeNode> = {};
  edges.forEach(([id, parentId], i) => {
    nodes[id] = { id, parentId, url: `https://x/${id}`, title: id, favIconUrl: '', tabId: null, favourite: false, note: '', createdAt: i };
  });
  return { nodes, groups: {} };
}

// A -> (B -> (D, E), C)   and a second root F
const sample = () => build([['A', null], ['B', 'A'], ['C', 'A'], ['D', 'B'], ['E', 'B'], ['F', null]]);

describe('layoutForest', () => {
  test('a parent is centred over its first and last child', () => {
    const { pos } = layoutForest(sample(), OPTS);
    expect(pos.B.x).toBe((pos.D.x + pos.E.x) / 2);
    expect(pos.A.x).toBe((pos.B.x + pos.C.x) / 2);
  });

  test('siblings never overlap', () => {
    const { pos } = layoutForest(sample(), OPTS);
    expect(pos.C.x - pos.B.x).toBeGreaterThanOrEqual(OPTS.nodeW + OPTS.gapX);
    expect(pos.E.x - pos.D.x).toBeGreaterThanOrEqual(OPTS.nodeW + OPTS.gapX);
  });

  test('nodes at the same depth never overlap, even across subtrees and roots', () => {
    const { pos } = layoutForest(sample(), OPTS);
    const byY = new Map<number, number[]>();
    for (const p of Object.values(pos)) byY.set(p.y, [...(byY.get(p.y) ?? []), p.x]);
    for (const xs of byY.values()) {
      xs.sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(OPTS.nodeW + OPTS.gapX);
    }
  });

  test('every child sits below its parent', () => {
    const { pos } = layoutForest(sample(), OPTS);
    expect(pos.B.y).toBeGreaterThan(pos.A.y);
    expect(pos.D.y).toBeGreaterThan(pos.B.y);
    expect(pos.F.y).toBe(pos.A.y);
  });

  test('reports a size that contains every node', () => {
    const { pos, width, height } = layoutForest(sample(), OPTS);
    for (const p of Object.values(pos)) {
      expect(p.x + OPTS.nodeW).toBeLessThanOrEqual(width);
      expect(p.y + OPTS.nodeH).toBeLessThanOrEqual(height);
    }
  });

  test('an empty state lays out to nothing', () => {
    expect(layoutForest({ nodes: {}, groups: {} })).toEqual({ pos: {}, width: 0, height: 0 });
  });

  test('a 2,000-node forest lays out in under 200 ms', () => {
    const edges: [string, string | null][] = [];
    for (let r = 0; r < 20; r++) {
      edges.push([`r${r}`, null]);
      for (let i = 1; i < 100; i++) edges.push([`r${r}n${i}`, i === 1 ? `r${r}` : `r${r}n${Math.floor(i / 3) || 1}`]);
    }
    const s = build(edges);
    const t = performance.now();
    const { pos } = layoutForest(s);
    expect(performance.now() - t).toBeLessThan(200);
    expect(Object.keys(pos)).toHaveLength(2000);
  });
});
