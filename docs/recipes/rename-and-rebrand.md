# Rename and rebrand

Use when the user names their extension, gives colors or an icon, or wants Marginalia turned into their own idea.

## 1. Name and words

1. `src/shared/brand.ts`: `name`, `tagline`, `description` (≤ 132 characters: the store's limit, checked), `homepage` (their site or support page), `privacy` (one true sentence about their data: the options page shows it and the privacy policy draft starts with it), `badgeColor`.
2. `package.json`: `name` (lower-case, dashes; it names the zip) and `version` (start at `1.0.0` or `0.1.0`).
3. Search for leftovers: `grep -rn "Marginalia\|marginalia" src scripts tests docs README.md`. Expected matches that are only internal ids: the highlight names `marginalia-*` in `src/content/painter.ts` and `content.css` (rename both together if you like), and `GECKO_ID` in `src/manifest.ts` (change it to an address or domain the user owns: `firefox-and-safari.md`). `TEMPLATE` in `checks/placeholders.mjs` lists the template's own values on purpose: leave it, it's how `npm run zip` knows a placeholder is left.
4. Rewrite `README.md` for the user's extension.

## 2. Colors

1. `src/ui/styles.css`: the tokens in `:root` (light), `:root[data-theme='dark']`, and the same dark values under `@media (prefers-color-scheme: dark)` (a test checks the two dark blocks match). `--brand` is the accent; `--logo-*` color the logo.
2. `src/content/ui.css.ts`: the same tokens for the in-page toolbar and editor (light, `data-theme="dark"`, and the system-dark block).
3. Highlight colors: `COLORS` in `src/shared/settings.ts`, the `::highlight()` rules in `src/content/content.css`, `--hl-*` tokens in both CSS files, and the `.swatch-*`/`.card[data-color]` rules. Renaming a color is a settings change: add a migration (`options-and-storage-migrations.md`) so stored `defaultColor` values and existing highlights still work.
4. If `tests/unit/tokens.test.ts` fails, darken the light-theme text color (or lighten the dark-theme one) until it passes; keep bright brand colors for fills.

## 3. Icon

Either:
- **Draw it in code:** change `COLORS` and `shapes()` in `scripts/make-icons.mjs` (shapes are rounded rectangles in a 100×100 box; small sizes get a bolder variant), run `npm run icons`, and change `logo()` in `src/ui/icons.ts` to the same drawing; or
- **Use the user's SVG:** save it as `assets/brand/icon.svg` (it needs a `viewBox`) and run `npm run icons`: the browser draws it at every size, with the store's 16 px of padding around the 128 px icon. If it turns to mush at 16 px (thin lines, small details, text), add a simplified `assets/brand/icon-small.svg` for the 16 and 32 px icons: fewer, bolder shapes on whole pixels of a `viewBox="0 0 16 16"` grid, same colors. List both SVGs in `assets.json` and `CREDITS.md`, and make `logo()` in `src/ui/icons.ts` the same drawing; or
- **Use the user's PNGs:** export PNGs at exactly 16, 32, 48 and 128 px to `assets/icons/icon-<size>.png` (the 128 one with about 16 px of transparent padding looks right in the store), update `assets.json` (`source`: where it came from; `credit`: who made it; `license`: `CC0-1.0` for CC0 art, `CodePlate-original` for art original to this project, which includes the user's own) and record the owner in `CREDITS.md`, and replace `logo()` with an `<img src="/icons/icon-48.png">` if the drawing can't be done in SVG.

## 4. Turning Marginalia into their idea

Decide with the user which parts stay. Then, part by part:
- **Content script** (`add-a-content-script-feature.md`): replace highlighting with their behavior. If nothing needs to run on pages until the user clicks, remove `content_scripts` and use `activeTab` + `scripting` instead (`add-a-permission.md`).
- **Data:** replace `src/shared/highlights.ts` with their data (keep the pattern: one item per page or per thing, writes through the service worker).
- **Popup / side panel / options:** keep the frame (`topbar`, footer, sections), replace the lists.
- Remove what they don't want: the side panel (`side_panel` and `sidePanel` in `src/manifest.ts`, `src/pages/sidepanel.*`, the build input in `scripts/build.mjs`, the menu item in `menus.ts`, the tests in `tests/e2e/pages.spec.ts`), the right-click menu, a command.
- Update `tests/pages/` and `scripts/lib/demo.mjs` so screenshots show their idea.

## 5. Keep the credit

The About section of the options page shows "Built with CodePlate (codeplate.io)" (`CREDIT` in `src/shared/brand.ts`). Keep it (AGENTS.md, rule 11).

## Verify

1. `npm run check` ends with `CODEPLATE CHECKS: PASS`.
2. `npm run shots` and open every PNG, light and dark: the name, logo and colors are the user's everywhere, text is readable.
3. Open `assets/icons/icon-16.png` and `icon-32.png` (they're tiny: that's the point), then `npm run build`, load `dist/chrome` unpacked, and look at the toolbar icon at its real size: it must read at 16 px. If it doesn't, draw the small version (section 3).
4. Record the name, colors and icon source in `docs/project.md`.
