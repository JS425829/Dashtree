// Draws the Histo-tree icon (a tree of linked nodes on a teal rounded square) and writes icons/icon-{16,32,48,128}.png.
// No dependencies: a tiny anti-aliased rasteriser plus a PNG encoder built on node:zlib.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SIZES = [16, 32, 48, 128];
const SAMPLES = 4; // 4x4 supersampling per pixel
const TOP = [0x34, 0xc3, 0xa1];
const BOTTOM = [0x16, 0x8a, 0x74];

/** Shapes are described in a 128x128 design space and tuned per output size so small icons stay legible. */
function design(size) {
  const small = size <= 32;
  const stroke = size <= 16 ? 14 : size <= 32 ? 10 : size <= 48 ? 8 : 7;
  const rootR = small ? 15 : 13;
  const kidR = small ? 13 : 11;
  const ring = size >= 48; // the open/closed distinction only reads at larger sizes
  const kids = [28, 64, 100];
  const rootY = 32, kidY = 94, busY = 64;
  const half = stroke / 2;

  const rects = [
    [64 - half, rootY, 64 + half, busY + half], // trunk
    [kids[0] - half, busY - half, kids[2] + half, busY + half], // bus
    // drops: stop at the top of a ring so the stem doesn't poke into its hollow centre
    ...kids.map((x, i) => [x - half, busY, x + half, ring && i > 0 ? kidY - kidR + 1 : kidY]),
  ];
  const discs = [[64, rootY, rootR, false], ...kids.map((x, i) => [x, kidY, kidR, ring && i > 0])];
  return { rects, discs, ringWidth: stroke * 0.75 };
}

const inRoundedSquare = (u, v, r = 30) => {
  const dx = Math.max(Math.abs(u - 64) - (64 - r), 0);
  const dy = Math.max(Math.abs(v - 64) - (64 - r), 0);
  return dx * dx + dy * dy <= r * r;
};

function glyphHit(d, u, v) {
  for (const [x1, y1, x2, y2] of d.rects) if (u >= x1 && u <= x2 && v >= y1 && v <= y2) return true;
  for (const [cx, cy, r, hollow] of d.discs) {
    const dist2 = (u - cx) ** 2 + (v - cy) ** 2;
    if (dist2 <= r * r && (!hollow || dist2 >= (r - d.ringWidth) ** 2)) return true;
  }
  return false;
}

function render(size) {
  const d = design(size);
  const scale = 128 / size;
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4); // leading 0 = PNG filter "none"
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const u = (x + (sx + 0.5) / SAMPLES) * scale;
          const v = (y + (sy + 0.5) / SAMPLES) * scale;
          if (!inRoundedSquare(u, v)) continue;
          n++;
          if (glyphHit(d, u, v)) {
            r += 255; g += 255; b += 255;
          } else {
            const t = (u + v) / 256;
            r += TOP[0] + (BOTTOM[0] - TOP[0]) * t;
            g += TOP[1] + (BOTTOM[1] - TOP[1]) * t;
            b += TOP[2] + (BOTTOM[2] - TOP[2]) * t;
          }
        }
      }
      const o = 1 + x * 4;
      if (n > 0) {
        row[o] = Math.round(r / n);
        row[o + 1] = Math.round(g / n);
        row[o + 2] = Math.round(b / n);
        row[o + 3] = Math.round((n / (SAMPLES * SAMPLES)) * 255);
      }
    }
    rows.push(row);
  }
  return Buffer.concat(rows);
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function png(size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(render(size), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('icons', { recursive: true });
for (const size of SIZES) {
  writeFileSync(`icons/icon-${size}.png`, png(size));
  console.log(`wrote icons/icon-${size}.png`);
}
