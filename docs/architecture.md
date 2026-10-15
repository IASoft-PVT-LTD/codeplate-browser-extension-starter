# Architecture

An extension is four programs that run in different places and can't share variables. This one connects them with typed messages and with storage change events.

```
 web page (http/https)                        the extension's own origin (chrome-extension://<id>/)
 ┌─────────────────────────────┐              ┌──────────────────────────────────────────────┐
 │ content script              │   TabApi     │ service worker (src/background/)             │
 │ src/content/                │◄─────────────│  menus.ts: right-click menu, shortcuts       │
 │  index.ts  events, answers  │              │  router.ts: BackgroundApi, the only writer   │
 │  painter.ts CSS.highlights  │─────────────►│  index.ts: listeners, badge                  │
 │  ui.ts     toolbar, editor  │ BackgroundApi└──────────────▲───────────────────────────────┘
 └──────────────▲──────────────┘                             │ BackgroundApi
                │ TabApi (page:info, scroll-to)              │
 ┌──────────────┴───────────────────────────────────────────┴───────────────┐
 │ pages (src/pages/): popup.html · sidepanel.html · options.html            │
 └───────────────────────────────────────────────────────────────────────────┘
          all of them read chrome.storage and listen to storage.onChanged
```

## The parts

| Part | Where it runs | Lifetime | Can use |
|---|---|---|---|
| Content script (`src/content/`) | Inside each http(s) page, in an isolated world: the page's DOM, not its JavaScript | As long as the page | `chrome.storage`, `chrome.runtime` messaging; no `chrome.tabs`, menus, side panel |
| Service worker (`src/background/`) | In the background, no DOM | Started for an event, stopped after ~30 s of quiet | Every API in the manifest's permissions |
| Popup (`src/pages/popup.ts`) | A small page under the toolbar button | Until it loses focus | Every API |
| Side panel (`src/pages/sidepanel.ts`) | A page next to the tab | While open | Every API |
| Options (`src/pages/options.ts`) | A tab | While open | Every API |

## Data

- **Settings** (`src/shared/settings.ts`): one object in `chrome.storage.sync` under `settings`, with `version`. `loadSettings()` runs `migrateSettings()`: missing version means 1; each entry in `MIGRATIONS` brings it up a version; `sanitize()` keeps valid fields and fills defaults. A migrated value is saved back. The service worker also runs it on install and update.
- **Highlights** (`src/shared/highlights.ts`): one item per page in `chrome.storage.local`, key `page:<pageKey>`, value `{ url, title, highlights[] }`. `pageKey()` (`src/shared/url.ts`) drops the `#fragment` and tracking parameters. A page item is removed when its last highlight is deleted.
- **Anchors** (`src/shared/anchor.ts`): a highlight remembers its text plus 32 characters before and after. On load, `indexText()` concatenates the page's text nodes, `locate()` scores every occurrence of the text by matching context, and `rangeFor()` turns the best one back into a DOM `Range`. Highlights whose text is gone are reported as `missing` ("Not on page" in the lists).

## A highlight's journey

1. The user selects text. `onPointerUp` in `src/content/index.ts` shows the toolbar (`PageUi.showToolbar`).
2. They click a color. `highlightSelection()` describes the selection as an anchor and sends `highlights:add` to the service worker.
3. `src/background/router.ts` queues the write (`serial()`), `addHighlight()` stores it, and the reply carries the new highlight.
4. The write fires `storage.onChanged`. Every listener reacts: the content script repaints (`paint()`), an open popup or side panel redraws its list, the options page updates its count.
5. After painting, the content script emits `page:ready` with the count; the service worker sets the toolbar badge, and the side panel refreshes if it's following that tab.

## Messages

Declared in `src/shared/messages.ts`:

- `BackgroundApi` (answered by `src/background/router.ts`): `highlights:add`, `:update`, `:delete`, `:delete-all`, `:search`, `:pages`.
- `TabApi` (answered by `src/content/index.ts`): `page:info`, `page:highlight-selection`, `page:scroll-to`.
- `Events` (one-way, content script → pages and worker): `page:ready`.

An envelope is `{ to, type, data }`; replies are `{ ok: true, value }` or `{ ok: false, error }`, so a thrown error in a handler becomes a rejected promise for the caller. `createListener()` ignores envelopes meant for someone else, so several listeners coexist.

## The build

`scripts/build.mjs` runs Vite three times into `dist/<browser>/`:

1. **pages:** `src/pages/*.html` as a multi-page app (ES modules, shared chunks in `assets/`)
2. **background:** `src/background/index.ts` as one ES module, `background.js`
3. **content:** `src/content/index.ts` as one IIFE, `content.js` (content scripts can't be modules)

Then it copies `src/content/content.css` and `assets/icons/`, and writes `manifest.json` from `buildManifest(target)` in `src/manifest.ts`. The Firefox variant swaps `background.service_worker` for `background.scripts`, `side_panel` for `sidebar_action`, drops the `sidePanel` permission and adds `browser_specific_settings.gecko`.

The Chrome build also gets a twin, `dist/chrome-e2e/`: the same files with `buildManifest('chrome', { e2e: true })`, which adds the test sites (`TEST_HOSTS`: `localhost`, `127.0.0.1`, `*.test`) to `host_permissions`. The screen tests, screenshots and store images load it, so features that wait for a click (`activeTab`) or a permission prompt (`optional_host_permissions`) work on the test pages. It is never zipped; the `manifest` step fails if a test site reaches `dist/chrome` or `dist/firefox`, and checks the twin differs from `dist/chrome` by those sites only.

## Tests

- `tests/unit/`: Vitest. `tests/fakes/chrome.ts` is an in-memory `chrome` (storage with change events, runtime and tab messaging with Chrome's reply rules, menus, commands, side panel, host permissions with user gestures and the prompt, registered content scripts). `anchor.test.ts` runs in jsdom.
- `tests/e2e/`: Playwright launches a persistent browser profile with `--load-extension=dist/chrome-e2e`, finds the extension id from its service worker, and opens the pages as tabs (`popup.html?tab=<id>` points the popup at a page's tab). Test pages come from `tests/pages/` on port 8891 (`E2E_PORT`). Storage is cleared before each test, and the tabs a test opened are closed after it (Edge's downloads page, which never finishes closing, is left alone). One test asks the browser which shortcuts it really assigned.
- `checks/manifest.mjs`: the built manifest against store rules, the shortcuts against keys Chrome and Edge keep, and the test build against the store build. `checks/placeholders.mjs`: the template's placeholder values `npm run zip` refuses.

The real toolbar popup and the browser's side panel frame can't be opened by automation; the same pages are tested as tabs. Right-click menu clicks and keyboard shortcuts are unit-tested (`menus.ts` with the fake) and the message they send is e2e-tested.
