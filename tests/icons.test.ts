import { existsSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, test } from 'vitest';

const SIZES = [16, 32, 48, 128];
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));

/** Decodes the 8-bit RGBA PNGs the generator writes (filter type 0 on every row). */
function decode(path: string) {
  const buf = readFileSync(path);
  expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  expect(buf[24]).toBe(8); // bit depth
  expect(buf[25]).toBe(6); // RGBA
  let offset = 8;
  const idat: Buffer[] = [];
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.subarray(offset + 4, offset + 8).toString('ascii');
    if (type === 'IDAT') idat.push(buf.subarray(offset + 8, offset + 8 + len));
    offset += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = 1 + width * 4;
  const px = (x: number, y: number) => {
    expect(raw[y * stride]).toBe(0);
    const i = y * stride + 1 + x * 4;
    return { r: raw[i], g: raw[i + 1], b: raw[i + 2], a: raw[i + 3] };
  };
  return { width, height, px };
}

describe('extension icons', () => {
  test('the manifest declares the icon at every size, for the extension and the toolbar button', () => {
    for (const size of SIZES) {
      expect(manifest.icons[String(size)]).toBe(`icons/icon-${size}.png`);
      expect(manifest.action.default_icon[String(size)]).toBe(`icons/icon-${size}.png`);
    }
  });

  test.each(SIZES)('icon-%i.png exists and really is that size', (size) => {
    const path = `icons/icon-${size}.png`;
    expect(existsSync(path)).toBe(true);
    const { width, height } = decode(path);
    expect([width, height]).toEqual([size, size]);
  });

  test('the 128px icon is a rounded square: transparent corners, opaque teal centre area', () => {
    const { px } = decode('icons/icon-128.png');
    expect(px(0, 0).a).toBe(0);
    expect(px(127, 127).a).toBe(0);
    const bg = px(12, 64); // left edge area, away from the tree
    expect(bg.a).toBe(255);
    expect(bg.g).toBeGreaterThan(bg.r); // teal: green and blue dominate red
    expect(bg.b).toBeGreaterThan(bg.r);
  });

  test('the glyph is drawn in white: the root node of the tree sits top-centre', () => {
    const { px } = decode('icons/icon-128.png');
    const root = px(64, 34);
    expect(root.r).toBeGreaterThan(240);
    expect(root.g).toBeGreaterThan(240);
    expect(root.b).toBeGreaterThan(240);
  });

  test('the tree page uses the icon as its tab icon and shows the logo beside the title', () => {
    const html = readFileSync('src/page/index.html', 'utf8');
    expect(html).toContain('<link rel="icon" href="icons/icon-32.png">');
    expect(html).toMatch(/<h1>\s*<svg class="logo"/);
  });

  test('the build copies the icons next to the manifest, for every browser it builds', () => {
    expect(readFileSync('build.mjs', 'utf8')).toContain("cpSync('icons', `${outdir}/icons`");
  });

  test('even the 16px icon keeps a visible white glyph', () => {
    const { px, width } = decode('icons/icon-16.png');
    let white = 0;
    for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) if (px(x, y).r > 235 && px(x, y).a === 255) white++;
    expect(white).toBeGreaterThan(12);
  });
});
