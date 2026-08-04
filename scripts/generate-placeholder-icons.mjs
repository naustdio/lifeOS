#!/usr/bin/env node
/**
 * One-off generator for placeholder PWA icons (solid brand-lime squares) so
 * `src/app/manifest.ts` references real, valid PNG files. These are
 * scaffold placeholders — replace with real branded artwork before the app
 * ships. Run manually: `node scripts/generate-placeholder-icons.mjs`.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/** Builds a solid-color, non-interlaced 8-bit RGBA PNG. */
function solidPng(size, [r, g, b, a]) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const row = Buffer.alloc(1 + size * 4);
  for (let x = 0; x < size; x++) {
    const offset = 1 + x * 4;
    row[offset] = r;
    row[offset + 1] = g;
    row[offset + 2] = b;
    row[offset + 3] = a;
  }
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  const idatData = deflateSync(raw);

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idatData),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const repoRoot = path.resolve(import.meta.dirname, "..");
const iconsDir = path.join(repoRoot, "public", "icons");
mkdirSync(iconsDir, { recursive: true });

// Brand lime #C6F432, opaque.
const LIME = [0xc6, 0xf4, 0x32, 0xff];
// Maskable icons need safe-zone padding; a solid color is trivially safe.
const INK = [0x11, 0x11, 0x11, 0xff];

writeFileSync(path.join(iconsDir, "icon-192.png"), solidPng(192, LIME));
writeFileSync(path.join(iconsDir, "icon-512.png"), solidPng(512, LIME));
writeFileSync(path.join(iconsDir, "icon-512-maskable.png"), solidPng(512, INK));

console.log("Generated placeholder PWA icons in public/icons/");
