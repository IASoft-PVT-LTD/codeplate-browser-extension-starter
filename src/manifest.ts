// The extension's manifest, as a typed object. `npm run build` writes it to
// dist/<browser>/manifest.json; never edit a manifest.json by hand.
//
// Every permission and every host pattern needs a reason in REASONS: the
// manifest check (checks/manifest.mjs) fails without one, and the reasons are
// what you paste into the Chrome Web Store's "Privacy practices" tab
// (docs/recipes/publish-to-chrome-web-store.md). Ask for as little as you can:
// each permission is a warning the user sees at install, and broad ones slow
// down the store review (docs/recipes/add-a-permission.md).
//
// This file runs in Node (the build and the checks import it), so it imports
// nothing from the extension's code except brand.ts.
import pkg from '../package.json' with { type: 'json' };
import { BRAND } from './shared/brand.ts';

export type Target = 'chrome' | 'firefox';

/** Where the content script runs. http and https pages only (not file://, not the browser's own pages). */
export const CONTENT_MATCHES = ['http://*/*', 'https://*/*'];

/** Why each permission and host pattern is needed, in words a reviewer accepts. */
export const REASONS: Record<string, string> = {
  storage: 'Saves the highlights and notes the user makes, and their settings, in the browser (chrome.storage). Nothing is sent anywhere.',
  contextMenus: 'Adds "Highlight selection" and "Highlight with a note" to the right-click menu for selected text.',
  sidePanel: 'Shows the highlights of the current page, and a search across all pages, in the side panel.',
  'http://*/*': 'The content script draws the user\'s saved highlights on the pages they highlighted, when they open them again. It reads the page\'s text only to find the highlighted passages.',
  'https://*/*': 'The content script draws the user\'s saved highlights on the pages they highlighted, when they open them again. It reads the page\'s text only to find the highlighted passages.',
};

/**
 * The test sites: where the e2e tests and screenshots serve their pages
 * (`localhost`, and made-up names like `reading-room.test`). Only the test
 * build, dist/chrome-e2e/, is allowed on them at install, so features that
 * normally wait for a click (`activeTab`) or a permission prompt
 * (`optional_host_permissions`) can run there in a test, where nobody can
 * click the prompt. They have no reason in REASONS on purpose: the store builds
 * (dist/chrome, dist/firefox) never contain them, and the manifest check fails
 * if one does. Never zip dist/chrome-e2e/.
 */
export const TEST_HOSTS = ['http://localhost/*', 'http://127.0.0.1/*', 'http://*.test/*'];

/** Firefox needs an add-on id. Change it to an address or domain the user owns (firefox-and-safari.md). */
export const GECKO_ID = 'marginalia@example.com';

const ICONS = { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' };

/** `e2e: true` makes the test build: the Chrome manifest plus TEST_HOSTS in host_permissions. */
export function buildManifest(target: Target = 'chrome', { e2e = false }: { e2e?: boolean } = {}): Record<string, unknown> {
  const m = storeManifest(target);
  if (!e2e) return m;
  if (target !== 'chrome') throw new Error('The test build is Chrome only.');
  return { ...m, host_permissions: [...((m.host_permissions as string[] | undefined) ?? []), ...TEST_HOSTS] };
}

function storeManifest(target: Target): Record<string, unknown> {
  const common = {
    manifest_version: 3,
    name: BRAND.name,
    description: BRAND.description,
    version: pkg.version,
    homepage_url: BRAND.homepage,
    icons: ICONS,
    action: { default_title: BRAND.name, default_popup: 'popup.html', default_icon: ICONS },
    options_ui: { page: 'options.html', open_in_tab: true },
    content_scripts: [{ matches: CONTENT_MATCHES, js: ['content.js'], css: ['content.css'], run_at: 'document_idle' }],
    commands: {
      _execute_action: { suggested_key: { default: 'Alt+Shift+M' }, description: `Open ${BRAND.name}` },
      'highlight-selection': { suggested_key: { default: 'Alt+Shift+H' }, description: 'Highlight the selected text' },
      'open-side-panel': { suggested_key: { default: 'Alt+Shift+S' }, description: 'Open the side panel' },
    },
    // The default MV3 policy, written out so the check can see it: scripts only from the extension itself.
    content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'" },
  };
  if (target === 'firefox') {
    return {
      ...common,
      permissions: ['storage', 'contextMenus'],
      background: { scripts: ['background.js'], type: 'module' },
      sidebar_action: { default_panel: 'sidepanel.html', default_title: BRAND.name, default_icon: ICONS, open_at_install: false },
      browser_specific_settings: { gecko: { id: GECKO_ID, strict_min_version: '140.0' } },
    };
  }
  return {
    ...common,
    minimum_chrome_version: '116',
    permissions: ['storage', 'contextMenus', 'sidePanel'],
    background: { service_worker: 'background.js', type: 'module' },
    side_panel: { default_path: 'sidepanel.html' },
  };
}
