// The right-click menu and the keyboard shortcuts. Both end up asking the
// tab's content script to highlight its selection, or opening the side panel.
// The shortcuts are declared in src/manifest.ts (`commands`); users change the
// keys at chrome://extensions/shortcuts.
import { BRAND } from '../shared/brand';
import { sendToTab } from '../shared/messages';

export const MENU = {
  highlight: 'highlight',
  highlightWithNote: 'highlight-with-note',
  openPanel: 'open-side-panel',
} as const;

/** Called on install and update: menus persist, so they're created once (removeAll first keeps updates clean). */
export async function createMenus(): Promise<void> {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({ id: MENU.highlight, title: 'Highlight selection', contexts: ['selection'] });
  chrome.contextMenus.create({ id: MENU.highlightWithNote, title: 'Highlight with a note…', contexts: ['selection'] });
  if (chrome.sidePanel) chrome.contextMenus.create({ id: MENU.openPanel, title: `Open ${BRAND.name} side panel`, contexts: ['action'] });
}

async function highlightIn(tab: chrome.tabs.Tab | undefined, withNote: boolean): Promise<void> {
  if (tab?.id === undefined) return;
  try {
    await sendToTab(tab.id, 'page:highlight-selection', { withNote });
  } catch {
    // No content script: a page the extension can't run on (the browser's own
    // pages, the Web Store) or one opened before the extension was installed.
  }
}

async function openPanel(tab: chrome.tabs.Tab | undefined): Promise<void> {
  // Must be called right away in the click or key handler (Chrome needs the user's gesture).
  if (chrome.sidePanel && tab?.windowId !== undefined) await chrome.sidePanel.open({ windowId: tab.windowId });
}

export function onMenuClick(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab): Promise<void> {
  if (info.menuItemId === MENU.openPanel) return openPanel(tab);
  if (info.menuItemId === MENU.highlight || info.menuItemId === MENU.highlightWithNote) return highlightIn(tab, info.menuItemId === MENU.highlightWithNote);
  return Promise.resolve();
}

export function onCommand(command: string, tab?: chrome.tabs.Tab): Promise<void> {
  if (command === 'highlight-selection') return highlightIn(tab, false);
  if (command === 'open-side-panel') return openPanel(tab);
  return Promise.resolve();
}
