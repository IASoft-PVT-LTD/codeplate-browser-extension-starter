# Sync with a backend

Use when data should follow the user across browsers or devices, be shared, or be processed on a server (accounts, an AI call, a team list).

First check whether `chrome.storage.sync` is enough: it follows the user's browser account for free, but holds only about 100 KB. Highlights and most user content need a real server.

## Ground rules

- **No secrets in the extension** (AGENTS.md, rule 8). An API key in the code is public. The extension talks to the user's own server; the server holds third-party keys.
- **No remote code** (rule 2). The server sends data (JSON), never JavaScript to run.
- **Say it in the privacy fields.** Sending page content or personal data to a server changes the Chrome Web Store privacy answers and needs a privacy policy (`publish-to-chrome-web-store.md`). Update the About text in `src/pages/options.ts` and `docs/project.md`.

## 1. The server

Any HTTPS API works. CodePlate's web SaaS starter (accounts, a database, billing) is a good fit: add JSON routes for the extension, e.g. `GET /api/ext/highlights?since=…` and `POST /api/ext/highlights`. Allow the extension's origin in CORS: `chrome-extension://<id>` (find the id at `chrome://extensions`; it's fixed once published, or pin it in development with a `key` in the manifest).

## 2. Signing in

Prefer one of these, in order:
1. **The website's own session:** the user signs in on the site; the extension calls the API with `credentials: 'include'` from an extension page or the service worker. Needs a host permission for the API origin (`add-a-permission.md`) and `SameSite=None; Secure` cookies.
2. **A token from a sign-in page:** open the site's `/ext/connect` page with `chrome.tabs.create`; after sign-in, that page sends a short-lived token to the extension with `chrome.runtime.sendMessage(EXTENSION_ID, …)` (declare the site in `externally_connectable.matches` in `src/manifest.ts`). Store the token in `chrome.storage.local`, never `sync`.
3. **OAuth with `chrome.identity.launchWebAuthFlow`** (permission `identity`) for third-party providers.

## 3. The sync code

1. `src/shared/api.ts`: one typed `api<T>(path, init)` helper with the base URL (a constant in `src/shared/brand.ts` or a setting) that adds the token and throws readable errors.
2. Sync in the service worker (`src/background/sync.ts`): on `chrome.alarms` (`alarms` permission; every 15 minutes is plenty) and after each local write in `router.ts`, push changes and pull new ones. Keep a `lastSyncedAt` in `chrome.storage.local`. Give highlights `updatedAt` (they have it) and resolve conflicts by newest `updatedAt` per id; record deletions as tombstones (`deletedAt`) so they sync too.
3. Never block the UI on the network: local writes stay instant; sync is background work. Show sync state (last synced, signed out, error) in the options page.
4. Offline: catch fetch errors and retry on the next alarm.

## 4. Test it

- Unit: a fake `fetch` (`vi.stubGlobal('fetch', …)`) and the fake `chrome`: push, pull, conflict, deletion, signed out.
- E2E: keep the checks offline. Serve a fake API from `scripts/serve-pages.mjs` (add `/api/…` routes) and point the extension at it in tests.

## Verify

1. `npm run check` ends with `CODEPLATE CHECKS: PASS`, with no step reaching the internet.
2. `npm run shots -- options`: the sign-in and sync state are clear in both themes.
3. With the user's real server: sign in, create data in two browser profiles, and watch it meet. Tell the user what was tested by hand.
4. `docs/project.md` lists the server, what is sent, and the privacy policy URL.
