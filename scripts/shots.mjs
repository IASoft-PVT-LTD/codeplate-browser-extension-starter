// Screenshots of the extension, so you can see your work: the popup, the side
// panel, the options page, and a web page with highlights and the note editor
// open. Each in light and dark.
//
//   npm run shots                         all four, light and dark
//   npm run shots -- popup sidepanel      some of them
//   npm run shots -- page --dark          one theme only (--light or --dark)
//   npm run shots -- popup --empty        no demo highlights (first-run look)
//   npm run shots -- --no-build           reuse the last build (dist/chrome-e2e/)
//
// PNGs go to shots/ at 2x (git-ignored); the tool prints each path. Open them.
// It builds the extension, serves the test pages (tests/pages/) on SHOTS_PORT
// (8892), starts a browser with the test build (dist/chrome-e2e/) in a fresh
// profile, and stores the demo highlights from scripts/lib/demo.mjs. The
// browser's console errors are printed under each shot: fix them.
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureBrowser } from './lib/browser.mjs';
import { DEMO_PAGES, seedDemo } from './lib/demo.mjs';
import { launchExtension } from './lib/extension.mjs';
import { servePages } from './serve-pages.mjs';

export const SHOTS = ['popup', 'sidepanel', 'options', 'page'];
const PORT = Number(process.env.SHOTS_PORT || 8892);
// The test pages show a friendlier address than localhost in the screenshots.
const HOST = 'reading-room.test';
const ORIGIN = `http://${HOST}:${PORT}`;

/** Takes screenshots; returns the files written. */
export async function takeShots({ names = SHOTS, themes = ['light', 'dark'], empty = false, build = true, out = 'shots', log = console.log } = {}) {
  if (build) {
    const r = spawnSync(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error('The build failed.');
  }
  mkdirSync(out, { recursive: true });
  const channel = await ensureBrowser({ log });
  const server = await servePages(PORT);
  const ext = await launchExtension({ channel, args: [`--host-resolver-rules=MAP ${HOST} 127.0.0.1`] });
  const written = [];
  try {
    if (!empty) await seedDemo(ext.api, ORIGIN);
    else await ext.api.evaluate(() => chrome.storage.local.clear());

    // The web page stays open: the popup and side panel are about its tab.
    const page = await ext.context.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(`page: ${m.text()}`));
    await page.goto(`${ORIGIN}${DEMO_PAGES[0].path}`);
    const tab = await waitForTab(ext, `${ORIGIN}${DEMO_PAGES[0].path}`);

    for (const theme of themes) {
      const suffix = theme === 'dark' ? '-dark' : '';
      for (const name of names) {
        const file = resolve(out, `${name}${suffix}.png`);
        const shot = await shoot(ext, page, tab, name, theme, errors);
        await shot(file);
        written.push(file);
        log(file);
        for (const e of errors.splice(0)) log(`  console error: ${e}`);
      }
    }
  } finally {
    await ext.close();
    server.close();
  }
  return written;
}

async function waitForTab(ext, url) {
  for (let i = 0; i < 50; i++) {
    const id = await ext.tabIdFor(url);
    if (id !== undefined) return id;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`The content script didn't start on ${url}`);
}

async function extPage(ext, path, size, theme, errors) {
  const p = await ext.context.newPage();
  await p.setViewportSize(size);
  await p.emulateMedia({ colorScheme: theme });
  p.on('console', (m) => m.type() === 'error' && errors.push(`${path}: ${m.text()}`));
  p.on('pageerror', (e) => errors.push(`${path}: ${e.message}`));
  await p.goto(ext.url(path));
  await p.waitForLoadState('networkidle');
  await p.waitForTimeout(300);
  return p;
}

async function shoot(ext, page, tab, name, theme, errors) {
  if (name === 'popup') {
    const p = await extPage(ext, `popup.html?tab=${tab}`, { width: 360, height: 600 }, theme, errors);
    return async (file) => {
      await p.screenshot({ path: file, fullPage: true });
      await p.close();
    };
  }
  if (name === 'sidepanel') {
    const p = await extPage(ext, `sidepanel.html?tab=${tab}`, { width: 400, height: 860 }, theme, errors);
    return async (file) => {
      await p.screenshot({ path: file });
      await p.close();
    };
  }
  if (name === 'options') {
    const p = await extPage(ext, 'options.html', { width: 960, height: 900 }, theme, errors);
    return async (file) => {
      await p.screenshot({ path: file, fullPage: true });
      await p.close();
    };
  }
  if (name === 'page') {
    await page.bringToFront();
    await page.emulateMedia({ colorScheme: theme });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
    // Open the note editor on a highlight with a note, as a user clicking it would.
    const target = DEMO_PAGES[0].highlights.find((h) => h.note)?.exact;
    const point = await page.evaluate((t) => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const at = n.data.indexOf(t);
        if (at < 0) continue;
        const r = document.createRange();
        r.setStart(n, at + 4);
        r.setEnd(n, at + 12);
        const box = r.getBoundingClientRect();
        return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
      }
      return null;
    }, target);
    if (point) await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(250);
    return async (file) => {
      await page.screenshot({ path: file });
      await page.keyboard.press('Escape');
    };
  }
  throw new Error(`Unknown screenshot "${name}". Use: ${SHOTS.join(', ')}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const names = args.filter((a) => !a.startsWith('--'));
  const themes = args.includes('--dark') ? ['dark'] : args.includes('--light') ? ['light'] : ['light', 'dark'];
  await takeShots({ names: names.length ? names : SHOTS, themes, empty: args.includes('--empty'), build: !args.includes('--no-build') });
}
