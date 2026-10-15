// Optional per-site access: no site access at install; the extension asks for
// one site at a time when the user wants a feature there, runs its content
// script only on the pages it was allowed, and stops cleanly when the access is
// taken back. Marginalia doesn't use it (its content script runs on every
// http(s) page); docs/recipes/optional-site-access.md switches an extension to
// this model step by step. Tested in tests/unit/site-access.test.ts.
//
//   manifest   optional_host_permissions: ['https://*/*', 'http://*/*'], and
//              'scripting' in permissions; no content_scripts for those pages
//   a page     button.onclick = () => {                  // the user's click
//                const ok = requestSiteAccess([originPattern(url)!]);   // no await before this
//                void ok.then((granted) => …);
//              };
//   worker     watchSiteAccess(() => syncSiteScripts(wanted(), { js: ['content.js'] }));
//              (at the top level of src/background/index.ts)
//
// Works in the service worker and in the extension's pages (popup, side panel,
// options). Both chrome.permissions and chrome.scripting exist in Firefox too.

/** An http(s) page's site as a match pattern: `https://shop.example.com/*`. Null for other pages. */
export function originPattern(url: string): string | null {
  const u = parse(url);
  return u ? `${u.protocol}//${u.hostname}/*` : null;
}

/**
 * One page (any query string) as a match pattern: `https://shop.example.com/item/42*`.
 * Null for other pages. For a content script on that page only.
 */
export function pagePattern(url: string): string | null {
  const u = parse(url);
  return u ? `${u.protocol}//${u.hostname}${u.pathname}*` : null;
}

function parse(url: string): URL | null {
  try {
    const u = new URL(url);
    // Match patterns can't name a port: a pattern matches every port of its host.
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

/**
 * Asks the user to allow the extension on these sites (match patterns covered
 * by `optional_host_permissions`). The browser shows its prompt only while
 * handling a click or key press, so call this **synchronously from the click
 * handler, before any `await`**; otherwise the browser refuses and this
 * resolves false. Resolves true if allowed (at once, without a prompt, if it
 * already was), false if the user said no or the browser refused.
 */
export function requestSiteAccess(patterns: string[]): Promise<boolean> {
  try {
    return chrome.permissions.request({ origins: patterns }).catch((e: unknown) => refused(e));
  } catch (e) {
    return Promise.resolve(refused(e));
  }
}

function refused(e: unknown): false {
  // Not in a user gesture, or a pattern the manifest doesn't declare: a bug to fix, not a "no".
  console.warn('Site access request refused:', e instanceof Error ? e.message : e);
  return false;
}

/** Whether the extension may run on all of these sites or pages now (granted at install or later). */
export function hasSiteAccess(patterns: string[]): Promise<boolean> {
  return chrome.permissions.contains({ origins: patterns }).catch(() => false);
}

/**
 * Takes access back (the user's "Remove" or "Stop on this site"). Needs no
 * click. Resolves false for access the manifest grants at install
 * (`host_permissions`), which can't be removed at runtime.
 * chrome.permissions.onRemoved fires, so watchSiteAccess() unregisters the scripts.
 */
export function revokeSiteAccess(patterns: string[]): Promise<boolean> {
  return chrome.permissions.remove({ origins: patterns }).catch(() => false);
}

/** The http(s) sites the extension may run on now: install-time host access plus what the user allowed. */
export async function grantedOrigins(): Promise<string[]> {
  const { origins = [] } = await chrome.permissions.getAll();
  return origins.filter((o) => /^(https?|\*):\/\//.test(o));
}

export interface SiteScriptOptions {
  /** Files from the build, as in the manifest's content_scripts. */
  js: string[];
  css?: string[];
  runAt?: 'document_start' | 'document_end' | 'document_idle';
  allFrames?: boolean;
  /** Script ids start with this, so other registered scripts are left alone. */
  prefix?: string;
}

/** A stable, short script id for a pattern (FNV-1a). */
export function siteScriptId(pattern: string, prefix = 'site-'): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < pattern.length; i++) h = Math.imul(h ^ pattern.charCodeAt(i), 0x01000193) >>> 0;
  return `${prefix}${h.toString(36)}`;
}

// Each sync waits for the one before, so two events close together can't
// register the same id twice (the browser throws on a duplicate id). It's only
// ordering: nothing is kept between service worker restarts (rule 6).
let queue: Promise<unknown> = Promise.resolve();

/**
 * Makes the registered content scripts match `wanted` (match patterns: sites
 * from originPattern() or single pages from pagePattern()): one registration
 * per pattern the extension has access to, and none for the rest. Scripts with
 * other id prefixes are left alone. Safe to call as often as you like: it only
 * changes what differs. Resolves with the ids it added and removed.
 */
export function syncSiteScripts(wanted: string[], options: SiteScriptOptions): Promise<{ added: string[]; removed: string[] }> {
  const run = queue.then(() => sync(wanted, options));
  queue = run.catch(() => undefined);
  return run;
}

async function sync(wanted: string[], { js, css, runAt = 'document_idle', allFrames = false, prefix = 'site-' }: SiteScriptOptions) {
  const allowed = new Map<string, string>();
  for (const pattern of new Set(wanted)) if (await hasSiteAccess([pattern])) allowed.set(siteScriptId(pattern, prefix), pattern);

  const registered = (await chrome.scripting.getRegisteredContentScripts()).filter((s) => s.id.startsWith(prefix));
  const same = (s: chrome.scripting.RegisteredContentScript) =>
    allowed.get(s.id) === s.matches?.[0] && s.matches?.length === 1 && String(s.js) === String(js) && String(s.css ?? []) === String(css ?? []);
  const removed = registered.filter((s) => !same(s)).map((s) => s.id);
  if (removed.length) await chrome.scripting.unregisterContentScripts({ ids: removed });

  const kept = new Set(registered.filter(same).map((s) => s.id));
  const add = [...allowed].filter(([id]) => !kept.has(id));
  if (add.length) {
    await chrome.scripting.registerContentScripts(
      add.map(([id, pattern]) => ({ id, matches: [pattern], js, ...(css?.length ? { css } : {}), runAt, allFrames })),
    );
  }
  return { added: add.map(([id]) => id), removed };
}

/**
 * Runs `sync` whenever the scripts may need to change: after install or an
 * update, at browser start-up, and when site access is granted or taken back
 * (by the extension, or by the user in the browser's extension settings).
 * Call it once, at the top level of the service worker.
 */
export function watchSiteAccess(sync: () => Promise<unknown>): void {
  const run = () => void sync().catch((e: unknown) => console.warn('Updating the site scripts failed:', e));
  chrome.runtime.onInstalled.addListener(run);
  chrome.runtime.onStartup.addListener(run);
  chrome.permissions.onAdded.addListener(run);
  chrome.permissions.onRemoved.addListener(run);
}
