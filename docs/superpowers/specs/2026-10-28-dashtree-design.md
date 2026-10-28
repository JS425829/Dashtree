# Histo-tree — design

> Renamed from "Dashtree". The internal storage names (IndexedDB `dashtree`, theme key `dashtree-theme`) deliberately keep the old name so saved trees survive the rename.

## Intent

Edge tabs are normally a flat strip or a grouped list. Jude works across many related tabs (heavily Azure: portal, DevOps, resource groups) and loses the trail of how they got from one page to another. Histo-tree shows tabs as a **tree**: each tab opened from scratch is a root, and every page reached from it is a branch. The second purpose is finding what colleagues are working on (a ticket, an Azure resource) by looking at or searching their trees.

## Goals

- A Microsoft Edge extension (Manifest V3, Chromium APIs) that records tab lineage and shows it as a tree.
- The tree opens as a **dedicated full-page tab**, not a side panel or popup window. Opened from the toolbar button or a keyboard shortcut.
- Favourite nodes (any node, root or branch) are kept permanently, so a trail you care about is never lost.
- Optional local team view: colleagues in one office see each other's trees, read-only, and can search across them.

## Non-goals

- No portable/desktop app. Extension only.
- No cloud service; team data never leaves the office network.
- No editing of another person's tree.
- Groups do not affect sharing, tree structure or tab behaviour.
- Other browsers (Chrome, Firefox, Safari) are out of scope for now.

## Anti-goals (a failure even if it technically works)

- Anyone you have not explicitly trusted seeing any part of your tree (personal browsing, email). Untrusted users get nothing, and everyone starts untrusted.
- Losing the trail: closing a tab must not silently delete its node (except by the post-restart wipe rule below).

## Tree model

- **Root:** a tab opened from scratch (new tab, typed URL, not opened from another tab's page).
- **Branch:** a page reached from an existing node, either by opening a link in a new tab (Edge reports the opener tab) or by clicking a link that navigates inside the same tab.
- Opening something from the original root creates a sibling branch under that root. Opening from a branch nests under that branch.
- **Same-tab navigation setting.** Default: it adds a new child node under the page you came from. Alternative: it updates the current node instead. User-selectable in settings.
- Each node shows the page's **favicon** (taken from the tab) and its title.

## Node states and click behaviour

- **Open** (a live tab exists): solid, filled node.
- **Closed** (no tab currently shows it): hollow, dashed-outline node. (Shapes are a proposal; the open/closed distinction is the requirement.)
- Clicking an open node jumps to that tab. Clicking a closed node reopens its URL in a new tab and the node becomes solid again.
- Under the default same-tab setting, the page you navigated away from becomes a closed node.

## Persistence and restart

- **Favourites do not auto-open.** Any node can be favourited. A favourited node is kept no matter what: it survives restarts, the post-restart wipe and "Clear hollow nodes", staying hollow when its tab is closed. Clicking it reopens it like any hollow node. To keep a favourited branch attached, its ancestors are kept too (my guess; the ancestors stay as hollow nodes). Its descendants are kept by the post-restart wipe, but the "Clear hollow nodes" button does remove a favourite's hollow children (decided by Jude).
- After a restart, non-favourite trees remain visible as hollow nodes. **Once the user opens any tab, the non-favourite hollow nodes are wiped.** This is a setting and can be turned off (keep hollow nodes indefinitely).
- Whether tabs restored by Edge's own session restore count as "the user opened a tab" is the builder's call (proposal: they count).
- **Clear hollow nodes:** a button in the top bar that removes every hollow node except favourites and their ancestors. Hollow children (descendants) of favourites are removed too; open tabs are never touched.

## The tree page (UI)

- Full viewport. Slim top bar: person switcher (me / teammates), team-connected indicator, search box, trust/untrust control per person.
- The canvas shows all roots side by side, each growing **downward** with connector lines, and scrolls/pans in both directions.
- **Pan:** click and hold on empty space, then drag.
- **Select:** hold Ctrl and drag to draw a selection box; Ctrl+click toggles single nodes.
- **Favourite:** a star on any node (root or branch).
- **Right-click a node** shows: **Delete** (removes just that node), **Delete with children** (removes the node and all its descendants), **Rename** (a custom name shown on the card instead of the page title; the page title keeps updating underneath, an empty name restores it; single node only), **Add notes** (free-text note on the node), and **Select hollow children** (selects every hollow descendant so they can be deleted together). Right-click on a selection still offers create/add to group.
- Hollow nodes can be selected (Ctrl+click or selection box) and deleted.
- Top-bar button **Clear hollow nodes** (see Persistence).
- **Groups:** right-click a selection to create a group or add to an existing one. A group is a named, coloured outline/label over its nodes, can include nodes from different trees, and is for categorisation only. A **Groups menu** in the top bar lists every group (name, member count) and offers, per group: Select members, Focus (dim everything outside the group; combines with search), Go to (scroll to it), Rename, a colour picker, and Delete (removes only the group, never its pages). It also has "New group from selection". The node right-click menu gains "Remove from group" and no longer offers "Add to group" for groups the selection is already entirely in. A setting hides the outlines. Group colours are validated as `#rrggbb` because they end up in inline styles.
- A reference mockup of the layout is in `.superpowers/brainstorm/4174-1793182613/content/tree-fullscreen-v3.html` (throwaway; behaviour above is authoritative).

## Team view

- Colleagues in one office. Read-only. Build this after the single-user tree works.
- **Worst-case assumptions (decided by Jude):** nothing can be installed beyond the extension (no helper program, no server); anyone can be on the network, so the network itself proves nothing; up to **50 people**.
- **Trust (decided by Jude):**
  - There is no per-root sharing. Trust is the only control.
  - Everyone is **untrusted** by default. Untrusted users cannot see or access your tree at all, and you cannot see theirs.
  - Trust is per person. Only **mutually trusted** pairs can see each other's whole trees.
  - Your favourites and groups are visible to people you trust. Groups remain categorisation only.
- **Search:** one search box covers the trees of every person you are connected to; results show who has the page and let you open the same URL.
- **Connection:** pairing codes between extensions (see "Team connection" below).

## Settings (all user-controllable)

1. Same-tab navigation: add new node (default) vs update current node.
2. Wipe non-favourite hollow nodes once a tab is opened after restart (default on).
3. When a tab is closed, turn its node hollow so it can be selected and deleted (default on). Off means the node is removed when its tab closes (my reading of this setting).
4. Added later, all in the Settings panel under Recording / Cleanup / Appearance (defaults in brackets): route changes after `#` count as separate pages (on); going back to an earlier page on the same path reuses its node (on); redirects update the current node (on); Clear hollow nodes also removes favourites' hollow children (on); ask before multi-delete, delete-with-children and Clear (on); theme System/Light/Dark (System); compact cards (off); show site name (on); show open/closed dots (on); dashed connector lines (on); ignored sites (empty).

## Constraints and decisions

- Platform: Edge, Manifest V3. Uses tab-opener information and navigation events to build lineage.
- Choices made by me, not yet confirmed by Jude: extension-only; solid/hollow node shapes.

## Calls made by the designer (from the builder check; not yet confirmed by Jude)

- **Enforcement:** the owner's extension sends a tree only to people it trusts, and stops when trust is removed. If the owner is offline, their tree disappears from others' views.
- **What creates a node (same-tab setting on):** real page navigations and same-origin history-state route changes (Azure Portal and DevOps are single-page apps). Back, forward and reload do not create nodes. Hash-only changes do not create nodes. Revisiting a URL that is already a child of the current node reuses that node instead of adding a duplicate. Navigating to a page that is an earlier, hollow node on the same path (for example Home -> resource -> Home) moves the tab back onto that earlier node instead of adding a duplicate (found from real use; the next page then branches from it). A URL typed into an existing tab starts a new root.
- **Restart reconciliation:** a tab whose URL matches a hollow node may re-attach to it; otherwise it starts a new root.
- **Retention:** closed nodes are kept until the post-restart wipe (or forever if that setting is off). Storage in IndexedDB.
- **Delete semantics:** deleting a node with its children kept re-attaches those children to the deleted node's parent (or makes them roots if it was a root). Deleting a node never closes an open tab; an open tab whose node was deleted starts a new root on its next navigation. Notes are private to the owner and are not sent to teammates (unlike favourites and groups). Explicit Delete / Delete with children works on favourites too (the wipe and Clear hollow nodes never touch them, but a deliberate delete does).
- **Tree page:** one instance only (opening it again focuses the existing tab), and it does not appear in the tree.

## Team connection: pairing codes (decided by Jude)

As far as I know, an Edge extension cannot listen for incoming connections or discover other machines. Decision: direct peer-to-peer links (WebRTC) between extensions, held open by an offscreen page, set up by swapping a pairing code over chat. Swapping the code is also the trust step: you only pair with people you trust. Accepted downsides: after either person restarts Edge the link may need a new code, and both people must be online at once. The builder should verify WebRTC works between two Edge machines on this office network early, and should make re-pairing as painless as possible. The single-user tree does not depend on any of this and is built first.

## Left to the builder

Language/tooling (TypeScript recommended but not required), storage format, how a teammate's tree is transmitted once connected, visual polish, handling of tabs with no favicon, restricted pages (edge://, extension pages), and tree layout algorithm details.
