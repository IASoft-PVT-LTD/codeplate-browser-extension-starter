// Shared start-up for the extension's pages (popup, side panel, options):
// the theme from settings, and which tab a page is about.
import { sendToTab, type PageInfo } from '../shared/messages';
import { loadSettings, onSettingsChange, type Settings, type Theme } from '../shared/settings';

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

/** Loads the settings, applies the theme, and keeps it current. */
export async function startPage(): Promise<Settings> {
  const settings = await loadSettings();
  applyTheme(settings.theme);
  onSettingsChange((s) => applyTheme(s.theme));
  return settings;
}

/**
 * The tab a popup or side panel is about: `?tab=<id>` if given (the e2e tests
 * and `npm run shots` open these pages in a normal tab and point them at a
 * page), otherwise the active tab of this window.
 */
export async function targetTabId(): Promise<number | undefined> {
  const param = new URLSearchParams(location.search).get('tab');
  if (param) return Number(param);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

/**
 * Opens the side panel (Chrome, Edge) or the sidebar (Firefox). Call it
 * straight from a click handler, before any `await`: browsers only allow it
 * as the direct result of a click or key press.
 */
export function openSidePanel(windowId: number | undefined): boolean {
  const firefox = (globalThis as { browser?: { sidebarAction?: { open(): Promise<void> } } }).browser?.sidebarAction;
  if (firefox) {
    void firefox.open();
    return true;
  }
  if (!chrome.sidePanel || windowId === undefined) return false;
  void chrome.sidePanel.open({ windowId });
  return true;
}

export function canOpenSidePanel(): boolean {
  return Boolean(chrome.sidePanel || (globalThis as { browser?: { sidebarAction?: unknown } }).browser?.sidebarAction);
}

/** Asks a tab's content script about its page; undefined where the extension can't run. */
export async function pageInfo(tabId: number | undefined): Promise<PageInfo | undefined> {
  if (tabId === undefined) return undefined;
  try {
    return await sendToTab(tabId, 'page:info', {});
  } catch {
    // chrome:// and edge:// pages, the web stores, the new tab page, PDFs, and
    // tabs opened before the extension was installed (until they're reloaded).
    return undefined;
  }
}
