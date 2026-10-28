import type { NodeId, Settings, TreeState } from '../core/types';

export type Command =
  | { type: 'getState' }
  | { type: 'activate'; id: NodeId }
  | { type: 'delete'; ids: NodeId[]; withChildren: boolean }
  | { type: 'setFavourite'; id: NodeId; value: boolean }
  | { type: 'setNote'; id: NodeId; note: string }
  | { type: 'rename'; id: NodeId; title: string }
  | { type: 'clearHollow' }
  | { type: 'createGroup'; name: string; colour: string; nodeIds: NodeId[] }
  | { type: 'addToGroup'; groupId: string; nodeIds: NodeId[] }
  | { type: 'getSettings' }
  | { type: 'setSettings'; settings: Partial<Settings> };

export interface StateReply {
  state: TreeState;
  settings: Settings;
}

/** Broadcast by the background whenever the tree changes. */
export const CHANGED = 'changed';
