# Side panel

Use when changing what the side panel shows, how it opens, or when the user wants a panel only on some sites (or no panel).

The side panel (`src/pages/sidepanel.ts`) is an extension page shown next to the tab. It stays open while the user browses, so it follows the active tab: `chrome.tabs.onActivated` and the content script's `page:ready` event refresh it.

## Change its content

1. `src/pages/sidepanel.ts`: the view switcher (`drawTabs`, `View`), the list (`drawList`), the footer. Build with `el()` and the classes in `src/ui/styles.css` (`.topbar`, `.tabs`, `.list`, `.card`, `.footer`, `.empty`).
2. Data for the current page comes from `info` (`page:info` from the tab's content script); everything else from `src/shared/` reads.
3. Keep it usable from 320 px wide (users resize the panel); test at 400 px in screenshots.
4. Add a `View` (e.g. `'notes'`): add it to the `View` type, a `tab('notes', 'Notes')` button in `drawTabs()`, and a branch in `drawList()`. `?view=notes` opens on it (handy for screenshots).

## How it opens

- From the popup button (`openSidePanel(windowId)` in `src/ui/page.ts`), the toolbar button's right-click menu and Alt+Shift+S (`src/background/menus.ts`). Each call must happen right in the user's click or key handler.
- To open it by clicking the toolbar button instead of the popup: in `src/background/index.ts` set `setPanelBehavior({ openPanelOnActionClick: true })` and remove `default_popup` from `action` in `src/manifest.ts` (the popup and panel can't both own the click).

## A panel only on some sites

Chrome can enable the panel per tab:

```ts
// src/background/index.ts, in a chrome.tabs.onUpdated listener (needs host access or "tabs" to read the URL):
await chrome.sidePanel.setOptions({ tabId, path: 'sidepanel.html', enabled: isSupportedSite(url) });
```

Remove `side_panel.default_path` from the manifest so it's off elsewhere. Reading `url` in `onUpdated` needs host permission for those sites (they're in `CONTENT_MATCHES` already) or `tabs`; prefer the content script telling the worker via `page:ready` (`sender.tab.id`), which needs no extra permission.

## No side panel

Remove `side_panel` and the `sidePanel` permission (and its `REASONS` entry) from `src/manifest.ts`, `sidebar_action` from the Firefox branch, `src/pages/sidepanel.*`, its input in `scripts/build.mjs`, the menu item in `src/background/menus.ts`, the `open-side-panel` command, the popup's panel button, `sidepanel` from `SHOTS` in `scripts/shots.mjs`, the store slides that use it in `scripts/store-assets.mjs`, and its tests in `tests/e2e/pages.spec.ts` and `tests/unit/messaging.test.ts`.

## Firefox

Firefox has a sidebar (`sidebar_action` in the Firefox manifest), not `chrome.sidePanel`. The same page works there; `openSidePanel()` calls `browser.sidebarAction.open()`. Per-tab enabling is `browser.sidebarAction.setPanel()`.

## Verify

1. `npm run check` ends with `CODEPLATE CHECKS: PASS` (the "side panel" e2e test covers both views, search, editing and deleting).
2. `npm run shots -- sidepanel` and open both PNGs; for a new view, also shoot it with `?view=`.
3. Load the build unpacked, open the panel, switch tabs and navigate: it should follow.
