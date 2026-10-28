import { isIgnoredUrl, isTrackableUrl } from '../core/rules';
import { hollowDescendants } from '../core/tree';
import type { NodeId, TreeState } from '../core/types';
import type { Command } from '../shared/messages';
import { displayName } from './display';
import type { LayoutOpts, LayoutResult } from './layout';
import { showMenu, type MenuItem } from './menu';
import { showToast } from './toast';

export interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface InteractCtx {
  state: TreeState;
  layout: LayoutResult;
  /** Card size in use, for hit-testing the selection box. */
  opts: LayoutOpts;
  /** The confirmBeforeDeleting setting. */
  confirmDelete: boolean;
  /** The ignoredSites setting, so the menu can add to it. */
  ignoredSites: string[];
  selected: Set<NodeId>;
}

/** The sites (once each, in order) that "Ignore" would add for these nodes: real sites not already covered. */
export function ignoreCandidates(s: TreeState, ids: NodeId[], ignored: string[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const url = s.nodes[id]?.url;
    if (!url || !isTrackableUrl(url)) continue;
    let host: string;
    try { host = new URL(url).hostname.toLowerCase(); } catch { continue; }
    if (!host || out.includes(host) || isIgnoredUrl(url, ignored)) continue;
    out.push(host);
  }
  return out;
}

/** A single plain delete never asks; several nodes or delete-with-children ask when the setting is on. */
export function needsConfirm(count: number, withChildren: boolean, enabled: boolean): boolean {
  return enabled && (count > 1 || withChildren);
}

const GROUP_COLOURS = ['#4da3ff', '#f5c542', '#7bd88f', '#ff7b72', '#c69cff', '#ffa657'];
const DRAG_THRESHOLD = 4;

/** Nodes whose box intersects the rectangle (corners may be given in any order). */
export function nodesInRect(layout: LayoutResult, nodeW: number, nodeH: number, r: Rect): NodeId[] {
  const left = Math.min(r.x1, r.x2), right = Math.max(r.x1, r.x2);
  const top = Math.min(r.y1, r.y2), bottom = Math.max(r.y1, r.y2);
  return Object.entries(layout.pos)
    .filter(([, p]) => p.x <= right && p.x + nodeW >= left && p.y <= bottom && p.y + nodeH >= top)
    .map(([id]) => id);
}

export function buildMenu(
  ids: NodeId[], c: InteractCtx, send: (cmd: Command) => unknown, changed: () => void,
): MenuItem[] {
  const del = (withChildren: boolean) => () => {
    const what = `${ids.length} node${ids.length === 1 ? '' : 's'}${withChildren ? ' and everything under them' : ''}`;
    if (needsConfirm(ids.length, withChildren, c.confirmDelete) && !confirm(`Delete ${what}?`)) return;
    void send({ type: 'delete', ids, withChildren });
  };
  const items: MenuItem[] = [
    { label: 'Delete', action: del(false) },
    { label: 'Delete with children', action: del(true) },
  ];

  if (ids.length === 1) {
    const id = ids[0];
    items.push(
      {
        label: 'Rename',
        action: () => {
          const node = c.state.nodes[id];
          const name = prompt('Name for this node (leave empty to use the page title)', node.url || node.customTitle ? displayName(node) : '');
          if (name !== null) void send({ type: 'rename', id, title: name });
        },
      },
      {
        label: 'Add notes',
        action: () => {
          const note = prompt('Note for this tab', c.state.nodes[id].note);
          if (note !== null) void send({ type: 'setNote', id, note });
        },
      },
      {
        label: 'Select hollow children',
        action: () => {
          c.selected.clear();
          hollowDescendants(c.state, id).forEach((d) => c.selected.add(d));
          changed();
        },
      },
    );
  }

  items.push('separator', {
    label: 'Create group…',
    action: () => {
      const name = prompt('Group name')?.trim();
      if (!name) return;
      const colour = GROUP_COLOURS[Object.keys(c.state.groups).length % GROUP_COLOURS.length];
      void send({ type: 'createGroup', name, colour, nodeIds: ids });
    },
  });
  for (const g of Object.values(c.state.groups)) {
    items.push({ label: `Add to group: ${g.name}`, action: () => void send({ type: 'addToGroup', groupId: g.id, nodeIds: ids }) });
  }

  const hosts = ignoreCandidates(c.state, ids, c.ignoredSites);
  if (hosts.length) {
    items.push('separator', {
      label: hosts.length === 1 ? `Ignore ${hosts[0]}` : `Ignore ${hosts.length} sites`,
      action: () => {
        void send({ type: 'setSettings', settings: { ignoredSites: [...c.ignoredSites, ...hosts] } });
        showToast(`Ignoring ${hosts.join(', ')} from now on. Pages already in the tree stay; manage the list in Settings.`);
      },
    });
  }
  return items;
}

type Drag =
  | { kind: 'pan'; x: number; y: number; left: number; top: number }
  | { kind: 'box'; x: number; y: number; el: HTMLElement };

export function attachInteractions(
  canvas: HTMLElement,
  getCtx: () => InteractCtx,
  send: (c: Command) => unknown,
  onSelectionChange: () => void,
): void {
  const viewport = canvas.parentElement as HTMLElement;
  let drag: Drag | null = null;
  let moved = false;

  const canvasPoint = (e: MouseEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  viewport.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.node')) return;
    moved = false;
    if (e.ctrlKey || e.metaKey) {
      const p = canvasPoint(e);
      const el = document.createElement('div');
      el.className = 'selection-box';
      canvas.append(el);
      drag = { kind: 'box', x: p.x, y: p.y, el };
    } else {
      drag = { kind: 'pan', x: e.clientX, y: e.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
      viewport.classList.add('panning');
    }
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!drag) return;
    if (drag.kind === 'pan') {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) moved = true;
      viewport.scrollLeft = drag.left - dx;
      viewport.scrollTop = drag.top - dy;
    } else {
      const p = canvasPoint(e);
      if (Math.abs(p.x - drag.x) + Math.abs(p.y - drag.y) > DRAG_THRESHOLD) moved = true;
      Object.assign(drag.el.style, {
        left: `${Math.min(p.x, drag.x)}px`, top: `${Math.min(p.y, drag.y)}px`,
        width: `${Math.abs(p.x - drag.x)}px`, height: `${Math.abs(p.y - drag.y)}px`,
      });
    }
  });

  window.addEventListener('mouseup', (e) => {
    if (!drag) return;
    const c = getCtx();
    if (drag.kind === 'box') {
      const p = canvasPoint(e);
      drag.el.remove();
      c.selected.clear();
      if (moved) nodesInRect(c.layout, c.opts.nodeW, c.opts.nodeH, { x1: drag.x, y1: drag.y, x2: p.x, y2: p.y }).forEach((id) => c.selected.add(id));
      onSelectionChange();
    } else {
      viewport.classList.remove('panning');
      if (!moved && c.selected.size) {
        c.selected.clear();
        onSelectionChange();
      }
    }
    drag = null;
  });

  canvas.addEventListener('click', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('.node');
    if (!el || (e.target as HTMLElement).closest('.star')) return;
    const { selected } = getCtx();
    const id = el.dataset.id!;
    if (!selected.delete(id)) selected.add(id);
    onSelectionChange();
  });

  viewport.addEventListener('contextmenu', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('.node');
    if (!el) return;
    e.preventDefault();
    const c = getCtx();
    const id = el.dataset.id!;
    if (!c.selected.has(id)) {
      c.selected.clear();
      c.selected.add(id);
      onSelectionChange();
    }
    showMenu(e.clientX, e.clientY, buildMenu([...c.selected], getCtx(), send, onSelectionChange));
  });
}
