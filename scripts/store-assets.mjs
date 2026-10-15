// Images for the Chrome Web Store (and Edge Add-ons) listing, made from fresh
// screenshots (scripts/shots.mjs):
//   shots/store/screenshot-1.png … -3.png   1280×800 (the size the store wants)
//   shots/store/promo-small.png             440×280 small promo tile
//   shots/store/icon-128.png                the store icon (assets/icons/icon-128.png)
//
//   npm run store                 (builds, shoots, composes)
//   npm run store -- --no-build
//
// Each screenshot is an HTML layout (headline + framed screenshots) rendered
// at exactly 1280×800. Change the words in SLIDES; colors follow the brand
// tokens. Look at every PNG before uploading.
import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { BRAND } from '../src/shared/brand.ts';
import { ensureBrowser } from './lib/browser.mjs';
import { takeShots } from './shots.mjs';

const OUT = 'shots/store';
const INK = '#2b2f6b';
const MARK = '#ffd43b';

const SLIDES = [
  { file: 'screenshot-1.png', title: 'Highlight anything you read', body: 'Select text on any page, pick a color, add a note. Your highlights are there when you come back.', main: 'page', side: 'sidepanel' },
  { file: 'screenshot-2.png', title: 'Every highlight, one click away', body: 'The popup lists this page’s highlights. Search them, jump to one, export to Markdown or JSON.', main: 'page', side: 'popup' },
  { file: 'screenshot-3.png', title: 'Yours, and private', body: 'Light and dark themes, per-site on/off, keyboard shortcuts. Everything stays in your browser.', main: 'options-dark', side: 'sidepanel-dark' },
];

const dataUrl = (f) => `data:image/png;base64,${readFileSync(f).toString('base64')}`;
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const LOGO = `<svg viewBox="0 0 100 100" width="44" height="44"><rect width="100" height="100" rx="24" fill="#4b50b0"/><rect x="18" y="41" width="64" height="18" rx="5" fill="${MARK}"/><rect x="24" y="25" width="52" height="7" rx="3.5" fill="#e9ebff"/><rect x="24" y="46.5" width="52" height="7" rx="3.5" fill="#2b2f6b"/><rect x="24" y="68" width="34" height="7" rx="3.5" fill="#e9ebff"/></svg>`;

function slideHtml(s) {
  return `<!doctype html><html><head><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1280px; height: 800px; overflow: hidden; font-family: system-ui, 'Segoe UI', sans-serif;
    background: radial-gradient(1200px 600px at 0% 0%, #3b3f8f 0%, ${INK} 55%, #1c1f4a 100%); color: #fff; position: relative; }
  .text { position: absolute; left: 56px; top: 40px; right: 56px; display: grid; grid-template-columns: auto 1fr; column-gap: 40px; align-items: center; }
  .brand { display: flex; align-items: center; gap: 12px; font-weight: 700; font-size: 22px; grid-column: 1 / -1; margin-bottom: 18px; }
  h1 { font-size: 40px; line-height: 1.1; letter-spacing: -0.02em; white-space: nowrap; }
  h1 mark { background: ${MARK}; color: ${INK}; border-radius: 6px; padding: 0 8px; }
  p { font-size: 18px; line-height: 1.45; color: #d9dbff; max-width: 560px; }
  .shots { position: absolute; left: 56px; right: 56px; bottom: 0; height: 560px; display: flex; gap: 24px; align-items: flex-start; }
  .main { flex: 1; border-radius: 14px 14px 0 0; overflow: hidden; box-shadow: 0 30px 80px rgb(0 0 0 / .45); background: #fff; height: 560px; }
  .main img { width: 100%; height: 530px; object-fit: cover; object-position: top left; display: block; }
  .bar { height: 30px; background: #eceef5; display: flex; align-items: center; gap: 7px; padding: 0 14px; }
  .bar i { width: 11px; height: 11px; border-radius: 50%; background: #c9ccd9; display: block; }
  .side { width: 330px; height: 560px; border-radius: 14px 14px 0 0; overflow: hidden; box-shadow: 0 24px 60px rgb(0 0 0 / .5); border: 1px solid rgb(255 255 255 / .15); border-bottom: 0; }
  .side img { width: 100%; display: block; }
  </style></head><body>
  <div class="text"><div class="brand">${LOGO}${esc(BRAND.name)}</div>
  <h1>${esc(s.title).replace(/(\S+)$/, '<mark>$1</mark>')}</h1><p>${esc(s.body)}</p></div>
  <div class="shots"><div class="main"><div class="bar"><i></i><i></i><i></i></div><img src="${dataUrl(`shots/${s.main}.png`)}"></div>
  <div class="side"><img src="${dataUrl(`shots/${s.side}.png`)}"></div></div>
  </body></html>`;
}

function promoHtml() {
  return `<!doctype html><html><head><style>
  * { margin: 0; box-sizing: border-box; }
  body { width: 440px; height: 280px; overflow: hidden; display: grid; place-items: center; font-family: system-ui, 'Segoe UI', sans-serif;
    background: radial-gradient(500px 300px at 0% 0%, #3b3f8f, ${INK} 60%, #1c1f4a); color: #fff; }
  .wrap { display: grid; justify-items: center; gap: 14px; text-align: center; padding: 0 30px; }
  .wrap svg { width: 72px; height: 72px; }
  h1 { font-size: 34px; letter-spacing: -0.02em; }
  p { font-size: 15px; color: #d9dbff; }
  </style></head><body><div class="wrap">${LOGO}<h1>${esc(BRAND.name)}</h1><p>${esc(BRAND.tagline)}</p></div></body></html>`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await takeShots({ names: ['page', 'popup', 'sidepanel', 'options'], build: !process.argv.includes('--no-build') });
  mkdirSync(OUT, { recursive: true });
  const channel = await ensureBrowser();
  const browser = await chromium.launch({ channel });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  for (const s of SLIDES) {
    await page.setContent(slideHtml(s), { waitUntil: 'load' });
    await page.screenshot({ path: `${OUT}/${s.file}` });
    console.log(resolve(OUT, s.file));
  }
  await page.setViewportSize({ width: 440, height: 280 });
  await page.setContent(promoHtml(), { waitUntil: 'load' });
  await page.screenshot({ path: `${OUT}/promo-small.png` });
  console.log(resolve(OUT, 'promo-small.png'));
  await browser.close();
  copyFileSync('assets/icons/icon-128.png', `${OUT}/icon-128.png`);
  console.log(resolve(OUT, 'icon-128.png'));
}
