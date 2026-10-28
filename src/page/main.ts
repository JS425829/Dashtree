import { DEFAULT_SETTINGS, EMPTY_STATE, type NodeId, type Settings, type TreeState } from '../core/types';
import { CHANGED, type Command, type StateReply } from '../shared/messages';
import { layoutForest, type LayoutResult } from './layout';
import { renderForest } from './render';

export interface PageContext {
  state: TreeState;
  settings: Settings;
  layout: LayoutResult;
  selected: Set<NodeId>;
  matches: Set<NodeId> | null;
}

export const ctx: PageContext = {
  state: EMPTY_STATE,
  settings: DEFAULT_SETTINGS,
  layout: layoutForest(EMPTY_STATE),
  selected: new Set(),
  matches: null,
};

export const send = <T = void>(c: Command): Promise<T> => chrome.runtime.sendMessage(c);

const canvas = document.getElementById('canvas')!;
const empty = document.getElementById('empty')!;

export function draw(): void {
  for (const id of ctx.selected) if (!ctx.state.nodes[id]) ctx.selected.delete(id);
  ctx.layout = layoutForest(ctx.state);
  renderForest(canvas, ctx.state, ctx.layout, { selected: ctx.selected, matches: ctx.matches });
  empty.hidden = Object.keys(ctx.state.nodes).length > 0;
}

export async function refresh(): Promise<void> {
  const reply = await send<StateReply>({ type: 'getState' });
  ctx.state = reply.state;
  ctx.settings = reply.settings;
  draw();
}

canvas.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const el = target.closest<HTMLElement>('.node');
  if (!el) return;
  const id = el.dataset.id!;
  if (target.closest('.star')) {
    void send({ type: 'setFavourite', id, value: !ctx.state.nodes[id].favourite });
    return;
  }
  if (e.ctrlKey || e.metaKey) return; // reserved for selection
  void send({ type: 'activate', id });
});

chrome.runtime.onMessage.addListener((m) => {
  if (m?.type === CHANGED) void refresh();
});

void refresh();
