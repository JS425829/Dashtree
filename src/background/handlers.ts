import { decideNavigation, isIgnoredUrl, isTrackableUrl, routeKey } from '../core/rules';
import {
  addNode, addToGroup, ancestorIds, clearHollow, closeTab, createGroup, deleteNodes, descendantIds, nodeForTab,
  reuseOrAddChild, setFavourite, setNote, updateNode,
} from '../core/tree';
import type { NodeId, Settings, TreeNode, TreeState } from '../core/types';
import type { Command } from '../shared/messages';
import type { Store } from './store';

/** Time after the first post-startup tab for session-restored tabs to re-attach before the wipe runs. */
export const RESTORE_GRACE_MS = 3000;
/** After a browser start, a tab whose URL matches a hollow node re-attaches to it (session restore). */
export const RESTORE_WINDOW_MS = 2 * 60 * 1000;
/** If no tab is opened this long after startup, the post-restart wipe is skipped rather than risk deleting this session's nodes. */
export const WIPE_WINDOW_MS = 10 * 60 * 1000;

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

const inRestoreWindow = (s: TreeState) => s.startedAt !== undefined && Date.now() - s.startedAt < RESTORE_WINDOW_MS;

const findHollowByUrl = (s: TreeState, url: string) =>
  Object.values(s.nodes).find((n) => n.tabId === null && n.url === url);

/** Re-attaching to an old hollow node by URL is only right while a restart is being reconciled. */
function attachOrAddRoot(s: TreeState, tabId: number, url: string): TreeState {
  const hollow = inRestoreWindow(s) ? findHollowByUrl(s, url) : undefined;
  if (hollow) return updateNode(s, hollow.id, { tabId });
  return addNode(s, { parentId: null, url, tabId }).state;
}

function fillPlaceholder(s: TreeState, placeholder: TreeNode, tabId: number, url: string): TreeState {
  const twin = Object.values(s.nodes).find(
    (n) => n.id !== placeholder.id && n.parentId === placeholder.parentId && n.tabId === null && routeKey(n.url) === routeKey(url),
  );
  if (!twin) return updateNode(s, placeholder.id, { url });
  return updateNode(deleteNodes(s, [placeholder.id], false), twin.id, { tabId });
}

/** Back/Forward: the tab now shows an earlier or later page, so move the open marker rather than add a node. */
function applyBackForward(s: TreeState, current: TreeNode, e: CommitEvent): TreeState {
  if (routeKey(e.url) === routeKey(current.url)) return s;
  const family = [...ancestorIds(s, current.id), ...descendantIds(s, current.id)];
  const match = family.map((id) => s.nodes[id]).find((n) => n.tabId === null && routeKey(n.url) === routeKey(e.url));
  if (!match) return updateNode(s, current.id, { url: e.url });
  return updateNode(updateNode(s, current.id, { tabId: null }), match.id, { tabId: e.tabId });
}

function applyCommit(s: TreeState, settings: Settings, e: CommitEvent): TreeState {
  const current = nodeForTab(s, e.tabId);

  if (!isTrackableUrl(e.url) || isIgnoredUrl(e.url, settings.ignoredSites)) {
    if (!current) return s;
    return current.url === '' ? deleteNodes(s, [current.id], false) : updateNode(s, current.id, { tabId: null });
  }
  if (!current) return attachOrAddRoot(s, e.tabId, e.url);
  if (current.url === '') return fillPlaceholder(s, current, e.tabId, e.url);
  if (e.qualifiers.includes('forward_back')) return applyBackForward(s, current, e);

  const action = decideNavigation(
    {
      transitionType: e.transitionType,
      qualifiers: e.qualifiers,
      fromHistoryState: e.fromHistoryState,
      hashOnly: routeKey(e.url) === routeKey(current.url),
      sameOrigin: sameOrigin(e.url, current.url),
    },
    settings,
  );

  switch (action) {
    case 'ignore':
      return s;
    case 'update-node':
      return updateNode(s, current.id, { url: e.url });
    case 'add-child':
      // single-page navigation changes neither the favicon nor always the title, so the child starts with its parent's
      return reuseOrAddChild(updateNode(s, current.id, { tabId: null }), current.id, {
        url: e.url, tabId: e.tabId, title: current.title, favIconUrl: current.favIconUrl,
      }).state;
    case 'new-root':
      return attachOrAddRoot(updateNode(s, current.id, { tabId: null }), e.tabId, e.url);
  }
}

function armWipe(store: Store): void {
  if (wipeTimers.has(store)) return;
  wipeTimers.set(store, setTimeout(() => {
    wipeTimers.delete(store);
    void store.mutate((st) => (st.pendingWipe ? { ...clearHollow(st), pendingWipe: false } : st));
  }, RESTORE_GRACE_MS));
}

/** Runs at the start of each browser session. `openTabs` are tabs already open, adopted by URL. */
export async function onStartup(store: Store, openTabs: { tabId: number; url: string }[] = []): Promise<void> {
  await store.mutate((s, settings) => {
    let next: TreeState = {
      ...s,
      nodes: Object.fromEntries(Object.entries(s.nodes).map(([id, n]) => [id, { ...n, tabId: null }])),
      pendingWipe: settings.wipeHollowAfterRestart,
      startedAt: Date.now(),
    };
    for (const t of openTabs) {
      if (!isTrackableUrl(t.url) || isIgnoredUrl(t.url, settings.ignoredSites)) continue;
      const match = findHollowByUrl(next, t.url);
      if (match) next = updateNode(next, match.id, { tabId: t.tabId });
    }
    return next;
  });
}

export async function onTabCreated(store: Store, e: { tabId: number; openerTabId?: number; url?: string }): Promise<void> {
  // everything happens inside the queue so a following onCommitted for this tab cannot overtake it
  await store.mutate((s, settings) => {
    let next = s;
    if (s.pendingWipe) {
      if (Date.now() - (s.startedAt ?? 0) > WIPE_WINDOW_MS) next = { ...s, pendingWipe: false };
      else armWipe(store);
    }
    if (nodeForTab(next, e.tabId)) return next;
    if (e.openerTabId !== undefined) {
      const opener = nodeForTab(next, e.openerTabId);
      return opener ? addNode(next, { parentId: opener.id, url: '', tabId: e.tabId }).state : next;
    }
    if (e.url && isTrackableUrl(e.url) && !isIgnoredUrl(e.url, settings.ignoredSites) && inRestoreWindow(next)) {
      const hollow = findHollowByUrl(next, e.url);
      if (hollow) return updateNode(next, hollow.id, { tabId: e.tabId });
    }
    return next;
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

/** Hands `tabId` to `id`, taking it from any other node; a bare duplicate root created by the race is dropped. */
function assignTab(s: TreeState, id: NodeId, tabId: number): TreeState {
  const url = s.nodes[id]?.url;
  let next = s;
  for (const other of Object.values(s.nodes)) {
    if (other.id === id || other.tabId !== tabId) continue;
    const bare = other.parentId === null && other.url === url && !other.favourite && !other.note
      && !Object.values(next.nodes).some((n) => n.parentId === other.id);
    next = bare ? deleteNodes(next, [other.id], false) : updateNode(next, other.id, { tabId: null });
  }
  return updateNode(next, id, { tabId });
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
  await store.mutate((s) => assignTab(s, id, tabId));
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
      return store.mutate((s) => clearHollow(s, { clearFavouriteChildren: true }));
    case 'createGroup':
      return store.mutate((s) => createGroup(s, c.name, c.colour, c.nodeIds).state);
    case 'addToGroup':
      return store.mutate((s) => addToGroup(s, c.groupId, c.nodeIds));
  }
}
