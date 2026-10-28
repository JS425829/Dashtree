import { ext, type NavDetails } from '../shared/api';
import { loadSettings, loadState, saveSettings, saveState } from '../storage/db';
import { CHANGED, type Command, type StateReply } from '../shared/messages';
import {
  activateNode, findTab, handleCommand, onBrowserStart, onCommitted, onSessionStart, onTabCreated, onTabRemoved, onTabUpdated,
  type TabApi,
} from './handlers';
import { createStore } from './store';

const broadcastChanged = () => {
  ext.runtime.sendMessage({ type: CHANGED }).catch(() => {});
};

const store = createStore({ load: loadState, save: saveState, settings: loadSettings, onChange: broadcastChanged });

const tabApi: TabApi = {
  async focusTab(tabId) {
    const tab = await ext.tabs.update(tabId, { active: true });
    if (!tab) throw new Error(`No tab with id ${tabId}`);
    await ext.windows.update(tab.windowId, { focused: true });
  },
  async openTab(url) {
    return (await ext.tabs.create({ url })).id!;
  },
};

const log = (e: unknown) => console.error('[histo-tree]', e);

/**
 * Once per session (ext.storage.session is cleared when the browser closes or the extension reloads) reconcile the
 * saved tab ids with the tabs that are really open. Every handler waits for this, so no event can be applied against
 * stale tab ids. This runs on extension reloads too, so it must never wipe anything: that is `runtime.onStartup`'s job.
 */
const ready: Promise<void> = (async () => {
  const { sessionStarted } = await ext.storage.session.get('sessionStarted');
  if (sessionStarted) return;
  await ext.storage.session.set({ sessionStarted: true });
  const tabs = await ext.tabs.query({});
  await onSessionStart(
    store,
    tabs.filter((t) => t.id !== undefined && t.url).map((t) => ({ tabId: t.id!, url: t.url! })),
  );
})().catch(log);

const after = (fn: () => Promise<unknown>) => void ready.then(fn).catch(log);

// a genuine browser start (not an extension reload): arm the wipe of the previous session's hollow nodes
ext.runtime.onStartup.addListener(() => after(() => onBrowserStart(store)));

async function openTreePage(): Promise<void> {
  const url = ext.runtime.getURL('index.html');
  // list the tabs and compare, rather than query by URL pattern: patterns for extension pages differ between browsers
  const existing = findTab(await ext.tabs.query({}), url);
  if (existing?.id !== undefined) {
    await ext.tabs.update(existing.id, { active: true });
    await ext.windows.update(existing.windowId, { focused: true });
  } else {
    await ext.tabs.create({ url });
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

ext.runtime.onMessage.addListener((msg: Command | { type: typeof CHANGED }, _sender, sendResponse) => {
  if (msg.type === CHANGED) return false;
  route(msg).then(sendResponse, (e) => sendResponse({ error: String(e) }));
  return true;
});

ext.action.onClicked.addListener(() => void openTreePage().catch(log));

ext.tabs.onCreated.addListener((tab) => {
  if (tab.id === undefined) return;
  const e = { tabId: tab.id, openerTabId: tab.openerTabId, url: tab.url || tab.pendingUrl };
  after(() => onTabCreated(store, e));
});
ext.tabs.onUpdated.addListener((tabId, info) => {
  if (info.title !== undefined || info.favIconUrl !== undefined) {
    after(() => onTabUpdated(store, tabId, { title: info.title, favIconUrl: info.favIconUrl }));
  }
});
ext.tabs.onRemoved.addListener((tabId) => after(() => onTabRemoved(store, tabId)));

const route2 = (d: NavDetails, fromHistoryState: boolean) => {
  if (d.frameId !== 0) return;
  after(() => onCommitted(store, {
    tabId: d.tabId, url: d.url, transitionType: d.transitionType, qualifiers: d.transitionQualifiers, fromHistoryState,
  }));
};
ext.webNavigation.onCommitted.addListener((d) => route2(d, false));
// single-page apps change the page without a real navigation; Azure Portal keeps its route in the #fragment
ext.webNavigation.onHistoryStateUpdated.addListener((d) => route2(d, true));
ext.webNavigation.onReferenceFragmentUpdated.addListener((d) => route2(d, true));
