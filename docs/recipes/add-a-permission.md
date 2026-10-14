# Add a permission (and justify it)

Use when a feature needs an API or site access the extension doesn't have yet: reading tabs, notifications, alarms, downloads, a specific site's data, injecting a script on click.

Every permission is a line in the install warning and a field in the store's privacy form, and broad ones slow down review. Pick the narrowest option that works, and write down why.

## 1. Choose the narrowest option

| You need | Prefer | Avoid unless needed |
|---|---|---|
| Run code on the current page when the user clicks the button, menu or a shortcut | `activeTab` + `scripting` (no install warning for activeTab) | host patterns for all sites |
| Run on page load on a few sites | `content_scripts.matches` for those sites only | `<all_urls>` |
| Run on any site, but only for users who want it | `optional_host_permissions` + `chrome.permissions.request()` after a click | install-time host access |
| Know the current tab's URL | ask its content script (`page:info`), or `activeTab` | `tabs` ("Read your browsing history") |
| Call your server | host permission for that one origin (`https://api.example.com/*`), only if the server doesn't allow CORS from extensions | `<all_urls>` |
| Timers in the service worker | `alarms` | `setInterval` (dies with the worker) |
| Save a file | a download from a page (`src/ui/export.ts`), no permission | `downloads` |
| Show system notifications | `notifications` | |

Permissions that need a careful listing: `tabs`, `history`, `bookmarks`, `cookies`, `webRequest`, `scripting` with broad hosts, `identity`, `debugger` (not in the allowlist: rejected for most extensions), `nativeMessaging`.

## 2. Add it

1. `src/manifest.ts`: add it to `permissions` (or `optional_permissions`, `host_permissions`, `optional_host_permissions`) in `buildManifest()`. If Firefox doesn't support it, add it only in the Chrome branch.
2. `src/manifest.ts`: add a sentence to `REASONS` keyed by the permission or pattern: what the user gets and what is read or stored. Write it for a reviewer: "Shows a notification when a tracked price drops" beats "Needed for notifications". The unit test `tests/unit/manifest.test.ts` and `checks/manifest.mjs` fail without it, and a reason for something no longer asked for fails too.
3. If `checks/manifest.mjs` says it isn't in `ALLOWED`: add it to the set there, deliberately, after checking it isn't one of the permissions above that tend to fail review.
4. Optional permissions: request them from a click handler in a page (not the service worker, not after an `await`):

   ```ts
   const granted = await chrome.permissions.request({ origins: ['https://shop.example.com/*'] });
   ```

   Check with `chrome.permissions.contains()` before using the feature, and handle "no". For site access asked one site at a time, with the content script registered only where it's allowed and removed when access is taken back, use `src/shared/site-access.ts` and follow `optional-site-access.md`.
5. `@types/chrome` already has the API types; use them (no `any`).
6. Add the permission and its reason to `docs/project.md` under **Permissions**, and to the store listing's privacy tab when publishing (`publish-to-chrome-web-store.md`).

## 3. Test it

- Unit: add the API to `tests/fakes/chrome.ts` (only what you call, behaving like the real one) and test your code with it.
- E2E: the screen tests load the test build, `dist/chrome-e2e/`: the Chrome build plus host access to the test sites (`TEST_HOSTS` in `src/manifest.ts`: `localhost`, `127.0.0.1`, `*.test`) at install. Automation can't click the right-click menu (so it can't grant `activeTab`) or a permission prompt, but on the test pages the extension already has access, so code that checks `chrome.permissions.contains()` or uses `chrome.scripting` there runs as if the user had said yes. Test the "denied" path in a unit test (`fake.prompt = 'deny'`). Never add `TEST_HOSTS` to the store manifest: the `manifest` step fails if `dist/chrome` or `dist/firefox` has one.

## Verify

1. `npm run check` ends with `CODEPLATE CHECKS: PASS` (the `manifest` step prints notes for broad or sensitive permissions: read them).
2. `npm run build`, reload the unpacked extension, and look at the permission warning Chrome shows ("Details" → "Permissions"); tell the user what their users will see at install.
3. `docs/project.md` lists the permission and its reason.
