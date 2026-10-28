// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from 'vitest';
import { addNode, createGroup, setFavourite, setNote } from '../src/core/tree';
import { EMPTY_STATE, DEFAULT_SETTINGS } from '../src/core/types';
import { layoutForest } from '../src/page/layout';
import { renderForest } from '../src/page/render';
import { renderTopBar } from '../src/page/topbar';

function sample() {
  const open = addNode(EMPTY_STATE, { parentId: null, url: 'https://portal.azure.com/', title: 'Azure portal', tabId: 1 });
  const hollow = addNode(open.state, { parentId: open.id, url: 'https://portal.azure.com/rg', title: 'Resource groups', tabId: null });
  const fav = setNote(setFavourite(hollow.state, open.id, true), open.id, 'check costs');
  return { state: fav, open: open.id, hollow: hollow.id };
}

describe('tree page accessibility', () => {
  let container: HTMLElement;
  let ids: ReturnType<typeof sample>;

  beforeEach(() => {
    document.body.innerHTML = '<div id="c"></div>';
    container = document.getElementById('c')!;
    ids = sample();
    renderForest(container, ids.state, layoutForest(ids.state), { selected: new Set(), matches: null });
  });

  const node = (id: string) => container.querySelector<HTMLElement>(`.node[data-id="${id}"]`)!;

  test('each node is reachable by keyboard: a real button that names the page and its state', () => {
    const main = node(ids.open).querySelector('button.node-main')!;
    expect(main.getAttribute('aria-label')).toBe('Azure portal, open tab, favourite, has a note');
    expect(node(ids.hollow).querySelector('button.node-main')!.getAttribute('aria-label')).toBe('Resource groups, closed tab');
  });

  test('the favourite star is a toggle button with a name and pressed state', () => {
    const star = node(ids.open).querySelector('button.star')!;
    expect(star.getAttribute('aria-pressed')).toBe('true');
    expect(star.getAttribute('aria-label')).toBe('Favourite');
    expect(node(ids.hollow).querySelector('button.star')!.getAttribute('aria-pressed')).toBe('false');
  });

  test('icons are SVG, not text glyphs, and are hidden from screen readers', () => {
    expect(container.textContent).not.toMatch(/[★☆✎]/);
    const icons = container.querySelectorAll('.node svg');
    expect(icons.length).toBeGreaterThan(0);
    icons.forEach((i) => expect(i.getAttribute('aria-hidden')).toBe('true'));
  });

  test('state is not conveyed by colour alone: hollow nodes are marked with a class and open ones are not', () => {
    expect(node(ids.hollow).classList.contains('hollow')).toBe(true);
    expect(node(ids.open).classList.contains('hollow')).toBe(false);
  });

  test('each node has a status dot above it: filled for an open tab, a ring for a closed one', () => {
    expect(container.querySelectorAll('circle.dot')).toHaveLength(2);
    expect(container.querySelectorAll('circle.dot.open')).toHaveLength(1);
    expect(container.querySelectorAll('circle.dot.hollow')).toHaveLength(1);
  });

  test('the favicon sits on a coloured tile and the card shows the site under the title', () => {
    const n = node(ids.open);
    expect(n.querySelector('.tile')).not.toBeNull();
    expect(n.querySelector('.label')!.textContent).toBe('Azure portal');
    expect(n.querySelector('.sub')!.textContent).toBe('portal.azure.com');
  });

  test('a group outlines only its own members, one box each, never the nodes between them', () => {
    const g = createGroup(ids.state, 'Costs', '#4da3ff', [ids.open, ids.hollow]);
    renderForest(container, g.state, layoutForest(g.state), { selected: new Set(), matches: null });
    expect(container.querySelectorAll('.group-box')).toHaveLength(2);
  });

  test('group membership is announced and shown as text, not colour alone', () => {
    const g = createGroup(ids.state, 'Costs', '#4da3ff', [ids.open]);
    renderForest(container, g.state, layoutForest(g.state), { selected: new Set(), matches: null });
    expect(node(ids.open).querySelector('button.node-main')!.getAttribute('aria-label')).toContain('in group Costs');
    expect(node(ids.hollow).querySelector('button.node-main')!.getAttribute('aria-label')).not.toContain('in group');
  });

  test('group outlines carry the group name as text', () => {
    const g = createGroup(ids.state, 'Costs', '#4da3ff', [ids.open]);
    renderForest(container, g.state, layoutForest(g.state), { selected: new Set(), matches: null });
    expect(container.querySelector('.group-label')!.textContent).toBe('Costs');
  });
});

describe('top bar accessibility', () => {
  test('the search box has an accessible name and the settings button reports its state', () => {
    document.body.innerHTML = '<header id="bar"></header>';
    renderTopBar(document.getElementById('bar')!, DEFAULT_SETTINGS, () => {}, () => {});
    expect(document.querySelector('input[type=search]')!.getAttribute('aria-label')).toBe('Search tabs, URLs and notes');
    const gear = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Settings')!;
    expect(gear.getAttribute('aria-expanded')).toBe('false');
    gear.click();
    expect(gear.getAttribute('aria-expanded')).toBe('true');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(gear.getAttribute('aria-expanded')).toBe('false');
  });
});
