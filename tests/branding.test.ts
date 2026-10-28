import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const html = readFileSync('src/page/index.html', 'utf8');

describe('the extension is called Histo-tree', () => {
  test('in the manifest: name, toolbar tooltip and shortcut description', () => {
    expect(manifest.name).toBe('Histo-tree');
    expect(manifest.action.default_title).toBe('Open Histo-tree');
    expect(manifest.commands._execute_action.description).toContain('Histo-tree');
  });

  test('on the tree page: tab title and heading', () => {
    expect(html).toContain('<title>Histo-tree</title>');
    expect(html).toMatch(/<\/svg>Histo-tree<\/h1>/);
  });

  test('the old name is gone from everything the user sees', () => {
    expect(JSON.stringify(manifest)).not.toMatch(/dashtree/i);
    expect(html).not.toMatch(/dashtree/i);
  });
});

describe('saved data keeps its original storage names, so nothing already recorded is lost', () => {
  test('the IndexedDB database name is unchanged', () => {
    expect(readFileSync('src/storage/db.ts', 'utf8')).toContain("const DB_NAME = 'dashtree';");
  });

  test('the remembered-theme key is unchanged', () => {
    expect(readFileSync('src/page/theme.ts', 'utf8')).toContain("const KEY = 'dashtree-theme';");
  });
});
