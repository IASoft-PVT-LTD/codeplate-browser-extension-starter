# Add a content-script feature

Use when the extension should do something inside web pages: read something from the page, add a button or badge, change how something looks, react to what the user selects or types.

The content script (`src/content/index.ts`) runs in every http(s) page in an isolated world: it sees the page's DOM but not its JavaScript variables, and the page can't see the extension's.

## 1. Decide where it runs

- On every page load: keep it in `src/content/index.ts` (it runs where `CONTENT_MATCHES` in `src/manifest.ts` says).
- Only on some sites: narrow `CONTENT_MATCHES` (e.g. `['https://*.example.com/*']`) and update `REASONS`; or add a second entry to `content_scripts` with its own file (add the entry to `scripts/build.mjs` as another IIFE build).
- Only when the user asks: use `activeTab` + `scripting` and `chrome.scripting.executeScript({ target: { tabId }, files: ['feature.js'] })` from the service worker or popup (`add-a-permission.md`).

## 2. Write it

1. Put the feature's logic in its own file, e.g. `src/content/price.ts`, as plain functions that take a `Document` or element and return data: they can be unit-tested in jsdom like `tests/unit/anchor.test.ts`.
2. Call it from `start()` in `src/content/index.ts`, after `settings` are loaded. Respect `enabled()` (per-site off).
3. Pages change after load (single-page apps, infinite scroll): watch with a `MutationObserver` limited to what you need, debounced, as `retryLater()` does. The 1-second URL check in `start()` handles in-app navigation.
4. UI on the page goes inside the `PageUi` shadow root (`src/content/ui.ts`): add a method that builds elements with `el()` and add their styles to `ui.css.ts`. Give controls `data-testid`s. Never use `innerHTML` with page text (AGENTS.md, rule 7).
5. Visual marks on text: use the CSS Custom Highlight API like `painter.ts` (register ranges in `CSS.highlights`, style with `::highlight(name)` in `src/content/content.css`). For marks on elements (an outline, a badge next to a price), position a box from the shadow root over `element.getBoundingClientRect()`, or, if you must add an attribute to the page, use one prefixed with the extension's name and remove it when turned off.
6. If the pages or popup need to ask for it, add a `TabApi` message (`messaging.md`) and a handler in `handlers` in `src/content/index.ts`.
7. Storing results: send a `BackgroundApi` message; the service worker writes (rule 4).

## 3. Test it

1. Unit tests in `tests/unit/` for the logic (jsdom: `// @vitest-environment jsdom` at the top).
2. A test page: add HTML to `tests/pages/` with the content the feature works on (write your own text; never copy a real site's page).
3. An e2e test in `tests/e2e/content.spec.ts`: `await page.goto('/your-page.html')`, `await ext.tabIdFor('/your-page.html')` (waits for the content script), then act and assert. `selectText()`, `clickText()` and `painted()` in `tests/e2e/fixtures.ts` help with selections and highlights.
4. Add demo data for it in `scripts/lib/demo.mjs` if screenshots should show it.

## Verify

1. `npm run check` ends with `CODEPLATE CHECKS: PASS`.
2. `npm run shots -- page` (light and dark): the feature looks right on the test page and doesn't disturb the page's own layout.
3. Load `dist/chrome` unpacked and try it on two or three real sites the user cares about; report anything site-specific you saw.
