import { decideNavigation, isTrackableUrl, stripHash } from '../core/rules';
import {
  addNode, addToGroup, clearHollow, closeTab, createGroup, deleteNodes, nodeForTab, reuseOrAddChild,
  setFavourite, setNote, updateNode,
} from '../core/tree';
import type { NodeId, Settings, TreeNode, TreeState } from '../core/types';
import type { Command } from '../shared/messages';
import type { Store } from './store';

/** Time after the first post-startup tab for session-restored tabs to re-attach before the wipe runs. */
export const RESTORE_GRACE_MS = 3000;

export interface CommitEvent {
  tabId: number;
  url: string;
  transitionType: string;
  qualifiers: string[];
  fromHistoryState: boolean;
}

export interface TabApi {
  focusTab(tabId: number): Promise<void>;
  openTab(url: string): Promise<number>;
}

const wipeTimers = new WeakMap<Store, ReturnType<typeof setTimeout>>();

const sameOrigin = (a: string, b: string) => {
  try { return new URL(a).origin === new URL(b).origin; } catch { return false; }
};

function attachOrAddRoot(s: TreeState, tabId: number, url: string): TreeState {
  const hollow = Object.values(s.nodes).find((n) => n.tabId === null && n.url === url);
  if (hollow) return updateNode(s, hollow.id, { tabId });
  return addNode(s, { parentId: null, url, tabId }).state;
}

function fillPlaceholder(s: TreeState, placeholder: TreeNode, tabId: number, url: string): TreeState {
  const twin = Object.values(s.nodes).find(
    (n) => n.id !== placeholder.id && n.parentId === placeholder.parentId && n.tabId === null && stripHash(n.url) === stripHash(url),
  );
  if (!twin) return updateNode(s, placeholder.id, { url });
  return updateNode(deleteNodes(s, [placeholder.id], false), twin.id, { tabId });
}

function applyCommit(s: TreeState, settings: Settings, e: CommitEvent): TreeState {
  const current = nodeForTab(s, e.tabId);

  if (!isTrackableUrl(e.url)) {
    if (!current) return s;
    return current.url === '' ? deleteNodes(s, [current.id], false) : updateNode(s, current.id, { tabId: null });
  }
  if (!current) return attachOrAddRoot(s, e.tabId, e.url);
  if (current.url === '') return fillPlaceholder(s, current, e.tabId, e.url);

  const action = decideNavigation(
    {
      transitionType: e.transitionType,
      qualifiers: e.qualifiers,
      fromHistoryState: e.fromHistoryState,
      hashOnly: stripHash(e.url) === stripHash(current.url),
      sameOrigin: sameOrigin(e.url, current.url),
    },
    settings,
  );

  switch (action) {
    case 'ignore':
      return s;
    case 'update-node':
      return updateNode(s, current.id, { url: e.url, title: '', favIconUrl: '' });
    case 'add-child':
      return reuseOrAddChild(updateNode(s, current.id, { tabId: null }), current.id, { url: e.url, tabId: e.tabId }).state;
    case 'new-root':
      return attachOrAddRoot(updateNode(s, current.id, { tabId: null }), e.tabId, e.url);
  }
}

async function scheduleWipe(store: Store): Promise<void> {
  if (wipeTimers.has(store)) return;
  const s = await store.read();
  if (!s.pendingWipe || wipeTimers.has(store)) return;
  wipeTimers.set(store, setTimeout(() => {
    wipeTimers.delete(store);
    void store.mutate((st) => (st.pendingWipe ? { ...clearHollow(st), pendingWipe: false } : st));
  }, RESTORE_GRACE_MS));
}

export async function onStartup(store: Store): Promise<void> {
  await store.mutate((s, settings) => ({
    ...s,
    nodes: Object.fromEntries(Object.entries(s.nodes).map(([id, n]) => [id, { ...n, tabId: null }])),
    pendingWipe: settings.wipeHollowAfterRestart,
  }));
}

export async function onTabCreated(store: Store, e: { tabId: number; openerTabId?: number }): Promise<void> {
  await scheduleWipe(store);
  if (e.openerTabId === undefined) return;
  await store.mutate((s) => {
    const opener = nodeForTab(s, e.openerTabId!);
    if (!opener || nodeForTab(s, e.tabId)) return s;
    return addNode(s, { parentId: opener.id, url: '', tabId: e.tabId }).state;
  });
}

export async function onCommitted(store: Store, e: CommitEvent): Promise<void> {
  await store.mutate((s, settings) => applyCommit(s, settings, e));
}

export async function onTabUpdated(store: Store, tabId: number, patch: { title?: string; favIconUrl?: string }): Promise<void> {
  await store.mutate((s) => {
    const n = nodeForTab(s, tabId);
    if (!n) return s;
    const title = patch.title ?? n.title;
    const favIconUrl = patch.favIconUrl ?? n.favIconUrl;
    return title === n.title && favIconUrl === n.favIconUrl ? s : updateNode(s, n.id, { title, favIconUrl });
  });
}

export async function onTabRemoved(store: Store, tabId: number): Promise<void> {
  await store.mutate((s, settings) => closeTab(s, tabId, settings));
}

export async function activateNode(store: Store, id: NodeId, api: TabApi): Promise<void> {
  const node = (await store.read()).nodes[id];
  if (!node) return;
  if (node.tabId !== null) {
    try {
      await api.focusTab(node.tabId);
      return;
    } catch {
      // stale tab id: fall through and reopen
    }
  }
  if (!node.url) return;
  const tabId = await api.openTab(node.url);
  await store.mutate((s) => updateNode(s, id, { tabId }));
}

/** Commands that only change the tree; getState/getSettings/setSettings/activate are routed in index.ts. */
export async function handleCommand(store: Store, c: Command): Promise<void> {
  switch (c.type) {
    case 'delete':
      return store.mutate((s) => deleteNodes(s, c.ids, c.withChildren));
    case 'setFavourite':
      return store.mutate((s) => setFavourite(s, c.id, c.value));
    case 'setNote':
      return store.mutate((s) => setNote(s, c.id, c.note));
    case 'clearHollow':
      return store.mutate((s) => clearHollow(s));
    case 'createGroup':
      return store.mutate((s) => createGroup(s, c.name, c.colour, c.nodeIds).state);
    case 'addToGroup':
      return store.mutate((s) => addToGroup(s, c.groupId, c.nodeIds));
  }
}
