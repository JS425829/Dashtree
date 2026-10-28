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

const log = (e: unknown) => console.error('[dashtree]', e);

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
chrome.runtime.onStartup.addListener(() => void onStartup(store).catch(log));

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id !== undefined) void onTabCreated(store, { tabId: tab.id, openerTabId: tab.openerTabId }).catch(log);
});
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.title !== undefined || info.favIconUrl !== undefined) {
    void onTabUpdated(store, tabId, { title: info.title, favIconUrl: info.favIconUrl }).catch(log);
  }
});
chrome.tabs.onRemoved.addListener((tabId) => void onTabRemoved(store, tabId).catch(log));

chrome.webNavigation.onCommitted.addListener((d) => {
  if (d.frameId !== 0) return;
  void onCommitted(store, {
    tabId: d.tabId, url: d.url, transitionType: d.transitionType, qualifiers: d.transitionQualifiers, fromHistoryState: false,
  }).catch(log);
});
chrome.webNavigation.onHistoryStateUpdated.addListener((d) => {
  if (d.frameId !== 0) return;
  void onCommitted(store, {
    tabId: d.tabId, url: d.url, transitionType: d.transitionType, qualifiers: d.transitionQualifiers, fromHistoryState: true,
  }).catch(log);
});
