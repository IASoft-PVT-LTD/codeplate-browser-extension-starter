// The side panel: stays open next to the page. "This page" lists the current
// tab's highlights and follows the user as they switch tabs or navigate;
// "All pages" searches every highlight, grouped by page. Both export.
import { BRAND } from '../shared/brand';
import { allPages, getPage, onHighlightsChange, searchHighlights, type Highlight, type PageRecord } from '../shared/highlights';
import { onEvent, sendToTab, type PageInfo } from '../shared/messages';
import { isSiteEnabled, onSettingsChange } from '../shared/settings';
import { shortUrl } from '../shared/url';
import { debounce, el, replace } from '../ui/dom';
import { exportButtons } from '../ui/export';
import { emptyState, highlightCard } from '../ui/highlight-list';
import { icon, logo } from '../ui/icons';
import { pageInfo, startPage, targetTabId } from '../ui/page';

type View = 'page' | 'all';

const app = document.getElementById('app')!;
document.title = `${BRAND.name} side panel`;
await startPage();

// With ?tab=<id> the panel stays on that tab; otherwise it follows the active tab.
const pinned = new URLSearchParams(location.search).has('tab');
let tabId = await targetTabId();
let info: PageInfo | undefined = await pageInfo(tabId);
let view: View = (new URLSearchParams(location.search).get('view') as View | null) ?? 'page';
let query = '';

const list = el('div', { class: 'list', 'data-testid': 'highlight-list' });
const subtitle = el('div', { class: 'muted', style: { fontSize: '12px', minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, 'data-testid': 'panel-page' });
const tabs = el('div', { class: 'tabs', role: 'tablist' });
const search = el('input', {
  type: 'search',
  'aria-label': 'Search highlights',
  'data-testid': 'search',
  oninput: debounce((e: Event) => {
    query = (e.target as HTMLInputElement).value;
    void drawList();
  }, 120),
});

function drawTabs(): void {
  const tab = (v: View, label: string) =>
    el(
      'button',
      {
        role: 'tab',
        'aria-selected': String(view === v),
        'data-testid': `view-${v}`,
        onclick: () => {
          view = v;
          drawTabs();
          void drawList();
        },
      },
      label,
    );
  replace(tabs, tab('page', 'This page'), tab('all', 'All pages'));
  search.placeholder = view === 'page' ? 'Search this page' : 'Search all highlights';
}

const openPage = (h: Highlight) => void chrome.tabs.create({ url: h.url });
const scrollTo = (h: Highlight) => tabId !== undefined && void sendToTab(tabId, 'page:scroll-to', { id: h.id });

async function pagesInView(): Promise<PageRecord[]> {
  if (view === 'all') return allPages();
  const page = info && (await getPage(info.url));
  return page ? [page] : [];
}

async function drawList(): Promise<void> {
  subtitle.textContent = info ? info.title || shortUrl(info.url) : 'No web page in this tab';
  if (view === 'page') {
    if (!info) {
      replace(list, emptyState('Nothing to show here', [`Open a web page to see its highlights. Switch to "All pages" to search everything you've highlighted.`]));
      return;
    }
    if (!info.enabled) {
      replace(list, emptyState(`Off on ${info.site}`, [`Turn ${BRAND.name} on for this site from its toolbar button.`]));
      return;
    }
  }
  const pages = await pagesInView();
  const hits = searchHighlights(pages, query);
  if (!hits.length) {
    replace(
      list,
      pages.length
        ? emptyState('Nothing matches', [`No highlight contains "${query}".`])
        : emptyState('No highlights yet', ['Select text on a page and pick a color, or right-click it and choose ', el('b', {}, 'Highlight selection'), '.']),
    );
    return;
  }
  if (view === 'page') {
    replace(list, hits.map(({ highlight }) => highlightCard(highlight, { missing: info?.missing, onOpen: scrollTo })));
    return;
  }
  // All pages: grouped by page, newest page first.
  const groups = new Map<string, { title: string; items: Highlight[] }>();
  for (const { highlight, title } of hits) {
    const g = groups.get(highlight.url) ?? { title, items: [] };
    g.items.push(highlight);
    groups.set(highlight.url, g);
  }
  replace(
    list,
    [...groups].map(([url, g]) => [
      el(
        'div',
        { class: 'group-title', 'data-testid': 'page-group' },
        el('a', { href: url, target: '_blank', rel: 'noreferrer', title: url }, g.title || shortUrl(url)),
        el('span', {}, `· ${g.items.length}`),
      ),
      ...g.items.map((h) => highlightCard(h, { onOpen: info?.url === h.url ? scrollTo : openPage })),
    ]),
  );
}

replace(
  app,
  el(
    'header',
    { class: 'topbar' },
    logo(26),
    el('div', { class: 'grow', style: { minWidth: '0' } }, el('h1', { class: 'name' }, BRAND.name), subtitle),
    el('button', { class: 'icon-btn', title: 'Settings', 'aria-label': 'Settings', 'data-testid': 'open-options', onclick: () => void chrome.runtime.openOptionsPage() }, icon('settings')),
  ),
  el('div', { class: 'section', style: { display: 'grid', gap: '10px' } }, tabs, el('label', { class: 'search' }, icon('search', 16), search)),
  list,
  el(
    'footer',
    { class: 'footer', style: { position: 'sticky', bottom: '0' } },
    el('span', { class: 'grow muted' }, 'Export'),
    ...exportButtons(pagesInView),
  ),
);
drawTabs();
void drawList();

// Keep current: any highlight change, settings change, tab switch or navigation.
onHighlightsChange(null, () => void drawList());
onSettingsChange((s) => {
  if (info) info = { ...info, enabled: isSiteEnabled(s, info.site) };
  void drawList();
});
async function follow(id: number | undefined): Promise<void> {
  tabId = id;
  info = await pageInfo(tabId);
  void drawList();
}
if (!pinned) {
  chrome.tabs.onActivated.addListener(({ tabId: id }) => void follow(id));
}
onEvent('page:ready', (_d, sender) => {
  const id = sender.tab?.id;
  if (id === undefined) return;
  if (pinned ? id === tabId : sender.tab?.active) void follow(id);
});
