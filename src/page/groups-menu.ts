import type { NodeId, TreeState } from '../core/types';
import type { Command } from '../shared/messages';
import { groupMembers, nextGroupColour } from './groups';

/** What the Groups menu needs from the page. */
export interface GroupsApi {
  send(c: Command): unknown;
  getSelected(): NodeId[];
  selectNodes(ids: NodeId[]): void;
  /** Dim everything outside this group, or null to stop. */
  setFocus(groupId: string | null): void;
  scrollTo(ids: NodeId[]): void;
  /** The confirmBeforeDeleting setting. */
  confirmDelete(): boolean;
}

export interface GroupsMenu {
  update(state: TreeState, focusGroupId: string | null): void;
}

const POPOVER_EVENT = 'histo:popover-open';

export function renderGroupsMenu(el: HTMLElement, api: GroupsApi): GroupsMenu {
  let state: TreeState = { nodes: {}, groups: {} };
  let focusId: string | null = null;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'groups-toggle';
  el.insertBefore(toggle, el.querySelector('.clear-hollow'));

  const popover = document.createElement('div');
  popover.className = 'popover groups-popover';
  popover.id = 'groups-popover';
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-label', 'Groups');
  popover.hidden = true;
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', popover.id);

  const newGroup = document.createElement('button');
  newGroup.type = 'button';
  newGroup.className = 'new-group';
  newGroup.textContent = 'New group from selection';
  const refreshNewGroup = () => { newGroup.disabled = api.getSelected().length === 0; };
  newGroup.addEventListener('click', () => {
    const name = prompt('Name for the new group')?.trim();
    if (!name) return;
    void api.send({ type: 'createGroup', name, colour: nextGroupColour(state), nodeIds: api.getSelected() });
  });

  const list = document.createElement('ul');
  list.className = 'group-list';
  const empty = document.createElement('p');
  empty.className = 'group-empty';
  empty.textContent = 'No groups yet. Select nodes with Ctrl+drag, then right-click and choose Create group…';
  popover.append(newGroup, list, empty);
  document.body.append(popover);

  const setOpen = (open: boolean) => {
    popover.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      refreshNewGroup();
      document.dispatchEvent(new CustomEvent(POPOVER_EVENT, { detail: popover.id }));
    }
  };
  toggle.addEventListener('click', () => setOpen(Boolean(popover.hidden)));
  document.addEventListener(POPOVER_EVENT, (e) => {
    if ((e as CustomEvent<string>).detail !== popover.id) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !popover.hidden) {
      setOpen(false);
      toggle.focus();
    }
  });

  const action = (text: string, label: string, onClick: () => void, pressed?: boolean) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.setAttribute('aria-label', label);
    if (pressed !== undefined) b.setAttribute('aria-pressed', String(pressed));
    b.addEventListener('click', onClick);
    return b;
  };

  function renderRows() {
    const groups = Object.values(state.groups);
    toggle.textContent = groups.length ? `Groups (${groups.length})` : 'Groups';
    empty.hidden = groups.length > 0;
    list.hidden = groups.length === 0;
    list.replaceChildren(...groups.map((g) => {
      const members = groupMembers(state, g.id);
      const li = document.createElement('li');
      li.className = 'group-row';
      li.dataset.groupId = g.id;

      const colour = document.createElement('input');
      colour.type = 'color';
      colour.value = g.colour;
      colour.setAttribute('aria-label', `Colour for ${g.name}`);
      colour.addEventListener('change', () => void api.send({ type: 'recolourGroup', groupId: g.id, colour: colour.value }));

      const name = document.createElement('span');
      name.className = 'group-name';
      name.textContent = g.name;
      const count = document.createElement('span');
      count.className = 'group-count';
      count.textContent = `${members.length} node${members.length === 1 ? '' : 's'}`;

      const buttons = document.createElement('span');
      buttons.className = 'group-actions';
      buttons.append(
        action('Select', `Select members of ${g.name}`, () => api.selectNodes(members)),
        action('Focus', `Focus ${g.name}`, () => api.setFocus(focusId === g.id ? null : g.id), focusId === g.id),
        action('Go to', `Go to ${g.name}`, () => api.scrollTo(members)),
        action('Rename', `Rename ${g.name}`, () => {
          const next = prompt('Group name', g.name)?.trim();
          if (next) void api.send({ type: 'renameGroup', groupId: g.id, name: next });
        }),
        action('Delete', `Delete ${g.name}`, () => {
          if (!api.confirmDelete() || confirm(`Delete the group "${g.name}"? The pages stay in the tree.`)) {
            void api.send({ type: 'deleteGroup', groupId: g.id });
          }
        }),
      );

      li.append(colour, name, count, buttons);
      return li;
    }));
  }

  return {
    update(s, focus) {
      state = s;
      focusId = focus;
      renderRows();
      refreshNewGroup();
    },
  };
}
