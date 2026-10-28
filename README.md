# Histo-tree

See your open tabs as a tree: every tab you open from scratch is a root, and every page reached from it is a branch.
It works in Microsoft Edge, Google Chrome and Firefox. Each browser keeps its own tree; nothing is shared between them.

## Build

```
npm install
npm run build            # both browsers
npm run build:chromium   # dist/          (Chrome and Edge)
npm run build:firefox    # dist-firefox/  (Firefox)
npm test
```

## Load it

**Edge:** open `edge://extensions`, turn on *Developer mode*, choose *Load unpacked*, pick the `dist` folder.

**Chrome:** open `chrome://extensions`, turn on *Developer mode*, choose *Load unpacked*, pick the `dist` folder.
Edge and Chrome share one build, because both are Chromium.

**Firefox (140 or newer):** open `about:debugging#/runtime/this-firefox`, choose *Load Temporary Add-on…*, pick
`dist-firefox/manifest.json`. A temporary add-on is removed when Firefox closes. To keep it, build a package
(below) and have it signed on addons.mozilla.org, or use Firefox Developer Edition / Nightly with
`xpinstall.signatures.required` set to `false`.

Then click the toolbar button, or press `Alt+Shift+T`, to open the tree.

## Package for the stores

```
npm run package          # packages/histo-tree-chromium-<version>.zip and packages/histo-tree-firefox-<version>.zip
npm run lint:firefox     # Mozilla's add-on linter on dist-firefox/
```

Before publishing on addons.mozilla.org, change the placeholder add-on id in `tools/manifest.mjs`
(`histo-tree@histo-tree.local`) to one of your own.

## What is different in Firefox

- Firefox has no service-worker background, so the same script runs as an event page (`background.scripts`).
- The code reaches the browser through `src/shared/api.ts`, which uses Firefox's promise-based `browser` namespace
  when it exists and `chrome` otherwise.
- The Firefox manifest adds an add-on id, a minimum version (140, the first to understand the "no data collected"
  declaration) and `data_collection_permissions: none`. Everything else is generated from the one `manifest.json`.

## Test it in a real browser

`tools/smoke.mjs` launches a browser headless with the extension loaded, browses a small local site (a same-tab link
and a new-tab link), opens the tree page and checks the recorded tree.

```
node tools/smoke.mjs "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" dist 9333 ws
node tools/smoke.mjs "C:/Program Files/Google/Chrome/Application/chrome.exe"        dist 9334 pipe
```

Edge loads the extension with `--load-extension`. Branded Chrome ignores that switch, so Chrome is driven over the
debugging protocol's pipe (`pipe`). There is no equivalent runner for Firefox here.

## Other tools

- `node tools/preview.mjs` builds `.superpowers/preview/preview.html`: the real page code with sample data, openable
  straight from disk.
- `node tools/make-icons.mjs` redraws the icons in `icons/`.
