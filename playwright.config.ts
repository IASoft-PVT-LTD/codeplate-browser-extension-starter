// Screen tests: a real browser with the test build (dist/chrome-e2e/) loaded,
// on test pages served from tests/pages/ (scripts/serve-pages.mjs).
//   npm run build && npm run e2e      (npm run check does both, and finds a browser)
// PW_CHANNEL picks the browser: `chromium` (Playwright's, after `npm run setup`)
// or `msedge`. Google Chrome can't load unpacked extensions from the command line.
// HEADED=1 shows the browser window.
import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT || 8891);

export default defineConfig({
  testDir: 'tests/e2e',
  // One browser with the extension, shared by the tests in order.
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: [['list']],
  outputDir: '.data/test-results',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `node scripts/serve-pages.mjs --port=${PORT}`,
    url: `http://127.0.0.1:${PORT}/article.html`,
    reuseExistingServer: false,
    timeout: 20_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
