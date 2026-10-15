# Firefox and Safari

Use when the user wants the extension in Firefox or Safari as well as Chrome and Edge.

## Firefox

`npm run build:firefox` writes `dist/firefox/` from the same code. `buildManifest('firefox')` in `src/manifest.ts` differs from Chrome's:

| Chrome | Firefox |
|---|---|
| `background.service_worker` | `background.scripts` (an event page) |
| `side_panel` + `sidePanel` permission | `sidebar_action` |
| no id needed | `browser_specific_settings.gecko.id` (`GECKO_ID`) |
| `minimum_chrome_version: 116` | `strict_min_version: 140.0` (the CSS Custom Highlight API) |

The code already copes: `chrome.sidePanel` is checked before use, and `openSidePanel()` (`src/ui/page.ts`) opens Firefox's sidebar. Firefox also supports the `chrome.*` namespace with promises.

1. Set `GECKO_ID` in `src/manifest.ts` to an id the user controls, like `marginalia@theirdomain.com`. It's permanent once published.
2. `npm run build:firefox`. The `manifest` check validates `dist/firefox` in every `npm run check`.
3. Try it: open `about:debugging#/runtime/this-firefox`, **Load Temporary Add-on…**, pick `dist/firefox/manifest.json`. Or install Mozilla's `web-ext` (`npx web-ext run --source-dir dist/firefox`, it downloads a tool: ask the user first).
4. In Firefox, host permissions are optional by default for MV3: the user may need to allow "Access your data for all websites" in the add-on's Permissions tab. Show a hint in the popup when the content script doesn't answer.
5. Things to check by hand: the toolbar popup, the sidebar (View → Sidebar), highlights on a page, the options page (`about:addons` → the add-on → Preferences).
6. Publish: `npm run zip -- --firefox` makes `dist/<name>-<version>-firefox.zip` for addons.mozilla.org (it refuses while `GECKO_ID` is still at `example.com`). Mozilla may ask for the source: zip the project without `node_modules/` and `dist/`, with the build command `npm ci && npm run build:firefox`.

The checks don't run Firefox (Playwright can't load Firefox extensions). Say so when reporting.

## Safari

Safari runs web extensions inside a macOS/iOS app, built with Xcode on a Mac.

1. On a Mac with Xcode: `xcrun safari-web-extension-converter dist/chrome --app-name "<Name>" --bundle-identifier com.theirname.ext`. It creates an Xcode project that wraps the built extension.
2. Differences to expect: no `chrome.sidePanel` (the panel button is hidden by `canOpenSidePanel()`), limited `contextMenus` contexts, `storage.sync` doesn't sync across devices the same way, and permissions are granted per site by the user in Safari's settings.
3. Run it from Xcode, enable it in Safari → Settings → Extensions (and "Allow unsigned extensions" in the Develop menu while testing).
4. Publishing needs an Apple Developer account (US$99/year) and goes through App Store Connect.

Keep the Safari project outside this folder (or in `safari/`, git-ignored except its config), and rebuild `dist/chrome` before each Xcode build.

## Verify

1. `npm run check` ends with `CODEPLATE CHECKS: PASS` (it builds and checks `dist/firefox` too).
2. Load `dist/firefox` in Firefox as a temporary add-on and go through: popup, sidebar, highlight on a page, reload the page, options. Report what you (or the user) checked by hand.
3. For Safari, the user runs the Xcode project; record the bundle id and Apple team in `docs/project.md`.
