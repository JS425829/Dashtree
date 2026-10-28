import { DEFAULT_SETTINGS, EMPTY_STATE, type NodeId, type Settings, type TreeState } from '../core/types';
import { ext } from '../shared/api';
import { CHANGED, type Command, type StateReply } from '../shared/messages';
import { attachInteractions, editNote } from './interact';
import { appearanceClasses, layoutOptsFor } from './appearance';
import { DEFAULT_LAYOUT, layoutForest, type LayoutOpts, type LayoutResult } from './layout';
import { renderForest } from './render';
import { applyCachedTheme, applyTheme } from './theme';
import { computeMatches } from './groups';
import { renderGroupsMenu } from './groups-menu';
import { renderTopBar } from './topbar';

applyCachedTheme();

export interface PageContext {
  state: TreeState;
  settings: Settings;
  layout: LayoutResult;
  opts: LayoutOpts;
  readonly confirmDelete: boolean;
  readonly ignoredSites: string[];
  readonly showNotes: boolean;
  selected: Set<NodeId>;
  matches: Set<NodeId> | null;
  /** The group whose members are highlighted (everything else dimmed), if any. */
  focusGroup: string | null;
}

export const ctx: PageContext = {
  state: EMPTY_STATE,
  settings: DEFAULT_SETTINGS,
  layout: layoutForest(EMPTY_STATE),
  opts: DEFAULT_LAYOUT,
  get confirmDelete() { return this.settings.confirmBeforeDeleting; },
  get ignoredSites() { return this.settings.ignoredSites; },
  get showNotes() { return this.settings.showNoteBoxes; },
  selected: new Set(),
  matches: null,
  focusGroup: null,
};

export const send = <T = void>(c: Command): Promise<T> => ext.runtime.sendMessage(c);

const canvas = document.getElementById('canvas')!;
const empty = document.getElementById('empty')!;

export function draw(): void {
  for (const id of ctx.selected) if (!ctx.state.nodes[id]) ctx.selected.delete(id);
  ctx.opts = layoutOptsFor(ctx.settings);
  ctx.layout = layoutForest(ctx.state, ctx.opts, ctx.settings.showNoteBoxes);
  canvas.className = appearanceClasses(ctx.settings).join(' ');
  renderForest(
    canvas, ctx.state, ctx.layout,
    { selected: ctx.selected, matches: ctx.matches, showNotes: ctx.settings.showNoteBoxes },
    ctx.opts,
  );
  empty.hidden = Object.keys(ctx.state.nodes).length > 0;
}

let query = '';

const topbar = renderTopBar(document.getElementById('topbar')!, ctx.settings, send, (q) => {
  query = q;
  applyQuery();
});

function applyQuery(): void {
  ctx.matches = computeMatches(ctx.state, query, ctx.focusGroup);
  draw();
}

const viewport = document.getElementById('viewport')!;

function scrollToNodes(ids: NodeId[]): void {
  const spots = ids.map((id) => ctx.layout.pos[id]).filter(Boolean);
  if (!spots.length) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  viewport.scrollTo({
    left: Math.max(0, Math.min(...spots.map((p) => p.x)) - 60),
    top: Math.max(0, Math.min(...spots.map((p) => p.y)) - 60),
    behavior: reduce ? 'auto' : 'smooth',
  });
}

const groupsMenu = renderGroupsMenu(document.getElementById('topbar')!, {
  send,
  getSelected: () => [...ctx.selected],
  selectNodes: (ids) => {
    ctx.selected.clear();
    ids.forEach((id) => ctx.selected.add(id));
    draw();
  },
  setFocus: (id) => {
    ctx.focusGroup = id;
    applyQuery();
    groupsMenu.update(ctx.state, ctx.focusGroup);
  },
  scrollTo: scrollToNodes,
  confirmDelete: () => ctx.settings.confirmBeforeDeleting,
});

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
  if (ctx.focusGroup && !ctx.state.groups[ctx.focusGroup]) ctx.focusGroup = null; // the focused group was deleted
  groupsMenu.update(ctx.state, ctx.focusGroup);
  applyQuery();
}

canvas.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const noteBox = target.closest<HTMLElement>('.note-box');
  if (noteBox) {
    const node = ctx.state.nodes[noteBox.dataset.id!];
    if (node) editNote(node.id, node.note, send);
    return;
  }
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

ext.runtime.onMessage.addListener((m) => {
  if (m?.type === CHANGED) void refresh();
});

void refresh();
