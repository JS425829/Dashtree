import { describe, expect, test } from 'vitest';
import { onCommitted } from '../src/background/handlers';
import { nodeForTab } from '../src/core/tree';
import { memoryStore, tabIdsAreUnique, type MemoryStore } from './helpers';

const commit = (m: MemoryStore, tabId: number, url: string, extra: Partial<Parameters<typeof onCommitted>[1]> = {}) =>
  onCommitted(m.store, { tabId, url, transitionType: 'link', qualifiers: [], fromHistoryState: true, ...extra });

const home = 'https://portal.azure.com/#home';
const apim = 'https://portal.azure.com/#@contoso/resource/subscriptions/1/providers/Microsoft.ApiManagement/service/apimcargowise';
const appi = 'https://portal.azure.com/#@contoso/resource/subscriptions/1/providers/Microsoft.Insights/components/appi-wlx-tst-uks';

const byUrl = (m: MemoryStore, url: string) => Object.values(m.state().nodes).filter((n) => n.url === url);

describe('going back to a page earlier in the same path', () => {
  test('Home -> apim -> Home shows Home once, with the tab moved back onto it', async () => {
    const m = memoryStore();
    await commit(m, 1, home, { transitionType: 'typed', fromHistoryState: false });
    await commit(m, 1, apim);
    await commit(m, 1, home);
    expect(byUrl(m, home)).toHaveLength(1);
    expect(Object.keys(m.state().nodes)).toHaveLength(2);
    expect(nodeForTab(m.state(), 1)!.url).toBe(home);
    expect(byUrl(m, apim)[0].tabId).toBeNull();
    expect(tabIdsAreUnique(m.state())).toBe(true);
  });

  test('the next page then branches from that earlier node, beside the one you left', async () => {
    const m = memoryStore();
    await commit(m, 1, home, { transitionType: 'typed', fromHistoryState: false });
    await commit(m, 1, apim);
    await commit(m, 1, home);
    await commit(m, 1, appi);
    const homeNode = byUrl(m, home)[0];
    expect(byUrl(m, appi)[0].parentId).toBe(homeNode.id);
    expect(byUrl(m, apim)[0].parentId).toBe(homeNode.id);
  });

  test('an earlier page that another open tab is showing is not taken over', async () => {
    const m = memoryStore();
    await commit(m, 1, home, { transitionType: 'typed', fromHistoryState: false });
    await commit(m, 1, apim); // tab 1 now on apim, Home is hollow
    await commit(m, 2, home, { transitionType: 'typed', fromHistoryState: false }); // tab 2 opens Home: re-uses nothing outside restart
    await commit(m, 1, home); // tab 1 goes "back" to Home while tab 2 shows a Home node
    expect(tabIdsAreUnique(m.state())).toBe(true);
    expect(nodeForTab(m.state(), 1)).toBeDefined();
    expect(nodeForTab(m.state(), 2)).toBeDefined();
  });

  test('a page that is only elsewhere in the tree (not on this path) still gets its own node', async () => {
    const m = memoryStore();
    await commit(m, 1, home, { transitionType: 'typed', fromHistoryState: false });
    await commit(m, 2, apim, { transitionType: 'typed', fromHistoryState: false });
    await commit(m, 2, home); // tab 2 reaches Home, but tab 1's Home is not on tab 2's path
    expect(byUrl(m, home)).toHaveLength(2);
  });
});
