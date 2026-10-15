# Customization map

"I want to change X — which file?"

| I want to change… | Edit | Notes |
|---|---|---|
| The extension's name, description, homepage | `src/shared/brand.ts` | Feeds the manifest and every page. Description ≤ 132 characters. `rename-and-rebrand.md`. |
| The version | `package.json` `version` | The manifest reads it. Bump it for every store upload. |
| The icon | `scripts/make-icons.mjs` (then `npm run icons`), or the user's SVG in `assets/brand/icon.svg` plus an optional simplified `assets/brand/icon-small.svg` for 16 and 32 px (then `npm run icons`), or replace `assets/icons/*.png` at the same sizes | Update `assets.json` if files change; the logo in `src/ui/icons.ts` (`logo()`) should match. |
| Colors and theme | `src/ui/styles.css` (tokens), `src/content/ui.css.ts` (in-page UI), `src/content/content.css` (highlight colors) | Light and dark values; `tests/unit/tokens.test.ts` checks contrast. |
| Permissions, sites the content script runs on | `src/manifest.ts` (`permissions`, `CONTENT_MATCHES`, `REASONS`) | `add-a-permission.md`. |
| Run only on sites the user allows, one at a time | `src/shared/site-access.ts`, `src/manifest.ts` | `optional-site-access.md`. |
| Sites the e2e tests and screenshots may use | `src/manifest.ts` (`TEST_HOSTS`) | Only in the test build `dist/chrome-e2e/`, never zipped. |
| What happens on web pages | `src/content/index.ts`, `src/content/painter.ts`, `src/content/ui.ts` | `add-a-content-script-feature.md`. |
| The toolbar or note editor on pages | `src/content/ui.ts`, `src/content/ui.css.ts` | Shadow root; `data-testid`s used by `tests/e2e/content.spec.ts`. |
| The popup | `src/pages/popup.ts` (+ `popup.html`) | 360 px wide (`body.popup` in `styles.css`). |
| The side panel | `src/pages/sidepanel.ts` | `side-panel.md`. |
| The options page | `src/pages/options.ts` | Sections are functions; About holds the credit. |
| A setting | `src/shared/settings.ts` | `options-and-storage-migrations.md`. |
| The data model | `src/shared/highlights.ts` | Writes only in `src/background/router.ts`. |
| A message between parts | `src/shared/messages.ts`, then the handler in `src/background/router.ts` or `src/content/index.ts` | `messaging.md`. |
| Right-click menu items | `src/background/menus.ts` | `context-menus-and-shortcuts.md`. |
| Keyboard shortcuts | `src/manifest.ts` `commands`, handled in `src/background/menus.ts` (`onCommand`) | Max 4 suggested keys, none in `RESERVED_KEYS` (`checks/manifest.mjs`). |
| The badge on the toolbar button | `src/background/index.ts` (`page:ready` listener), `BRAND.badgeColor` | |
| Export formats | `src/shared/export.ts`, buttons in `src/ui/export.ts` | |
| List cards (popup and side panel) | `src/ui/highlight-list.ts` | |
| Icons inside the UI | `src/ui/icons.ts` | Path data, 24×24, stroke only. |
| Which pages URLs count as "the same page" | `src/shared/url.ts` (`pageKey`, `TRACKING`) | |
| How highlights are found again | `src/shared/anchor.ts` (`CONTEXT`, `locate`) | |
| The Firefox build | `src/manifest.ts` (`target === 'firefox'`, `GECKO_ID`) | `firefox-and-safari.md`. |
| Test pages for e2e and screenshots | `tests/pages/*.html`, demo data `scripts/lib/demo.mjs` | |
| Store screenshots and promo tile | `scripts/store-assets.mjs` (`SLIDES`, `promoHtml`) | `npm run store`. |
| What the store zip contains | `scripts/zip.mjs` | Only `dist/chrome/` or `dist/firefox/`; refuses the placeholders in `checks/placeholders.mjs`. |
| The store listing and privacy policy drafts | `npm run listing` (`scripts/listing.mjs`) writes `docs/store-listing.md`, `docs/privacy-policy.md` | Permission justifications come from `REASONS`; the privacy summary from `BRAND.privacy`. |
| The privacy line in About | `src/shared/brand.ts` (`privacy`) | Also starts the privacy policy draft. |
| What the checks run | `checks/run.mjs`, `checks/manifest.mjs` (`ALLOWED`) | |
