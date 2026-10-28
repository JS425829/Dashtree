import { describe, expect, test } from 'vitest';
import { matchIds } from '../src/page/topbar';
import { addNode, setNote } from '../src/core/tree';
import { EMPTY_STATE } from '../src/core/types';

describe('matchIds', () => {
  test('an empty query matches nothing, so nothing is dimmed', () => {
    const a = addNode(EMPTY_STATE, { parentId: null, url: 'https://x/a', tabId: 1 });
    expect(matchIds(a.state, '')).toEqual(new Set());
    expect(matchIds(a.state, '   ')).toEqual(new Set());
  });

  test('a query that matches one node\'s note returns exactly that id', () => {
    const a = addNode(EMPTY_STATE, { parentId: null, url: 'https://x/a', tabId: 1 });
    const b = addNode(a.state, { parentId: null, url: 'https://x/b', tabId: 2 });
    const noted = setNote(b.state, b.id, 'waiting on XL-1042');
    expect(matchIds(noted, 'xl-1042')).toEqual(new Set([b.id]));
  });

  test('a query with no hits returns an empty set', () => {
    const a = addNode(EMPTY_STATE, { parentId: null, url: 'https://x/a', tabId: 1 });
    expect(matchIds(a.state, 'zzz').size).toBe(0);
  });
});
