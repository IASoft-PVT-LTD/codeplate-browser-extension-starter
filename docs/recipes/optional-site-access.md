# Optional site access (one site at a time)

Use when the extension shouldn't run on every site from the moment it's installed: the user turns it on for a site (or a single page), the browser asks once, and only then does the content script run there. Taking the access back stops it cleanly.

Why: with no host access at install there's no "Read and change all your data on all websites" warning, users trust it more, and the store review is quicker. Marginalia itself runs on every http(s) page (its content script is in the manifest), so it doesn't use this; the steps below switch an extension to it. They were applied to Marginalia in a copy of the template and `npm run check` passed.

The pieces are in `src/shared/site-access.ts` (tested in `tests/unit/site-access.test.ts`):

| Function | Does |
|---|---|
| `originPattern(url)`, `pagePattern(url)` | A page's site (`https://shop.example.com/*`) or just that page (`https://shop.example.com/item/42*`) as a match pattern; null for non-web pages. |
| `requestSiteAccess(patterns)` | Shows the browser's prompt. Only works **synchronously inside a click or key handler**, before any `await`; resolves true or false. |
| `hasSiteAccess(patterns)`, `grantedOrigins()` | What the extension may run on now (install-time host access plus what the user allowed). |
| `revokeSiteAccess(patterns)` | Takes access back (no click needed). |
| `syncSiteScripts(wanted, { js, css })` | Registers the content script (`chrome.scripting.registerContentScripts`) once per wanted pattern the extension has access to, and unregisters the rest. Only changes what differs; one run at a time. |
| `watchSiteAccess(sync)` | Calls `sync` after install or update, at browser start-up, and whenever access is granted or removed (also from the browser's own extension settings). |

## 1. The manifest

In `src/manifest.ts`:

1. Remove `content_scripts` from `buildManifest()` (the scripts are registered at runtime instead). Keep `content.js` and `content.css` in the build: `scripts/build.mjs` still makes them.
2. Add `optional_host_permissions: ['https://*/*', 'http://*/*']` to the common part (or only the sites the extension is for, such as `'https://*.example.com/*'`).
3. Add `'scripting'` to `permissions` in both the Chrome and the Firefox branch. Add `'activeTab'` too if the popup needs the current tab's address before access is granted (it shows no install warning).
4. Rewrite `REASONS` for each pattern and permission. Say that the access is optional and asked for one site at a time, for example: "Optional, asked for one site at a time when the user turns the extension on for it. On those sites only, the content script …". Rename `CONTENT_MATCHES` (now unused) to the list in step 2 and use it there.
5. `tests/unit/manifest.test.ts` checks `CONTENT_MATCHES`: update that test to the new list (rule 10: say so).

The `manifest` step then prints a note that the broad patterns are optional: nothing is asked at install.

## 2. The service worker: keep the scripts in step

At the top level of `src/background/index.ts`, synchronously (rule 6):

```ts
import { grantedOrigins, syncSiteScripts, watchSiteAccess } from '../shared/site-access';

const SCRIPT = { js: ['content.js'], css: ['content.css'] };
watchSiteAccess(async () => syncSiteScripts(await grantedOrigins(), SCRIPT));
```

That's per site: every allowed site gets the script. **Per page** instead: pass the pages that need it, from your data, for example `syncSiteScripts(saved.map((p) => pagePattern(p.url)!), SCRIPT)`, and also call that sync after the router changes the list (in `src/background/router.ts`, after the write). The user still allows the whole site (`originPattern`): the browser's prompt is per site.

## 3. Ask inside a click

In a page (the popup, usually), from the button's own handler, before any `await`:

```ts
import { hasSiteAccess, originPattern, requestSiteAccess } from '../shared/site-access';

// Read before drawing: with activeTab, the popup may read the current tab's address.
const url = tabId === undefined ? undefined : (await chrome.tabs.get(tabId).catch(() => undefined))?.url;
const site = url ? originPattern(url) : null;
const allowed = site ? await hasSiteAccess([site]) : false;

// In the "Turn on for this site" button:
onclick: () => {
  const asked = requestSiteAccess([site!]); // first line of the handler: no await before it
  void asked.then((ok) => {
    if (ok) void startHere();
  });
},
```

The service worker hears `permissions.onAdded` and registers the script for the next page loads.

## 4. Start it on the open tab now

Registered scripts run on pages loaded later. For the tab that's already open:

```ts
async function startHere(): Promise<void> {
  await chrome.scripting.insertCSS({ target: { tabId: tabId! }, files: ['content.css'] });
  await chrome.scripting.executeScript({ target: { tabId: tabId! }, files: ['content.js'] });
  // then ask the content script again (pageInfo()) and redraw
}
```

## 5. Taking it back

Offer "Stop on this site" or a list of allowed sites (the options page's Sites section): call `revokeSiteAccess([originPattern(url)!])`. `permissions.onRemoved` fires, `watchSiteAccess` syncs, and the script is unregistered. The page that's open keeps the script until it's reloaded; tell the user so, or have the content script stop itself (`TabApi` message).

Users can also remove the access in the browser (the extension's details page, "Site access"); the same event fires, so nothing else is needed.

## 6. Firefox

Firefox supports `optional_host_permissions`, `chrome.permissions.request()` (inside a click, too) and `chrome.scripting.registerContentScripts()`. In Firefox, even install-time host permissions can be turned off by the user in about:addons; `watchSiteAccess` handles that the same way.

## Test it

- **Unit:** `tests/unit/site-access.test.ts` shows the pattern: the fake `chrome` (`tests/fakes/chrome.ts`) knows what the manifest declares (`fake.hosts({ optional: [...] })`), refuses `permissions.request()` outside a click (`fake.click(() => …)`, a gesture until its first `await`), answers the prompt as you set (`fake.prompt = 'deny'`), and keeps the registered scripts (`fake.scripts`). Test your own "turn on", "no thanks" and "remove" paths there, and the per-page list if you sync per page.
- **E2E:** automation can't click the browser's prompt. The screen tests load the test build, `dist/chrome-e2e/`, which is allowed on the test sites (`localhost`, `*.test`; `TEST_HOSTS` in `src/manifest.ts`) at install, so `grantedOrigins()` includes them and `watchSiteAccess` registers the content script on the test pages with no prompt. The store build never has those sites (the `manifest` step checks).
- **By hand:** load `dist/chrome` unpacked, open a site, click the button, accept the prompt, check the page; reload it; remove the access in the browser's extension details; reload again. Tell the user this is checked by hand only.

## Verify

1. `npm run check` ends with `CODEPLATE CHECKS: PASS`; the `manifest` step's notes say the broad patterns are optional.
2. `npm run build`, load `dist/chrome` unpacked, and look at "Details" → "Site access": "On click" or "On specific sites", not "On all sites". Tell the user what their users will see.
3. The by-hand pass above, on one or two real sites.
4. `npm run listing` refreshed the permission justifications, and `docs/project.md` records the new permission model.
