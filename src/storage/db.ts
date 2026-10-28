import { DEFAULT_SETTINGS, EMPTY_STATE, type Settings, type TreeState } from '../core/types';

// The extension is now called Histo-tree, but this name is where saved trees live: changing it would orphan them.
const DB_NAME = 'dashtree';
const STORE = 'tree';
const KEY = 'state';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function loadState(): Promise<TreeState> {
  return (await run<TreeState | undefined>('readonly', (s) => s.get(KEY))) ?? EMPTY_STATE;
}

export async function saveState(state: TreeState): Promise<void> {
  await run('readwrite', (s) => s.put(state, KEY));
}

export async function loadSettings(): Promise<Settings> {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(settings ?? {}) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.local.set({ settings });
}
