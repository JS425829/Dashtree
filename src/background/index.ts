import { loadSettings, loadState, saveSettings, saveState } from '../storage/db';
import { CHANGED, type Command, type StateReply } from '../shared/messages';
import {
  activateNode, handleCommand, onCommitted, onStartup, onTabCreated, onTabRemoved, onTabUpdated, type TabApi,
} from './handlers';
import { createStore } from './store';

const broadcastChanged = () => {
  chrome.runtime.sendMessage({ type: CHANGED }).catch(() => {});
};

const store = createStore({ load: loadState, save: saveState, settings: loadSettings, onChange: broadcastChanged });

const tabApi: TabApi = {
  async focusTab(tabId) {
    const tab = await chrome.tabs.update(tabId, { active: true });
    if (!tab) throw new Error(`No tab with id ${tabId}`);
    await chrome.windows.update(tab.windowId, { focused: true });
  },
  async openTab(url) {
    return (await chrome.tabs.create({ url })).id!;
  },
};

const log = (e: unknown) => console.error('[histo-tree]', e);

/**
 * Once per browser session (chrome.storage.session is cleared when the browser closes or the extension reloads)
 * reset every node to hollow and adopt tabs that are already open. Every handler waits for this, so no event can be
 * applied against last session's stale tab ids.
 */
const ready: Promise<void> = (async () => {
  const { sessionStarted } = await chrome.storage.session.get('sessionStarted');
  if (sessionStarted) return;
  await chrome.storage.session.set({ sessionStarted: true });
  const tabs = await chrome.tabs.query({});
  await onStartup(
    store,
    tabs.filter((t) => t.id !== undefined && t.url).map((t) => ({ tabId: t.id!, url: t.url! })),
  );
})().catch(log);

const after = (fn: () => Promise<unknown>) => void ready.then(fn).catch(log);

async function openTreePage(): Promise<void> {
  const url = chrome.runtime.getURL('index.html');
  const [existing] = await chrome.tabs.query({ url });
  if (existing?.id !== undefined) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
}

async function route(c: Command): Promise<StateReply | undefined> {
  await ready;
  switch (c.type) {
    case 'getState':
    case 'getSettings':
      return { state: await store.read(), settings: await loadSettings() };
    case 'activate':
      return void (await activateNode(store, c.id, tabApi));
    case 'setSettings':
      await saveSettings({ ...(await loadSettings()), ...c.settings });
      broadcastChanged();
      return;
    default:
      return void (await handleCommand(store, c));
  }
}

chrome.runtime.onMessage.addListener((msg: Command | { type: typeof CHANGED }, _sender, sendResponse) => {
  if (msg.type === CHANGED) return false;
  route(msg).then(sendResponse, (e) => sendResponse({ error: String(e) }));
  return true;
});

chrome.action.onClicked.addListener(() => void openTreePage().catch(log));

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id === undefined) return;
  const e = { tabId: tab.id, openerTabId: tab.openerTabId, url: tab.url || tab.pendingUrl };
  after(() => onTabCreated(store, e));
});
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.title !== undefined || info.favIconUrl !== undefined) {
    after(() => onTabUpdated(store, tabId, { title: info.title, favIconUrl: info.favIconUrl }));
  }
});
chrome.tabs.onRemoved.addListener((tabId) => after(() => onTabRemoved(store, tabId)));

type NavDetails = chrome.webNavigation.WebNavigationTransitionCallbackDetails;
const route2 = (d: NavDetails, fromHistoryState: boolean) => {
  if (d.frameId !== 0) return;
  after(() => onCommitted(store, {
    tabId: d.tabId, url: d.url, transitionType: d.transitionType, qualifiers: d.transitionQualifiers, fromHistoryState,
  }));
};
chrome.webNavigation.onCommitted.addListener((d) => route2(d, false));
// single-page apps change the page without a real navigation; Azure Portal keeps its route in the #fragment
chrome.webNavigation.onHistoryStateUpdated.addListener((d) => route2(d, true));
chrome.webNavigation.onReferenceFragmentUpdated.addListener((d) => route2(d, true));
