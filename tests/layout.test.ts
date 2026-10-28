import { describe, expect, test } from 'vitest';
import { NOTE_BOX, layoutForest } from '../src/page/layout';
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

  test('with note boxes on, a node that has a note gets room for its box, and the next sibling moves over', () => {
    const base = build([['A', null], ['B', 'A'], ['C', 'A']]);
    const noted = { ...base, nodes: { ...base.nodes, B: { ...base.nodes.B, note: 'check costs' } } };
    const plain = layoutForest(noted, OPTS, false);
    const withBoxes = layoutForest(noted, OPTS, true);
    expect(withBoxes.pos.C.x - withBoxes.pos.B.x).toBe(plain.pos.C.x - plain.pos.B.x + NOTE_BOX.w + NOTE_BOX.gap);
  });

  test('nodes without notes lay out exactly as before, whether or not note boxes are on', () => {
    expect(layoutForest(sample(), OPTS, true)).toEqual(layoutForest(sample(), OPTS, false));
  });

  test('a blank note takes no room', () => {
    const s = sample();
    const blank = { ...s, nodes: { ...s.nodes, B: { ...s.nodes.B, note: '   ' } } };
    expect(layoutForest(blank, OPTS, true)).toEqual(layoutForest(s, OPTS, true));
  });

  test('a card plus its note box never overlaps the next card at the same depth', () => {
    const s = sample();
    const noted = { ...s, nodes: Object.fromEntries(Object.entries(s.nodes).map(([k, n]) => [k, { ...n, note: 'n' }])) };
    const { pos } = layoutForest(noted, OPTS, true);
    const byY = new Map<number, number[]>();
    for (const p of Object.values(pos)) byY.set(p.y, [...(byY.get(p.y) ?? []), p.x]);
    for (const xs of byY.values()) {
      xs.sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(OPTS.nodeW + NOTE_BOX.gap + NOTE_BOX.w + OPTS.gapX);
    }
  });

  test('a parent is still centred over its children\'s cards when they carry notes', () => {
    const base = build([['A', null], ['B', 'A'], ['C', 'A']]);
    const noted = { ...base, nodes: { ...base.nodes, C: { ...base.nodes.C, note: 'wide' } } };
    const { pos } = layoutForest(noted, OPTS, true);
    expect(pos.A.x).toBe((pos.B.x + pos.C.x) / 2);
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
