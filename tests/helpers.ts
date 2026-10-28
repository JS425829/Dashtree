import { onBrowserStart, onSessionStart } from '../src/background/handlers';
import { createStore, type Store } from '../src/background/store';
import { DEFAULT_SETTINGS, EMPTY_STATE, type Settings, type TreeState } from '../src/core/types';

export interface MemoryStore {
  store: Store;
  state: () => TreeState;
  set: (s: TreeState) => void;
  changes: () => number;
  settings: Settings;
}

/** `latencyMs` makes every load/save slow, like real IndexedDB, so interleaving bugs show up. */
export function memoryStore(overrides: Partial<Settings> = {}, latencyMs = 0): MemoryStore {
  let saved: TreeState = EMPTY_STATE;
  let changes = 0;
  const settings = { ...DEFAULT_SETTINGS, ...overrides };
  const pause = () => (latencyMs ? new Promise<void>((r) => setTimeout(r, latencyMs)) : Promise.resolve());
  const store = createStore({
    load: async () => { await pause(); return saved; },
    save: async (s) => { await pause(); saved = s; },
    settings: async () => settings,
    onChange: () => { changes++; },
  });
  return { store, state: () => saved, set: (s) => { saved = s; }, changes: () => changes, settings };
}

/** Invariant: no two nodes ever claim the same live tab. */
export function tabIdsAreUnique(s: TreeState): boolean {
  const ids = Object.values(s.nodes).map((n) => n.tabId).filter((t) => t !== null);
  return new Set(ids).size === ids.length;
}

/** A genuine browser restart: the new session starts (tabs reconciled), then the browser-start event arms the wipe. */
export async function restart(m: MemoryStore, openTabs: { tabId: number; url: string }[] = []): Promise<void> {
  await onSessionStart(m.store, openTabs);
  await onBrowserStart(m.store);
}
