import { isHexColour } from '../core/tree';
import type { NodeId, TreeNode, TreeState } from '../core/types';
import { displayName } from './display';
import { DEFAULT_LAYOUT, NOTE_BOX, type LayoutOpts, type LayoutResult } from './layout';

export interface RenderUi {
  selected: Set<NodeId>;
  /** Nodes matching the active search, or null when no search is active (nothing dimmed). */
  matches: Set<NodeId> | null;
  /** Show each node's note in a box beside its card (the layout must have been made with room for them). */
  showNotes?: boolean;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const GROUP_PAD = 8;
const FALLBACK_COLOUR = '#5aaeff';
const DOT_GAP = 12; // distance from a card's top edge up to its timeline dot

function hostOf(url: string): string {
  try { return new URL(url).hostname; } catch { return ''; }
}

/** A stable pastel hue per site, so each site's tile keeps its colour. */
function hueOf(host: string): number {
  let h = 0;
  for (const c of host) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/** The tab favicon on a coloured rounded tile; a letter badge when there is none or it fails to load. */
function makeTile(n: TreeNode): HTMLElement {
  const host = hostOf(n.url);
  const tile = document.createElement('span');
  tile.className = 'tile';
  tile.style.setProperty('--h', String(hueOf(host)));
  const fallback = () => {
    const f = document.createElement('span');
    f.className = 'ico-fallback';
    f.textContent = (host[0] ?? '·').toUpperCase();
    return f;
  };
  if (!n.favIconUrl) {
    tile.append(fallback());
    return tile;
  }
  const img = document.createElement('img');
  img.className = 'ico';
  img.alt = '';
  img.src = n.favIconUrl;
  img.addEventListener('error', () => img.replaceWith(fallback()), { once: true });
  tile.append(img);
  return tile;
}

const ICONS = {
  star: 'M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z',
  note: 'M4 20h4l10.5-10.5a2.1 2.1 0 000-3L17 5a2.1 2.1 0 00-3 0L4 15.5V20z',
};

/** Decorative inline SVG icon (hidden from assistive tech; the owning control carries the name). */
function svgIcon(path: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', path);
  svg.append(p);
  return svg;
}

function describe(n: TreeNode, text: string, groups: string[]): string {
  return [text, n.tabId === null ? 'closed tab' : 'open tab']
    .concat(n.favourite ? 'favourite' : [], n.note ? 'has a note' : [], groups.map((g) => `in group ${g}`))
    .join(', ');
}

function makeNode(n: TreeNode, x: number, y: number, ui: RenderUi, groups: string[], opts: LayoutOpts): HTMLElement {
  const el = document.createElement('div');
  el.className = ['node', n.tabId === null ? 'hollow' : 'open']
    .concat(ui.selected.has(n.id) ? 'selected' : [], n.favourite ? 'favourite' : [])
    .concat(ui.matches && !ui.matches.has(n.id) ? 'dim' : [], ui.matches?.has(n.id) ? 'match' : [])
    .join(' ');
  el.dataset.id = n.id;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.width = `${opts.nodeW}px`;
  el.style.height = `${opts.nodeH}px`;

  const text = document.createElement('span');
  text.className = 'label';
  text.textContent = displayName(n);
  const sub = document.createElement('span');
  sub.className = 'sub';
  sub.textContent = hostOf(n.url);
  const words = document.createElement('span');
  words.className = 'words';
  words.append(text, sub);

  const main = document.createElement('button');
  main.type = 'button';
  main.className = 'node-main';
  main.title = n.url;
  main.setAttribute('aria-label', describe(n, text.textContent, groups));
  main.append(makeTile(n), words);
  if (n.note) {
    const note = document.createElement('span');
    note.className = 'note-mark';
    note.title = n.note;
    note.append(svgIcon(ICONS.note));
    main.append(note);
  }

  const star = document.createElement('button');
  star.type = 'button';
  star.className = 'star';
  star.setAttribute('aria-label', 'Favourite');
  star.setAttribute('aria-pressed', String(n.favourite));
  star.append(svgIcon(ICONS.star));

  el.append(main, star);
  return el;
}

function makeConnectors(s: TreeState, layout: LayoutResult, opts: LayoutOpts): SVGSVGElement {
  const { nodeW, nodeH } = opts;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'connectors');
  svg.setAttribute('width', String(layout.width));
  svg.setAttribute('height', String(layout.height));
  for (const n of Object.values(s.nodes)) {
    const to = layout.pos[n.id];
    if (!to) continue;
    const x2 = to.x + nodeW / 2, y2 = to.y - DOT_GAP;
    const from = n.parentId ? layout.pos[n.parentId] : undefined;
    if (from) {
      const x1 = from.x + nodeW / 2, y1 = from.y + nodeH, mid = (y1 + y2) / 2;
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', `M${x1} ${y1} C${x1} ${mid} ${x2} ${mid} ${x2} ${y2}`);
      path.setAttribute('class', n.tabId === null ? 'link hollow' : 'link open');
      svg.append(path);
    }
    // timeline dot: filled for an open tab, a ring for a closed one
    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('class', n.tabId === null ? 'dot hollow' : 'dot open');
    dot.setAttribute('cx', String(x2));
    dot.setAttribute('cy', String(y2));
    dot.setAttribute('r', '5');
    svg.append(dot);
  }
  return svg;
}

/** One outline per member (never a shared box, which would also cover non-members), each labelled with the group name. */
function makeGroupBoxes(s: TreeState, layout: LayoutResult, opts: LayoutOpts): HTMLElement[] {
  const { nodeW, nodeH } = opts;
  const boxes: HTMLElement[] = [];
  const layers = new Map<NodeId, number>(); // a node in several groups gets nested outlines
  for (const g of Object.values(s.groups)) {
    for (const id of g.nodeIds) {
      const p = layout.pos[id];
      if (!p) continue;
      const layer = layers.get(id) ?? 0;
      layers.set(id, layer + 1);
      const pad = GROUP_PAD + layer * 4;
      const colour = isHexColour(g.colour) ? g.colour : FALLBACK_COLOUR; // it goes into an inline style
      const box = document.createElement('div');
      box.className = 'group-box';
      box.style.cssText = `left:${p.x - pad}px;top:${p.y - pad}px;width:${nodeW + 2 * pad}px;height:${nodeH + 2 * pad}px;border-color:${colour}`;
      const tag = document.createElement('span');
      tag.className = 'group-label';
      tag.style.background = colour;
      tag.textContent = g.name;
      box.append(tag);
      boxes.push(box);
    }
  }
  return boxes;
}

/** A sticky-note box beside the card; clicking it edits the note. */
function makeNoteBox(n: TreeNode, at: { x: number; y: number }, ui: RenderUi, opts: LayoutOpts): HTMLElement {
  const box = document.createElement('button');
  box.type = 'button';
  box.className = ui.matches && !ui.matches.has(n.id) ? 'note-box dim' : 'note-box';
  box.dataset.id = n.id;
  box.title = 'Click to edit this note';
  box.style.left = `${at.x + opts.nodeW + NOTE_BOX.gap}px`;
  box.style.top = `${at.y}px`;
  box.style.width = `${NOTE_BOX.w}px`;
  box.style.maxHeight = `${opts.nodeH + opts.gapY - 12}px`; // never reaches the row below
  box.textContent = n.note ?? '';
  return box;
}

function groupNamesByNode(s: TreeState): Map<NodeId, string[]> {
  const out = new Map<NodeId, string[]>();
  for (const g of Object.values(s.groups)) {
    for (const id of g.nodeIds) out.set(id, [...(out.get(id) ?? []), g.name]);
  }
  return out;
}

export function renderForest(
  container: HTMLElement, s: TreeState, layout: LayoutResult, ui: RenderUi, opts: LayoutOpts = DEFAULT_LAYOUT,
): void {
  container.style.width = `${layout.width}px`;
  container.style.height = `${layout.height}px`;
  const groups = groupNamesByNode(s);
  const nodes = Object.values(s.nodes)
    .filter((n) => layout.pos[n.id])
    .map((n) => makeNode(n, layout.pos[n.id].x, layout.pos[n.id].y, ui, groups.get(n.id) ?? [], opts));
  const noteBoxes = ui.showNotes
    ? Object.values(s.nodes)
      .filter((n) => layout.pos[n.id] && n.note?.trim())
      .map((n) => makeNoteBox(n, layout.pos[n.id], ui, opts))
    : [];
  container.replaceChildren(...makeGroupBoxes(s, layout, opts), makeConnectors(s, layout, opts), ...nodes, ...noteBoxes);
}
