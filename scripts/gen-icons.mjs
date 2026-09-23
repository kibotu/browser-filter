/**
 * Generate the extension icons (16/48/128 PNG) with no dependencies.
 * A neutral "blocked" glyph: ring plus diagonal bar on a solid square.
 * Output is deterministic; icons are committed, this script documents
 * their provenance and allows regeneration.
 *
 * Usage: npm run icons
 */
import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'extension', 'icons');

const BACKGROUND = [30, 41, 59, 255]; // slate-900
const GLYPH = [248, 250, 252, 255]; // slate-50
const SUPERSAMPLE = 4;

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    const row = y * (size * 4 + 1);
    raw[row] = 0; // filter: none
    pixels.copy(raw, row + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Ring + diagonal bar, centred, in unit coordinates (0..1). */
function isGlyph(u, v) {
  const dx = u - 0.5;
  const dy = v - 0.5;
  const dist = Math.hypot(dx, dy);
  const ring = Math.abs(dist - 0.33) <= 0.07;
  const bar = Math.abs(dx + dy) / Math.SQRT2 <= 0.07 && dist <= 0.4;
  return ring || bar;
}

function renderIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const step = SUPERSAMPLE;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let hits = 0;
      for (let sy = 0; sy < step; sy += 1) {
        for (let sx = 0; sx < step; sx += 1) {
          if (isGlyph((x + (sx + 0.5) / step) / size, (y + (sy + 0.5) / step) / size)) hits += 1;
        }
      }
      const covered = hits / (step * step);
      const fg = GLYPH;
      const bg = BACKGROUND;
      const offset = (y * size + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        pixels[offset + channel] = Math.round(bg[channel] + (fg[channel] - bg[channel]) * covered);
      }
    }
  }
  return pixels;
}

await mkdir(OUT_DIR, { recursive: true });
for (const size of [16, 48, 128]) {
  const file = path.join(OUT_DIR, `${size}.png`);
  await writeFile(file, encodePng(size, renderIcon(size)));
  console.log(`wrote ${path.relative(ROOT, file)}`);
}
