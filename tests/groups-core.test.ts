import { describe, expect, test } from 'vitest';
import { handleCommand } from '../src/background/handlers';
import {
  addNode, createGroup, deleteGroup, removeFromGroup, renameGroup, setGroupColour,
} from '../src/core/tree';
import { EMPTY_STATE, type TreeState } from '../src/core/types';
import { GROUP_COLOURS, computeMatches, nextGroupColour } from '../src/page/groups';
import { memoryStore } from './helpers';

function threeNodesAndAGroup() {
  let s: TreeState = EMPTY_STATE;
  const ids: string[] = [];
  for (const url of ['https://x/a', 'https://x/b', 'https://x/c']) {
    const r = addNode(s, { parentId: null, url, title: url.slice(-1), tabId: null });
    s = r.state;
    ids.push(r.id);
  }
  const g = createGroup(s, 'Ticket', '#5aaeff', [ids[0], ids[1]]);
  return { s: g.state, ids, gid: g.id };
}

describe('deleting and editing groups', () => {
  test('deleteGroup removes the group but never its nodes', () => {
    const { s, ids, gid } = threeNodesAndAGroup();
    const after = deleteGroup(s, gid);
    expect(after.groups[gid]).toBeUndefined();
    expect(Object.keys(after.nodes).sort()).toEqual([...ids].sort());
  });

  test('deleting an unknown group changes nothing', () => {
    const { s } = threeNodesAndAGroup();
    expect(deleteGroup(s, 'nope')).toBe(s);
  });

  test('renameGroup trims the name, and an empty name is refused', () => {
    const { s, gid } = threeNodesAndAGroup();
    expect(renameGroup(s, gid, '  Costs  ').groups[gid].name).toBe('Costs');
    expect(renameGroup(s, gid, '   ')).toBe(s);
  });

  test('setGroupColour accepts #rrggbb and refuses anything else', () => {
    const { s, gid } = threeNodesAndAGroup();
    expect(setGroupColour(s, gid, '#00AAFF').groups[gid].colour).toBe('#00AAFF');
    expect(setGroupColour(s, gid, 'red; background:url(x)')).toBe(s);
    expect(setGroupColour(s, gid, '#fff')).toBe(s);
  });

  test('removeFromGroup takes members out, and a group left with no members disappears', () => {
    const { s, ids, gid } = threeNodesAndAGroup();
    const one = removeFromGroup(s, gid, [ids[0]]);
    expect(one.groups[gid].nodeIds).toEqual([ids[1]]);
    const none = removeFromGroup(one, gid, [ids[1]]);
    expect(none.groups[gid]).toBeUndefined();
    expect(Object.keys(none.nodes)).toHaveLength(3);
  });
});

describe('group commands', () => {
  test('deleteGroup, renameGroup, recolourGroup and removeFromGroup work through the background', async () => {
    const m = memoryStore();
    const { s, ids, gid } = threeNodesAndAGroup();
    m.set(s);
    await handleCommand(m.store, { type: 'renameGroup', groupId: gid, name: 'Costs' });
    await handleCommand(m.store, { type: 'recolourGroup', groupId: gid, colour: '#112233' });
    expect(m.state().groups[gid]).toMatchObject({ name: 'Costs', colour: '#112233' });
    await handleCommand(m.store, { type: 'removeFromGroup', groupId: gid, nodeIds: [ids[0]] });
    expect(m.state().groups[gid].nodeIds).toEqual([ids[1]]);
    await handleCommand(m.store, { type: 'deleteGroup', groupId: gid });
    expect(m.state().groups[gid]).toBeUndefined();
  });
});

describe('group colours', () => {
  test('new groups cycle through the palette', () => {
    expect(nextGroupColour(EMPTY_STATE)).toBe(GROUP_COLOURS[0]);
    const { s } = threeNodesAndAGroup();
    expect(nextGroupColour(s)).toBe(GROUP_COLOURS[1]);
  });
});

describe('highlighting: search and group focus together', () => {
  test('no search and no focus highlights nothing', () => {
    const { s } = threeNodesAndAGroup();
    expect(computeMatches(s, '', null)).toBeNull();
  });

  test('focusing a group highlights exactly its members', () => {
    const { s, ids, gid } = threeNodesAndAGroup();
    expect(computeMatches(s, '  ', gid)).toEqual(new Set([ids[0], ids[1]]));
  });

  test('a search alone matches as before', () => {
    const { s, ids } = threeNodesAndAGroup();
    expect(computeMatches(s, 'x/c', null)).toEqual(new Set([ids[2]]));
  });

  test('search and focus together show only matches inside the group', () => {
    const { s, ids, gid } = threeNodesAndAGroup();
    expect(computeMatches(s, 'x/', gid)).toEqual(new Set([ids[0], ids[1]]));
    expect(computeMatches(s, 'x/c', gid)).toEqual(new Set());
  });

  test('a focus on a group that no longer exists is ignored', () => {
    const { s } = threeNodesAndAGroup();
    expect(computeMatches(s, '', 'gone')).toBeNull();
  });
});
