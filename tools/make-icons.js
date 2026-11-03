// Generates PNG icons (no dependencies). Run: node tools/make-icons.js
const fs = require('fs'), zlib = require('zlib'), path = require('path');

function crc32(buf) { let c, crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; for (let x = 0; x < size; x++) { const [r, g, b, a] = pixel(x, y); const o = y * (size * 4 + 1) + 1 + x * 4; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a; } }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function inRounded(x, y, x0, y0, w, h, r) {
  if (x < x0 || y < y0 || x >= x0 + w || y >= y0 + h) return false;
  const cx = Math.max(x0 + r, Math.min(x, x0 + w - r)), cy = Math.max(y0 + r, Math.min(y, y0 + h - r));
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
function mix(a, b, t) { return a.map((v, i) => Math.round(v + (b[i] - v) * t)); }

function icon(size, maskable) {
  const pad = maskable ? size * 0.1 : 0;
  const S = size - pad * 2;
  const u = v => pad + v / 512 * S; // map 512-grid to px
  return png(size, (x, y) => {
    const bgRadius = maskable ? 0 : u(112) - pad;
    const inBg = maskable ? true : inRounded(x, y, pad, pad, S, S, bgRadius);
    if (!inBg) return [0, 0, 0, 0];
    const t = ((x - pad) + (y - pad)) / (2 * S);
    let col = mix([42, 120, 214], [94, 154, 230], t);
    const tiles = [[112, 112, .95], [272, 112, .7], [112, 272, .7], [272, 272, .95]];
    for (const [tx, ty, op] of tiles) if (inRounded(x, y, u(tx), u(ty), u(128) - pad, u(128) - pad, u(28) - pad)) col = mix(col, [255, 255, 255], op);
    // check mark in the bottom-right tile: distance to two segments
    const segs = [[[300, 336], [324, 360]], [[324, 360], [372, 308]]];
    for (const [[ax, ay], [bx, by]] of segs) {
      const px = (x - pad) / S * 512, py = (y - pad) / S * 512;
      const dx = bx - ax, dy = by - ay; const tt = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
      const d = Math.hypot(px - (ax + tt * dx), py - (ay + tt * dy));
      if (d <= 9) col = [42, 120, 214];
    }
    return [col[0], col[1], col[2], 255];
  });
}
const out = path.join(__dirname, '..', 'icons');
fs.writeFileSync(path.join(out, 'icon-192.png'), icon(192, false));
fs.writeFileSync(path.join(out, 'icon-512.png'), icon(512, false));
fs.writeFileSync(path.join(out, 'icon-maskable-512.png'), icon(512, true));
console.log('icons written to', out);
