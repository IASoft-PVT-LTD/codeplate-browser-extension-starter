// The service worker: the extension's background. Chrome starts it when an
// event it listens to fires and stops it after about 30 seconds of quiet, so:
//   - register every listener at the top level, synchronously (a listener added
//     later, after an await, misses the event that woke the worker)
//   - keep no state in variables; anything that must survive goes in
//     chrome.storage (src/shared/storage.ts)
import { BRAND } from '../shared/brand';
import { onEvent } from '../shared/messages';
import { loadSettings } from '../shared/settings';
import { createMenus, onCommand, onMenuClick } from './menus';
import { listener } from './router';

chrome.runtime.onInstalled.addListener(() => {
  void createMenus();
  // Runs the settings migrations once after an update (src/shared/settings.ts).
  void loadSettings();
});

chrome.runtime.onMessage.addListener(listener);
chrome.contextMenus.onClicked.addListener((info, tab) => void onMenuClick(info, tab));
chrome.commands.onCommand.addListener((command, tab) => void onCommand(command, tab));

// The toolbar button opens the popup; the side panel opens from the popup,
// the right-click menu on the button, or Alt+Shift+S.
chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => undefined);

// The badge on the toolbar button: how many highlights this tab's page has.
onEvent('page:ready', ({ count }, sender) => {
  const tabId = sender.tab?.id;
  if (tabId === undefined) return;
  void chrome.action.setBadgeText({ tabId, text: count ? String(count) : '' });
  void chrome.action.setBadgeBackgroundColor({ tabId, color: BRAND.badgeColor });
});
