import type { NodeId, Settings, TreeState } from '../core/types';

export type Command =
  | { type: 'getState' }
  | { type: 'activate'; id: NodeId }
  | { type: 'delete'; ids: NodeId[]; withChildren: boolean }
  | { type: 'setFavourite'; id: NodeId; value: boolean }
  | { type: 'setNote'; id: NodeId; note: string }
  | { type: 'rename'; id: NodeId; title: string }
  | { type: 'move'; id: NodeId; targetId: NodeId; position: 'before' | 'after' }
  | { type: 'clearHollow' }
  | { type: 'createGroup'; name: string; colour: string; nodeIds: NodeId[] }
  | { type: 'addToGroup'; groupId: string; nodeIds: NodeId[] }
  | { type: 'removeFromGroup'; groupId: string; nodeIds: NodeId[] }
  | { type: 'deleteGroup'; groupId: string }
  | { type: 'renameGroup'; groupId: string; name: string }
  | { type: 'recolourGroup'; groupId: string; colour: string }
  | { type: 'getSettings' }
  | { type: 'setSettings'; settings: Partial<Settings> };

export interface StateReply {
  state: TreeState;
  settings: Settings;
}

/** Broadcast by the background whenever the tree changes. */
export const CHANGED = 'changed';
