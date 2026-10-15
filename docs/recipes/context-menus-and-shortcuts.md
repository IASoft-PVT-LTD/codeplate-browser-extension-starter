# Context menus and keyboard shortcuts

Use when adding or changing right-click menu items or keyboard commands.

Both live in the service worker: `src/background/menus.ts` defines and handles them; `src/background/index.ts` registers the listeners; shortcuts are declared in `src/manifest.ts` under `commands`.

## Add a right-click menu item

1. `src/background/menus.ts`: add an id to `MENU` and create it in `createMenus()`:

   ```ts
   chrome.contextMenus.create({ id: MENU.copyQuote, title: 'Copy as quote', contexts: ['selection'] });
   ```

   `contexts`: `selection` (selected text), `link`, `image`, `page`, `editable`, `action` (the toolbar button's own menu, max 6 items). `documentUrlPatterns: ['https://*.example.com/*']` limits it to some sites. `%s` in the title shows the selected text.
2. Handle it in `onMenuClick()`: `info.selectionText`, `info.linkUrl`, `info.srcUrl`, `info.pageUrl` (needs host access) and `tab` tell you what was clicked. To act on the page, send a `TabApi` message (`messaging.md`) as `highlightIn()` does.
3. Menus are created once on install/update (`chrome.runtime.onInstalled`); after changing them, reload the extension.
4. Firefox calls this API `menus` but accepts `contextMenus`; `action` context works there too.

## Add a keyboard command

1. `src/manifest.ts`, `commands`:

   ```ts
   'copy-quote': { suggested_key: { default: 'Alt+Shift+Q', mac: 'Alt+Shift+Q' }, description: 'Copy the selection as a quote' },
   ```

   At most 4 commands may have a `suggested_key` (checked). Keys must include `Ctrl` or `Alt` (`Command`/`MacCtrl` on macOS), may add `Shift`, and must not clash with browser shortcuts; if one does, the browser silently leaves it unset. Commands without a suggested key appear at `chrome://extensions/shortcuts` for the user to set.

   **Picking a key.** `Alt+Shift+<letter>` is the safest family. In Edge 155 on Windows, `Alt+Shift+` A, B, C, I, P, R, T, W, X and Z are kept by the browser (Chrome's own shortcuts include A, B, I and T); the `manifest` check refuses those (`RESERVED_KEYS` in `checks/manifest.mjs`). Most `Ctrl+Shift+<letter>` keys are taken (new InPrivate or incognito window, reopen tab, developer tools, Edge's collections and read aloud…). Marginalia's `Alt+Shift+M`, `H` and `S` are assigned in both.
2. Handle it in `onCommand()` in `src/background/menus.ts`. `_execute_action` (opens the popup) needs no code.
3. The options page lists commands automatically (`chrome.commands.getAll()`), with a button to the browser's shortcut page.
4. Suggested keys apply on first install only; existing users keep theirs.
5. **Why a shortcut shows "Not set"** at `chrome://extensions/shortcuts` (`edge://extensions/shortcuts`) and in the options page's list: the browser keeps that key for itself, another installed extension already has it, or the extension was installed before the key was added (step 4). There's no error anywhere; the command just has no key. Pick another key (the e2e test below catches the first case), or tell the user to set one on that page.

## Test it

- Unit: `tests/unit/messaging.test.ts` ("menus and shortcuts") calls `createMenus()`, `onMenuClick()` and `onCommand()` with the fake `chrome` and checks what was created and which message the tab received. Add your item and command there.
- E2E: automation can't open the real right-click menu or press extension shortcuts; send the same `TabApi` message from the api page (see "the right-click menu and shortcut path" in `tests/e2e/content.spec.ts`). The test "every suggested shortcut is assigned by the browser" (`tests/e2e/pages.spec.ts`) asks the real browser, through `chrome.commands.getAll()`, which keys it assigned in a fresh profile: it fails if a suggested key would show "Not set".

## Verify

1. `npm run check` ends with `CODEPLATE CHECKS: PASS`.
2. `npm run shots -- options`: the new command is listed with its keys.
3. Load the build unpacked, reload the extension, right-click selected text and press the shortcut on a real page. Tell the user these two are verified by hand only.
