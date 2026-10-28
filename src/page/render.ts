import type { NodeId, TreeNode, TreeState } from '../core/types';
import { DEFAULT_LAYOUT, type LayoutResult } from './layout';

export interface RenderUi {
  selected: Set<NodeId>;
  /** Nodes matching the active search, or null when no search is active (nothing dimmed). */
  matches: Set<NodeId> | null;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const GROUP_PAD = 8;

function hostOf(url: string): string {
  try { return new URL(url).hostname; } catch { return ''; }
}

function label(n: TreeNode): string {
  if (n.title) return n.title;
  if (!n.url) return 'Loading…';
  try {
    const u = new URL(n.url);
    return u.hostname + (u.pathname === '/' ? '' : u.pathname);
  } catch { return n.url; }
}

/** The tab favicon, or a letter badge when there is none or it fails to load. */
function makeIcon(n: TreeNode): HTMLElement {
  const fallback = () => {
    const f = document.createElement('span');
    f.className = 'ico-fallback';
    f.textContent = (hostOf(n.url)[0] ?? '·').toUpperCase();
    return f;
  };
  if (!n.favIconUrl) return fallback();
  const img = document.createElement('img');
  img.className = 'ico';
  img.alt = '';
  img.src = n.favIconUrl;
  img.addEventListener('error', () => img.replaceWith(fallback()), { once: true });
  return img;
}

function makeNode(n: TreeNode, x: number, y: number, ui: RenderUi): HTMLElement {
  const el = document.createElement('div');
  el.className = ['node', n.tabId === null ? 'hollow' : 'open']
    .concat(ui.selected.has(n.id) ? 'selected' : [], n.favourite ? 'favourite' : [])
    .concat(ui.matches && !ui.matches.has(n.id) ? 'dim' : [], ui.matches?.has(n.id) ? 'match' : [])
    .join(' ');
  el.dataset.id = n.id;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.width = `${DEFAULT_LAYOUT.nodeW}px`;
  el.style.height = `${DEFAULT_LAYOUT.nodeH}px`;
  el.title = n.url;

  const text = document.createElement('span');
  text.className = 'label';
  text.textContent = label(n);
  el.append(makeIcon(n), text);

  if (n.note) {
    const note = document.createElement('span');
    note.className = 'note-mark';
    note.textContent = '✎';
    note.title = n.note;
    el.append(note);
  }
  const star = document.createElement('span');
  star.className = 'star';
  star.textContent = n.favourite ? '★' : '☆';
  el.append(star);
  return el;
}

function makeConnectors(s: TreeState, layout: LayoutResult): SVGSVGElement {
  const { nodeW, nodeH } = DEFAULT_LAYOUT;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'connectors');
  svg.setAttribute('width', String(layout.width));
  svg.setAttribute('height', String(layout.height));
  for (const n of Object.values(s.nodes)) {
    const from = n.parentId ? layout.pos[n.parentId] : undefined;
    const to = layout.pos[n.id];
    if (!from || !to) continue;
    const x1 = from.x + nodeW / 2, y1 = from.y + nodeH, x2 = to.x + nodeW / 2, y2 = to.y;
    const mid = (y1 + y2) / 2;
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', `M${x1} ${y1} V${mid} H${x2} V${y2}`);
    svg.append(path);
  }
  return svg;
}

function makeGroupBoxes(s: TreeState, layout: LayoutResult): HTMLElement[] {
  const { nodeW, nodeH } = DEFAULT_LAYOUT;
  const boxes: HTMLElement[] = [];
  for (const g of Object.values(s.groups)) {
    const ps = g.nodeIds.map((id) => layout.pos[id]).filter(Boolean);
    if (!ps.length) continue;
    const x1 = Math.min(...ps.map((p) => p.x)) - GROUP_PAD;
    const y1 = Math.min(...ps.map((p) => p.y)) - GROUP_PAD;
    const x2 = Math.max(...ps.map((p) => p.x)) + nodeW + GROUP_PAD;
    const y2 = Math.max(...ps.map((p) => p.y)) + nodeH + GROUP_PAD;
    const box = document.createElement('div');
    box.className = 'group-box';
    box.style.cssText = `left:${x1}px;top:${y1}px;width:${x2 - x1}px;height:${y2 - y1}px;border-color:${g.colour}`;
    const tag = document.createElement('span');
    tag.className = 'group-label';
    tag.style.background = g.colour;
    tag.textContent = g.name;
    box.append(tag);
    boxes.push(box);
  }
  return boxes;
}

export function renderForest(container: HTMLElement, s: TreeState, layout: LayoutResult, ui: RenderUi): void {
  container.style.width = `${layout.width}px`;
  container.style.height = `${layout.height}px`;
  const nodes = Object.values(s.nodes)
    .filter((n) => layout.pos[n.id])
    .map((n) => makeNode(n, layout.pos[n.id].x, layout.pos[n.id].y, ui));
  container.replaceChildren(...makeGroupBoxes(s, layout), makeConnectors(s, layout), ...nodes);
}
