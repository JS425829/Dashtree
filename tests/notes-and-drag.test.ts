// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { addNode, orderedSiblings, setNote } from '../src/core/tree';
import { EMPTY_STATE, type NodeId, type TreeState } from '../src/core/types';
import { attachInteractions, buildMenu, editNote, reorderTarget, type InteractCtx } from '../src/page/interact';
import { DEFAULT_LAYOUT, NOTE_BOX, layoutForest } from '../src/page/layout';
import type { MenuItem } from '../src/page/menu';
import type { Command } from '../src/shared/messages';
import { renderForest } from '../src/page/render';

function threeRoots(notes: Record<number, string> = {}) {
  let s: TreeState = EMPTY_STATE;
  const ids: NodeId[] = [];
  ['a', 'b', 'c'].forEach((k, i) => {
    const r = addNode(s, { parentId: null, url: `https://x/${k}`, title: k.toUpperCase(), tabId: i === 0 ? 1 : null }, i + 1);
    s = r.state;
    ids.push(r.id);
  });
  for (const [i, text] of Object.entries(notes)) s = setNote(s, ids[Number(i)], text);
  return { s, ids };
}

const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!;

describe('note boxes', () => {
  let c: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '<div id="c"></div>';
    c = $('#c');
  });

  const draw = (s: TreeState, showNotes: boolean | undefined, matches: Set<NodeId> | null = null) =>
    renderForest(c, s, layoutForest(s, DEFAULT_LAYOUT, Boolean(showNotes)), { selected: new Set(), matches, showNotes }, DEFAULT_LAYOUT);

  test('a node with a note gets a box beside it showing the note text', () => {
    const { s, ids } = threeRoots({ 0: 'check costs\nbefore Friday' });
    draw(s, true);
    const boxes = c.querySelectorAll('.note-box');
    expect(boxes).toHaveLength(1);
    const box = boxes[0] as HTMLElement;
    expect(box.textContent).toBe('check costs\nbefore Friday');
    expect(box.dataset.id).toBe(ids[0]);
    const pos = layoutForest(s, DEFAULT_LAYOUT, true).pos[ids[0]];
    expect(box.style.left).toBe(`${pos.x + DEFAULT_LAYOUT.nodeW + NOTE_BOX.gap}px`);
    expect(box.style.top).toBe(`${pos.y}px`);
    expect(box.style.width).toBe(`${NOTE_BOX.w}px`);
  });

  test('the box is a button that says it can be clicked to edit', () => {
    const { s } = threeRoots({ 1: 'hello' });
    draw(s, true);
    const box = $('.note-box');
    expect(box.tagName).toBe('BUTTON');
    expect(box.getAttribute('title')).toBe('Click to edit this note');
  });

  test('nodes without a note, or a blank one, get no box', () => {
    const { s } = threeRoots({ 1: '   ' });
    draw(s, true);
    expect(c.querySelectorAll('.note-box')).toHaveLength(0);
  });

  test('no boxes at all when note boxes are switched off', () => {
    const { s } = threeRoots({ 0: 'a note' });
    draw(s, false);
    expect(c.querySelectorAll('.note-box')).toHaveLength(0);
    draw(s, undefined);
    expect(c.querySelectorAll('.note-box')).toHaveLength(0);
  });

  test('a box is dimmed along with its card when a search does not match that node', () => {
    const { s, ids } = threeRoots({ 0: 'a note' });
    draw(s, true, new Set([ids[1]]));
    expect($('.note-box').classList.contains('dim')).toBe(true);
    draw(s, true, new Set([ids[0]]));
    expect($('.note-box').classList.contains('dim')).toBe(false);
  });
});

describe('editing a note', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test('asks with the current text and sends what was typed, including an empty note to clear it', () => {
    const send = vi.fn();
    const ask = vi.spyOn(window, 'prompt').mockReturnValue('new text');
    editNote('n1', 'old text', send);
    expect(ask.mock.calls[0][1]).toBe('old text');
    expect(send).toHaveBeenCalledWith({ type: 'setNote', id: 'n1', note: 'new text' });
    ask.mockReturnValue('');
    editNote('n1', 'old text', send);
    expect(send).toHaveBeenLastCalledWith({ type: 'setNote', id: 'n1', note: '' });
  });

  test('cancelling changes nothing', () => {
    const send = vi.fn();
    vi.spyOn(window, 'prompt').mockReturnValue(null);
    editNote('n1', 'old text', send);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('where a dragged card would land', () => {
  // cards are 268 wide with 60 between roots: centres at 134, 462 and 790
  const pos = (s: TreeState) => layoutForest(s);

  test('left of every other card: before the first', () => {
    const { s, ids } = threeRoots();
    expect(reorderTarget(s, pos(s), DEFAULT_LAYOUT.nodeW, ids[2], 0)).toEqual({ targetId: ids[0], position: 'before' });
  });

  test('right of every other card: after the last', () => {
    const { s, ids } = threeRoots();
    expect(reorderTarget(s, pos(s), DEFAULT_LAYOUT.nodeW, ids[0], 2000)).toEqual({ targetId: ids[2], position: 'after' });
  });

  test('between two cards: before the one on the right', () => {
    const { s, ids } = threeRoots();
    expect(reorderTarget(s, pos(s), DEFAULT_LAYOUT.nodeW, ids[2], 300)).toEqual({ targetId: ids[1], position: 'before' });
  });

  test('where it already sits: nothing to do', () => {
    const { s, ids } = threeRoots();
    expect(reorderTarget(s, pos(s), DEFAULT_LAYOUT.nodeW, ids[1], 300)).toBeNull(); // between A and C, which is where B is
  });

  test('a node with no siblings has nowhere to go', () => {
    const only = addNode(EMPTY_STATE, { parentId: null, url: 'https://x/only', tabId: null });
    expect(reorderTarget(only.state, layoutForest(only.state), DEFAULT_LAYOUT.nodeW, only.id, 500)).toBeNull();
  });
});

describe('dragging a card to reorder', () => {
  let canvas: HTMLElement;
  let send: ReturnType<typeof vi.fn<(c: Command) => unknown>>;
  let ids: NodeId[];
  let ctx: InteractCtx;

  beforeEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '<main id="v"><div id="c"></div></main>';
    canvas = $('#c');
    const r = threeRoots();
    ids = r.ids;
    const layout = layoutForest(r.s);
    ctx = { state: r.s, layout, opts: DEFAULT_LAYOUT, confirmDelete: true, ignoredSites: [], selected: new Set() };
    renderForest(canvas, r.s, layout, { selected: ctx.selected, matches: null });
    send = vi.fn<(c: Command) => unknown>();
    attachInteractions(canvas, () => ctx, send, () => {});
  });

  const main = (i: number) => $(`.node[data-id="${ids[i]}"] .node-main`, canvas);
  const mouse = (type: string, target: EventTarget, x: number, y = 20, init: MouseEventInit = {}) =>
    target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, ...init }));
  const drag = (i: number, toX: number) => {
    mouse('mousedown', main(i), 100);
    mouse('mousemove', window, toX);
    mouse('mouseup', window, toX);
  };

  test('dropping past the last card sends a move to after it', () => {
    drag(0, 900);
    expect(send).toHaveBeenCalledWith({ type: 'move', id: ids[0], targetId: ids[2], position: 'after' });
  });

  test('dropping before the first card sends a move to before it', () => {
    drag(2, -100);
    expect(send).toHaveBeenCalledWith({ type: 'move', id: ids[2], targetId: ids[0], position: 'before' });
  });

  test('a plain click, or a wobble smaller than a drag, sends nothing', () => {
    mouse('mousedown', main(0), 100);
    mouse('mouseup', window, 100);
    mouse('mousedown', main(0), 100);
    mouse('mousemove', window, 102);
    mouse('mouseup', window, 102);
    expect(send).not.toHaveBeenCalled();
  });

  test('while dragging the card is lifted and a drop marker shows; both go away afterwards', () => {
    mouse('mousedown', main(0), 100);
    mouse('mousemove', window, 900);
    const card = $(`.node[data-id="${ids[0]}"]`, canvas);
    expect(card.classList.contains('dragging')).toBe(true);
    expect(canvas.querySelectorAll('.drop-indicator')).toHaveLength(1);
    mouse('mouseup', window, 900);
    expect(card.classList.contains('dragging')).toBe(false);
    expect(canvas.querySelectorAll('.drop-indicator')).toHaveLength(0);
    expect(card.style.transform).toBe('');
  });

  test('no marker is shown where dropping would change nothing', () => {
    mouse('mousedown', main(1), 100);
    mouse('mousemove', window, 300); // between A and C: B's own place
    expect(canvas.querySelectorAll('.drop-indicator')).toHaveLength(0);
    mouse('mouseup', window, 300);
    expect(send).not.toHaveBeenCalled();
  });

  test('the click that follows a drag is swallowed, so the page is not opened; a normal click still works', () => {
    const seen = vi.fn();
    canvas.addEventListener('click', seen);
    drag(0, 900);
    mouse('click', main(0), 900);
    expect(seen).not.toHaveBeenCalled();
    return new Promise<void>((resolve) => setTimeout(() => {
      mouse('click', main(1), 300);
      expect(seen).toHaveBeenCalledTimes(1);
      resolve();
    }, 5));
  });

  test('Escape cancels the drag', () => {
    mouse('mousedown', main(0), 100);
    mouse('mousemove', window, 900);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(canvas.querySelectorAll('.drop-indicator')).toHaveLength(0);
    expect($(`.node[data-id="${ids[0]}"]`, canvas).classList.contains('dragging')).toBe(false);
    mouse('mouseup', window, 900);
    expect(send).not.toHaveBeenCalled();
  });

  test('Ctrl+press (selecting) and pressing the star do not start a drag', () => {
    mouse('mousedown', main(0), 100, 20, { ctrlKey: true });
    mouse('mousemove', window, 900);
    mouse('mouseup', window, 900);
    const star = $(`.node[data-id="${ids[0]}"] .star`, canvas);
    mouse('mousedown', star, 100);
    mouse('mousemove', window, 900);
    mouse('mouseup', window, 900);
    expect(send).not.toHaveBeenCalled();
  });

  test('the right mouse button does not drag', () => {
    mouse('mousedown', main(0), 100, 20, { button: 2 });
    mouse('mousemove', window, 900);
    mouse('mouseup', window, 900);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('Move left and Move right in the node menu', () => {
  const labels = (items: MenuItem[]) => items.filter((i) => i !== 'separator').map((i) => (i as { label: string }).label);
  const item = (items: MenuItem[], label: string) => items.find((i) => i !== 'separator' && i.label === label) as { action: () => void };
  const ctxFor = (s: TreeState): InteractCtx => ({
    state: s, layout: layoutForest(s), opts: DEFAULT_LAYOUT, confirmDelete: true, ignoredSites: ['x'], selected: new Set(),
  });

  test('a middle node can go either way, and the items send the move', () => {
    const { s, ids } = threeRoots();
    const send = vi.fn();
    const items = buildMenu([ids[1]], ctxFor(s), send, () => {});
    expect(labels(items)).toContain('Move left');
    expect(labels(items)).toContain('Move right');
    item(items, 'Move left').action();
    expect(send).toHaveBeenLastCalledWith({ type: 'move', id: ids[1], targetId: ids[0], position: 'before' });
    item(items, 'Move right').action();
    expect(send).toHaveBeenLastCalledWith({ type: 'move', id: ids[1], targetId: ids[2], position: 'after' });
  });

  test('the first node can only go right and the last only left', () => {
    const { s, ids } = threeRoots();
    expect(labels(buildMenu([ids[0]], ctxFor(s), vi.fn(), () => {}))).toEqual(expect.arrayContaining(['Move right']));
    expect(labels(buildMenu([ids[0]], ctxFor(s), vi.fn(), () => {}))).not.toContain('Move left');
    expect(labels(buildMenu([ids[2]], ctxFor(s), vi.fn(), () => {}))).not.toContain('Move right');
    expect(labels(buildMenu([ids[2]], ctxFor(s), vi.fn(), () => {}))).toContain('Move left');
  });

  test('not offered for a selection of several nodes', () => {
    const { s, ids } = threeRoots();
    const l = labels(buildMenu([ids[0], ids[1]], ctxFor(s), vi.fn(), () => {}));
    expect(l).not.toContain('Move left');
    expect(l).not.toContain('Move right');
  });

  test('the order really changes when the move is applied', () => {
    const { s, ids } = threeRoots();
    expect(orderedSiblings(s, ids[0])).toEqual(ids);
  });
});
