import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  MIGRATIONS,
  SETTINGS_VERSION,
  isSiteEnabled,
  loadSettings,
  migrateSettings,
  onSettingsChange,
  saveSettings,
  setSiteEnabled,
} from '../../src/shared/settings';
import { installFakeChrome } from '../fakes/chrome';

let fake: ReturnType<typeof installFakeChrome>;
beforeEach(() => {
  fake = installFakeChrome();
});

describe('migrateSettings', () => {
  it('gives the defaults when nothing is stored', () => {
    expect(migrateSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(migrateSettings('nonsense')).toEqual(DEFAULT_SETTINGS);
  });

  it('migrates version 1 (no version field, color/toolbar) to the current version', () => {
    const v1 = { color: 'green', toolbar: false, theme: 'dark' };
    expect(migrateSettings(v1)).toEqual({ ...DEFAULT_SETTINGS, defaultColor: 'green', selectionToolbar: false, theme: 'dark' });
  });

  it('keeps valid fields and replaces invalid ones with defaults', () => {
    const got = migrateSettings({ version: 2, defaultColor: 'purple', theme: 'dark', disabledSites: ['b.com', 'a.com', 'a.com', 3, ''], selectionToolbar: 'yes' });
    expect(got.defaultColor).toBe(DEFAULT_SETTINGS.defaultColor);
    expect(got.theme).toBe('dark');
    expect(got.disabledSites).toEqual(['a.com', 'b.com']);
    expect(got.selectionToolbar).toBe(true);
  });

  it('has migrations in order, ending at SETTINGS_VERSION', () => {
    const versions = MIGRATIONS.map((m) => m.to);
    expect([...versions].sort((a, b) => a - b)).toEqual(versions);
    expect(versions.at(-1)).toBe(SETTINGS_VERSION);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it('never goes backwards: a newer stored version is kept as far as it is valid', () => {
    expect(migrateSettings({ ...DEFAULT_SETTINGS, version: 99, theme: 'light' }).theme).toBe('light');
  });
});

describe('stored settings', () => {
  it('loads defaults without writing anything', async () => {
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(fake.sync.size).toBe(0);
  });

  it('migrates and saves an old stored value on load', async () => {
    fake.sync.set('settings', { color: 'pink', toolbar: true });
    const s = await loadSettings();
    expect(s.defaultColor).toBe('pink');
    expect(fake.sync.get('settings')).toEqual(s);
  });

  it('saves a change and tells listeners', async () => {
    const seen = vi.fn();
    onSettingsChange(seen);
    const s = await saveSettings({ theme: 'dark' });
    expect(s.theme).toBe('dark');
    expect((await loadSettings()).theme).toBe('dark');
    expect(seen).toHaveBeenCalledWith(expect.objectContaining({ theme: 'dark', version: SETTINGS_VERSION }));
  });

  it('turns a site off and on again', async () => {
    let s = await setSiteEnabled('example.com', false);
    expect(isSiteEnabled(s, 'example.com')).toBe(false);
    expect(isSiteEnabled(s, 'other.org')).toBe(true);
    s = await setSiteEnabled('example.com', false);
    expect(s.disabledSites).toEqual(['example.com']);
    s = await setSiteEnabled('example.com', true);
    expect(s.disabledSites).toEqual([]);
  });
});
