import { DEFAULT_SETTINGS, EMPTY_STATE, type NodeId, type Settings, type TreeState } from '../core/types';
import { CHANGED, type Command, type StateReply } from '../shared/messages';
import { attachInteractions } from './interact';
import { appearanceClasses, layoutOptsFor } from './appearance';
import { DEFAULT_LAYOUT, layoutForest, type LayoutOpts, type LayoutResult } from './layout';
import { renderForest } from './render';
import { applyCachedTheme, applyTheme } from './theme';
import { matchIds, renderTopBar } from './topbar';

applyCachedTheme();

export interface PageContext {
  state: TreeState;
  settings: Settings;
  layout: LayoutResult;
  opts: LayoutOpts;
  readonly confirmDelete: boolean;
  readonly ignoredSites: string[];
  selected: Set<NodeId>;
  matches: Set<NodeId> | null;
}

export const ctx: PageContext = {
  state: EMPTY_STATE,
  settings: DEFAULT_SETTINGS,
  layout: layoutForest(EMPTY_STATE),
  opts: DEFAULT_LAYOUT,
  get confirmDelete() { return this.settings.confirmBeforeDeleting; },
  get ignoredSites() { return this.settings.ignoredSites; },
  selected: new Set(),
  matches: null,
};

export const send = <T = void>(c: Command): Promise<T> => chrome.runtime.sendMessage(c);

const canvas = document.getElementById('canvas')!;
const empty = document.getElementById('empty')!;

export function draw(): void {
  for (const id of ctx.selected) if (!ctx.state.nodes[id]) ctx.selected.delete(id);
  ctx.opts = layoutOptsFor(ctx.settings);
  ctx.layout = layoutForest(ctx.state, ctx.opts);
  canvas.className = appearanceClasses(ctx.settings).join(' ');
  renderForest(canvas, ctx.state, ctx.layout, { selected: ctx.selected, matches: ctx.matches }, ctx.opts);
  empty.hidden = Object.keys(ctx.state.nodes).length > 0;
}

let query = '';

const topbar = renderTopBar(document.getElementById('topbar')!, ctx.settings, send, (q) => {
  query = q;
  applyQuery();
});

function applyQuery(): void {
  ctx.matches = query.trim() ? matchIds(ctx.state, query) : null;
  draw();
}

let latestRequest = 0;

export async function refresh(): Promise<void> {
  const request = ++latestRequest;
  const reply = await send<StateReply & { error?: string }>({ type: 'getState' });
  // ignore errors from the worker and replies that were overtaken by a newer request
  if (!reply || reply.error || !reply.state || request !== latestRequest) return;
  ctx.state = reply.state;
  ctx.settings = reply.settings;
  applyTheme(ctx.settings.theme);
  topbar.update(ctx.settings);
  applyQuery();
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

attachInteractions(canvas, () => ctx, send, draw);

chrome.runtime.onMessage.addListener((m) => {
  if (m?.type === CHANGED) void refresh();
});

void refresh();
