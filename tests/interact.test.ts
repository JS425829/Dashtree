import { describe, expect, test } from 'vitest';
import { nodesInRect } from '../src/page/interact';
import type { LayoutResult } from '../src/page/layout';

const layout: LayoutResult = {
  pos: { a: { x: 0, y: 0 }, b: { x: 200, y: 0 }, c: { x: 0, y: 100 } },
  width: 300,
  height: 140,
};

describe('nodesInRect', () => {
  test('returns only the nodes whose box intersects the rectangle', () => {
    const hit = nodesInRect(layout, 100, 40, { x1: 150, y1: -10, x2: 260, y2: 20 });
    expect(hit).toEqual(['b']);
  });

  test('a rectangle that only grazes a node edge still selects it', () => {
    expect(nodesInRect(layout, 100, 40, { x1: 99, y1: 10, x2: 150, y2: 20 })).toEqual(['a']);
  });

  test('returns nothing over empty space', () => {
    expect(nodesInRect(layout, 100, 40, { x1: 110, y1: 50, x2: 190, y2: 90 })).toEqual([]);
  });

  test('works when the rectangle is dragged right-to-left and bottom-to-top', () => {
    const hit = nodesInRect(layout, 100, 40, { x1: 260, y1: 130, x2: -10, y2: -10 });
    expect(hit.sort()).toEqual(['a', 'b', 'c']);
  });
});
