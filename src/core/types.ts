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
}

export interface Settings {
  sameTabAddsNode: boolean;
  wipeHollowAfterRestart: boolean;
  hollowOnTabClose: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  sameTabAddsNode: true,
  wipeHollowAfterRestart: true,
  hollowOnTabClose: true,
};

export const EMPTY_STATE: TreeState = { nodes: {}, groups: {} };
