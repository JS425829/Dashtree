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
  sameTabAddsNode: boolean;
  wipeHollowAfterRestart: boolean;
  hollowOnTabClose: boolean;
  theme: Theme;
  /** Host names that are never recorded; each also covers its subdomains. */
  ignoredSites: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  sameTabAddsNode: true,
  wipeHollowAfterRestart: true,
  hollowOnTabClose: true,
  theme: 'system',
  ignoredSites: [],
};

export const EMPTY_STATE: TreeState = { nodes: {}, groups: {} };
