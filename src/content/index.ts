// The content script: runs inside every http(s) page (src/manifest.ts,
// content_scripts), in an isolated world: it shares the page's DOM but not its
// JavaScript. It
//   - paints the page's saved highlights (painter.ts) and keeps them current
//     when they change anywhere (storage change events)
//   - shows the color toolbar under a selection and the note editor (ui.ts)
//   - answers TabApi messages from the service worker and the pages
//
// It never writes storage itself: new highlights and edits go to the service
// worker (sendToBackground), the extension's one writer.
import { describeRange, indexText } from '../shared/anchor';
import { listForPage, onHighlightsChange, type Highlight } from '../shared/highlights';
import { createListener, emit, sendToBackground, type Handlers, type PageInfo, type TabApi } from '../shared/messages';
import { isSiteEnabled, loadSettings, onSettingsChange, type Color, type Settings } from '../shared/settings';
import { pageKey, siteOf } from '../shared/url';
import { clearPaint, hitTest, paint, reveal } from './painter';
import { HOST_TAG, PageUi } from './ui';

let settings: Settings;
let url = pageKey(location.href);
let highlights: Highlight[] = [];
let ranges = new Map<string, Range>();
let missing: string[] = [];
let ui: PageUi | null = null;
let stopWatching: (() => void) | null = null;

const site = () => siteOf(location.href);
const enabled = () => isSiteEnabled(settings, site());

function redraw(): void {
  if (!enabled()) {
    clearPaint();
    ranges = new Map();
    missing = [];
    return;
  }
  ({ ranges, missing } = paint(highlights));
  emit('page:ready', { url, count: highlights.length });
  if (missing.length) retryLater();
}

// Pages that build their text after load (single-page apps, lazy sections):
// when some highlights weren't found, look again after the page changes, a few times.
let retries = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
const observer = new MutationObserver(() => {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    observer.disconnect();
    if (++retries <= 10) redraw();
  }, 600);
});
function retryLater(): void {
  if (retries < 10 && document.body) observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}

async function loadPage(): Promise<void> {
  url = pageKey(location.href);
  retries = 0;
  stopWatching?.();
  highlights = await listForPage(url);
  redraw();
  stopWatching = onHighlightsChange(url, (page) => {
    highlights = page?.highlights ?? [];
    redraw();
  });
}

function getUi(): PageUi {
  if (!ui) {
    ui = new PageUi();
    ui.setTheme(settings.theme);
  }
  return ui;
}

/** The current selection, if it's page text the extension can highlight. */
function pageSelection(): Range | null {
  const sel = document.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  const active = document.activeElement;
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active as HTMLElement).isContentEditable)) return null;
  if (!document.body?.contains(range.commonAncestorContainer)) return null;
  return range;
}

async function highlightSelection(color: Color = settings.defaultColor, withNote = false): Promise<Highlight | null> {
  if (!enabled()) return null;
  const range = pageSelection();
  if (!range) return null;
  const anchor = describeRange(range, indexText(document.body, (e) => e.tagName.toLowerCase() === HOST_TAG));
  if (!anchor) return null;
  const rect = range.getBoundingClientRect();
  const created = await sendToBackground('highlights:add', { url, title: document.title, anchor, color });
  document.getSelection()?.removeAllRanges();
  ui?.hideToolbar();
  // The storage change repaints the page; add it now too, so the editor below can find it.
  if (!highlights.some((h) => h.id === created.id)) {
    highlights = [...highlights, created];
    redraw();
  }
  if (withNote) openEditor(created, rect);
  return created;
}

function openEditor(h: Highlight, rect: DOMRect): void {
  getUi().openEditor(h, rect, {
    save: (note, color) => void sendToBackground('highlights:update', { url, id: h.id, patch: { note, color } }),
    remove: () => void sendToBackground('highlights:delete', { url, id: h.id }),
  });
}

// --- events in the page ---

function onPointerUp(e: MouseEvent): void {
  if (!enabled() || ui?.contains(e.target)) return;
  // Let the browser finish updating the selection first.
  setTimeout(() => {
    const range = pageSelection();
    if (range && settings.selectionToolbar) {
      getUi().showToolbar(range.getBoundingClientRect(), settings.defaultColor, (color, withNote) => void highlightSelection(color, withNote));
      return;
    }
    ui?.hideToolbar();
    if (!range && e.button === 0) {
      const id = hitTest(ranges, e.clientX, e.clientY);
      const h = id && highlights.find((x) => x.id === id);
      if (h) openEditor(h, ranges.get(h.id)!.getBoundingClientRect());
    }
  }, 0);
}

function onKeyDown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    ui?.hideToolbar();
    ui?.closeEditor();
  }
}

// --- messages ---

const handlers: Handlers<TabApi> = {
  'page:info': (): PageInfo => ({ url, title: document.title, site: site(), enabled: enabled(), missing }),
  'page:highlight-selection': ({ color, withNote }) => highlightSelection(color, withNote),
  'page:scroll-to': ({ id }) => {
    const range = ranges.get(id);
    if (!range) return false;
    reveal(range);
    return true;
  },
};

async function start(): Promise<void> {
  settings = await loadSettings();
  chrome.runtime.onMessage.addListener(createListener<TabApi>('tab', handlers));
  onSettingsChange((next) => {
    const wasEnabled = enabled();
    settings = next;
    ui?.setTheme(next.theme);
    if (!enabled()) {
      ui?.hideToolbar();
      ui?.closeEditor();
    }
    if (wasEnabled !== enabled()) redraw();
  });
  document.addEventListener('mouseup', onPointerUp, true);
  document.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('scroll', () => ui?.toolbarVisible && ui.hideToolbar(), { passive: true });
  await loadPage();
  // Single-page apps change the address without loading a new page.
  let last = location.href;
  setInterval(() => {
    if (location.href === last) return;
    last = location.href;
    if (pageKey(last) !== url) void loadPage();
  }, 1000);
}

void start();
