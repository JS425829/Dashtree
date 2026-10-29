import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const page = () => readFileSync('docs/index.html', 'utf8');
const demo = () => readFileSync('docs/demo.html', 'utf8');
const REPO = 'https://github.com/JS425829/Dashtree';

describe('the GitHub Pages site', () => {
  test('is published as plain files: nothing for Jekyll to process', () => {
    expect(existsSync('docs/.nojekyll')).toBe(true);
    expect(existsSync('docs/index.html')).toBe(true);
  });

  test('is a proper page: language, title, description, mobile viewport, one main landmark, one h1', () => {
    const html = page();
    expect(html).toContain('<html lang="en">');
    expect(html).toMatch(/<title>[^<]*Histo-tree[^<]*<\/title>/);
    expect(html).toMatch(/<meta name="description" content="[^"]{40,}"/);
    expect(html).toContain('name="viewport"');
    expect(html.match(/<main[\s>]/g)).toHaveLength(1);
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
  });

  test('is accessible: a skip link, alt text on every image, and a title on the demo frame', () => {
    const html = page();
    expect(html).toMatch(/<a class="skip" href="#main">/);
    const imgs = html.match(/<img\b[^>]*>/g) ?? [];
    expect(imgs.length).toBeGreaterThanOrEqual(1);
    for (const img of imgs) expect(img, img).toMatch(/\balt="[^"]+"/);
    expect(html).toMatch(/<iframe\b[^>]*\btitle="[^"]+"/);
  });

  test('embeds the live demo and offers it full screen', () => {
    const html = page();
    expect(html).toMatch(/<iframe\b[^>]*\bsrc="demo\.html"/);
    expect(html).toMatch(/<a [^>]*href="demo\.html"/);
  });

  test('covers what it does and how to get it, for all three browsers', () => {
    const html = page();
    for (const word of ['tree', 'hollow', 'Favourite', 'Notes', 'Groups', 'reorder', 'Ignore', 'glow', 'Azure', 'Edge', 'Chrome', 'Firefox', 'Load unpacked', 'Load Temporary Add-on']) {
      expect(html, word).toContain(word);
    }
    expect(html).toContain(REPO);
  });

  test('sends people to the GitHub releases to download it, and never tells them to build it', () => {
    const html = page();
    const install = /<section id="install"[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';
    expect(install).toMatch(new RegExp(`<a [^>]*class="btn primary"[^>]*href="${REPO}/releases/latest"|<a [^>]*href="${REPO}/releases/latest"[^>]*class="btn primary"`));
    expect(html).toContain(`href="${REPO}/releases"`); // the footer link
    for (const asset of ['histo-tree-chromium', 'histo-tree-firefox']) expect(install, asset).toContain(asset);
    expect(html).not.toMatch(/npm (install|run)/);
    expect(html).not.toContain('dist-firefox');
    expect(html).not.toMatch(/<pre[\s>]/);
    expect(html).not.toMatch(/\bbuild it\b/i);
  });

  test('the release link sits at the bottom of the page: in the install section and the footer, after the demo', () => {
    const html = page();
    expect(html.lastIndexOf('/releases')).toBeGreaterThan(html.indexOf('id="demo"'));
    expect(/<footer[\s\S]*<\/footer>/.exec(html)?.[0]).toContain(`${REPO}/releases`);
  });

  test('is honest about Firefox, which has not yet been run in a real Firefox', () => {
    expect(page()).toMatch(/Firefox[^<]{0,40}experimental|experimental[^<]{0,40}Firefox/i);
  });

  test('makes no outside requests: no external scripts, styles, fonts, images or frames', () => {
    const html = page();
    const external = [...html.matchAll(/\b(?:src|srcset|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
    // the only outside address is the link to the project's own GitHub repository
    for (const url of external) expect(url.startsWith(REPO), url).toBe(true);
    expect(html).not.toMatch(/<script[^>]*\bsrc=/);
    expect(html).not.toMatch(/<link[^>]*rel="stylesheet"/);
    expect(html).not.toMatch(/@import|url\(\s*["']?https?:/);
  });

  test('has hero screenshots for both colour schemes, and they are real images', () => {
    for (const f of ['docs/img/tree-light.png', 'docs/img/tree-dark.png']) {
      expect(existsSync(f), f).toBe(true);
      expect(readFileSync(f).subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    }
    expect(page()).toContain('prefers-color-scheme: dark');
  });
});

describe('the live demo page', () => {
  test('is the real Histo-tree interface with sample data, in one file', () => {
    const html = demo();
    expect(html).toContain('<title>Histo-tree</title>');
    expect(html).toContain('id="canvas"');
    for (const sample of ['Microsoft Azure', 'Resource groups', 'rg-prod-uk', 'Ticket XL-1042']) expect(html, sample).toContain(sample);
  });

  test('makes no outside requests: no scripts from elsewhere and no favicon lookups', () => {
    const html = demo();
    expect(html).not.toMatch(/<script[^>]*\bsrc=/);
    expect(html).not.toContain('google.com/s2');
    expect(html).not.toMatch(/\b(?:src|href)="https?:\/\//);
  });
});
