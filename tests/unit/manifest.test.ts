// The manifest source (src/manifest.ts). The built files are checked again by
// checks/manifest.mjs (icons on disk, files the manifest names, the CSP).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pkg from '../../package.json' with { type: 'json' };
import { CREDIT } from '../../src/shared/brand';
import { CONTENT_MATCHES, REASONS, TEST_HOSTS, buildManifest } from '../../src/manifest';

type Manifest = {
  permissions: string[];
  host_permissions?: string[];
  optional_permissions?: string[];
  optional_host_permissions?: string[];
  content_scripts?: { matches: string[] }[];
  description: string;
  name: string;
  version: string;
  commands: Record<string, { suggested_key?: unknown }>;
};

describe('manifest', () => {
  for (const target of ['chrome', 'firefox'] as const) {
    const m = buildManifest(target) as unknown as Manifest;
    it(`${target}: every permission and host pattern has a reason`, () => {
      const asked = [
        ...m.permissions,
        ...(m.optional_permissions ?? []),
        ...(m.host_permissions ?? []),
        ...(m.optional_host_permissions ?? []),
        ...(m.content_scripts ?? []).flatMap((c) => c.matches),
      ];
      for (const p of asked) expect(REASONS[p], `REASONS["${p}"] in src/manifest.ts`).toBeTruthy();
    });
    it(`${target}: fits the store's limits`, () => {
      expect(m.name.length).toBeLessThanOrEqual(75);
      expect(m.description.length).toBeLessThanOrEqual(132);
      expect(Object.values(m.commands).filter((c) => c.suggested_key).length).toBeLessThanOrEqual(4);
    });
  }

  it('takes its version from package.json', () => {
    expect(buildManifest().version).toBe(pkg.version);
    expect(pkg.version).toMatch(/^\d+(\.\d+){0,3}$/);
  });

  it('runs the content script on web pages only', () => {
    expect(CONTENT_MATCHES).toEqual(['http://*/*', 'https://*/*']);
  });

  it('keeps reasons only for things the manifest asks for', () => {
    const used = new Set(['chrome', 'firefox'].flatMap((t) => {
      const m = buildManifest(t as 'chrome' | 'firefox') as unknown as Manifest;
      return [...m.permissions, ...(m.host_permissions ?? []), ...(m.optional_permissions ?? []), ...(m.optional_host_permissions ?? []), ...(m.content_scripts ?? []).flatMap((c) => c.matches)];
    }));
    expect(Object.keys(REASONS).filter((k) => !used.has(k))).toEqual([]);
  });
});

// The checks are plain Node modules (no types): imported by path.
const checks = (name: string) => import(/* @vite-ignore */ `../../checks/${name}`);

describe('test build (dist/chrome-e2e)', () => {
  it('is the Chrome manifest plus the test sites in host_permissions, and nothing else', () => {
    const store = buildManifest('chrome') as unknown as Manifest;
    const test = buildManifest('chrome', { e2e: true }) as unknown as Manifest;
    expect(test.host_permissions).toEqual([...(store.host_permissions ?? []), ...TEST_HOSTS]);
    expect({ ...test, host_permissions: store.host_permissions }).toEqual({ ...store, host_permissions: store.host_permissions });
  });

  it('no store build asks for a test site, and the test sites have no store reason', async () => {
    const { isTestHost } = await checks('manifest.mjs');
    for (const target of ['chrome', 'firefox'] as const) {
      const m = buildManifest(target) as unknown as Manifest;
      const hosts = [...(m.host_permissions ?? []), ...(m.optional_host_permissions ?? []), ...(m.content_scripts ?? []).flatMap((c) => c.matches)];
      expect(hosts.filter(isTestHost)).toEqual([]);
    }
    for (const h of TEST_HOSTS) {
      expect(isTestHost(h)).toBe(true);
      expect(REASONS[h]).toBeUndefined();
    }
    expect(['http://reading-room.test/*', 'http://localhost:9000/*', 'http://app.localhost/*'].every(isTestHost)).toBe(true);
    expect(['https://*/*', 'https://shop.example.com/*', 'https://testing.example.com/*'].some(isTestHost)).toBe(false);
  });
});

describe('shortcuts', () => {
  it('suggest no key that Chrome or Edge keeps for itself (it would show "Not set")', async () => {
    const { RESERVED_KEYS } = await checks('manifest.mjs');
    const m = buildManifest('chrome') as unknown as { commands: Record<string, { suggested_key?: Record<string, string> }> };
    const keys = Object.values(m.commands).flatMap((c) => Object.values(c.suggested_key ?? {}));
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter((k) => RESERVED_KEYS.has(k))).toEqual([]);
  });
});

describe('store placeholders (npm run zip)', () => {
  it("finds the template's name, homepage and Firefox id, and nothing once they're the user's", async () => {
    const { findPlaceholders, TEMPLATE } = await checks('placeholders.mjs');
    const all = (findPlaceholders({ packageName: TEMPLATE.packageName, firefox: true }) as string[]).join(' | ');
    expect(all).toMatch(/name is still/);
    expect(all).toMatch(/package\.json/);
    expect(all).toMatch(/BRAND\.homepage/);
    expect(all).toMatch(/GECKO_ID/);
    const brand = { name: 'Margin Notes Pro', homepage: 'https://marginnotes.app/help', privacy: '' };
    expect(findPlaceholders({ brand, geckoId: 'ext@marginnotes.app', packageName: 'margin-notes-pro', firefox: true })).toEqual([]);
    expect(findPlaceholders({ brand: { ...brand, homepage: 'https://www.example.com' }, packageName: 'margin-notes-pro' })).toHaveLength(1);
  });
});

describe('credit (free license)', () => {
  it('is the exact text, shown in the options page About section', () => {
    expect(CREDIT.text).toBe('Built with CodePlate (codeplate.io)');
    const options = readFileSync('src/pages/options.ts', 'utf8');
    expect(options).toMatch(/section\(\s*'about'/);
    expect(options).toContain('CREDIT.text');
  });
});
