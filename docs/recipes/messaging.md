# Messaging between the parts

Use when one part of the extension needs another to do something or answer something: a page asking the service worker to save, the side panel asking the content script about its page, the service worker telling a tab to act.

All messages are declared in `src/shared/messages.ts`, so TypeScript checks both ends.

## Which API

| From → to | Declare in | Send with | Answer in |
|---|---|---|---|
| Popup, side panel, options, content script → service worker | `BackgroundApi` | `sendToBackground(type, data)` | `handlers` in `src/background/router.ts` |
| Service worker or a page → one tab's content script | `TabApi` | `sendToTab(tabId, type, data)` | `handlers` in `src/content/index.ts` |
| Content script → every open extension page (no answer) | `Events` | `emit(type, data)` | `onEvent(type, fn)` in the page |

Data changes don't need messages to spread: write storage (through the service worker) and let `onHighlightsChange()` / `onSettingsChange()` listeners update every part.

## Add a message

1. `src/shared/messages.ts`: add an entry with request and response types:

   ```ts
   export interface BackgroundApi {
     // …
     'highlights:import': { req: { pages: PageRecord[] }; res: { added: number } };
   }
   ```

   Requests and responses must survive JSON: plain objects, arrays, strings, numbers, booleans, `null`. Use timestamps (numbers) for dates.
2. Handle it. TypeScript now reports the missing key in `handlers` (`Handlers<BackgroundApi>` requires every message):

   ```ts
   'highlights:import': ({ pages }) => write(() => importPages(pages)),
   ```

   Wrap storage writes in `write()` so they run one at a time. Throw an `Error` with a clear message for bad input: the caller gets a rejected promise with that message.
3. Call it: `const { added } = await sendToBackground('highlights:import', { pages });`
4. For `TabApi`, the caller must handle tabs with no content script (`sendToTab` rejects with "Receiving end does not exist"): catch it, as `pageInfo()` in `src/ui/page.ts` does.

## Long work and the service worker

- A message handler can take as long as it needs; Chrome keeps the worker alive while a message is waiting for its reply (up to 5 minutes).
- Don't start work that outlives the reply and keeps state in variables: the worker may stop. Store progress in `chrome.storage.session` or `local`.
- Streams or many updates (a long download, progress): use `chrome.runtime.connect()` ports instead; declare a port message type next to the others and keep the same envelope.

## Test it

1. `tests/unit/messaging.test.ts` routes real messages through the fake `chrome`: add a case that sends your message with `sendToBackground()` and checks the result and storage. For `TabApi`, push a `createListener('tab', handlers)` into `fake.tabListeners(id)`.
2. In e2e, call it from the api page: `ext.api.evaluate(() => chrome.runtime.sendMessage({ to: 'background', type: 'highlights:import', data: {...} }))` (the `ext.add()` helper in `tests/e2e/fixtures.ts` does this for `highlights:add`).

## Verify

1. `npm run typecheck`: no missing handlers.
2. `npm run check` ends with `CODEPLATE CHECKS: PASS`.
3. If the message changes something visible, `npm run shots` and look at the parts it touches.
