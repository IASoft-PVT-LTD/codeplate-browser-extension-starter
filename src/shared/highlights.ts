// Highlights: the extension's data. Stored in chrome.storage.local, one item
// per page under "page:<pageKey>", so a page loads only its own highlights.
//
// Reads can happen anywhere (the content script, the pages). Writes happen only
// in the service worker (src/background/router.ts), which the other parts ask
// through typed messages: one writer means no lost updates when the popup and
// the page change the same page at once.
import type { Color } from './settings';
import { getByPrefix, getItem, onItemChange, removeItems, setItem } from './storage';

/** Where a highlight is: the text itself and a little context on each side (anchor.ts). */
export interface Anchor {
  exact: string;
  prefix: string;
  suffix: string;
}

export interface Highlight {
  id: string;
  /** The page key (pageKey() in url.ts). */
  url: string;
  anchor: Anchor;
  color: Color;
  note: string;
  createdAt: number;
  updatedAt: number;
}

/** What one stored item holds: a page and its highlights, oldest first. */
export interface PageRecord {
  url: string;
  title: string;
  highlights: Highlight[];
}

export interface PageSummary {
  url: string;
  title: string;
  count: number;
  updatedAt: number;
}

export interface NewHighlight {
  url: string;
  title: string;
  anchor: Anchor;
  color: Color;
  note?: string;
}

export type HighlightPatch = Partial<Pick<Highlight, 'color' | 'note'>>;

const PREFIX = 'page:';
export const pageItemKey = (url: string) => `${PREFIX}${url}`;
/** Notes longer than this are cut: storage.local items should stay small. */
export const MAX_NOTE = 5000;

export async function getPage(url: string): Promise<PageRecord | undefined> {
  return getItem<PageRecord>('local', pageItemKey(url));
}

export async function listForPage(url: string): Promise<Highlight[]> {
  return (await getPage(url))?.highlights ?? [];
}

export async function allPages(): Promise<PageRecord[]> {
  const pages = Object.values(await getByPrefix<PageRecord>('local', PREFIX));
  return pages.sort((a, b) => lastChange(b) - lastChange(a));
}

export async function listPages(): Promise<PageSummary[]> {
  return (await allPages()).map((p) => ({ url: p.url, title: p.title, count: p.highlights.length, updatedAt: lastChange(p) }));
}

const lastChange = (p: PageRecord) => Math.max(0, ...p.highlights.map((h) => h.updatedAt));

// --- writes (service worker only) ---

export async function addHighlight(draft: NewHighlight, now = Date.now()): Promise<Highlight> {
  const page = (await getPage(draft.url)) ?? { url: draft.url, title: draft.title, highlights: [] };
  const highlight: Highlight = {
    id: crypto.randomUUID(),
    url: draft.url,
    anchor: draft.anchor,
    color: draft.color,
    note: (draft.note ?? '').slice(0, MAX_NOTE),
    createdAt: now,
    updatedAt: now,
  };
  await setItem('local', pageItemKey(draft.url), { ...page, title: draft.title || page.title, highlights: [...page.highlights, highlight] });
  return highlight;
}

export async function updateHighlight(url: string, id: string, patch: HighlightPatch, now = Date.now()): Promise<Highlight | null> {
  const page = await getPage(url);
  const old = page?.highlights.find((h) => h.id === id);
  if (!page || !old) return null;
  const updated: Highlight = {
    ...old,
    ...(patch.color ? { color: patch.color } : {}),
    ...(patch.note !== undefined ? { note: patch.note.slice(0, MAX_NOTE) } : {}),
    updatedAt: now,
  };
  await setItem('local', pageItemKey(url), { ...page, highlights: page.highlights.map((h) => (h.id === id ? updated : h)) });
  return updated;
}

export async function deleteHighlight(url: string, id: string): Promise<boolean> {
  const page = await getPage(url);
  if (!page?.highlights.some((h) => h.id === id)) return false;
  const rest = page.highlights.filter((h) => h.id !== id);
  // A page with no highlights left is removed, so "All pages" only lists pages with highlights.
  if (rest.length) await setItem('local', pageItemKey(url), { ...page, highlights: rest });
  else await removeItems('local', pageItemKey(url));
  return true;
}

export async function deleteAll(): Promise<number> {
  const keys = Object.keys(await getByPrefix('local', PREFIX));
  await removeItems('local', keys);
  return keys.length;
}

// --- search (pure) ---

export interface SearchHit {
  highlight: Highlight;
  title: string;
}

/**
 * Highlights matching every word of `query` (case-insensitive) in the quote,
 * the note, the page title or its address. Newest first. An empty query
 * matches everything.
 */
export function searchHighlights(pages: PageRecord[], query: string): SearchHit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const hits: SearchHit[] = [];
  for (const page of pages) {
    for (const h of page.highlights) {
      const text = `${h.anchor.exact}\n${h.note}\n${page.title}\n${page.url}`.toLowerCase();
      if (words.every((w) => text.includes(w))) hits.push({ highlight: h, title: page.title });
    }
  }
  return hits.sort((a, b) => b.highlight.createdAt - a.highlight.createdAt);
}

/** Calls `fn` when the highlights of one page (or, with no url, any page) change. */
export function onHighlightsChange(url: string | null, fn: (page: PageRecord | undefined) => void): () => void {
  return onItemChange<PageRecord>('local', (k) => (url ? k === pageItemKey(url) : k.startsWith(PREFIX)), (_k, value) => fn(value));
}
