import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { findTab } from '../src/background/handlers';
// @ts-expect-error plain ES module shared with the build script
import { chromiumManifest, firefoxManifest } from '../tools/manifest.mjs';

const base = JSON.parse(readFileSync('manifest.json', 'utf8'));

describe('Chrome and Edge manifest', () => {
  test('is the base manifest: service-worker background, no Firefox-only keys', () => {
    const m = chromiumManifest(base);
    expect(m.background).toEqual({ service_worker: 'background.js', type: 'module' });
    expect(m.browser_specific_settings).toBeUndefined();
    expect(m.manifest_version).toBe(3);
  });
});

describe('Firefox manifest', () => {
  const m = firefoxManifest(base);

  test('uses a script-based background (Firefox has no service-worker background)', () => {
    expect(m.background).toEqual({ scripts: ['background.js'] });
  });

  test('declares an add-on id, a minimum version, and that no data is collected', () => {
    expect(m.browser_specific_settings.gecko.id).toMatch(/^[a-zA-Z0-9-._]+@[a-zA-Z0-9-._]+$/);
    // the data-collection key is only understood from Firefox 140 (Android 142), so that is the minimum
    expect(m.browser_specific_settings.gecko.strict_min_version).toBe('140.0');
    expect(m.browser_specific_settings.gecko_android.strict_min_version).toBe('142.0');
    expect(m.browser_specific_settings.gecko.data_collection_permissions).toEqual({ required: ['none'] });
  });

  test('keeps everything else the same: permissions, icons, toolbar button, shortcut, no private windows', () => {
    for (const key of ['name', 'version', 'description', 'permissions', 'icons', 'action', 'commands', 'incognito']) {
      expect(m[key]).toEqual(base[key]);
    }
  });

  test('building the ports never changes the base manifest', () => {
    const before = JSON.stringify(base);
    firefoxManifest(base);
    chromiumManifest(base);
    expect(JSON.stringify(base)).toBe(before);
    expect(base.background.service_worker).toBe('background.js');
  });
});

describe('the code works in both browsers', () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? sourceFiles(p) : p.endsWith('.ts') ? [p] : [];
    });
  }

  test('only the shared API module touches the `chrome` global; everything else goes through `ext`', () => {
    const offenders = sourceFiles('src')
      .filter((f) => !f.endsWith(join('shared', 'api.ts')))
      .filter((f) => /\bchrome\./.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  test('the shared API prefers Firefox\'s promise-based `browser` namespace and falls back to `chrome`', () => {
    const api = readFileSync(join('src', 'shared', 'api.ts'), 'utf8');
    expect(api).toMatch(/g\.browser \?\? g\.chrome/);
  });
});

describe('finding the already-open tree page', () => {
  const url = 'chrome-extension://abc/index.html';

  test('matches the tab showing exactly that address, whichever browser prefix it has', () => {
    const tabs = [{ id: 1, url: 'https://x/' }, { id: 2, url }, { id: 3, url: `${url}#frag` }];
    expect(findTab(tabs, url)?.id).toBe(2);
    const moz = 'moz-extension://uuid/index.html';
    expect(findTab([{ id: 9, url: moz }], moz)?.id).toBe(9);
  });

  test('ignores tabs without a URL, and finds nothing when it is not open', () => {
    expect(findTab([{ id: 1 }, { id: 2, url: 'https://x/' }], url)).toBeUndefined();
    expect(findTab([], url)).toBeUndefined();
  });
});
