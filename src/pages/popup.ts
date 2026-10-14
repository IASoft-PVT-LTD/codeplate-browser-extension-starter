// The popup: opens from the toolbar button (or Alt+Shift+M). It shows the
// current page's highlights with a search box, the per-site on/off switch,
// export, and buttons for the side panel and the settings.
// A popup closes as soon as it loses focus, and starts from scratch each time.
import { BRAND } from '../shared/brand';
import { getPage, onHighlightsChange, searchHighlights, type PageRecord } from '../shared/highlights';
import { onEvent, sendToTab, type PageInfo } from '../shared/messages';
import { isSiteEnabled, onSettingsChange, setSiteEnabled } from '../shared/settings';
import { debounce, el, replace } from '../ui/dom';
import { exportButtons } from '../ui/export';
import { emptyState, highlightCard } from '../ui/highlight-list';
import { icon, logo } from '../ui/icons';
import { canOpenSidePanel, openSidePanel, pageInfo, startPage, targetTabId } from '../ui/page';

const app = document.getElementById('app')!;
document.title = BRAND.name;

await startPage();
const tabId = await targetTabId();
// Read now: opening the side panel must happen right in the click handler.
const windowId = tabId === undefined ? undefined : (await chrome.tabs.get(tabId).catch(() => undefined))?.windowId;
let info = await pageInfo(tabId);
let query = '';

const list = el('div', { class: 'list scroll', 'data-testid': 'highlight-list' });
const footerCount = el('span', { class: 'grow muted', 'data-testid': 'count' });

function topbar(): HTMLElement {
  return el(
    'header',
    { class: 'topbar' },
    logo(26),
    el('h1', { class: 'name' }, BRAND.name),
    el('span', { class: 'grow' }),
    canOpenSidePanel()
      ? el(
          'button',
          {
            class: 'icon-btn',
            title: 'Open the side panel',
            'aria-label': 'Open the side panel',
            'data-testid': 'open-side-panel',
            onclick: () => openSidePanel(windowId) && window.close(),
          },
          icon('panel'),
        )
      : null,
    el('button', { class: 'icon-btn', title: 'Settings', 'aria-label': 'Settings', 'data-testid': 'open-options', onclick: () => void chrome.runtime.openOptionsPage() }, icon('settings')),
  );
}

function siteRow(page: PageInfo): HTMLElement {
  const toggle = el('input', {
    type: 'checkbox',
    role: 'switch',
    checked: page.enabled,
    'aria-label': `${BRAND.name} on ${page.site}`,
    'data-testid': 'site-toggle',
    onchange: (e: Event) => void setSiteEnabled(page.site, (e.target as HTMLInputElement).checked),
  });
  return el(
    'div',
    { class: 'site' },
    el('span', { class: 'muted' }, icon('globe', 16)),
    el('div', { class: 'grow', style: { minWidth: '0' } }, el('div', { class: 'host' }, page.site), el('div', { class: 'state' }, page.enabled ? 'On for this site' : 'Off for this site')),
    el('label', { class: 'switch' }, toggle, el('span', {})),
  );
}

async function drawList(): Promise<void> {
  if (!info) return;
  const page: PageRecord = (await getPage(info.url)) ?? { url: info.url, title: info.title, highlights: [] };
  const hits = searchHighlights([page], query).map((h) => h.highlight);
  const total = page.highlights.length;
  footerCount.textContent = `${total} highlight${total === 1 ? '' : 's'} on this page`;
  if (!total) {
    replace(
      list,
      emptyState('No highlights yet', ['Select text on the page and pick a color, or press ', el('kbd', {}, 'Alt'), '+', el('kbd', {}, 'Shift'), '+', el('kbd', {}, 'H'), '.']),
    );
    return;
  }
  if (!hits.length) {
    replace(list, emptyState('Nothing matches', [`No highlight on this page contains "${query}".`]));
    return;
  }
  replace(
    list,
    hits.map((h) =>
      highlightCard(h, {
        missing: info?.missing,
        onOpen: (x) => tabId !== undefined && void sendToTab(tabId, 'page:scroll-to', { id: x.id }),
      }),
    ),
  );
}

function draw(): void {
  if (!info) {
    replace(
      app,
      topbar(),
      emptyState(`${BRAND.name} can't run here`, ['It works on web pages (http and https). Browser pages, web stores and tabs opened before it was installed are out of reach; reload the tab to try again.']),
    );
    return;
  }
  const current = info;
  const search = el('input', {
    type: 'search',
    placeholder: 'Search this page’s highlights',
    'aria-label': 'Search highlights',
    'data-testid': 'search',
    value: query,
    oninput: debounce((e: Event) => {
      query = (e.target as HTMLInputElement).value;
      void drawList();
    }, 120),
  });
  replace(
    app,
    topbar(),
    siteRow(current),
    current.enabled
      ? [el('div', { class: 'section' }, el('label', { class: 'search' }, icon('search', 16), search)), list]
      : emptyState(`Off on ${current.site}`, [`${BRAND.name} won't show or make highlights here. Turn it back on with the switch above.`]),
    el(
      'footer',
      { class: 'footer' },
      footerCount,
      ...exportButtons(async () => {
        const page = await getPage(current.url);
        return page ? [page] : [];
      }),
    ),
  );
  void drawList();
}

draw();

if (info) {
  onHighlightsChange(info.url, () => void drawList());
  onSettingsChange((s) => {
    // From the new settings, not the content script: it may not have heard yet.
    if (info) info = { ...info, enabled: isSiteEnabled(s, info.site) };
    draw();
  });
  // The content script repainted (e.g. after being turned back on): refresh "Not on page" marks.
  onEvent('page:ready', async (_d, sender) => {
    if (sender.tab?.id !== tabId) return;
    info = await pageInfo(tabId);
    void drawList();
  });
}
