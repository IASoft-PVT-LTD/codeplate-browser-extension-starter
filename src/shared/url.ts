// Page addresses. Highlights belong to a page "key": its URL without the
// #fragment and without tracking parameters, so the same article opened from a
// newsletter link and from a bookmark shows the same highlights.

/** Query parameters that only track where a click came from. */
const TRACKING = /^(utm_[a-z_]+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|_hsenc|_hsmi|ref_src)$/i;

/** Only http and https pages get the content script (see src/manifest.ts). */
export function isSupportedUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/** The key highlights are stored under: no hash, no tracking parameters, lower-case host. */
export function pageKey(url: string): string {
  const u = new URL(url);
  u.hash = '';
  for (const name of [...u.searchParams.keys()]) if (TRACKING.test(name)) u.searchParams.delete(name);
  u.hostname = u.hostname.toLowerCase();
  // URLSearchParams leaves a bare "?" when every parameter was removed.
  return u.toString().replace(/\?$/, '');
}

/** The site a page belongs to, for per-site enable/disable: the host without "www.". */
export function siteOf(url: string): string {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
}

/** A short form of a URL for lists: host + path, without the scheme. */
export function shortUrl(url: string): string {
  const u = new URL(url);
  const path = u.pathname === '/' ? '' : u.pathname;
  return `${u.hostname.replace(/^www\./, '')}${path}${u.search}`;
}
