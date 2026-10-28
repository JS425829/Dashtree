// @vitest-environment jsdom
import { describe, expect, test, vi } from 'vitest';
import { addNode, createGroup } from '../src/core/tree';
import { EMPTY_STATE, type TreeState } from '../src/core/types';
import { buildMenu, type InteractCtx } from '../src/page/interact';
import { DEFAULT_LAYOUT, layoutForest } from '../src/page/layout';
import type { MenuItem } from '../src/page/menu';
import { renderForest } from '../src/page/render';

function sample() {
  let s: TreeState = EMPTY_STATE;
  const ids: string[] = [];
  for (const url of ['https://x/a', 'https://x/b']) {
    const r = addNode(s, { parentId: null, url, tabId: null });
    s = r.state;
    ids.push(r.id);
  }
  const g = createGroup(s, 'Ticket', '#5aaeff', [ids[0]]);
  const other = createGroup(g.state, 'Costs', '#f5c542', [ids[0], ids[1]]);
  return { s: other.state, ids, ticket: g.id, costs: other.id };
}

const ctxFor = (s: TreeState): InteractCtx => ({
  state: s, layout: layoutForest(s), opts: DEFAULT_LAYOUT, confirmDelete: true, ignoredSites: ['x'], selected: new Set(),
});
const labels = (items: MenuItem[]) => items.filter((i) => i !== 'separator').map((i) => (i as { label: string }).label);
const find = (items: MenuItem[], label: string) => items.find((i) => i !== 'separator' && i.label === label) as { label: string; action: () => void };

describe('group items in the node menu', () => {
  test('offers Remove from group for each group the selection belongs to, and sends the removal', () => {
    const { s, ids, ticket } = sample();
    const send = vi.fn();
    const items = buildMenu([ids[0]], ctxFor(s), send, () => {});
    expect(labels(items)).toContain('Remove from group: Ticket');
    expect(labels(items)).toContain('Remove from group: Costs');
    find(items, 'Remove from group: Ticket').action();
    expect(send).toHaveBeenCalledWith({ type: 'removeFromGroup', groupId: ticket, nodeIds: [ids[0]] });
  });

  test('does not offer Remove from group for a node that is in no group', () => {
    const { s, ids } = sample();
    const loose = addNode(s, { parentId: null, url: 'https://x/loose', tabId: null });
    const items = buildMenu([loose.id], ctxFor(loose.state), vi.fn(), () => {});
    expect(labels(items).some((l) => l.startsWith('Remove from group'))).toBe(false);
    expect(ids).toHaveLength(2);
  });

  test('Add to group no longer offers a group every selected node is already in', () => {
    const { s, ids } = sample();
    const items = buildMenu([ids[0]], ctxFor(s), vi.fn(), () => {});
    expect(labels(items)).not.toContain('Add to group: Ticket');
    expect(labels(items)).not.toContain('Add to group: Costs');
    const both = buildMenu([ids[0], ids[1]], ctxFor(s), vi.fn(), () => {});
    expect(labels(both)).toContain('Add to group: Ticket'); // node b is not in Ticket yet
    expect(labels(both)).not.toContain('Add to group: Costs'); // both already are
  });
});

describe('group outlines', () => {
  test('a group colour that is not a plain #rrggbb value can never reach the page styling', () => {
    const { s, costs, ticket } = sample();
    const evil = {
      ...s,
      groups: {
        ...s.groups,
        [costs]: { ...s.groups[costs], colour: 'red; background:url(//evil)' },
        [ticket]: { ...s.groups[ticket], colour: '#00aa00' },
      },
    };
    document.body.innerHTML = '<div id="c"></div>';
    const c = document.getElementById('c')!;
    renderForest(c, evil, layoutForest(evil), { selected: new Set(), matches: null });

    const styles = [...c.querySelectorAll<HTMLElement>('.group-box, .group-label')].map((e) => e.getAttribute('style') ?? '').join(' ');
    expect(styles).not.toContain('evil');

    // compare in the browser's own normalised form (it rewrites hex colours as rgb())
    const normal = (hex: string) => { const p = document.createElement('div'); p.style.background = hex; return p.style.background; };
    const tag = (name: string) => [...c.querySelectorAll<HTMLElement>('.group-label')].find((l) => l.textContent === name)!;
    expect(tag('Costs').style.background).toBe(normal('#5aaeff')); // fell back to the default colour
    expect(tag('Ticket').style.background).toBe(normal('#00aa00')); // a valid colour is left alone
  });
});
