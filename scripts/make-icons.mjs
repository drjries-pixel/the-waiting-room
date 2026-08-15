#!/usr/bin/env node
/**
 * Generates the home-screen icons from the plant in the login illustration.
 *
 * iOS ignores SVG for apple-touch-icon, so a raster file is unavoidable. This
 * rasterises the same paths by hand rather than pulling in a native image
 * dependency (sharp/resvg have no reliable win32-arm64 build, which is the
 * whole reason wrangler can't run Windows-side on this machine either).
 *
 *   node scripts/make-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

/* ---------- geometry, lifted from src/screens/Login.jsx ---------- */

const PAPER = [0xfa, 0xf8, 0xf5];
const DISC = [0xed, 0xf3, 0xed];
const POT = [0xc9, 0xb3, 0x9a];
const LEAF_NEAR = [0x7c, 0x9a, 0x82];
const LEAF_FAR = [0x55, 0x75, 0x5c];

// cubic bezier -> polyline
function flatten([x0, y0], [x1, y1], [x2, y2], [x3, y3], steps = 48) {
  const pts = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    pts.push([
      u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
      u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
    ]);
  }
  return pts;
}

const nearLeaf = [
  ...flatten([163, 78], [153, 74], [149, 64], [153, 56]),
  ...flatten([153, 56], [161, 58], [165, 66], [163, 78]),
];
const farLeaf = [
  ...flatten([163, 78], [172, 72], [173, 62], [168, 55]),
  ...flatten([168, 55], [161, 59], [159, 68], [163, 78]),
];

function inPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inRoundRect(px, py, x, y, w, h, r) {
  if (px < x || px > x + w || py < y || py > y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r || (px >= x + r && px <= x + w - r) || (py >= y + r && py <= y + h - r);
}

/** Colour at a point in the 512-space design, or null for background. */
function sample(x, y) {
  // plant transform: translate(256,262) scale(6.5) translate(-163,-75.5)
  const px = (x - 256) / 6.5 + 163;
  const py = (y - 262) / 6.5 + 75.5;

  if (inPolygon(px, py, farLeaf)) return LEAF_FAR;
  if (inPolygon(px, py, nearLeaf)) return LEAF_NEAR;
  if (inRoundRect(px, py, 152, 78, 22, 18, 4)) return POT;
  if ((x - 256) ** 2 + (y - 256) ** 2 <= 176 * 176) return DISC;
  return PAPER;
}

/* ---------- render with 3x supersampling ---------- */

function render(size) {
  const SS = 3;
  const rgba = Buffer.alloc(size * size * 4);
  const scale = 512 / size;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const c = sample((x + (sx + 0.5) / SS) * scale, (y + (sy + 0.5) / SS) * scale);
          r += c[0];
          g += c[1];
          b += c[2];
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      rgba[i] = Math.round(r / n);
      rgba[i + 1] = Math.round(g / n);
      rgba[i + 2] = Math.round(b / n);
      rgba[i + 3] = 255; // fully opaque: iOS composites transparency onto black
    }
  }
  return rgba;
}

/* ---------- minimal PNG writer ---------- */

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function toPng(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour + alpha
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const [size, name] of [
  [180, 'public/apple-touch-icon.png'],
  [192, 'public/icon-192.png'],
  [512, 'public/icon-512.png'],
]) {
  const png = toPng(render(size), size);
  writeFileSync(name, png);
  console.log(`${name.padEnd(30)} ${size}x${size}  ${(png.length / 1024).toFixed(1)} KB`);
}
