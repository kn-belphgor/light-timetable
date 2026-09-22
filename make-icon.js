/* 生成轻课表的应用图标（纯 Node，手写 PNG 编码，无依赖） */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(Buffer.concat([t, data])) >>> 0, 0);
  return Buffer.concat([len, t, data, crc]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;                       /* filter: none */
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}
/* 圆角矩形覆盖率（3×3 超采样，边缘平滑） */
function roundRectCov(x, y, w, h, r, px, py, S) {
  let hit = 0;
  for (let sy = 0; sy < 3; sy++) {
    for (let sx = 0; sx < 3; sx++) {
      const qx = px + (sx + 0.5) / 3, qy = py + (sy + 0.5) / 3;
      let inside;
      if (qx < x || qx > x + w || qy < y || qy > y + h) inside = false;
      else {
        const cx = Math.min(Math.max(qx, x + r), x + w - r);
        const cy = Math.min(Math.max(qy, y + r), y + h - r);
        inside = ((qx - cx) * (qx - cx) + (qy - cy) * (qy - cy)) <= r * r;
      }
      if (inside) hit++;
    }
  }
  return hit / 9;
}
function draw(S, opts) {
  const bg = Buffer.alloc(S * S * 4);
  const A = [79, 70, 229], B = [139, 92, 246];                 /* 靛蓝 → 紫罗兰 */
  const pad = opts.maskable ? S * 0.20 : S * 0.02;             /* maskable 内容内缩 */
  const radius = opts.maskable ? S * 0.10 : S * 0.22;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const t = (x + y) / (2 * S);
      let r = A[0] + (B[0] - A[0]) * t, g = A[1] + (B[1] - A[1]) * t, b = A[2] + (B[2] - A[2]) * t;
      let a = roundRectCov(0, 0, S, S, radius, x, y, S);
      /* 三条白色课表条 + 左侧时间点 */
      const cw = (S - pad * 2);
      const bars = [
        { y0: 0.30, y1: 0.395, x0: 0.16, x1: 0.80, al: 0.97 },
        { y0: 0.455, y1: 0.55, x0: 0.16, x1: 0.62, al: 0.86 },
        { y0: 0.61, y1: 0.705, x0: 0.16, x1: 0.71, al: 0.86 }
      ];
      for (const bar of bars) {
        const by = pad + cw * (bar.y0 - 0.16), bh = cw * (bar.y1 - bar.y0);
        const bx = pad + cw * 0.245, bw = cw * (bar.x1 - bar.x0);
        const dotR = bh * 0.30;
        const dotX = pad + cw * 0.135, dotY = by + bh / 2;
        let cov = roundRectCov(bx, by, bw, bh, bh / 2, x, y, S);
        cov = Math.max(cov, roundRectCov(dotX - dotR, dotY - dotR, dotR * 2, dotR * 2, dotR, x, y, S));
        if (cov > 0) { r = r + (255 - r) * cov * bar.al; g = g + (255 - g) * cov * bar.al; b = b + (255 - b) * cov * bar.al; }
      }
      bg[i] = Math.round(r); bg[i + 1] = Math.round(g); bg[i + 2] = Math.round(b);
      bg[i + 3] = Math.round(a * 255);
    }
  }
  return png(S, S, bg);
}

const dir = __dirname;
fs.writeFileSync(path.join(dir, 'icon-192.png'), draw(192, {}));
fs.writeFileSync(path.join(dir, 'icon-512.png'), draw(512, {}));
fs.writeFileSync(path.join(dir, 'icon-maskable-512.png'), draw(512, { maskable: true }));
fs.writeFileSync(path.join(dir, 'icon.svg'), `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#8b5cf6"/>
  </linearGradient></defs>
  <rect width="512" height="512" rx="113" fill="url(#g)"/>
  <g fill="#fff">
    <circle cx="107" cy="176" r="19"/><rect x="147" y="150" width="248" height="52" rx="26"/>
    <circle cx="107" cy="257" r="19"/><rect x="147" y="231" width="150" height="52" rx="26" opacity=".88"/>
    <circle cx="107" cy="338" r="19"/><rect x="147" y="312" width="196" height="52" rx="26" opacity=".88"/>
  </g>
</svg>
`);
console.log('已生成 icon-192.png / icon-512.png / icon-maskable-512.png / icon.svg');
