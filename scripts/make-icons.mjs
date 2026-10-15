// Makes the extension's icons in assets/icons/ (16, 32, 48 and 128 px).
//
//   npm run icons                     the drawing below: lines of text on an ink
//                                     square, the middle line highlighted (the
//                                     same drawing as logo() in src/ui/icons.ts)
//   npm run icons -- --svg=assets/brand/icon.svg
//                                     the user's SVG, at every size
//   npm run icons -- --svg=assets/brand/icon.svg --small-svg=assets/brand/icon-small.svg
//                                     plus a simplified drawing for 16 and 32 px
//
// Without flags, assets/brand/icon.svg and assets/brand/icon-small.svg are used
// when they exist (list them in assets.json, with their source and license).
// Either can be left out: no icon.svg → the drawing below for 48 and 128 px;
// no icon-small.svg → the full icon for 16 and 32 px as well.
//
// Why a small version: at 16 and 32 px (the toolbar) fine detail turns to mush.
// Draw it with fewer, bolder shapes on whole pixels of a 16- or 32-unit grid
// (viewBox="0 0 16 16"), no thin lines, no text. The drawing below does the
// same: shapes() returns a bolder variant for small sizes.
//
// The code drawing is plain Node: each pixel is 4×4 supersampled against
// rounded rectangles and the PNG is written with node:zlib. SVGs are drawn by
// the browser the checks use (scripts/lib/browser.mjs), on a transparent
// background, with 16 px of transparent padding around the 128 px icon (what
// the Chrome Web Store asks for); the SVG needs a viewBox. Then update
// logo() in src/ui/icons.ts to match (docs/recipes/rename-and-rebrand.md).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const OUT = 'assets/icons';
const SIZES = [16, 32, 48, 128];
const COLORS = { bg: '#2b2f6b', bgBottom: '#3b3f8f', line: '#e9ebff', mark: '#ffd43b', ink: '#2b2f6b' };

/** Shapes in a 100×100 box: [x, y, w, h, radius, color]. Small sizes get fewer, bolder lines. */
function shapes(size) {
  if (size <= 32) {
    return [
      [16, 36, 68, 28, 8, 'mark'],
      [22, 16, 56, 11, 5.5, 'line'],
      [22, 44.5, 56, 11, 5.5, 'ink'],
      [22, 73, 38, 11, 5.5, 'line'],
    ];
  }
  return [
    [18, 41, 64, 18, 5, 'mark'],
    [24, 25, 52, 7, 3.5, 'line'],
    [24, 46.5, 52, 7, 3.5, 'ink'],
    [24, 68, 34, 7, 3.5, 'line'],
  ];
}

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

function inRoundRect(px, py, x, y, w, h, r) {
  const qx = Math.abs(px - (x + w / 2)) - (w / 2 - r);
  const qy = Math.abs(py - (y + h / 2)) - (h / 2 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r <= 0;
}

/** [r, g, b, a] at a point of the 100-unit icon. */
function shade(u, v, list) {
  if (!inRoundRect(u, v, 0, 0, 100, 100, 22)) return [0, 0, 0, 0];
  let color = mix(hex(COLORS.bg), hex(COLORS.bgBottom), v / 100);
  for (const [x, y, w, h, r, name] of list) if (inRoundRect(u, v, x, y, w, h, r)) color = hex(COLORS[name]);
  return [...color, 255];
}

function render(size) {
  const list = shapes(size);
  const px = Buffer.alloc(size * size * 4);
  const N = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < N; sy++) {
        for (let sx = 0; sx < N; sx++) {
          const c = shade(((x + (sx + 0.5) / N) / size) * 100, ((y + (sy + 0.5) / N) / size) * 100, list);
          r += c[0] * c[3];
          g += c[1] * c[3];
          b += c[2] * c[3];
          a += c[3];
        }
      }
      const i = (y * size + x) * 4;
      px[i] = a ? Math.round(r / a) : 0;
      px[i + 1] = a ? Math.round(g / a) : 0;
      px[i + 2] = a ? Math.round(b / a) : 0;
      px[i + 3] = Math.round(a / (N * N));
    }
  }
  return png(size, size, px);
}

// --- PNG writer ---
const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- the user's SVG, drawn by the browser ---
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const pick = (flag, fallback) => {
  const path = arg(flag) ?? (existsSync(fallback) ? fallback : undefined);
  if (path && !existsSync(path)) throw new Error(`--${flag}=${path}: no such file`);
  if (path && !/viewBox=/.test(readFileSync(path, 'utf8'))) throw new Error(`${path} has no viewBox, so it can't be scaled to each size: add one (viewBox="0 0 <width> <height>")`);
  return path;
};
const SOURCES = { full: pick('svg', 'assets/brand/icon.svg'), small: pick('small-svg', 'assets/brand/icon-small.svg') };

/** Draws an SVG file into a size×size PNG; `inset` px of transparent padding on each side. */
async function svgToPng(browser, file, size, inset) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  try {
    const src = `data:image/svg+xml;base64,${readFileSync(file).toString('base64')}`;
    const box = size - inset * 2;
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:transparent"><img src="${src}" style="display:block;position:absolute;left:${inset}px;top:${inset}px;width:${box}px;height:${box}px;object-fit:contain"></body></html>`,
    );
    await page.waitForFunction(() => document.images[0]?.complete && document.images[0].naturalWidth > 0);
    return await page.screenshot({ type: 'png', omitBackground: true });
  } finally {
    await page.close();
  }
}

/** Which source each size comes from: an SVG path, or null for the drawing above. */
function sourceFor(size) {
  if (size <= 32) return SOURCES.small ?? SOURCES.full ?? null;
  return SOURCES.full ?? null;
}

mkdirSync(OUT, { recursive: true });
let browser;
try {
  if (SIZES.some(sourceFor)) {
    const { chromium } = await import('@playwright/test');
    const { ensureBrowser } = await import('./lib/browser.mjs');
    browser = await chromium.launch({ channel: await ensureBrowser({ log: () => undefined }) });
  }
  for (const s of SIZES) {
    const src = sourceFor(s);
    writeFileSync(`${OUT}/icon-${s}.png`, src ? await svgToPng(browser, src, s, s === 128 ? 16 : 0) : render(s));
    console.log(`${OUT}/icon-${s}.png  (from ${src ?? 'the drawing in scripts/make-icons.mjs'})`);
  }
} finally {
  await browser?.close();
}
console.log('Look at them at their real size (16 px in the toolbar), and update logo() in src/ui/icons.ts to match.');
