// Rasterises the UPlayer logo (same geometry as public/favicon.svg) into a
// 512px PNG for the Windows exe / installer, with no image dependencies.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SIZE = 512;
const S = SIZE / 64; // favicon viewBox is 64x64

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => a + (b - a) * t;
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const G0 = hex('#1ed760');
const G1 = hex('#0ea5e9');
const BG = hex('#0b0b0b');

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

// "U": two verticals joined by the lower half of a circle at (32,34) r=14
function uDist(x, y) {
  const left = segDist(x, y, 18, 18, 18, 34);
  const right = segDist(x, y, 46, 18, 46, 34);
  const arc = y >= 34 ? Math.abs(Math.hypot(x - 32, y - 34) - 14) : Infinity;
  return Math.min(left, right, arc) - 3.5;
}

function roundRectDist(x, y, w, h, r) {
  const qx = Math.abs(x - w / 2) - (w / 2 - r);
  const qy = Math.abs(y - h / 2) - (h / 2 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

const px = Buffer.alloc(SIZE * SIZE * 4);
for (let j = 0; j < SIZE; j++) {
  for (let i = 0; i < SIZE; i++) {
    // 4x supersampling for smooth edges
    let r = 0, g = 0, b = 0, a = 0;
    for (const [ox, oy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
      const x = (i + ox) / S, y = (j + oy) / S;
      const inBg = roundRectDist(x, y, 64, 64, 16) <= 0;
      if (!inBg) continue;
      const mark = uDist(x, y) <= 0 || Math.hypot(x - 32, y - 34) <= 4;
      const t = clamp((x + y) / 128);
      const c = mark ? [mix(G0[0], G1[0], t), mix(G0[1], G1[1], t), mix(G0[2], G1[2], t)] : BG;
      r += c[0]; g += c[1]; b += c[2]; a += 255;
    }
    const k = (j * SIZE + i) * 4;
    const n = a / 255;
    px[k] = n ? r / n : 0;
    px[k + 1] = n ? g / n : 0;
    px[k + 2] = n ? b / n : 0;
    px[k + 3] = a / 4;
  }
}

// ---------- PNG encoding ----------
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let j = 0; j < size; j++) pixels.copy(raw, j * (size * 4 + 1) + 1, j * size * 4, (j + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const png = encodePng(SIZE, px);
for (const out of ['build/icon.png', 'build/electron/icon.png']) {
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, png);
}
console.log(`icon: ${png.length} bytes`);

// ---------- white media glyphs for the Windows taskbar thumbnail toolbar ----------

const inTri = (x, y, [a, b, c]) => {
  const s = (p, q, r) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
  const d1 = s([x, y], a, b), d2 = s([x, y], b, c), d3 = s([x, y], c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};
const inRect = (x, y, [x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

// shapes on a 16-unit grid
const GLYPHS = {
  play: (x, y) => inTri(x, y, [[4.5, 2.5], [13.5, 8], [4.5, 13.5]]),
  pause: (x, y) => inRect(x, y, [3.5, 2.5, 6.5, 13.5]) || inRect(x, y, [9.5, 2.5, 12.5, 13.5]),
  next: (x, y) => inTri(x, y, [[2.5, 2.5], [10.5, 8], [2.5, 13.5]]) || inRect(x, y, [11, 2.5, 13.5, 13.5]),
  prev: (x, y) => inTri(x, y, [[13.5, 2.5], [5.5, 8], [13.5, 13.5]]) || inRect(x, y, [2.5, 2.5, 5, 13.5]),
};

const GS = 32; // px; 2x the 16-unit grid
for (const [name, inside] of Object.entries(GLYPHS)) {
  const g = Buffer.alloc(GS * GS * 4);
  for (let j = 0; j < GS; j++) {
    for (let i = 0; i < GS; i++) {
      let hits = 0;
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) if (inside(((i + (sx + 0.5) / 4) / GS) * 16, ((j + (sy + 0.5) / 4) / GS) * 16)) hits++;
      const k = (j * GS + i) * 4;
      g[k] = g[k + 1] = g[k + 2] = 255;
      g[k + 3] = Math.round((hits / 16) * 255);
    }
  }
  writeFileSync(`build/electron/thumb-${name}.png`, encodePng(GS, g));
}
console.log('taskbar glyphs written');
