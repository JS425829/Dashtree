# Dashtree Core (single-user tree) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Edge extension that records tab lineage as a tree and shows it on a dedicated full-page tab, with favourites, notes, groups, delete/clear tools and search.

**Architecture:** A pure TypeScript core (`src/core`) holds the tree model and navigation rules and is unit-tested without a browser. A background service worker is the single writer: it turns Edge tab/navigation events into core operations, persists the whole tree to IndexedDB, and broadcasts a change message. The tree page is a thin client: it asks the background for state, sends commands for every change, and renders with DOM + SVG.

**Tech Stack:** TypeScript, esbuild (bundling), Vitest + fake-indexeddb (tests), Manifest V3, no UI framework.

**Spec:** `docs/superpowers/specs/2026-10-28-dashtree-design.md`. Team view (pairing codes, trust, person switcher) is **out of scope here** and gets its own plan after this one works.

## Global Constraints

- Platform: Microsoft Edge, Manifest V3 (service worker background). Extension only, nothing to install beyond it.
- The tree opens as a **dedicated full-page tab** (toolbar button and keyboard shortcut); one instance only (re-opening focuses the existing tab); the tree page never appears in the tree.
- Node states: **open** = solid filled node; **closed** = hollow, dashed-outline node. Nodes show the tab favicon and title. Layout is vertical: roots at top, branches grow downward with connector lines.
- Settings and defaults: (1) same-tab navigation adds a new node (default) vs updates the current node; (2) wipe non-favourite hollow nodes once a tab is opened after restart (default on); (3) closing a tab turns its node hollow (default on; off removes the node).
- Back, forward, reload and hash-only changes create no nodes. Revisiting a URL already present as a child of the current node reuses it. A URL typed into an existing tab starts a new root. Same-origin history-state route changes count (Azure Portal and DevOps are single-page apps).
- Favourites: any node can be favourited; favourites never auto-open; a favourite plus its ancestors and descendants survive the post-restart wipe and "Clear hollow nodes"; explicit Delete still works on them.
- Right-click node menu: Delete, Delete with children, Add notes, Select hollow children. Deleting a node whose children are kept re-attaches them to its parent (or makes them roots); deleting never closes an open tab. Notes are private. Groups are categorisation only (name + colour; can span trees).
- Top bar (this plan): search box, "Clear hollow nodes" button, settings. Pan = click-hold-drag on empty space; select = Ctrl+drag box, Ctrl+click toggles.
- Storage: tree in IndexedDB; settings in `chrome.storage.local`.
- Clicking an open node jumps to its tab; clicking a hollow node reopens its URL in a new tab and the node becomes solid again.

## Review Focus

1. Azure Portal fires many history-state events for one page: no duplicate nodes, no explosion (Task 3, Task 5).
2. A node's `tabId` is stale (tab closed while the worker slept): clicking must reopen, not throw (Task 5).
3. `edge://`, `about:` and extension pages, and tabs with no favicon: never recorded / fallback icon (Task 5, Task 6).
4. Two events arriving at once must both apply, in order (Task 4).
5. A 2,000-node tree must lay out fast enough to stay usable: under 200 ms (Task 6).

---

## File Structure

- `manifest.json`, `package.json`, `tsconfig.json`, `build.mjs`, `vitest.config.ts` — scaffolding
- `src/core/types.ts` — shared types and `DEFAULT_SETTINGS`
- `src/core/tree.ts` — pure tree operations (immutable, return new state)
- `src/core/rules.ts` — pure navigation decision
- `src/storage/db.ts` — IndexedDB load/save of `TreeState`; settings helpers
- `src/shared/messages.ts` — `Command` union and reply types
- `src/background/store.ts` — serial mutate queue; `src/background/handlers.ts` — event handlers; `src/background/index.ts` — Edge wiring and command router
- `src/page/{index.html,main.ts,layout.ts,render.ts,interact.ts,menu.ts,topbar.ts}` — tree page
- `tests/*.test.ts` — one file per core/background module

---

### Task 1: Scaffold, build and test harness

**Files:**
- Create: `package.json`, `tsconfig.json`, `build.mjs`, `vitest.config.ts`, `manifest.json`, `src/background/index.ts` (empty stub), `src/page/index.html`, `src/page/main.ts` (stub), `tests/smoke.test.ts`, `.gitignore`

**Interfaces:**
- Produces: `npm run build` → `dist/` loadable as an unpacked Edge extension; `npm test` runs Vitest.

- [ ] **Step 1: Write `tests/smoke.test.ts`** asserting `expect(1 + 1).toBe(2)`.
- [ ] **Step 2: Create the scaffolding.** `git init`; add `.gitignore` (`node_modules`, `dist`, `.superpowers`). `manifest.json`: `manifest_version: 3`, `permissions: ["tabs","webNavigation","storage","unlimitedStorage"]`, `background.service_worker: "background.js"` (type module), `action` (toolbar button), `commands._execute_action` suggested key `Alt+Shift+T`, `web_accessible_resources` not needed. `build.mjs` uses esbuild to bundle `src/background/index.ts` → `dist/background.js` and `src/page/main.ts` → `dist/page.js`, and copies `manifest.json` and `src/page/index.html` into `dist/`. Scripts: `build`, `test` (`vitest run`).
- [ ] **Step 3: Run** `npm install && npm test`. Expected: 1 passed.
- [ ] **Step 4: Run** `npm run build`. Expected: `dist/manifest.json`, `dist/background.js`, `dist/page.js`, `dist/index.html` exist.
- [ ] **Step 5: Commit** `chore: scaffold extension, build and tests`.

---

### Task 2: Tree model

**Files:**
- Create: `src/core/types.ts`, `src/core/tree.ts`
- Test: `tests/tree.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  ```ts
  export type NodeId = string;
  export interface TreeNode { id: NodeId; parentId: NodeId | null; url: string; title: string; favIconUrl: string; tabId: number | null; favourite: boolean; note: string; createdAt: number }
  export interface Group { id: string; name: string; colour: string; nodeIds: NodeId[] }
  export interface TreeState { nodes: Record<NodeId, TreeNode>; groups: Record<string, Group> }
  export interface Settings { sameTabAddsNode: boolean; wipeHollowAfterRestart: boolean; hollowOnTabClose: boolean }
  export const DEFAULT_SETTINGS: Settings; export const EMPTY_STATE: TreeState;
  ```
  A node is hollow iff `tabId === null`.
- Produces (`tree.ts`, all pure, return new `TreeState`): `addNode(s, p: {parentId: NodeId|null; url: string; title?: string; favIconUrl?: string; tabId: number|null}, now?: number): {state: TreeState; id: NodeId}`; `reuseOrAddChild(s, parentId, p, now?): {state; id}` (reuses a child with the same URL ignoring `#hash`, attaching `tabId`); `updateNode(s, id, patch: Partial<Pick<TreeNode,'url'|'title'|'favIconUrl'|'tabId'>>)`; `nodeForTab(s, tabId): TreeNode | undefined`; `closeTab(s, tabId, settings)`; `deleteNodes(s, ids, withChildren: boolean)`; `hollowDescendants(s, id): NodeId[]`; `protectedIds(s): Set<NodeId>`; `clearHollow(s)`; `setFavourite(s, id, v)`; `setNote(s, id, note)`; `createGroup(s, name, colour, nodeIds): {state; id}`; `addToGroup(s, groupId, nodeIds)`; `searchNodes(s, query): TreeNode[]` (case-insensitive substring over title, url, note).

- [ ] **Step 1: Write failing tests** in `tests/tree.test.ts`:
  - `reuseOrAddChild` twice with `https://x/a#1` then `https://x/a#2` under one parent returns the same id; `Object.keys(nodes).length` is 2.
  - `closeTab` with `hollowOnTabClose: true` sets that node's `tabId` to `null`; with `false` removes it and re-attaches its children to its parent.
  - `deleteNodes(s, [b], false)` on A→B→C leaves C with `parentId === A`; deleting a root's only-kept child makes it a root (`parentId === null`); `deleteNodes(s, [b], true)` removes B and C. Deleting never touches other nodes' `tabId`.
  - `protectedIds` for favourite B in A→B→C includes A, B, C and not an unrelated hollow D.
  - `clearHollow` removes unrelated hollow D, keeps open nodes and protected hollow nodes, and for hollow A→open B makes B a root.
  - `hollowDescendants(A)` returns only hollow nodes below A.
  - Deleting a node removes its id from every group's `nodeIds`.
  - `searchNodes(s, 'RG-prod')` matches a node whose URL contains `rg-prod` and one whose note contains it.
- [ ] **Step 2: Run** `npx vitest run tests/tree.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `types.ts` and `tree.ts` per the signatures. IDs via `crypto.randomUUID()`. Keep state immutable (spread copies).
- [ ] **Step 4: Run** `npx vitest run tests/tree.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: tree model`.

---

### Task 3: Navigation rules

**Files:**
- Create: `src/core/rules.ts`
- Test: `tests/rules.test.ts`

**Interfaces:**
- Consumes: `Settings` from Task 2.
- Produces:
  ```ts
  export type NavAction = 'ignore' | 'add-child' | 'update-node' | 'new-root';
  export interface NavInput { transitionType: string; qualifiers: string[]; fromHistoryState: boolean; hashOnly: boolean; sameOrigin: boolean }
  export function decideNavigation(i: NavInput, s: Settings): NavAction;
  export function isTrackableUrl(url: string): boolean;   // false for edge:, about:, chrome-extension:, empty
  export function stripHash(url: string): string;
  ```

- [ ] **Step 1: Write failing tests:** `reload` → `ignore`; any input with `qualifiers: ['forward_back']` → `ignore`; `hashOnly: true` → `ignore`; `typed` / `generated` / `auto_bookmark` → `new-root`; `link` with default settings → `add-child`; `link` with `sameTabAddsNode: false` → `update-node`; `fromHistoryState: true, sameOrigin: true` → `add-child`; `fromHistoryState: true, sameOrigin: false` → `ignore`; `isTrackableUrl('edge://newtab')` and `'chrome-extension://abc/page.html'` and `''` → false, `'https://portal.azure.com/#home'` → true; `stripHash('https://x/a#b')` → `'https://x/a'`.
- [ ] **Step 2: Run** `npx vitest run tests/rules.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** in `rules.ts`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: navigation rules`.

---

### Task 4: Persistence and serial store

**Files:**
- Create: `src/storage/db.ts`, `src/background/store.ts`
- Test: `tests/db.test.ts`, `tests/store.test.ts`

**Interfaces:**
- Consumes: `TreeState`, `Settings`, `EMPTY_STATE`, `DEFAULT_SETTINGS`.
- Produces: `loadState(): Promise<TreeState>`; `saveState(s: TreeState): Promise<void>` (single record, IndexedDB db `dashtree`, store `tree`, key `state`); `loadSettings(): Promise<Settings>`; `saveSettings(s: Settings): Promise<void>` (`chrome.storage.local`).
  ```ts
  export interface StoreDeps { load(): Promise<TreeState>; save(s: TreeState): Promise<void>; settings(): Promise<Settings>; onChange(): void }
  export interface Store { mutate(fn: (s: TreeState, settings: Settings) => TreeState): Promise<void>; read(): Promise<TreeState> }
  export function createStore(deps: StoreDeps): Store;
  ```
  `mutate` calls are queued so they run one at a time in call order; each loads fresh state, saves, then calls `onChange`.

- [ ] **Step 1: Write failing tests:** `saveState` then `loadState` (with `fake-indexeddb/auto` imported) round-trips a state with one node; `loadState` on an empty db returns `EMPTY_STATE`. Store: with in-memory deps, `await Promise.all([mutate(addA), mutate(addB)])` leaves both nodes present and `onChange` called twice (**Review Focus 4**).
- [ ] **Step 2: Run** both files. Expected: FAIL.
- [ ] **Step 3: Implement.** Queue = chained promise; a failed mutation must not block later ones.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: persistence and serial store`.

---

### Task 5: Background event handlers

**Files:**
- Create: `src/shared/messages.ts`, `src/background/handlers.ts`, `src/background/index.ts` (replace stub)
- Test: `tests/handlers.test.ts`

**Interfaces:**
- Consumes: `Store` (Task 4), core `tree.ts` and `rules.ts`.
- Produces (`messages.ts`):
  ```ts
  export type Command =
    | { type: 'getState' } | { type: 'activate'; id: NodeId }
    | { type: 'delete'; ids: NodeId[]; withChildren: boolean }
    | { type: 'setFavourite'; id: NodeId; value: boolean } | { type: 'setNote'; id: NodeId; note: string }
    | { type: 'clearHollow' } | { type: 'createGroup'; name: string; colour: string; nodeIds: NodeId[] }
    | { type: 'addToGroup'; groupId: string; nodeIds: NodeId[] }
    | { type: 'getSettings' } | { type: 'setSettings'; settings: Partial<Settings> };
  export interface StateReply { state: TreeState; settings: Settings }
  export const CHANGED = 'changed';   // broadcast message type
  ```
- Produces (`handlers.ts`, plain-object events so no `chrome` mocking is needed):
  `onTabCreated(store, e: {tabId: number; openerTabId?: number})`; `onCommitted(store, e: {tabId; url; transitionType; qualifiers: string[]; fromHistoryState: boolean})`; `onTabUpdated(store, tabId, patch: {title?: string; favIconUrl?: string})`; `onTabRemoved(store, tabId)`; `onStartup(store)`; `activateNode(store, id, api: {focusTab(tabId): Promise<void>; openTab(url): Promise<number>}): Promise<void>`.
- Behaviour (decisions): `onTabCreated` with an opener creates a placeholder child (`url: ''`) under the opener's node; the first trackable commit fills it. A commit in a tab with no node creates a root. A commit with `isTrackableUrl` false removes any placeholder and records nothing. `onStartup` sets every node's `tabId` to `null` and arms a pending wipe if `wipeHollowAfterRestart`; the wipe runs `RESTORE_GRACE_MS = 3000` after the first `onTabCreated` following startup, so session-restored tabs can first re-attach: a commit whose URL equals a hollow node's URL attaches to that node instead of creating a root. `activateNode` calls `focusTab` for an open node; if `focusTab` rejects (stale id) or the node is hollow, it calls `openTab(url)` and stores the new `tabId` on the node (**Review Focus 2**).
- `index.ts`: register `chrome.tabs.onCreated/onUpdated/onRemoved`, `chrome.webNavigation.onCommitted` (frame 0 only) and `onHistoryStateUpdated` (frame 0, `fromHistoryState: true`), `chrome.runtime.onStartup`; route `Command` messages from `chrome.runtime.onMessage` (return `true` for async) to `tree.ts` via `store.mutate`, answering `getState`/`getSettings` with `StateReply`; `onChange` does `chrome.runtime.sendMessage({type: CHANGED}).catch(() => {})`; `chrome.action.onClicked` opens or focuses the single `page.html`-style tab (`index.html`).

- [ ] **Step 1: Write failing tests** with an in-memory store:
  - Opener tab 1 (root node) → `onTabCreated(2, opener 1)` + `onCommitted(2, 'https://x/b', 'link')` yields a child of node 1 with that url.
  - Azure storm: 20 `onCommitted` history-state events for the same URL in tab 1 add exactly one node (**Review Focus 1**).
  - `reload` and `forward_back` commits add nothing; a `typed` commit in a tracked tab creates a new root that holds the `tabId`, and the old node becomes hollow (`tabId === null`) because no tab shows it any more.
  - `onCommitted` with `edge://newtab` and with a `chrome-extension://` URL adds no node (**Review Focus 3**).
  - `onTabRemoved` makes the node hollow (default settings) and removes it when `hollowOnTabClose: false`.
  - `onStartup` nulls all `tabId`s; advancing fake timers 3000 ms after a first `onTabCreated` removes non-favourite hollow nodes but keeps a favourite and a node re-attached by a matching restored commit.
  - `activateNode` with a rejecting `focusTab` calls `openTab` and sets the new `tabId`.
- [ ] **Step 2: Run** `npx vitest run tests/handlers.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `messages.ts`, `handlers.ts`, `index.ts` per the above.
- [ ] **Step 4: Run** the test file, then `npm run build`. Expected: PASS and a clean build.
- [ ] **Step 5: Commit** `feat: background tracking and command router`.

---

### Task 6: Tree layout and rendering

**Files:**
- Create: `src/page/layout.ts`, `src/page/render.ts`, `src/page/main.ts` (replace stub), update `src/page/index.html`
- Test: `tests/layout.test.ts`

**Interfaces:**
- Consumes: `TreeState`; `Command`/`StateReply`.
- Produces: `layoutForest(s: TreeState, opts?: {nodeW: number; nodeH: number; gapX: number; gapY: number}): {pos: Record<NodeId, {x: number; y: number}>; width: number; height: number}` — roots left to right with `ROOT_GAP`, children centred under their parent, depth increases `y`.
  `renderForest(container: HTMLElement, s: TreeState, layout: ReturnType<typeof layoutForest>, ui: {selected: Set<NodeId>; query: string}): void` — absolutely positioned node elements plus one SVG of connector lines; each element has `data-id`, class `open` (solid) or `hollow` (dashed outline), favicon `<img>` (fallback inline icon when `favIconUrl` is empty or fails to load, **Review Focus 3**), title, star toggle, note indicator, and group colour outlines/labels.
  `main.ts`: sends `getState`, renders, re-fetches on `CHANGED`; clicking a node sends `activate`; star click sends `setFavourite`.

- [ ] **Step 1: Write failing tests** in `tests/layout.test.ts`: a parent's `x` equals the mean of its first and last child's `x`; siblings never overlap (`|dx| >= nodeW + gapX`); two roots do not overlap; every child's `y` is greater than its parent's; a generated 2,000-node tree lays out in under 200 ms (**Review Focus 5**).
- [ ] **Step 2: Run** `npx vitest run tests/layout.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `layout.ts` (tidy-tree: lay out subtrees left to right, centre parents). Then `render.ts` and `main.ts`; style to match the approved mockup `.superpowers/brainstorm/4174-1793182613/content/tree-fullscreen-v3.html` (dark theme, header bar, full-viewport canvas).
- [ ] **Step 4: Run** the layout tests and `npm run build`. Expected: PASS and a clean build.
- [ ] **Step 5: Commit** `feat: tree page layout and rendering`.

---

### Task 7: Interactions, menu, groups

**Files:**
- Create: `src/page/interact.ts`, `src/page/menu.ts`
- Modify: `src/page/main.ts`, `src/page/render.ts` (selection styling)
- Test: `tests/interact.test.ts`

**Interfaces:**
- Consumes: `layoutForest` output, `Command`.
- Produces: `nodesInRect(layout, nodeW, nodeH, rect: {x1;y1;x2;y2}): NodeId[]` (pure; nodes whose box intersects the rect); `attachInteractions(canvas: HTMLElement, getCtx: () => {state: TreeState; layout: LayoutResult; selected: Set<NodeId>}, send: (c: Command) => void, onSelectionChange: () => void): void` — drag on empty space pans (translate canvas), Ctrl+drag draws a selection box and selects `nodesInRect`, Ctrl+click toggles a node; `showMenu(x: number, y: number, items: {label: string; action: () => void}[]): void` (`menu.ts`).
  Node right-click items: **Delete**, **Delete with children**, **Add notes** (prompt/textarea, sends `setNote`), **Select hollow children** (sets selection to `hollowDescendants`, no command). Right-click on a selection offers **Create group…** (name + colour) and **Add to group ▸ <existing>**, plus Delete for the whole selection.

- [ ] **Step 1: Write failing tests:** `nodesInRect` returns only intersecting nodes and returns `[]` for a rect over empty space.
- [ ] **Step 2: Run** `npx vitest run tests/interact.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `interact.ts`, `menu.ts`; wire into `main.ts`.
- [ ] **Step 4: Run** tests and `npm run build`. Expected: PASS and a clean build.
- [ ] **Step 5: Commit** `feat: pan, select, context menu, groups`.

---

### Task 8: Top bar, search and settings

**Files:**
- Create: `src/page/topbar.ts`
- Modify: `src/page/main.ts`, `src/page/index.html`, `src/background/index.ts` (single-tab focus)
- Test: `tests/topbar.test.ts`

**Interfaces:**
- Consumes: `searchNodes` (Task 2), `Command`, `Settings`.
- Produces: `matchIds(s: TreeState, query: string): Set<NodeId>` (non-matching nodes are dimmed by `render`, matching ones highlighted); `renderTopBar(el: HTMLElement, settings: Settings, send: (c: Command) => void, onQuery: (q: string) => void): void` — search box, **Clear hollow nodes** button (sends `clearHollow`, confirm first), and a settings popover with the three settings as checkboxes (sends `setSettings`). Background: the toolbar button and `Alt+Shift+T` open `index.html`, or focus it if a tab with that URL already exists.

- [ ] **Step 1: Write failing tests:** `matchIds` with an empty query returns an empty set (nothing dimmed); a query matching one node's note returns exactly that id.
- [ ] **Step 2: Run** `npx vitest run tests/topbar.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `topbar.ts`, hook into `main.ts`, add the single-instance focus logic to `index.ts`.
- [ ] **Step 4: Run** the full suite `npm test` and `npm run build`. Expected: all PASS, clean build.
- [ ] **Step 5: Commit** `feat: top bar, search, settings, single tree tab`.

---

### Task 9: Real-browser verification

**Files:** none (manual).

- [ ] **Step 1:** In Edge open `edge://extensions`, enable Developer mode, **Load unpacked** → `dist/`.
- [ ] **Step 2:** Open `portal.azure.com`, click into a resource group in the same tab, then open a link in a new tab. Open the tree page. Expected: Azure root, a child for the same-tab navigation, a child for the new tab; favicons shown; reload/back create no new nodes.
- [ ] **Step 3:** Close the new tab. Expected: its node turns hollow (dashed). Click it: a tab reopens and the node turns solid. Click an open node: Edge switches to that tab.
- [ ] **Step 4:** Favourite a branch, restart Edge, open one tab. Expected: non-favourite hollow nodes are wiped after about 3 seconds; the favourite and its ancestors/descendants remain; **Clear hollow nodes** keeps them too.
- [ ] **Step 5:** Right-click a node: delete, delete with children, add notes, select hollow children all work; Ctrl+drag selects, right-click on the selection creates a group; click-drag on empty space pans; the search box dims non-matches; toggling each setting changes behaviour.
- [ ] **Step 6:** Fix anything that fails, rebuild, commit `fix: issues found in manual verification` if any.
