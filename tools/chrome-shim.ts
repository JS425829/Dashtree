// Preview-only stand-in for the extension runtime: serves sample data to the real page code and applies its commands in memory.
import {
  addNode, addToGroup, clearHollow, createGroup, deleteGroup, deleteNodes, moveNode, removeFromGroup, renameGroup, renameNode,
  setFavourite, setGroupColour, setNote, updateNode,
} from '../src/core/tree';
import { DEFAULT_SETTINGS, EMPTY_STATE, type NodeId, type TreeState } from '../src/core/types';
import { CHANGED, type Command } from '../src/shared/messages';

let state: TreeState = EMPTY_STATE;
let settings = { ...DEFAULT_SETTINGS };
let nextTab = 100;

const icon = (domain: string) => `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
function add(parentId: NodeId | null, domain: string, path: string, title: string, tabId: number | null): NodeId {
  const r = addNode(state, { parentId, url: `https://${domain}${path}`, title, favIconUrl: icon(domain), tabId });
  state = r.state;
  return r.id;
}

const azure = add(null, 'portal.azure.com', '/', 'Microsoft Azure', 1);
const rgs = add(azure, 'portal.azure.com', '/#view/Browse/ResourceGroups', 'Resource groups', null);
const prod = add(rgs, 'portal.azure.com', '/#@contoso/resource/rg-prod-uk', 'rg-prod-uk', 2);
const blobs = add(prod, 'portal.azure.com', '/#@contoso/resource/rg-prod-uk/blobs', 'Storage account: blobs', null);
add(rgs, 'portal.azure.com', '/#@contoso/resource/rg-dev', 'rg-dev', null);
const pipes = add(azure, 'dev.azure.com', '/xpand/_build', 'Pipelines', 3);
const run = add(pipes, 'dev.azure.com', '/xpand/_build/results?buildId=482', 'Run #482', null);
add(azure, 'portal.azure.com', '/#view/Cost/Management', 'Cost management', null);
const gh = add(null, 'github.com', '/', 'GitHub', 4);
const pr = add(gh, 'github.com', '/xpand/app/pull/31', 'PR #31: tidy deploy script', null);
add(pr, 'github.com', '/xpand/app/pull/31/checks', 'Checks', null);
const outlook = add(null, 'outlook.office.com', '/mail', 'Outlook', null);
state = setFavourite(state, azure, true);
state = setFavourite(state, outlook, true);
state = setNote(state, azure, 'check costs before Friday');
state = setNote(state, blobs, 'lifecycle rule?');
state = createGroup(state, 'Ticket XL-1042', '#5aaeff', [prod, run, pr]).state;

const listeners: ((m: unknown) => void)[] = [];
const notify = () => listeners.forEach((l) => l({ type: CHANGED }));

async function handle(c: Command): Promise<unknown> {
  switch (c.type) {
    case 'getState':
    case 'getSettings':
      return { state, settings };
    case 'activate': {
      const n = state.nodes[c.id];
      if (n && n.tabId === null) state = updateNode(state, c.id, { tabId: nextTab++ });
      break;
    }
    case 'delete': state = deleteNodes(state, c.ids, c.withChildren); break;
    case 'setFavourite': state = setFavourite(state, c.id, c.value); break;
    case 'setNote': state = setNote(state, c.id, c.note); break;
    case 'rename': state = renameNode(state, c.id, c.title); break;
    case 'move': state = moveNode(state, c.id, c.targetId, c.position); break;
    case 'clearHollow': state = clearHollow(state); break;
    case 'createGroup': state = createGroup(state, c.name, c.colour, c.nodeIds).state; break;
    case 'addToGroup': state = addToGroup(state, c.groupId, c.nodeIds); break;
    case 'removeFromGroup': state = removeFromGroup(state, c.groupId, c.nodeIds); break;
    case 'deleteGroup': state = deleteGroup(state, c.groupId); break;
    case 'renameGroup': state = renameGroup(state, c.groupId, c.name); break;
    case 'recolourGroup': state = setGroupColour(state, c.groupId, c.colour); break;
    case 'setSettings': settings = { ...settings, ...c.settings }; break;
  }
  setTimeout(notify, 0);
  return undefined;
}

(globalThis as unknown as { chrome: unknown }).chrome = {
  runtime: {
    sendMessage: handle,
    onMessage: { addListener: (fn: (m: unknown) => void) => listeners.push(fn) },
  },
};
