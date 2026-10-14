// A small typed layer over chrome.storage. Every read and write of extension
// data goes through src/shared/settings.ts or src/shared/highlights.ts, which use this.
//
//   local  this browser only, about 10 MB: highlights (they can be large)
//   sync   follows the user's browser account, about 100 KB in total and 8 KB per
//          item: settings only
//
// Both work in the service worker, the extension's pages and the content script.

export type AreaName = 'local' | 'sync';

function area(name: AreaName): chrome.storage.StorageArea {
  return chrome.storage[name];
}

export async function getItem<T>(name: AreaName, key: string): Promise<T | undefined> {
  const got = await area(name).get(key);
  return got[key] as T | undefined;
}

/** Every item whose key starts with `prefix`. */
export async function getByPrefix<T>(name: AreaName, prefix: string): Promise<Record<string, T>> {
  const all = (await area(name).get(null)) as Record<string, T>;
  return Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith(prefix)));
}

export async function setItem<T>(name: AreaName, key: string, value: T): Promise<void> {
  await area(name).set({ [key]: value });
}

export async function removeItems(name: AreaName, keys: string | string[]): Promise<void> {
  await area(name).remove(keys);
}

/**
 * Calls `fn(key, newValue, oldValue)` when an item in `name` whose key passes
 * `match` changes, from any part of the extension. Returns a function that
 * stops listening.
 */
export function onItemChange<T>(
  name: AreaName,
  match: (key: string) => boolean,
  fn: (key: string, newValue: T | undefined, oldValue: T | undefined) => void,
): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    if (areaName !== name) return;
    for (const [key, change] of Object.entries(changes)) {
      if (match(key)) fn(key, change.newValue as T | undefined, change.oldValue as T | undefined);
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
