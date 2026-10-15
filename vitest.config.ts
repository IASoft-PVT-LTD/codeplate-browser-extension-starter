// Unit tests: storage, settings migrations, messaging (over a fake `chrome`,
// tests/fakes/chrome.ts), anchors (in jsdom), export, the manifest and the
// color tokens. The real browser is tested by tests/e2e/ (Playwright).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
  },
});
