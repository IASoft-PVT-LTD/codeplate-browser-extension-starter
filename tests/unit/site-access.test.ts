// Optional per-site access (src/shared/site-access.ts) over the fake
// permissions and scripting APIs: asking inside a click, registering the
// content script only where allowed, and cleaning up when access is taken back.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  grantedOrigins,
  hasSiteAccess,
  originPattern,
  pagePattern,
  requestSiteAccess,
  revokeSiteAccess,
  siteScriptId,
  syncSiteScripts,
  watchSiteAccess,
} from '../../src/shared/site-access';
import { installFakeChrome, patternCovers } from '../fakes/chrome';

const OPTIONAL = ['https://*/*', 'http://*/*'];
const SHOP = 'https://shop.example.com/item/42?color=teal#reviews';
const SHOP_SITE = 'https://shop.example.com/*';
const SHOP_PAGE = 'https://shop.example.com/item/42*';
const JS = { js: ['content.js'] };

let fake: ReturnType<typeof installFakeChrome>;
beforeEach(() => {
  fake = installFakeChrome();
  fake.hosts({ optional: OPTIONAL });
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('patterns', () => {
  it('turns an address into a site or a page pattern, http(s) only, without port, query or hash', () => {
    expect(originPattern(SHOP)).toBe(SHOP_SITE);
    expect(originPattern('http://localhost:8891/a.html')).toBe('http://localhost/*');
    expect(pagePattern(SHOP)).toBe(SHOP_PAGE);
    for (const bad of ['chrome://extensions/', 'file:///C:/a.html', 'not a url']) {
      expect(originPattern(bad)).toBeNull();
      expect(pagePattern(bad)).toBeNull();
    }
  });

  it('the fake compares patterns like the browser', () => {
    expect(patternCovers('https://*/*', SHOP_SITE)).toBe(true);
    expect(patternCovers(SHOP_SITE, SHOP_PAGE)).toBe(true);
    expect(patternCovers(SHOP_PAGE, SHOP_SITE)).toBe(false);
    expect(patternCovers('https://*.example.com/*', SHOP_SITE)).toBe(true);
    expect(patternCovers('http://*/*', SHOP_SITE)).toBe(false);
  });
});

describe('asking for a site', () => {
  it('is allowed inside a click, and then the site counts as granted', async () => {
    expect(await hasSiteAccess([SHOP_SITE])).toBe(false);
    const asked = fake.click(() => requestSiteAccess([SHOP_SITE]));
    expect(await asked).toBe(true);
    expect(await hasSiteAccess([SHOP_SITE, SHOP_PAGE])).toBe(true);
    expect(await hasSiteAccess(['https://other.example.org/*'])).toBe(false);
    expect(await grantedOrigins()).toEqual([SHOP_SITE]);
  });

  it('is refused outside a click, and after an await inside one', async () => {
    expect(await requestSiteAccess([SHOP_SITE])).toBe(false);
    const late = fake.click(async () => {
      await Promise.resolve();
      return requestSiteAccess([SHOP_SITE]);
    });
    expect(await late).toBe(false);
    expect(await hasSiteAccess([SHOP_SITE])).toBe(false);
  });

  it('resolves false when the user says no, or the manifest does not declare the pattern', async () => {
    fake.prompt = 'deny';
    expect(await fake.click(() => requestSiteAccess([SHOP_SITE]))).toBe(false);
    fake.prompt = 'allow';
    expect(await fake.click(() => requestSiteAccess(['ftp://files.example.com/*']))).toBe(false);
  });
});

describe('content scripts per site or page', () => {
  it('registers one script per allowed pattern only, and is idempotent', async () => {
    await fake.click(() => requestSiteAccess([SHOP_SITE]));
    const wanted = [SHOP_PAGE, 'https://news.example.org/story*'];
    const first = await syncSiteScripts(wanted, JS);
    expect(first).toEqual({ added: [siteScriptId(SHOP_PAGE)], removed: [] });
    expect([...fake.scripts.values()]).toEqual([{ id: siteScriptId(SHOP_PAGE), matches: [SHOP_PAGE], js: ['content.js'], runAt: 'document_idle', allFrames: false }]);
    expect(await syncSiteScripts(wanted, JS)).toEqual({ added: [], removed: [] });
  });

  it('removes scripts no longer wanted, re-registers changed ones, and leaves other prefixes alone', async () => {
    await fake.click(() => requestSiteAccess(['https://*/*']));
    await chrome.scripting.registerContentScripts([{ id: 'other-1', matches: ['https://a.example.com/*'], js: ['other.js'] }]);
    await syncSiteScripts(['https://a.example.com/*', 'https://b.example.com/*'], JS);
    const r = await syncSiteScripts(['https://b.example.com/*'], { js: ['content.js'], css: ['content.css'] });
    expect(r.removed.sort()).toEqual([siteScriptId('https://a.example.com/*'), siteScriptId('https://b.example.com/*')].sort());
    expect(r.added).toEqual([siteScriptId('https://b.example.com/*')]);
    expect([...fake.scripts.keys()].sort()).toEqual(['other-1', siteScriptId('https://b.example.com/*')].sort());
    expect(fake.scripts.get(siteScriptId('https://b.example.com/*'))?.css).toEqual(['content.css']);
  });

  it('runs one sync at a time, so events close together never register an id twice', async () => {
    await fake.click(() => requestSiteAccess([SHOP_SITE]));
    await expect(Promise.all([syncSiteScripts([SHOP_SITE], JS), syncSiteScripts([SHOP_SITE], JS), syncSiteScripts([SHOP_SITE], JS)])).resolves.toHaveLength(3);
    expect(fake.scripts.size).toBe(1);
  });

  it('install-time host access (the e2e build) counts as allowed, and cannot be revoked', async () => {
    fake.hosts({ required: ['http://localhost/*', 'http://*.test/*'], optional: OPTIONAL });
    await syncSiteScripts(['http://localhost/*', 'http://reading-room.test/article.html*'], JS);
    expect(fake.scripts.size).toBe(2);
    expect(await revokeSiteAccess(['http://localhost/*'])).toBe(false);
  });
});

describe('taking access back', () => {
  it('unregisters the script when the user removes a site (watchSiteAccess)', async () => {
    const wanted = () => grantedOrigins();
    const sync = vi.fn(async () => syncSiteScripts(await wanted(), JS));
    watchSiteAccess(sync);

    await fake.click(() => requestSiteAccess([SHOP_SITE]));
    await vi.waitFor(() => expect(fake.scripts.size).toBe(1));

    expect(await revokeSiteAccess([SHOP_SITE])).toBe(true);
    await vi.waitFor(() => expect(fake.scripts.size).toBe(0));
    expect(await hasSiteAccess([SHOP_SITE])).toBe(false);

    // Also after install/update and at browser start-up.
    fake.api.runtime.onInstalled.dispatch({ reason: 'update' });
    fake.api.runtime.onStartup.dispatch();
    expect(sync).toHaveBeenCalledTimes(4);
  });
});
