import type { Settings, TreeState } from '../core/types';

export interface StoreDeps {
  load(): Promise<TreeState>;
  save(s: TreeState): Promise<void>;
  settings(): Promise<Settings>;
  onChange(): void;
}

export interface Store {
  mutate(fn: (s: TreeState, settings: Settings) => TreeState): Promise<void>;
  read(): Promise<TreeState>;
}

export function createStore(deps: StoreDeps): Store {
  let queue: Promise<unknown> = Promise.resolve();

  return {
    mutate(fn) {
      const run = async () => {
        const [state, settings] = await Promise.all([deps.load(), deps.settings()]);
        const next = fn(state, settings);
        if (next !== state) {
          await deps.save(next);
          deps.onChange();
        }
      };
      const result = queue.then(run, run);
      queue = result.catch(() => {});
      return result;
    },
    read: () => deps.load(),
  };
}
