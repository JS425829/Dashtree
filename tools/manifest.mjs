// Per-browser manifests, derived from the one base manifest.json (which is the Chrome/Edge one).

/** Chrome and Edge (Chromium, Manifest V3, service-worker background): the base manifest as it is. */
export const chromiumManifest = (base) => structuredClone(base);

/**
 * Firefox (Manifest V3): no service-worker background, so the same script runs as an event page, and
 * Firefox wants an add-on id, a minimum version and a statement about data collection.
 * The id is a placeholder: change it to your own before publishing on addons.mozilla.org.
 */
export function firefoxManifest(base) {
  const m = structuredClone(base);
  m.background = { scripts: ['background.js'] };
  // Firefox only understands data_collection_permissions from 140 (Android 142), so that is the minimum version
  m.browser_specific_settings = {
    gecko: {
      id: 'histo-tree@histo-tree.local',
      strict_min_version: '140.0',
      data_collection_permissions: { required: ['none'] },
    },
    gecko_android: { strict_min_version: '142.0' },
  };
  return m;
}
