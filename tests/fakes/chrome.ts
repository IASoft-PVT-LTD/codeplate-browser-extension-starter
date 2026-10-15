// A fake `chrome` for unit tests: just enough of the extension APIs, in
// memory, with the same behavior as the browser where the code relies on it:
//   - storage.local / storage.sync: get(null | key | keys), set, remove, clear,
//     and storage.onChanged events (fired after each write, values copied
//     through JSON like the real thing)
//   - runtime.sendMessage / onMessage and tabs.sendMessage: listeners get
//     (message, sender, sendResponse); returning true keeps the channel open
//     for an async answer; nobody answering rejects like Chrome does
//   - event objects (addListener/removeListener/dispatch) for contextMenus,
//     commands, runtime.onInstalled, tabs.onActivated
//   - contextMenus.create/removeAll, sidePanel.open, action badge calls are recorded
//   - permissions (host access): contains / request / remove / getAll and the
//     onAdded / onRemoved events, with match patterns compared like Chrome:
//     request() throws outside a user gesture and for patterns the manifest
//     doesn't declare; remove() throws for install-time host_permissions
//   - scripting.registerContentScripts / unregisterContentScripts /
//     getRegisteredContentScripts, throwing on duplicate or unknown ids
//
//   const fake = installFakeChrome();   // in beforeEach: sets globalThis.chrome
//   fake.tabListeners(7).push(listener) // a content script in tab 7
//   fake.hosts({ optional: ['https://*/*'] })   // what the manifest declares
//   fake.click(() => requestSiteAccess([...]))  // a user gesture, until the first await
//   fake.prompt = 'deny'                        // what the user answers
// Add what a new test needs; keep it honest to the real API.
type Listener = (...args: never[]) => unknown;

export class FakeEvent<L extends Listener> {
  listeners: L[] = [];
  addListener = (l: L) => void this.listeners.push(l);
  removeListener = (l: L) => void (this.listeners = this.listeners.filter((x) => x !== l));
  hasListener = (l: L) => this.listeners.includes(l);
  dispatch(...args: Parameters<L>): unknown[] {
    return this.listeners.map((l) => l(...args));
  }
}

type Changes = Record<string, { oldValue?: unknown; newValue?: unknown }>;
type ChangeListener = (changes: Changes, area: string) => void;
type MessageListener = (message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (r: unknown) => void) => boolean | undefined | void;

const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

function fakeArea(name: string, onChanged: FakeEvent<ChangeListener>) {
  const data = new Map<string, unknown>();
  const emit = (changes: Changes) => {
    if (Object.keys(changes).length) onChanged.dispatch(changes, name);
  };
  return {
    data,
    async get(keys?: string | string[] | Record<string, unknown> | null) {
      if (keys === null || keys === undefined) return Object.fromEntries([...data].map(([k, v]) => [k, clone(v)]));
      const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
      const out: Record<string, unknown> = {};
      for (const k of list) {
        if (data.has(k)) out[k] = clone(data.get(k));
        else if (keys && typeof keys === 'object' && !Array.isArray(keys)) out[k] = (keys as Record<string, unknown>)[k];
      }
      return out;
    },
    async set(items: Record<string, unknown>) {
      const changes: Changes = {};
      for (const [k, v] of Object.entries(items)) {
        changes[k] = { oldValue: clone(data.get(k)), newValue: clone(v) };
        data.set(k, clone(v));
      }
      emit(changes);
    },
    async remove(keys: string | string[]) {
      const changes: Changes = {};
      for (const k of typeof keys === 'string' ? [keys] : keys) {
        if (!data.has(k)) continue;
        changes[k] = { oldValue: clone(data.get(k)) };
        data.delete(k);
      }
      emit(changes);
    },
    async clear() {
      await this.remove([...data.keys()]);
    },
  };
}

/** Delivers a message to listeners like Chrome: first answer wins; no answer → error. */
function deliver(listeners: MessageListener[], message: unknown, sender: chrome.runtime.MessageSender): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let answered = false;
    let waiting = false;
    const sendResponse = (r: unknown) => {
      if (answered) return;
      answered = true;
      resolve(clone(r));
    };
    for (const l of [...listeners]) {
      if (l(clone(message), sender, sendResponse) === true) waiting = true;
      if (answered) return;
    }
    if (!waiting && !answered) reject(new Error('Could not establish connection. Receiving end does not exist.'));
  });
}

/** Whether match pattern `outer` covers `inner` (both like `https://*.example.com/*`). */
export function patternCovers(outer: string, inner: string): boolean {
  if (outer === '<all_urls>') return /^(https?|\*):\/\//.test(inner) || inner === '<all_urls>';
  const parse = (p: string) => /^(\*|https?):\/\/([^/]+)(\/.*)$/.exec(p);
  const o = parse(outer);
  const i = parse(inner);
  if (!o || !i) return false;
  const [, os, oh, op] = o;
  const [, is, ih, ip] = i;
  if (os !== '*' && os !== is) return false;
  const hostOk = oh === '*' || oh === ih || (oh.startsWith('*.') && (ih === oh.slice(2) || ih.endsWith(oh.slice(1))));
  const glob = new RegExp(`^${op.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*')}$`);
  return hostOk && glob.test(ip);
}

export function installFakeChrome() {
  const onChanged = new FakeEvent<ChangeListener>();
  const local = fakeArea('local', onChanged);
  const sync = fakeArea('sync', onChanged);
  const onMessage = new FakeEvent<MessageListener>();
  const tabs = new Map<number, MessageListener[]>();
  const menus: chrome.contextMenus.CreateProperties[] = [];
  const opened: { windowId?: number; tabId?: number }[] = [];
  const badges: { tabId?: number; text?: string }[] = [];
  /** Who runtime.sendMessage says it is (an extension page by default; set `tab` to act as a content script). */
  let sender: chrome.runtime.MessageSender = { id: 'fake-extension-id' };
  // Host access: what the manifest declares, what is granted now, and whether a user gesture is in progress.
  const declared = { required: [] as string[], optional: [] as string[] };
  const granted = new Set<string>();
  let inGesture = false;
  const onAdded = new FakeEvent<(p: chrome.permissions.Permissions) => void>();
  const onRemoved = new FakeEvent<(p: chrome.permissions.Permissions) => void>();
  const covered = (pattern: string) => [...granted].some((g) => patternCovers(g, pattern));
  const scripts = new Map<string, chrome.scripting.RegisteredContentScript>();
  const state = { prompt: 'allow' as 'allow' | 'deny' };

  const api = {
    runtime: {
      id: 'fake-extension-id',
      getManifest: () => ({ manifest_version: 3, name: 'Marginalia', version: '1.0.0' }),
      sendMessage: (message: unknown) => deliver(onMessage.listeners, message, sender),
      onMessage,
      onInstalled: new FakeEvent<(details: { reason: string }) => void>(),
      onStartup: new FakeEvent<() => void>(),
      openOptionsPage: async () => undefined,
    },
    storage: { local, sync, onChanged },
    tabs: {
      sendMessage: (tabId: number, message: unknown) => deliver(tabs.get(tabId) ?? [], message, { id: 'fake-extension-id' }),
      query: async () => [] as chrome.tabs.Tab[],
      get: async (tabId: number) => ({ id: tabId, windowId: 1 }) as chrome.tabs.Tab,
      create: async (p: { url: string }) => ({ id: 99, url: p.url }) as chrome.tabs.Tab,
      onActivated: new FakeEvent<(info: { tabId: number; windowId: number }) => void>(),
    },
    contextMenus: {
      create: (p: chrome.contextMenus.CreateProperties) => void menus.push(p),
      removeAll: async () => void (menus.length = 0),
      onClicked: new FakeEvent<(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) => void>(),
    },
    commands: {
      onCommand: new FakeEvent<(command: string, tab?: chrome.tabs.Tab) => void>(),
      getAll: async () => [] as chrome.commands.Command[],
    },
    sidePanel: {
      open: async (o: { windowId?: number; tabId?: number }) => void opened.push(o),
      setPanelBehavior: async () => undefined,
    },
    action: {
      setBadgeText: async (d: { tabId?: number; text?: string }) => void badges.push(d),
      setBadgeBackgroundColor: async () => undefined,
    },
    permissions: {
      contains: async ({ origins = [] }: chrome.permissions.Permissions) => origins.every(covered),
      getAll: async () => ({ permissions: [] as string[], origins: [...granted] }),
      // Like Chrome: checked at the call (not in the promise), so a call after an await is refused.
      request: ({ origins = [] }: chrome.permissions.Permissions): Promise<boolean> => {
        if (!inGesture) return Promise.reject(new Error('This function must be called during a user gesture'));
        const undeclared = origins.filter((o) => ![...declared.required, ...declared.optional].some((d) => patternCovers(d, o)));
        if (undeclared.length) return Promise.reject(new Error(`Only permissions specified in the manifest may be requested: ${undeclared.join(', ')}`));
        const missing = origins.filter((o) => !covered(o));
        if (!missing.length) return Promise.resolve(true);
        if (state.prompt === 'deny') return Promise.resolve(false);
        for (const o of missing) granted.add(o);
        onAdded.dispatch({ origins: missing });
        return Promise.resolve(true);
      },
      remove: async ({ origins = [] }: chrome.permissions.Permissions) => {
        if (origins.some((o) => declared.required.includes(o))) throw new Error('You cannot remove required permissions.');
        const gone = origins.filter((o) => granted.delete(o));
        if (gone.length) onRemoved.dispatch({ origins: gone });
        return true;
      },
      onAdded,
      onRemoved,
    },
    scripting: {
      registerContentScripts: async (list: chrome.scripting.RegisteredContentScript[]) => {
        for (const s of list) if (scripts.has(s.id)) throw new Error(`Duplicate script ID '${s.id}'`);
        for (const s of list) scripts.set(s.id, clone(s));
      },
      unregisterContentScripts: async (filter?: { ids?: string[] }) => {
        const ids = filter?.ids ?? [...scripts.keys()];
        for (const id of ids) if (!scripts.has(id)) throw new Error(`Nonexistent script ID '${id}'`);
        for (const id of ids) scripts.delete(id);
      },
      getRegisteredContentScripts: async (filter?: { ids?: string[] }) =>
        [...scripts.values()].filter((s) => !filter?.ids || filter.ids.includes(s.id)).map(clone),
    },
  };
  (globalThis as unknown as { chrome: typeof api }).chrome = api;

  return {
    api,
    local: local.data,
    sync: sync.data,
    menus,
    opened,
    badges,
    /** The message listeners of a tab's content script. */
    tabListeners(tabId: number): MessageListener[] {
      if (!tabs.has(tabId)) tabs.set(tabId, []);
      return tabs.get(tabId)!;
    },
    /** The content scripts registered with chrome.scripting, by id. */
    scripts,
    /** The host access the manifest declares: `required` (host_permissions, granted at install) and `optional`. */
    hosts({ required = [], optional = [] }: { required?: string[]; optional?: string[] }) {
      declared.required = required;
      declared.optional = optional;
      for (const r of required) granted.add(r);
    },
    /** Runs `fn` as a user's click: a gesture until its first await, like the browser. */
    click<T>(fn: () => T): T {
      inGesture = true;
      try {
        return fn();
      } finally {
        inGesture = false;
      }
    },
    /** What the user answers the permission prompt. */
    set prompt(answer: 'allow' | 'deny') {
      state.prompt = answer;
    },
    /** Makes runtime.sendMessage come from a tab (like a content script) or, with no tab, an extension page. */
    sendAs(tab?: Partial<chrome.tabs.Tab>) {
      sender = tab ? { id: 'fake-extension-id', tab: tab as chrome.tabs.Tab } : { id: 'fake-extension-id' };
    },
  };
}
