// The store listing and privacy policy drafts (scripts/listing.mjs): every
// permission the manifest asks for is justified, and a re-run refreshes only
// the generated blocks.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { REASONS, buildManifest } from '../../src/manifest';

// A plain Node module (no types): imported by a path held in a variable.
const LISTING: string = '../../scripts/listing.mjs';
const load = () => import(/* @vite-ignore */ LISTING);

let dir = '';
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('listing drafts', () => {
  it('justify every permission and host pattern of the Chrome manifest with its reason', async () => {
    const { blocks, permissionsOf } = await load();
    const b = blocks();
    const p = permissionsOf(buildManifest('chrome'));
    for (const x of [...p.required, ...p.optional, ...p.hosts, ...p.optionalHosts]) {
      expect(b.listing.permissions).toContain(x);
      expect(b.listing.permissions).toContain(REASONS[x]);
    }
    expect(b.listing.basics).toContain(buildManifest('chrome').description as string);
    expect(b.listing.permissions).not.toContain('[TODO');
  });

  it('are created, keep edits outside the generated blocks, and refresh stale blocks', async () => {
    const { write, status, FILES } = await load();
    dir = mkdtempSync(join(tmpdir(), 'listing-'));
    expect(Object.values(status(dir))).toEqual(['missing', 'missing']);
    expect(Object.values(write(dir))).toEqual(['created', 'created']);
    expect(Object.values(status(dir))).toEqual(['todo', 'todo']);

    const file = join(dir, FILES.listing);
    const edited = readFileSync(file, 'utf8')
      .replace(/\[TODO: one sentence[^\]]*\]/, 'Highlights text on web pages.')
      .replace(/(<!-- listing:auto permissions -->\n)[\s\S]*?(\n<!-- \/listing:auto -->)/, '$1- **storage**: old reason$2');
    writeFileSync(file, edited);
    expect(status(dir)[FILES.listing]).toBe('stale');
    write(dir);
    const after = readFileSync(file, 'utf8');
    expect(after).toContain('Highlights text on web pages.');
    expect(after).not.toContain('old reason');
    expect(after).toContain(REASONS.storage);
  });
});
