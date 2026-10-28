import { isIgnoredUrl, isTrackableUrl } from '../core/rules';
import { hollowDescendants, moveNode, orderedSiblings, stepTarget, type MovePosition } from '../core/tree';
import type { NodeId, TreeState } from '../core/types';
import type { Command } from '../shared/messages';
import { displayName } from './display';
import { nextGroupColour } from './groups';
import { NOTE_BOX, type LayoutOpts, type LayoutResult } from './layout';
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
  /** Note boxes are on, so a card with a note is wider when placing the drop marker. */
  showNotes?: boolean;
  selected: Set<NodeId>;
}

/** Asks for a note (starting from the current one) and sends it; an empty answer clears it, cancelling does nothing. */
export function editNote(id: NodeId, current: string, send: (c: Command) => unknown): void {
  const note = prompt('Note for this tab', current);
  if (note !== null) void send({ type: 'setNote', id, note });
}

/**
 * Where dragging `draggedId` with the pointer at canvas x `pointerX` would drop it among its siblings,
 * or null when that would not change the order.
 */
export function reorderTarget(
  s: TreeState, layout: LayoutResult, nodeW: number, draggedId: NodeId, pointerX: number,
): { targetId: NodeId; position: MovePosition } | null {
  const others = orderedSiblings(s, draggedId).filter((id) => id !== draggedId && layout.pos[id]);
  if (!others.length) return null;
  const before = others.find((id) => layout.pos[id].x + nodeW / 2 > pointerX);
  const targetId = before ?? others[others.length - 1];
  const position: MovePosition = before ? 'before' : 'after';
  return moveNode(s, draggedId, targetId, position) === s ? null : { targetId, position };
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
        action: () => editNote(id, c.state.nodes[id].note, send),
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
    const left = stepTarget(c.state, id, -1);
    const right = stepTarget(c.state, id, 1);
    if (left) items.push({ label: 'Move left', action: () => void send({ type: 'move', id, ...left }) });
    if (right) items.push({ label: 'Move right', action: () => void send({ type: 'move', id, ...right }) });
  }

  items.push('separator', {
    label: 'Create group…',
    action: () => {
      const name = prompt('Group name')?.trim();
      if (!name) return;
      void send({ type: 'createGroup', name, colour: nextGroupColour(c.state), nodeIds: ids });
    },
  });
  for (const g of Object.values(c.state.groups)) {
    // only groups that would actually gain a member
    if (ids.every((id) => g.nodeIds.includes(id))) continue;
    items.push({ label: `Add to group: ${g.name}`, action: () => void send({ type: 'addToGroup', groupId: g.id, nodeIds: ids }) });
  }
  for (const g of Object.values(c.state.groups)) {
    if (!ids.some((id) => g.nodeIds.includes(id))) continue;
    items.push({ label: `Remove from group: ${g.name}`, action: () => void send({ type: 'removeFromGroup', groupId: g.id, nodeIds: ids }) });
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

  // dragging a card sideways reorders it among its siblings
  interface NodeDrag {
    id: NodeId;
    x: number;
    y: number;
    el: HTMLElement;
    moved: boolean;
    cancelled: boolean;
    indicator: HTMLElement | null;
    target: ReturnType<typeof reorderTarget>;
  }
  let nodeDrag: NodeDrag | null = null;
  let swallowClick = false;

  const dropLift = (d: NodeDrag) => {
    d.el.classList.remove('dragging');
    d.el.style.transform = '';
    d.indicator?.remove();
    d.indicator = null;
  };

  viewport.addEventListener('mousedown', (e) => {
    const t = e.target as HTMLElement;
    const card = t.closest<HTMLElement>('.node');
    if (card && e.button === 0 && !e.ctrlKey && !e.metaKey && !t.closest('.star')) {
      nodeDrag = { id: card.dataset.id!, x: e.clientX, y: e.clientY, el: card, moved: false, cancelled: false, indicator: null, target: null };
    }
  });

  window.addEventListener('mousemove', (e) => {
    const d = nodeDrag;
    if (!d || d.cancelled) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) <= DRAG_THRESHOLD) return;
    d.moved = true;
    d.el.classList.add('dragging');
    d.el.style.transform = `translate(${dx}px, ${dy}px)`;

    const c = getCtx();
    d.target = reorderTarget(c.state, c.layout, c.opts.nodeW, d.id, canvasPoint(e).x);
    if (!d.target) {
      d.indicator?.remove();
      d.indicator = null;
      return;
    }
    const at = c.layout.pos[d.target.targetId];
    const noted = c.showNotes && c.state.nodes[d.target.targetId].note?.trim();
    const slot = c.opts.nodeW + (noted ? NOTE_BOX.gap + NOTE_BOX.w : 0);
    d.indicator ??= Object.assign(document.createElement('div'), { className: 'drop-indicator' });
    if (!d.indicator.isConnected) canvas.append(d.indicator);
    Object.assign(d.indicator.style, {
      left: `${d.target.position === 'before' ? at.x - c.opts.gapX / 2 - 2 : at.x + slot + c.opts.gapX / 2 - 2}px`,
      top: `${at.y - 4}px`,
      height: `${c.opts.nodeH + 8}px`,
    });
  });

  window.addEventListener('mouseup', () => {
    const d = nodeDrag;
    if (!d) return;
    nodeDrag = null;
    dropLift(d);
    if (d.moved) {
      // the click that follows a drag must not open the page
      swallowClick = true;
      setTimeout(() => { swallowClick = false; }, 0);
      if (!d.cancelled && d.target) void send({ type: 'move', id: d.id, ...d.target });
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nodeDrag && !nodeDrag.cancelled) {
      nodeDrag.cancelled = true;
      dropLift(nodeDrag);
    }
  });

  canvas.addEventListener('click', (e) => {
    if (!swallowClick) return;
    swallowClick = false;
    e.stopPropagation();
    e.preventDefault();
  }, true);

  viewport.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.node, .note-box')) return;
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
