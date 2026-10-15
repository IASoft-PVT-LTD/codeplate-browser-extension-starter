// The user's settings: one typed object in chrome.storage.sync under "settings",
// with a version number and a list of migrations.
//
// To add or change a setting (docs/recipes/options-and-storage-migrations.md):
//   1. change `Settings` and `DEFAULT_SETTINGS`, and `sanitize()` for the new field
//   2. if old stored values need converting (a rename, a new shape), bump
//      SETTINGS_VERSION and add a migration to MIGRATIONS; never edit a
//      migration that has shipped (people's browsers have already run it)
//   3. tests/unit/settings.test.ts: a test for the migration
import { getItem, onItemChange, setItem } from './storage';

export const COLORS = ['yellow', 'green', 'blue', 'pink'] as const;
export type Color = (typeof COLORS)[number];
export const THEMES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];
export const EXPORT_FORMATS = ['markdown', 'json'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const SETTINGS_VERSION = 2;

export interface Settings {
  version: typeof SETTINGS_VERSION;
  /** The color of a new highlight. */
  defaultColor: Color;
  /** Show the small color toolbar when text is selected on a page. */
  selectionToolbar: boolean;
  /** Theme of the popup, side panel and options page. */
  theme: Theme;
  /** Sites (from siteOf() in url.ts) where the extension does nothing. */
  disabledSites: string[];
  /** The format the export buttons offer first. */
  exportFormat: ExportFormat;
}

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  defaultColor: 'yellow',
  selectionToolbar: true,
  theme: 'system',
  disabledSites: [],
  exportFormat: 'markdown',
};

const KEY = 'settings';

type Raw = Record<string, unknown>;
export interface Migration {
  /** The version this migration produces. */
  to: number;
  up: (old: Raw) => Raw;
}

/**
 * Oldest first. Version 1 (the first release) stored `color` and `toolbar`;
 * version 2 renamed them and added per-site disabling and the export format.
 */
export const MIGRATIONS: Migration[] = [
  {
    to: 2,
    up: ({ color, toolbar, ...rest }) => ({ ...rest, defaultColor: color, selectionToolbar: toolbar, disabledSites: [] }),
  },
];

const isOneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);

/** Keeps every valid field and replaces the rest with defaults. */
function sanitize(raw: Raw): Settings {
  const d = DEFAULT_SETTINGS;
  return {
    version: SETTINGS_VERSION,
    defaultColor: isOneOf(COLORS, raw.defaultColor) ? raw.defaultColor : d.defaultColor,
    selectionToolbar: typeof raw.selectionToolbar === 'boolean' ? raw.selectionToolbar : d.selectionToolbar,
    theme: isOneOf(THEMES, raw.theme) ? raw.theme : d.theme,
    disabledSites: Array.isArray(raw.disabledSites)
      ? [...new Set(raw.disabledSites.filter((s): s is string => typeof s === 'string' && s.length > 0))].sort()
      : d.disabledSites,
    exportFormat: isOneOf(EXPORT_FORMATS, raw.exportFormat) ? raw.exportFormat : d.exportFormat,
  };
}

/** Brings any stored value (or nothing) up to the current version. Pure; unit-tested. */
export function migrateSettings(stored: unknown): Settings {
  if (!stored || typeof stored !== 'object') return { ...DEFAULT_SETTINGS };
  let raw = { ...(stored as Raw) };
  // The first release didn't store a version.
  let version = typeof raw.version === 'number' ? raw.version : 1;
  for (const m of MIGRATIONS) {
    if (m.to > version) {
      raw = m.up(raw);
      version = m.to;
    }
  }
  return sanitize(raw);
}

/** Reads the settings, migrating (and saving) an older version first. */
export async function loadSettings(): Promise<Settings> {
  const stored = await getItem<Raw>('sync', KEY);
  const settings = migrateSettings(stored);
  if (stored && JSON.stringify(stored) !== JSON.stringify(settings)) await setItem('sync', KEY, settings);
  return settings;
}

export async function saveSettings(patch: Partial<Omit<Settings, 'version'>>): Promise<Settings> {
  const next = sanitize({ ...(await loadSettings()), ...patch });
  await setItem('sync', KEY, next);
  return next;
}

/** Calls `fn` with the new settings whenever they change, anywhere in the extension. */
export function onSettingsChange(fn: (settings: Settings) => void): () => void {
  return onItemChange<Raw>('sync', (k) => k === KEY, (_k, value) => fn(migrateSettings(value)));
}

export function isSiteEnabled(settings: Settings, site: string): boolean {
  return !settings.disabledSites.includes(site);
}

export async function setSiteEnabled(site: string, enabled: boolean): Promise<Settings> {
  const { disabledSites } = await loadSettings();
  const others = disabledSites.filter((s) => s !== site);
  return saveSettings({ disabledSites: enabled ? others : [...others, site] });
}
