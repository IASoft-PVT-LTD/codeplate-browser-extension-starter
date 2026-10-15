// Finds a browser that can load the unpacked extension, for the e2e tests,
// screenshots and store images, so `npm ci && npm run check` works on a clean
// machine. In order:
//   1. PW_CHANNEL, if set: `chromium` (Playwright's Chromium) or `msedge`
//   2. Playwright's Chromium, if `npm run setup` installed it and it starts
//   3. an installed Microsoft Edge
//   4. otherwise it installs Playwright's Chromium once (cached for later runs)
// Google Chrome is never used: since Chrome 137 the branded browser ignores
// --load-extension, the switch that loads an unpacked extension.
// Extensions need a full browser, not the old headless shell: Playwright's
// `chromium` channel runs Chromium's new headless mode, which loads them.
// It sets PW_CHANNEL for the processes started after it (playwright.config.ts
// reads it) and returns the channel.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

async function starts(channel) {
  const dir = mkdtempSync(join(tmpdir(), 'ext-probe-'));
  try {
    const ctx = await chromium.launchPersistentContext(dir, { channel, headless: true, timeout: 30_000 });
    await ctx.close();
    return true;
  } catch {
    return false;
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  }
}

export async function ensureBrowser({ log = console.log } = {}) {
  const wanted = process.env.PW_CHANNEL;
  if (wanted) {
    if (/^chrome/.test(wanted)) {
      throw new Error(`PW_CHANNEL=${wanted}: Google Chrome (137 and later) can't load an unpacked extension from the command line. Use PW_CHANNEL=chromium (after \`npm run setup\`) or msedge.`);
    }
    log(`browser: ${wanted} (from PW_CHANNEL)`);
    return wanted;
  }
  if (existsSync(chromium.executablePath()) && (await starts('chromium'))) {
    log("browser: Playwright's Chromium");
    process.env.PW_CHANNEL = 'chromium';
    return 'chromium';
  }
  if (await starts('msedge')) {
    log("browser: the installed Microsoft Edge (set PW_CHANNEL to choose, or run `npm run setup` for Playwright's Chromium)");
    process.env.PW_CHANNEL = 'msedge';
    return 'msedge';
  }
  if (existsSync(chromium.executablePath())) {
    throw new Error(
      "Playwright's Chromium is installed but won't start here (on Windows, security software can block it). Install Microsoft Edge, or set PW_CHANNEL=msedge.",
    );
  }
  log("browser: none found, so installing Playwright's Chromium once (about 150 MB; later runs reuse it)…");
  const r = spawnSync('npx playwright install chromium', { stdio: 'inherit', shell: true });
  if (r.status !== 0 || !existsSync(chromium.executablePath())) {
    throw new Error(
      "Couldn't install a browser for the screen tests. Run `npm run setup` and read its error, or install Microsoft Edge. On Linux, `npx playwright install --with-deps chromium` also installs the system libraries.",
    );
  }
  process.env.PW_CHANNEL = 'chromium';
  return 'chromium';
}
