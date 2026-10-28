// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { addNode, createGroup } from '../src/core/tree';
import { EMPTY_STATE, type TreeState } from '../src/core/types';
import { renderGroupsMenu, type GroupsApi } from '../src/page/groups-menu';

function sample() {
  let s: TreeState = EMPTY_STATE;
  const ids: string[] = [];
  for (const url of ['https://x/a', 'https://x/b', 'https://x/c']) {
    const r = addNode(s, { parentId: null, url, tabId: null });
    s = r.state;
    ids.push(r.id);
  }
  const g1 = createGroup(s, 'Ticket XL-1042', '#5aaeff', [ids[0], ids[1]]);
  const g2 = createGroup(g1.state, 'Costs', '#f5c542', [ids[2]]);
  return { s: g2.state, ids, g1: g1.id, g2: g2.id };
}

function setup(opts: { selected?: string[]; confirmDelete?: boolean; state?: TreeState } = {}) {
  document.body.innerHTML = '<header id="bar"><button class="clear-hollow">Clear hollow nodes</button><button>Settings</button></header>';
  const api = {
    send: vi.fn(),
    getSelected: vi.fn(() => opts.selected ?? []),
    selectNodes: vi.fn(),
    setFocus: vi.fn(),
    scrollTo: vi.fn(),
    confirmDelete: vi.fn(() => opts.confirmDelete ?? true),
  } satisfies GroupsApi;
  const menu = renderGroupsMenu(document.getElementById('bar')!, api);
  const data = sample();
  menu.update(opts.state ?? data.s, null);
  return { api, menu, ...data };
}

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const open = () => $('.groups-toggle').click();
const row = (name: string) => [...document.querySelectorAll<HTMLElement>('.group-row')].find((r) => r.querySelector('.group-name')!.textContent === name)!;
const btn = (r: HTMLElement, label: string) => [...r.querySelectorAll('button')].find((b) => b.textContent === label)!;

describe('the Groups menu', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test('sits in the top bar before Clear hollow nodes, shows how many groups there are, and opens and closes', () => {
    setup();
    const bar = $('#bar');
    const toggle = $('.groups-toggle');
    expect(toggle.textContent).toContain('Groups');
    expect(toggle.textContent).toContain('2');
    expect(toggle.nextElementSibling).toBe($('.clear-hollow'));
    expect(bar.contains(toggle)).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    open();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  test('lists every group with its name and member count', () => {
    setup();
    expect(row('Ticket XL-1042').querySelector('.group-count')!.textContent).toBe('2 nodes');
    expect(row('Costs').querySelector('.group-count')!.textContent).toBe('1 node');
  });

  test('says how to make a group when there are none', () => {
    setup({ state: EMPTY_STATE });
    expect($('.groups-popover').textContent).toContain('No groups yet');
    expect($('.groups-toggle').textContent).not.toContain('(');
  });

  test('Select picks all the group\'s members', () => {
    const { api, ids } = setup();
    btn(row('Ticket XL-1042'), 'Select').click();
    expect(api.selectNodes).toHaveBeenCalledWith([ids[0], ids[1]]);
  });

  test('Go to scrolls to the group', () => {
    const { api, ids } = setup();
    btn(row('Ticket XL-1042'), 'Go to').click();
    expect(api.scrollTo).toHaveBeenCalledWith([ids[0], ids[1]]);
  });

  test('Focus toggles: first press focuses the group, second clears it, and the button shows the state', () => {
    const { api, menu, s, g1 } = setup();
    const focusBtn = btn(row('Ticket XL-1042'), 'Focus');
    expect(focusBtn.getAttribute('aria-pressed')).toBe('false');
    focusBtn.click();
    expect(api.setFocus).toHaveBeenLastCalledWith(g1);
    menu.update(s, g1);
    const pressed = btn(row('Ticket XL-1042'), 'Focus');
    expect(pressed.getAttribute('aria-pressed')).toBe('true');
    pressed.click();
    expect(api.setFocus).toHaveBeenLastCalledWith(null);
  });

  test('Rename sends the trimmed name, and ignores a cancelled or empty answer', () => {
    const { api, g1 } = setup();
    const ask = vi.spyOn(window, 'prompt').mockReturnValue('  Billing  ');
    btn(row('Ticket XL-1042'), 'Rename').click();
    expect(ask.mock.calls[0][1]).toBe('Ticket XL-1042');
    expect(api.send).toHaveBeenCalledWith({ type: 'renameGroup', groupId: g1, name: 'Billing' });
    api.send.mockClear();
    ask.mockReturnValue(null);
    btn(row('Ticket XL-1042'), 'Rename').click();
    ask.mockReturnValue('   ');
    btn(row('Ticket XL-1042'), 'Rename').click();
    expect(api.send).not.toHaveBeenCalled();
  });

  test('changing a group\'s colour sends the new colour', () => {
    const { api, g2 } = setup();
    const colour = row('Costs').querySelector<HTMLInputElement>('input[type=color]')!;
    expect(colour.getAttribute('aria-label')).toBe('Colour for Costs');
    expect(colour.value).toBe('#f5c542');
    colour.value = '#112233';
    colour.dispatchEvent(new Event('change'));
    expect(api.send).toHaveBeenCalledWith({ type: 'recolourGroup', groupId: g2, colour: '#112233' });
  });

  test('Delete asks first, says the pages stay, and only deletes if confirmed', () => {
    const { api, g1 } = setup();
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
    btn(row('Ticket XL-1042'), 'Delete').click();
    expect(ask.mock.calls[0][0]).toContain('Ticket XL-1042');
    expect(ask.mock.calls[0][0]).toContain('stay in the tree');
    expect(api.send).not.toHaveBeenCalled();
    ask.mockReturnValue(true);
    btn(row('Ticket XL-1042'), 'Delete').click();
    expect(api.send).toHaveBeenCalledWith({ type: 'deleteGroup', groupId: g1 });
  });

  test('Delete does not ask when confirmations are turned off', () => {
    const { api, g2 } = setup({ confirmDelete: false });
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
    btn(row('Costs'), 'Delete').click();
    expect(ask).not.toHaveBeenCalled();
    expect(api.send).toHaveBeenCalledWith({ type: 'deleteGroup', groupId: g2 });
  });

  test('every control names its group for screen readers', () => {
    setup();
    const labels = [...row('Costs').querySelectorAll('button')].map((b) => b.getAttribute('aria-label'));
    expect(labels).toEqual(['Select members of Costs', 'Focus Costs', 'Go to Costs', 'Rename Costs', 'Delete Costs']);
  });
});

describe('New group from selection', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  test('is disabled until something is selected', () => {
    setup({ selected: [] });
    expect($<HTMLButtonElement>('.new-group').disabled).toBe(true);
  });

  test('asks for a name and creates the group from the selection with the next palette colour', () => {
    const { api, ids } = setup({ selected: ['sel-1', 'sel-2'] });
    expect($<HTMLButtonElement>('.new-group').disabled).toBe(false);
    vi.spyOn(window, 'prompt').mockReturnValue('Review');
    $('.new-group').click();
    expect(api.send).toHaveBeenCalledWith({ type: 'createGroup', name: 'Review', colour: expect.stringMatching(/^#[0-9a-f]{6}$/i), nodeIds: ['sel-1', 'sel-2'] });
    expect(ids).toHaveLength(3);
  });

  test('does nothing if the name is cancelled or empty', () => {
    const { api } = setup({ selected: ['sel-1'] });
    const ask = vi.spyOn(window, 'prompt').mockReturnValue(null);
    $('.new-group').click();
    ask.mockReturnValue('  ');
    $('.new-group').click();
    expect(api.send).not.toHaveBeenCalled();
  });

  test('re-checks the selection each time the menu opens', () => {
    const { api } = setup({ selected: [] });
    api.getSelected.mockReturnValue(['a']);
    open();
    expect($<HTMLButtonElement>('.new-group').disabled).toBe(false);
  });
});
