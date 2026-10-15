# Browser Extension Starter: agent brief

You are building a browser extension for the user, starting from this template. This brief tells you how the project works, what to ask before changing anything, the rules that keep it working (and passing store review), and how to check every change. Read it all once. Then follow **Interview** before your first edit.

## Start here

This folder is a complete, working **Manifest V3** extension for **Chrome and Edge** (and Brave, Opera, Vivaldi), with a **Firefox** build, called **Marginalia** (a placeholder): highlight text on any web page, add notes, and find them again. It's **TypeScript** (strict) built with **Vite 8**, with no UI framework: small typed DOM helpers instead.

- **Content script** (`src/content/`): runs in every http(s) page. Select text and a color toolbar appears; click a color to highlight, or the note button to highlight with a note. Click a highlight to edit its note, change its color or delete it. Highlights are drawn with the CSS Custom Highlight API, so the page's HTML is never changed, and they come back when the page is opened again.
- **Popup** (toolbar button, Alt+Shift+M): this page's highlights, search, export (Markdown or JSON), and an on/off switch for the site.
- **Side panel** (Alt+Shift+S, the popup's panel button, or right-click the toolbar button): "This page" follows the active tab; "All pages" searches every highlight, grouped by page.
- **Options page**: default color, the selection toolbar on/off, theme (system, light, dark), sites it's turned off on, keyboard shortcuts, export or delete everything, About (with the CodePlate credit).
- **Service worker** (`src/background/`): the right-click menu ("Highlight selection", "Highlight with a note…"), keyboard commands, the badge count, and the one place that writes highlights.
- **Typed everything:** settings in `chrome.storage.sync` with a version and migrations; highlights in `chrome.storage.local`; messages between the parts declared once with their request and response types.
- **Permissions kept small and justified:** `storage`, `contextMenus`, `sidePanel`, and the content script on http(s) pages. Each one has a written reason that the checks require and the store listing reuses (`npm run listing`). For an extension that should run only on the sites the user allows, one at a time, `docs/recipes/optional-site-access.md` switches the model with a tested helper.

"Highlight" and "note" are what the user will replace with their own idea: a price tracker, a reading-time badge, a page summarizer, a form filler, a tab tool (`docs/recipes/rename-and-rebrand.md`, then the recipe for the part they need).

**Run it:** `npm install`, then `npm run dev` (rebuilds `dist/chrome/` on every save). In Chrome or Edge open `chrome://extensions` (`edge://extensions`), turn on **Developer mode**, click **Load unpacked** and pick `dist/chrome`. After a rebuild click the extension's ↻ reload button, then reload the web page.

**Verify any change** with one command from this folder. It must end with `CODEPLATE CHECKS: PASS`:

```
npm run check
```

It loads the built extension into a real browser for the screen tests. The first time, run `npm run setup` (installs Playwright's Chromium), or set `PW_CHANNEL=msedge` to use an installed Edge; with neither, the checks look for Edge and otherwise download Chromium once. **Google Chrome can't be used for the tests:** since Chrome 137 it ignores `--load-extension`. Node 22.18 or newer is required; 24 is what the template is tested with.

## Interview

Before you change anything, read `docs/project.md`.

- **If it still contains `<!-- codeplate:project-stub -->`, interview the user first.** Ask only what you need, in one short message, and suggest defaults so they can just say "yes":
  1. **What it does.** The itch, in a sentence. Which parts do they picture: something on the page itself, a popup from the toolbar button, a side panel, a right-click menu item, a keyboard shortcut, a settings page? A name and a one-line pitch?
  2. **Which sites.** Every site, a few specific sites (which ones), or only when they click the button? This decides the permissions: fewer sites means a friendlier install warning and a faster store review.
  3. **Data it touches (privacy).** What does it read from pages? What does it keep, and where: only this browser, synced with their browser account, or on a server of theirs? Does anything leave the browser? Is any of it personal (browsing history, form contents, health, money)? The Chrome Web Store asks all of this, and a privacy policy is needed if it collects anything.
  4. **Browsers.** Chrome and Edge (one build covers both), Firefox too, Safari (needs a Mac and Xcode)? Do they have a Chrome Web Store developer account (a one-time US$5 fee)?
  5. **Brand.** Colors, an icon (a file or a description), tone of voice.

  Then replace the stub in `docs/project.md` with their answers as short decisions, and remove the marker.
- **Otherwise, the project has started.** `docs/project.md` holds the decisions made so far. Follow them, and add new decisions as the user makes them. This file is how the next session knows what was agreed.

Work in small steps. Make one change, verify it, show the result (see **Seeing your work**), then continue. The usual first steps are `rename-and-rebrand.md`, then the recipe for the part they need (`add-a-content-script-feature.md`, `side-panel.md`, `context-menus-and-shortcuts.md`), then `options-and-storage-migrations.md` for their settings, and `publish-to-chrome-web-store.md` at the end.

`README.md` and `codeplate.json` describe the template. Once the user has named their extension, rewrite `README.md` for it (what it is, how to load and build it), and leave `codeplate.json` and `LICENSE.md` in place. `LICENSE.md` explains the user's rights to the template code.

## Architecture

Four parts that run in different places and talk through typed messages and storage. See `docs/architecture.md` for the details, a highlight's journey from selection to side panel, and how the build works.

| Path | What lives there |
|---|---|
| `src/manifest.ts` | **The manifest**, as a typed object, and `REASONS`: why each permission and host pattern is needed. The build writes `dist/<browser>/manifest.json` from it (Chrome and Firefox variants), plus the test build `dist/chrome-e2e/` (the Chrome manifest plus `TEST_HOSTS`: `localhost`, `*.test`), which only the tests and screenshots load and which is never zipped. Never edit a `manifest.json` by hand. |
| `src/background/` | The service worker. `index.ts` (listeners, registered at the top level), `router.ts` (answers `BackgroundApi` messages; every highlight write happens here, one at a time), `menus.ts` (right-click menu and keyboard commands). |
| `src/content/` | The content script, in every http(s) page. `index.ts` (start-up, page events, `TabApi` answers), `painter.ts` (draws highlights with `CSS.highlights`), `ui.ts` + `ui.css.ts` (the toolbar and note editor, in a shadow root), `content.css` (the `::highlight()` colors). |
| `src/pages/` | The extension's pages: `popup.html/.ts`, `sidepanel.html/.ts`, `options.html/.ts`. |
| `src/ui/` | Shared by the pages: `styles.css` (**design tokens**, light and dark), `dom.ts` (`el()`, `replace()`), `icons.ts` (icons and the logo as SVG), `highlight-list.ts` (the highlight card), `export.ts` (download buttons), `page.ts` (theme, target tab, opening the side panel). |
| `src/shared/` | Plain TypeScript used everywhere: `messages.ts` (**the typed message APIs**), `settings.ts` (**typed settings, defaults, migrations**), `highlights.ts` (the data and its storage), `storage.ts` (typed `chrome.storage` wrapper), `anchor.ts` (finding text again), `url.ts`, `export.ts` (Markdown/JSON), `brand.ts` (**name, words, privacy line, the credit**), `site-access.ts` (optional per-site access and runtime-registered content scripts; unused by Marginalia, see `optional-site-access.md`). |
| `assets/icons/` | The toolbar and store icons, 16/32/48/128 px (listed in `assets.json`; made by `npm run icons` from the drawing in `scripts/make-icons.mjs`, or from the user's `assets/brand/icon.svg` with an optional simplified `icon-small.svg` for 16 and 32 px). |
| `tests/unit/` | Vitest over a fake `chrome` (`tests/fakes/chrome.ts`): settings and migrations, highlights, messaging and the service worker, anchors (jsdom), export, the manifest, color contrast, the credit. |
| `tests/e2e/` | Playwright with the test build (`dist/chrome-e2e/`) loaded: content script, popup, side panel, options, shortcuts. `fixtures.ts` has the helpers. |
| `tests/pages/` | The web pages the e2e tests and screenshots highlight (served by `scripts/serve-pages.mjs`). |
| `checks/` | `run.mjs` (behind `npm run check`), `manifest.mjs` (the store-style manifest check, the test build check, keys the browsers keep), `placeholders.mjs` (the template values `npm run zip` refuses). |
| `scripts/` | `build.mjs`, `shots.mjs`, `store-assets.mjs`, `listing.mjs` (store listing and privacy policy drafts), `zip.mjs`, `media.mjs`, `make-icons.mjs`, `serve-pages.mjs`; `lib/` (finding a browser, launching it with the extension, demo data). |

## Rules

1. **The manifest lives in `src/manifest.ts`, and every permission has a reason.** Add a permission or host pattern there and a sentence to `REASONS` saying what it's for, in words a store reviewer accepts; the checks fail without one, and an unknown permission must also be added to `ALLOWED` in `checks/manifest.mjs` on purpose. Ask for the least that works: `activeTab` (access only after the user clicks) before host patterns, specific sites before all sites, `optional_permissions` (asked for later, when a feature needs it) before install-time ones. Each permission is a warning at install and can slow review. Follow `docs/recipes/add-a-permission.md`.
2. **No remote code, ever.** Manifest V3 and the stores forbid running code that isn't in the package: no `<script src="https://…">`, no `eval`, `new Function` or string timers, no fetching JavaScript to run. Data from a server is fine; code is not. Keep `content_security_policy` as it is. Lint and the manifest check catch the common cases.
3. **Messages are typed in `src/shared/messages.ts`.** Add a message to `BackgroundApi` (answered by the service worker) or `TabApi` (answered by the content script) with its request and response types, then handle it in `src/background/router.ts` or `src/content/index.ts`; send with `sendToBackground()`/`sendToTab()`. Never call `chrome.runtime.sendMessage` with an untyped object. Messages are JSON: no functions, `Date`s or DOM nodes.
4. **Storage goes through `src/shared/`.** Settings: `loadSettings()`/`saveSettings()` in `settings.ts`; every change to a stored shape bumps `SETTINGS_VERSION` with a migration in `MIGRATIONS` and a test, and a shipped migration is never edited (people's browsers have already run it). Highlights (or the user's own data) live in `chrome.storage.local`, written only by the service worker. `sync` storage is small (about 100 KB, 8 KB per item): settings only.
5. **Colors come from the tokens.** Pages use the CSS variables in `src/ui/styles.css` (`--ink`, `--surface`, `--brand`…), each with a light and a dark value; never put a hex color in a page or component. The in-page UI mirrors them in `src/content/ui.css.ts`. `tests/unit/tokens.test.ts` checks text contrast in both themes.
6. **The service worker keeps no state in variables.** The browser stops it after about 30 seconds of quiet and starts it again for the next event. Register every listener at the top level of `src/background/index.ts`, synchronously; keep anything that must survive in `chrome.storage` (or `chrome.storage.session` for this browser session). Use `chrome.alarms` for timers, not `setInterval`.
7. **The content script must not break pages.** Don't change the page's DOM except through the shadow-root host in `src/content/ui.ts`; don't add global CSS (only `::highlight()` rules in `content.css`); handle pages that change after load. Build UI with `el()` from `src/ui/dom.ts`, never `innerHTML` with page text or user notes (it's how extensions get injection bugs, and pages with Trusted Types block it).
8. **No secrets in the extension.** Everything in an extension can be read by anyone who installs it: no API keys, tokens or passwords in code, settings or `.env`. Anything secret lives on a server the extension calls (`docs/recipes/sync-with-a-backend.md`).
9. **Keep the licensing clean.** Use only code you write here, packages with permissive licenses (MIT, Apache-2.0, BSD, ISC), and images and fonts the user owns or that are CC0, each listed in `assets.json` and `CREDITS.md`. Don't paste code from tutorials or other extensions. Pin new packages to exact versions (`npm install --save-exact`). Every package you add ships inside the extension and is reviewed with it: prefer none.
10. **Never weaken a check to make it pass.** If a check fails, fix the cause. If the user deliberately changed something a test covers (say, they removed the side panel), update that test to the new design and say so.
11. **Keep the CodePlate credit.** This template's free license (`LICENSE.md`) asks that anything the user shares shows "Built with CodePlate (codeplate.io)" where people can see it. It's in the options page's About section (`CREDIT` in `src/shared/brand.ts`, rendered by `src/pages/options.ts`), and a unit test and a screen test check it. Keep it when you rebrand. The credit is only optional if `LICENSE.md` is the **CodePlate Pro License**: a copy downloaded with an active CodePlate paid plan comes with it, and names its license ID in `CODEPLATE-LICENSE.txt`. If the user asks to remove the credit and `LICENSE.md` is still the free license, tell them that.

## Verify

After every change:

1. **Run `npm run check`.** The last line must be `CODEPLATE CHECKS: PASS`. It runs these steps and lists each one's result and time:
   - `env`: every environment variable the scripts and tests read is in `.env.example` (and `src/` reads none)
   - `assets`: `assets.json` matches the files in `assets/`, PNG sizes too
   - `typecheck`: `tsc` (strict)
   - `lint`: ESLint, including no `eval`/`new Function`
   - `unit`: Vitest: settings and migrations, highlights, messaging and the service worker's handlers, anchors, export, manifest, contrast, credit
   - `build`: `dist/chrome/`, `dist/firefox/`, and the test build `dist/chrome-e2e/`
   - `manifest`: both store builds as a store sees them: permissions allowlisted and justified, CSP, no remote code, icons, every file the manifest names, no shortcut the browsers keep, no test site; and the test build is the Chrome build plus the test sites, nothing else
   - `e2e`: Playwright with the test build loaded in a real browser: highlighting on a test page, notes, reloads, the per-site switch, the popup, the side panel, the options page, export, settings migration, every suggested shortcut really assigned

   For a quicker loop: `npm run typecheck`, `npm test` (or `npm test -- settings`), `npm run lint`, or `node checks/run.mjs --skip=e2e`. Always finish with a full `npm run check`. When a step fails, the end of its output is repeated above the summary. Failed screen tests leave screenshots and traces in `.data/test-results/`.
2. **Look at it.** For anything visible, take screenshots and open the PNGs, light **and** dark (`npm run shots`; see **Seeing your work**). Taking them isn't enough. Check:
   - every piece of text is readable against its background, in both themes
   - nothing overlaps, is cut off or runs off the side, at the popup's 360 px width and the side panel's 400 px too
   - the empty state (`--empty`) still makes sense
3. **Tell the user** what changed and show the screenshots. Tell them how to see it themselves: reload the extension at `chrome://extensions` and reload the page. Say which things the checks can't see: the real popup and side panel chrome around the pages, the right-click menu and the keyboard shortcuts themselves (the tests send the same messages they do), and behavior on the real sites they care about.

## Recipes

Step-by-step guides for common requests. Follow the matching recipe when one fits; each ends with its own verification.

- `docs/recipes/rename-and-rebrand.md`: name, words, icon, colors, and turning Marginalia into the user's idea.
- `docs/recipes/add-a-permission.md`: add a permission or host access the least scary way, and justify it.
- `docs/recipes/optional-site-access.md`: no site access at install; ask for one site at a time in a click, run the content script only there, clean up when access is removed.
- `docs/recipes/add-a-content-script-feature.md`: change or add what happens on web pages.
- `docs/recipes/options-and-storage-migrations.md`: a new setting, a changed data shape, migrations.
- `docs/recipes/messaging.md`: a new message between the service worker, pages and content script.
- `docs/recipes/side-panel.md`: change the side panel, per-site panels, opening it.
- `docs/recipes/context-menus-and-shortcuts.md`: right-click menu items and keyboard commands.
- `docs/recipes/sync-with-a-backend.md`: accounts and syncing to a server, safely.
- `docs/recipes/firefox-and-safari.md`: the Firefox build, testing it, and Safari.
- `docs/recipes/publish-to-chrome-web-store.md`: the placeholders the zip refuses, the listing and privacy policy drafts (`npm run listing`), the zip, the privacy fields, review tips, Edge Add-ons.

`docs/customization-map.md` answers "I want to change X — which file?" for everything else.

## Seeing your work

You can't click the toolbar button, but you can take screenshots of every part with demo highlights loaded.

**Rule: before you report a change, screenshot every part it touched, in light and dark, and open the PNGs.** A change to `src/ui/styles.css`, `src/ui/` components or `brand.ts` touches every page: shoot them all. Don't wait to be asked, and say in your report which shots you looked at.

```
npm run shots                          (popup, side panel, options, a page with highlights; light and dark)
npm run shots -- popup sidepanel       (some of them)
npm run shots -- page --dark           (one theme: --light or --dark)
npm run shots -- popup --empty         (no highlights: the first-run look)
npm run shots -- options --no-build    (reuse the last build)
```

- Names: `popup`, `sidepanel`, `options`, `page` (the test article with highlights and the note editor open). Files: `shots/<name>.png` and `shots/<name>-dark.png`, at 2x.
- It builds, serves `tests/pages/` on port 8892 (`SHOTS_PORT`) as `reading-room.test`, starts a browser with the test build (`dist/chrome-e2e/`, allowed on `*.test`) in a fresh profile, and loads the demo highlights from `scripts/lib/demo.mjs`. Your own browser profile is never touched.
- The popup and side panel are opened as normal tabs pointed at the page's tab (`popup.html?tab=<id>`): the content is the same, without the browser's frame around it.
- Console errors from each page are printed under its file: fix them.
- When you change what the extension does, change the demo data in `scripts/lib/demo.mjs` and the test pages in `tests/pages/` to match, so the screenshots show the user's idea.
- `npm run store` makes the store images (1280×800 screenshots and the 440×280 promo tile) in `shots/store/`; `npm run media` remakes `docs/media/` for the README.

## Common pitfalls

- **"Could not establish connection. Receiving end does not exist."** Nothing answered the message: the tab has no content script (browser pages like `chrome://`, the Web Store, PDFs, or a tab opened before the extension was installed or reloaded: reload the tab), or the handler isn't registered. `sendToTab` callers catch this; do the same for new ones.
- **Changes don't show up.** After `npm run build` (or a `npm run dev` rebuild), reload the extension at `chrome://extensions`, then reload the web page: old pages keep the old content script. The popup reloads each time it opens; the side panel needs closing and opening.
- **A listener "doesn't fire" in the service worker.** It was added after an `await` or inside another callback, so it wasn't registered when the worker woke up. Register at the top level of `src/background/index.ts`. Global variables there reset whenever the worker stops (rule 6).
- **`chrome.sidePanel.open()` fails with "may only be called in response to a user gesture".** Call it directly in the click or command handler, before any `await` (`openSidePanel()` in `src/ui/page.ts`).
- **`tab.url` is undefined.** Without the `tabs` permission or host access to that page, Chrome hides URLs and titles. Ask the tab's content script instead (`page:info`), as the popup does; add `tabs` only if you truly need every tab's address (rule 1).
- **Content script ES imports fail.** Browsers load content scripts as classic scripts. `scripts/build.mjs` bundles `src/content/index.ts` into one IIFE file; import freely in TypeScript, but don't use dynamic `import()` there.
- **Page styles leak into the in-page UI (or the other way).** Build it inside the shadow root of `PageUi` (`src/content/ui.ts`); its host has `all: initial`, so set fonts on your elements in `ui.css.ts`.
- **Google Chrome doesn't load the extension in tests.** Chrome 137+ ignores `--load-extension`. Use Playwright's Chromium (`npm run setup`) or Edge (`PW_CHANNEL=msedge`); for your own testing, load it unpacked in any Chrome from `chrome://extensions`.
- **Edge opens a downloads page during the export test.** Expected. It never finishes closing, so the fixtures ask once and then leave it be (later tests don't wait for it). Do the same for any test that downloads.
- **It works in the tests, but not in the browser you loaded it in.** The tests and screenshots load `dist/chrome-e2e/`, which has access to `localhost` and `*.test` from install. Load `dist/chrome` (the store build) for your own testing: there, anything relying on `activeTab` or optional site access needs the click or the user's yes first.
- **A keyboard shortcut shows "Not set"** (at `chrome://extensions/shortcuts`, or in the options page). The browser keeps that key for itself, another extension already has it, or the extension was installed before the key was added (suggested keys apply on first install only). The `manifest` step refuses keys Chrome and Edge are known to keep, and the e2e step checks every suggested key was really assigned; to fix it for an existing install, set the key on that page. `context-menus-and-shortcuts.md` has keys that work.
- **`npm run zip` says FAIL for the name or homepage.** The template's placeholders (`checks/placeholders.mjs`) must not reach a store: rebrand first (`rename-and-rebrand.md`).
- **Ports in use:** the e2e tests serve test pages on 8891 (`E2E_PORT`), screenshots on 8892 (`SHOTS_PORT`). Set the variables to move them.
- **npm prints "install-scripts" warnings** (npm 11 asks before running packages' install scripts). They're harmless here and the checks pass; don't approve scripts on the user's behalf.
