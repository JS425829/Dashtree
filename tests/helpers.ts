import { createStore, type Store } from '../src/background/store';
import { DEFAULT_SETTINGS, EMPTY_STATE, type Settings, type TreeState } from '../src/core/types';

export interface MemoryStore {
  store: Store;
  state: () => TreeState;
  set: (s: TreeState) => void;
  changes: () => number;
  settings: Settings;
}

export function memoryStore(overrides: Partial<Settings> = {}): MemoryStore {
  let saved: TreeState = EMPTY_STATE;
  let changes = 0;
  const settings = { ...DEFAULT_SETTINGS, ...overrides };
  const store = createStore({
    load: async () => saved,
    save: async (s) => { saved = s; },
    settings: async () => settings,
    onChange: () => { changes++; },
  });
  return { store, state: () => saved, set: (s) => { saved = s; }, changes: () => changes, settings };
}
