// Starts a browser with the test build loaded (dist/chrome-e2e/: the Chrome
// build, also allowed on the test sites; see TEST_HOSTS in src/manifest.ts),
// for screenshots and store images (the e2e tests do the same in
// tests/e2e/fixtures.ts).
//   const { context, id, api, close } = await launchExtension({ channel });
//   api  an extension page (options.html), for calling chrome.* APIs
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

export async function launchExtension({ channel, dir = 'dist/chrome-e2e', headless = !process.env.HEADED, args = [], colorScheme = 'light' } = {}) {
  const path = resolve(dir);
  const profile = mkdtempSync(join(tmpdir(), 'ext-profile-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel,
    headless,
    colorScheme,
    deviceScaleFactor: 2,
    args: [`--disable-extensions-except=${path}`, `--load-extension=${path}`, ...args],
  });
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent('serviceworker', { timeout: 15_000 });
  const id = new URL(worker.url()).host;
  const api = await context.newPage();
  await api.goto(`chrome-extension://${id}/options.html`);
  return {
    context,
    id,
    api,
    url: (page) => `chrome-extension://${id}/${page}`,
    /** The id of the tab showing `urlStart`, found by asking each tab's content script. */
    async tabIdFor(urlStart) {
      return api.evaluate(async (start) => {
        for (const t of await chrome.tabs.query({})) {
          try {
            const r = await chrome.tabs.sendMessage(t.id, { to: 'tab', type: 'page:info', data: {} });
            if (r?.ok && r.value.url.startsWith(start)) return t.id;
          } catch {
            // no content script in this tab
          }
        }
        return undefined;
      }, urlStart);
    },
    async close() {
      await context.close();
      rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
    },
  };
}
