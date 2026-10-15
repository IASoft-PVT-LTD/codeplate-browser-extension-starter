# Options and storage migrations

Use when adding a setting, changing what a setting holds, or changing the shape of stored data.

People's browsers keep whatever an older version stored. A migration converts it the first time the new version reads it. A shipped migration is never edited or removed.

## Add a setting

1. `src/shared/settings.ts`:
   - add the field to `Settings` with a comment
   - add its default to `DEFAULT_SETTINGS`
   - add a line to `sanitize()` that keeps a valid stored value and falls back to the default (use `isOneOf()` for a fixed list)
   A new field with a default needs **no** migration: `sanitize()` fills it in.
2. `src/pages/options.ts`: add a `row(label, hint, control)` to the right section (or a new `section(...)` function added to `draw()`); controls call `saveSettings({ field: value })` directly. Give the control a `data-testid`.
3. Use it where it matters: the content script and pages already get the current settings (`loadSettings()`, `onSettingsChange()`); the service worker should call `loadSettings()` when it needs them (no cached copy: rule 6).
4. Tests: a case in `tests/unit/settings.test.ts` (default and an invalid stored value); a step in the options e2e test (`tests/e2e/pages.spec.ts`, "saves settings as they change").

## Change a setting's shape (rename, split, new type)

1. Bump `SETTINGS_VERSION` in `src/shared/settings.ts` (e.g. 2 → 3) and change `Settings`.
2. Append to `MIGRATIONS`:

   ```ts
   {
     to: 3,
     // 3: `theme: 'system' | 'light' | 'dark'` became `appearance: { theme, compact }`.
     up: ({ theme, ...rest }) => ({ ...rest, appearance: { theme, compact: false } }),
   },
   ```

   It receives the raw stored object at the previous version and returns the next one; `sanitize()` runs after all migrations.
3. Add a test in `tests/unit/settings.test.ts` that stores a version-2 object and checks `migrateSettings()` returns the new shape, and keep the version-1 test: a user can jump from any old version.
4. The e2e test "migrates settings saved by version 1" shows how to check it in a real browser.

## Change the shape of stored data

Highlights (or the user's own data) live in `chrome.storage.local`, one item per page (`src/shared/highlights.ts`). To change the shape:

1. Add a `format` number to the stored record (e.g. `PageRecord.format?: number`, missing = 1).
2. Write `upgradePage(raw): PageRecord` next to it and call it in `getPage()` and `allPages()`, so old items are read correctly; write back the upgraded record on the next save (the service worker's `addHighlight`/`updateHighlight` already rewrite the item).
3. For a big change, migrate everything once in the service worker's `chrome.runtime.onInstalled` listener when `details.reason === 'update'` (`src/background/index.ts`), through the write queue in `router.ts`.
4. Export has its own `format` in `toJson()` (`src/shared/export.ts`): bump it if the exported shape changes.
5. Unit tests: store an old-format item in the fake's `local` map and read it back.

## Storage limits

- `chrome.storage.sync`: about 100 KB total, 8 KB per item, and write rate limits. Settings only; never user content.
- `chrome.storage.local`: about 10 MB. Past that, add the `unlimitedStorage` permission (`add-a-permission.md`) or move bulky data to IndexedDB in an extension page.
- `chrome.storage.session`: in memory for this browser session (service worker state that must survive the worker stopping).

## Verify

1. `npm run check` ends with `CODEPLATE CHECKS: PASS`.
2. `npm run shots -- options` (light and dark): the new control is in the right section and readable.
3. Try an upgrade by hand: load the previous build unpacked, set the settings, build the new version, reload the extension, and check the options page shows the migrated values.
4. Add the setting (and any migration) to `docs/project.md`.
