import { describe, expect, test } from 'vitest';
import { handleCommand, onCommitted } from '../src/background/handlers';
import { appearanceClasses, layoutOptsFor } from '../src/page/appearance';
import { DEFAULT_LAYOUT } from '../src/page/layout';
import { addNode, setFavourite } from '../src/core/tree';
import { DEFAULT_SETTINGS } from '../src/core/types';
import { memoryStore, type MemoryStore } from './helpers';

const commit = (m: MemoryStore, tabId: number, url: string, extra: Partial<Parameters<typeof onCommitted>[1]> = {}) =>
  onCommitted(m.store, { tabId, url, transitionType: 'link', qualifiers: [], fromHistoryState: true, ...extra });
const urls = (m: MemoryStore) => Object.values(m.state().nodes).map((n) => n.url);
const typed = { transitionType: 'typed', fromHistoryState: false };

const home = 'https://portal.azure.com/#home';
const blade = 'https://portal.azure.com/#view/HubsExtension/BrowseResourceGroups';

describe('recording settings', () => {
  test('routeFragmentsAreSeparate off: route changes after # are ignored', async () => {
    const m = memoryStore({ routeFragmentsAreSeparate: false });
    await commit(m, 1, home, typed);
    await commit(m, 1, blade);
    expect(urls(m)).toEqual([home]);
  });

  test('routeFragmentsAreSeparate on (default): the same change is recorded', async () => {
    const m = memoryStore();
    await commit(m, 1, home, typed);
    await commit(m, 1, blade);
    expect(urls(m).sort()).toEqual([blade, home].sort());
  });

  test('reuseEarlierPage off: Home -> blade -> Home adds a third node', async () => {
    const m = memoryStore({ reuseEarlierPage: false });
    await commit(m, 1, home, typed);
    await commit(m, 1, blade);
    await commit(m, 1, home);
    expect(urls(m)).toHaveLength(3);
  });

  test('redirectsUpdateNode off: a client redirect adds a node like any navigation', async () => {
    const m = memoryStore({ redirectsUpdateNode: false });
    await commit(m, 1, 'https://x/a', typed);
    await commit(m, 1, 'https://x/b', { fromHistoryState: false });
    await commit(m, 1, 'https://x/b-final', { fromHistoryState: false, qualifiers: ['client_redirect'] });
    expect(urls(m)).toHaveLength(3);
  });
});

describe('cleanup settings', () => {
  function favouriteWithHollowChild(m: MemoryStore) {
    const fav = addNode(m.state(), { parentId: null, url: 'https://x/fav', tabId: null });
    const kid = addNode(fav.state, { parentId: fav.id, url: 'https://x/kid', tabId: null });
    m.set(setFavourite(kid.state, fav.id, true));
    return { fav: fav.id, kid: kid.id };
  }

  test('clearRemovesFavouriteChildren on (default): the button removes a favourite\'s hollow children', async () => {
    const m = memoryStore();
    const ids = favouriteWithHollowChild(m);
    await handleCommand(m.store, { type: 'clearHollow' });
    expect(m.state().nodes[ids.kid]).toBeUndefined();
    expect(m.state().nodes[ids.fav]).toBeDefined();
  });

  test('clearRemovesFavouriteChildren off: the button keeps them', async () => {
    const m = memoryStore({ clearRemovesFavouriteChildren: false });
    const ids = favouriteWithHollowChild(m);
    await handleCommand(m.store, { type: 'clearHollow' });
    expect(m.state().nodes[ids.kid]).toBeDefined();
  });
});

describe('appearance settings', () => {
  test('the defaults add no extra classes and use the standard card size', () => {
    expect(appearanceClasses(DEFAULT_SETTINGS)).toEqual([]);
    expect(layoutOptsFor(DEFAULT_SETTINGS)).toEqual(DEFAULT_LAYOUT);
  });

  test('each appearance setting maps to a class', () => {
    expect(appearanceClasses({ ...DEFAULT_SETTINGS, compactCards: true })).toEqual(['compact']);
    expect(appearanceClasses({ ...DEFAULT_SETTINGS, showSiteName: false })).toEqual(['hide-site']);
    expect(appearanceClasses({ ...DEFAULT_SETTINGS, showStatusDots: false })).toEqual(['hide-dots']);
    expect(appearanceClasses({ ...DEFAULT_SETTINGS, dashedConnectors: false })).toEqual(['solid-lines']);
  });

  test('compact cards are smaller in both directions', () => {
    const c = layoutOptsFor({ ...DEFAULT_SETTINGS, compactCards: true });
    expect(c.nodeH).toBeLessThan(DEFAULT_LAYOUT.nodeH);
    expect(c.nodeW).toBeLessThan(DEFAULT_LAYOUT.nodeW);
  });
});
