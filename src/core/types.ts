export type NodeId = string;

/** A node is hollow iff `tabId === null`. */
export interface TreeNode {
  id: NodeId;
  parentId: NodeId | null;
  url: string;
  title: string;
  favIconUrl: string;
  tabId: number | null;
  favourite: boolean;
  note: string;
  createdAt: number;
}

export interface Group {
  id: string;
  name: string;
  colour: string;
  nodeIds: NodeId[];
}

export interface TreeState {
  nodes: Record<NodeId, TreeNode>;
  groups: Record<string, Group>;
  /** Set on browser start; cleared once the post-restart wipe of hollow nodes has run. */
  pendingWipe?: boolean;
  /** When this browser session began (ms since epoch); bounds the restart-reconciliation and wipe windows. */
  startedAt?: number;
}

export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  // recording
  sameTabAddsNode: boolean;
  /** Route changes after # (Azure Portal blades) count as separate pages; off ignores them. */
  routeFragmentsAreSeparate: boolean;
  /** Going back to an earlier hollow page on the same path moves the tab onto it instead of adding a duplicate. */
  reuseEarlierPage: boolean;
  redirectsUpdateNode: boolean;
  // cleanup
  wipeHollowAfterRestart: boolean;
  hollowOnTabClose: boolean;
  /** The Clear hollow nodes button also removes the hollow children of favourites. */
  clearRemovesFavouriteChildren: boolean;
  /** Ask before multi-delete, delete-with-children and Clear hollow nodes. */
  confirmBeforeDeleting: boolean;
  // appearance
  theme: Theme;
  compactCards: boolean;
  showSiteName: boolean;
  showStatusDots: boolean;
  dashedConnectors: boolean;
  /** Host names that are never recorded; each also covers its subdomains. */
  ignoredSites: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  sameTabAddsNode: true,
  routeFragmentsAreSeparate: true,
  reuseEarlierPage: true,
  redirectsUpdateNode: true,
  wipeHollowAfterRestart: true,
  hollowOnTabClose: true,
  clearRemovesFavouriteChildren: true,
  confirmBeforeDeleting: true,
  theme: 'system',
  compactCards: false,
  showSiteName: true,
  showStatusDots: true,
  dashedConnectors: true,
  ignoredSites: [],
};

export const EMPTY_STATE: TreeState = { nodes: {}, groups: {} };
