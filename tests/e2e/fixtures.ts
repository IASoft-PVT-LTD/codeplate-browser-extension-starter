// The e2e fixtures: one browser per test run with the test build loaded
// (dist/chrome-e2e/: the Chrome build, also allowed on the test sites at
// install; see TEST_HOSTS in src/manifest.ts), in a persistent context with
// --load-extension, and helpers to drive it.
//
//   test('…', async ({ page, ext }) => {
//     await page.goto('/article.html');
//     await selectText(page, 'readers argued');
//     const tab = await ext.tabIdFor('/article.html');
//     const popup = await ext.open(`popup.html?tab=${tab}`);
//   });
//
// Storage is cleared before every test, so tests don't depend on each other.
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test as base, chromium, expect, type BrowserContext, type Page } from '@playwright/test';
import type { Highlight, NewHighlight, PageRecord } from '../../src/shared/highlights';
import type { Settings } from '../../src/shared/settings';

export const PORT = Number(process.env.E2E_PORT || 8891);
export const ORIGIN = `http://localhost:${PORT}`;

export interface Ext {
  context: BrowserContext;
  id: string;
  /** An extension page kept open to call chrome.* APIs from. */
  api: Page;
  /** Opens an extension page (popup.html?tab=…, options.html, sidepanel.html?tab=…) in a new tab. */
  open(path: string, size?: { width: number; height: number }): Promise<Page>;
  tabIdFor(urlPart: string): Promise<number>;
  pages(): Promise<PageRecord[]>;
  settings(): Promise<Settings>;
  setSettings(raw: unknown): Promise<void>;
  add(h: NewHighlight): Promise<Highlight>;
}

/** The browser's own downloads page (Edge opens one after a download). */
const DOWNLOADS_PAGE = /^(edge|chrome):\/\/downloads/;
/** Pages that wouldn't close (a downloads page): not waited for again. */
const leftOpen = new WeakSet<Page>();

export const test = base.extend<{ page: Page; fresh: void }, { ext: Ext }>({
  ext: [
    // eslint-disable-next-line no-empty-pattern -- Playwright reads the fixtures a function asks for from this pattern.
    async ({}, use) => {
      const dir = resolve('dist/chrome-e2e');
      if (!existsSync(join(dir, 'manifest.json'))) throw new Error('dist/chrome-e2e/ is missing: run `npm run build` first (it makes the test build too).');
      const profile = mkdtempSync(join(tmpdir(), 'ext-e2e-'));
      const context = await chromium.launchPersistentContext(profile, {
        channel: process.env.PW_CHANNEL || 'chromium',
        headless: !process.env.HEADED,
        args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`],
      });
      let [worker] = context.serviceWorkers();
      worker ??= await context.waitForEvent('serviceworker', { timeout: 15_000 });
      const id = new URL(worker.url()).host;
      const api = await context.newPage();
      await api.goto(`chrome-extension://${id}/options.html`);

      const ext: Ext = {
        context,
        id,
        api,
        async open(path, size) {
          const p = await context.newPage();
          if (size) await p.setViewportSize(size);
          await p.goto(`chrome-extension://${id}/${path}`);
          return p;
        },
        async tabIdFor(urlPart) {
          // Content scripts load a moment after the page: ask until one answers.
          let found: number | undefined;
          await expect
            .poll(async () => {
              found = await api.evaluate(async (part) => {
                for (const t of await chrome.tabs.query({})) {
                  try {
                    const r = await chrome.tabs.sendMessage(t.id!, { to: 'tab', type: 'page:info', data: {} });
                    if (r?.ok && r.value.url.includes(part)) return t.id;
                  } catch {
                    // no content script here
                  }
                }
                return undefined;
              }, urlPart);
              return found;
            })
            .toBeTruthy();
          return found!;
        },
        pages: () =>
          api.evaluate(async () => {
            const all = await chrome.storage.local.get(null);
            return Object.entries(all)
              .filter(([k]) => k.startsWith('page:'))
              .map(([, v]) => v as PageRecord);
          }),
        settings: () => api.evaluate(async () => (await chrome.storage.sync.get('settings')).settings as Settings),
        setSettings: (raw) => api.evaluate(async (s) => chrome.storage.sync.set({ settings: s }), raw),
        add: (h) =>
          api.evaluate(async (draft) => {
            const r = await chrome.runtime.sendMessage({ to: 'background', type: 'highlights:add', data: draft });
            if (!r?.ok) throw new Error(r?.error ?? 'no answer');
            return r.value as Highlight;
          }, h),
      };
      await use(ext);
      await context.close();
      rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
    },
    { scope: 'worker' },
  ],
  // Before every test (even those that don't use `page`): empty storage. After: close what it opened.
  fresh: [
    async ({ ext }, use) => {
      await ext.api.evaluate(async () => {
        await chrome.storage.local.clear();
        await chrome.storage.sync.clear();
      });
      await use();
      for (const p of ext.context.pages()) {
        if (p === ext.api || leftOpen.has(p)) continue;
        // After a download Edge opens its downloads page (edge://downloads-hub/), which never finishes closing.
        // Ask once without waiting, and leave it be: waiting for it would add seconds to every later test.
        if (DOWNLOADS_PAGE.test(p.url())) {
          leftOpen.add(p);
          void p.close().catch(() => undefined);
          continue;
        }
        const closed = await Promise.race([p.close().then(() => true, () => true), new Promise<boolean>((ok) => setTimeout(() => ok(false), 2000))]);
        if (!closed) leftOpen.add(p);
      }
    },
    { auto: true },
  ],
  page: async ({ ext }, use) => {
    const page = await ext.context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await use(page);
    expect(errors, 'errors in the page').toEqual([]);
  },
});

export { expect };

/** Selects the first occurrence of `text` on the page, as a user would, and releases the mouse. */
export async function selectText(page: Page, text: string): Promise<void> {
  await page.evaluate((t) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const at = (n as Text).data.indexOf(t);
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(n, at);
      range.setEnd(n, at + t.length);
      const sel = document.getSelection()!;
      sel.removeAllRanges();
      sel.addRange(range);
      const r = range.getBoundingClientRect();
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: r.right, clientY: r.bottom }));
      return;
    }
    throw new Error(`"${t}" isn't on the page`);
  }, text);
}

/** How many ranges the extension painted on the page for a highlight name (marginalia-yellow, -note…). */
export function painted(page: Page, name: string): Promise<number> {
  return page.evaluate((n) => (CSS.highlights.get(n)?.size ?? 0), name);
}

/** Clicks the middle of the first occurrence of `text` (to open a highlight's note editor). */
export async function clickText(page: Page, text: string): Promise<void> {
  const box = await page.evaluate((t) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const at = (n as Text).data.indexOf(t);
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(n, at);
      range.setEnd(n, at + t.length);
      range.startContainer.parentElement?.scrollIntoView({ block: 'center' });
      const r = range.getClientRects()[0];
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    return null;
  }, text);
  if (!box) throw new Error(`"${text}" isn't on the page`);
  await page.mouse.click(box.x, box.y);
}
