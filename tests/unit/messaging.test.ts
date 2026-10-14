// The message layer and the service worker's handlers, end to end over the
// fake runtime: a page or content script sends, the router answers.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listForPage } from '../../src/shared/highlights';
import { createListener, emit, onEvent, sendToBackground, sendToTab, type Handlers, type TabApi } from '../../src/shared/messages';
import { installFakeChrome } from '../fakes/chrome';

let fake: ReturnType<typeof installFakeChrome>;
beforeEach(async () => {
  fake = installFakeChrome();
  // A fresh service worker for each test: import the router again.
  vi.resetModules();
  const { listener } = await import('../../src/background/router');
  fake.api.runtime.onMessage.addListener(listener);
});

const URL_A = 'https://example.com/a';
const anchor = { exact: 'some text', prefix: '', suffix: '' };

describe('background messages', () => {
  it('adds, updates, searches and deletes highlights through the service worker', async () => {
    const h = await sendToBackground('highlights:add', { url: URL_A, title: 'A', anchor, color: 'green' });
    expect(h.color).toBe('green');
    expect(await listForPage(URL_A)).toHaveLength(1);

    const u = await sendToBackground('highlights:update', { url: URL_A, id: h.id, patch: { note: 'why it matters' } });
    expect(u?.note).toBe('why it matters');

    const hits = await sendToBackground('highlights:search', { query: 'matters' });
    expect(hits.map((x) => x.highlight.id)).toEqual([h.id]);
    expect((await sendToBackground('highlights:pages', {})).map((p) => p.url)).toEqual([URL_A]);

    expect(await sendToBackground('highlights:delete', { url: URL_A, id: h.id })).toBe(true);
    expect(await listForPage(URL_A)).toEqual([]);
  });

  it('runs writes one at a time, so quick changes to one page all land', async () => {
    await Promise.all(Array.from({ length: 10 }, (_, i) => sendToBackground('highlights:add', { url: URL_A, title: 'A', anchor: { ...anchor, exact: `t${i}` }, color: 'yellow' })));
    expect(await listForPage(URL_A)).toHaveLength(10);
  });

  it('turns handler errors into rejected promises on the caller side', async () => {
    await expect(sendToBackground('highlights:add', { url: URL_A, title: 'A', anchor: { ...anchor, exact: '  ' }, color: 'yellow' })).rejects.toThrow('A highlight needs some text.');
  });

  it('answers unknown message types with an error', async () => {
    const send = chrome.runtime.sendMessage as (m: unknown) => Promise<{ ok: boolean; error?: string }>;
    expect(await send({ to: 'background', type: 'nope', data: {} })).toEqual({ ok: false, error: 'Unknown message "nope"' });
  });

  it('ignores messages meant for others', async () => {
    const listener = createListener('background', {} as Handlers<never>);
    expect(listener({ to: 'tab', type: 'page:info', data: {} }, {}, () => undefined)).toBe(false);
    expect(listener('not an envelope', {}, () => undefined)).toBe(false);
  });
});

describe('tab messages and events', () => {
  it('reaches a content script in a tab, typed both ways', async () => {
    const handlers: Handlers<TabApi> = {
      'page:info': () => ({ url: URL_A, title: 'A', site: 'example.com', enabled: true, missing: [] }),
      'page:highlight-selection': () => null,
      'page:scroll-to': ({ id }) => id === 'yes',
    };
    fake.tabListeners(7).push(createListener<TabApi>('tab', handlers));
    expect((await sendToTab(7, 'page:info', {})).site).toBe('example.com');
    expect(await sendToTab(7, 'page:scroll-to', { id: 'yes' })).toBe(true);
    await expect(sendToTab(8, 'page:info', {})).rejects.toThrow(/Receiving end does not exist/);
  });

  it('delivers events from a content script with its tab', async () => {
    const seen = vi.fn();
    onEvent('page:ready', seen);
    fake.sendAs({ id: 3, active: true });
    emit('page:ready', { url: URL_A, count: 2 });
    await Promise.resolve();
    expect(seen).toHaveBeenCalledWith({ url: URL_A, count: 2 }, expect.objectContaining({ tab: expect.objectContaining({ id: 3 }) }));
  });
});

describe('menus and shortcuts', () => {
  it('creates the right-click menus and routes clicks and keys to the tab or the side panel', async () => {
    const { createMenus, onMenuClick, onCommand, MENU } = await import('../../src/background/menus');
    await createMenus();
    expect(fake.menus.map((m) => m.id)).toEqual([MENU.highlight, MENU.highlightWithNote, MENU.openPanel]);

    const asked = vi.fn((_m: unknown, _s: unknown, reply: (r: unknown) => void) => {
      reply({ ok: true, value: null });
      return false;
    });
    fake.tabListeners(5).push(asked);
    const tab = { id: 5, windowId: 2 } as chrome.tabs.Tab;
    await onMenuClick({ menuItemId: MENU.highlightWithNote } as chrome.contextMenus.OnClickData, tab);
    expect(asked.mock.calls[0][0]).toEqual({ to: 'tab', type: 'page:highlight-selection', data: { withNote: true } });
    await onCommand('highlight-selection', tab);
    expect(asked.mock.calls[1][0]).toMatchObject({ data: { withNote: false } });

    await onCommand('open-side-panel', tab);
    await onMenuClick({ menuItemId: MENU.openPanel } as chrome.contextMenus.OnClickData, tab);
    expect(fake.opened).toEqual([{ windowId: 2 }, { windowId: 2 }]);

    // A page without the content script (chrome://…) is ignored quietly.
    await expect(onCommand('highlight-selection', { id: 404 } as chrome.tabs.Tab)).resolves.toBeUndefined();
  });
});
