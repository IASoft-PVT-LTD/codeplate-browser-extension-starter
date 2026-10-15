// Typed messages between the parts of the extension.
//
//   BackgroundApi  pages and the content script ask the service worker
//                  (sendToBackground); src/background/router.ts answers
//   TabApi         the service worker and pages ask a tab's content script
//                  (sendToTab); src/content/index.ts answers
//   Events         one-way news from a content script to every extension page
//                  (emit / onEvent)
//
// To add a message (docs/recipes/messaging.md): add it to the right interface
// with its request and response types; TypeScript then makes you handle it.
// Messages must be JSON-serializable: no functions, Dates, Maps or DOM nodes.
import type { Highlight, HighlightPatch, NewHighlight, PageRecord, SearchHit } from './highlights';
import type { Color } from './settings';

/** What a content script says about its page. */
export interface PageInfo {
  /** The page key highlights are stored under (pageKey() in url.ts). */
  url: string;
  title: string;
  /** For per-site enable/disable (siteOf() in url.ts). */
  site: string;
  enabled: boolean;
  /** Highlights stored for the page that couldn't be found in it (the page changed). */
  missing: string[];
}

export interface BackgroundApi {
  'highlights:add': { req: NewHighlight; res: Highlight };
  'highlights:update': { req: { url: string; id: string; patch: HighlightPatch }; res: Highlight | null };
  'highlights:delete': { req: { url: string; id: string }; res: boolean };
  'highlights:delete-all': { req: Record<string, never>; res: number };
  'highlights:search': { req: { query: string }; res: SearchHit[] };
  'highlights:pages': { req: Record<string, never>; res: PageRecord[] };
}

export interface TabApi {
  'page:info': { req: Record<string, never>; res: PageInfo };
  'page:highlight-selection': { req: { color?: Color; withNote?: boolean }; res: Highlight | null };
  'page:scroll-to': { req: { id: string }; res: boolean };
}

export interface Events {
  /** A content script loaded (or its page's highlights were drawn again). */
  'page:ready': { count: number; url: string };
}

type Req<Api, K extends keyof Api> = Api[K] extends { req: infer R } ? R : never;
type Res<Api, K extends keyof Api> = Api[K] extends { res: infer R } ? R : never;

/** What travels: which API, which message, its data. */
export interface Envelope {
  to: 'background' | 'tab' | 'event';
  type: string;
  data: unknown;
}

/** What comes back: errors cross the boundary as messages, then throw again on the caller's side. */
export type Reply = { ok: true; value: unknown } | { ok: false; error: string };

async function unwrap<T>(reply: Reply | undefined, type: string): Promise<T> {
  if (!reply) throw new Error(`No answer to "${type}": nothing is listening (is the extension reloaded, or the page from before it was installed?)`);
  if (!reply.ok) throw new Error(reply.error);
  return reply.value as T;
}

export async function sendToBackground<K extends keyof BackgroundApi>(type: K, data: Req<BackgroundApi, K>): Promise<Res<BackgroundApi, K>> {
  const envelope: Envelope = { to: 'background', type, data };
  return unwrap(await chrome.runtime.sendMessage(envelope), type);
}

export async function sendToTab<K extends keyof TabApi>(tabId: number, type: K, data: Req<TabApi, K>): Promise<Res<TabApi, K>> {
  const envelope: Envelope = { to: 'tab', type, data };
  return unwrap(await chrome.tabs.sendMessage(tabId, envelope), type);
}

/** Sends an event to the extension's pages (side panel, popup). Nobody listening is fine. */
export function emit<K extends keyof Events>(type: K, data: Events[K]): void {
  const envelope: Envelope = { to: 'event', type, data };
  chrome.runtime.sendMessage(envelope).catch(() => undefined);
}

export type Handlers<Api> = {
  [K in keyof Api]: (data: Req<Api, K>, sender: chrome.runtime.MessageSender) => Promise<Res<Api, K>> | Res<Api, K>;
};

/**
 * Turns a handler object into a chrome.runtime.onMessage listener. Only
 * envelopes addressed to `to` are answered; the rest are left for other
 * listeners. Unknown types and thrown errors come back as errors.
 */
export function createListener<Api>(to: 'background' | 'tab', handlers: Handlers<Api>) {
  return (message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (reply: Reply) => void): boolean => {
    const m = message as Partial<Envelope> | null;
    if (!m || m.to !== to || typeof m.type !== 'string') return false;
    const handler = (handlers as Record<string, ((data: unknown, s: chrome.runtime.MessageSender) => unknown) | undefined>)[m.type];
    if (!handler) {
      sendResponse({ ok: false, error: `Unknown message "${m.type}"` });
      return false;
    }
    Promise.resolve()
      .then(() => handler(m.data, sender))
      .then(
        (value) => sendResponse({ ok: true, value: value ?? null }),
        (e: unknown) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      );
    // true: the answer comes later (asynchronously).
    return true;
  };
}

/** Listens for events from content scripts (in a page or the side panel). Returns a function that stops. */
export function onEvent<K extends keyof Events>(type: K, fn: (data: Events[K], sender: chrome.runtime.MessageSender) => void): () => void {
  const listener = (message: unknown, sender: chrome.runtime.MessageSender) => {
    const m = message as Partial<Envelope> | null;
    if (m?.to === 'event' && m.type === type) fn(m.data as Events[K], sender);
    return false;
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}
