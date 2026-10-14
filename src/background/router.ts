// The service worker's answers to BackgroundApi messages (src/shared/messages.ts).
// Every highlight write in the extension happens here, one at a time.
import { addHighlight, allPages, deleteAll, deleteHighlight, searchHighlights, updateHighlight } from '../shared/highlights';
import { createListener, type BackgroundApi, type Handlers } from '../shared/messages';

/** Runs writes one after another: two quick changes to one page must not overwrite each other. */
function serial() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(job: () => Promise<T>): Promise<T> => {
    const run = tail.then(job, job);
    tail = run.catch(() => undefined);
    return run;
  };
}
const write = serial();

export const handlers: Handlers<BackgroundApi> = {
  'highlights:add': (draft) => {
    if (!draft.anchor?.exact?.trim()) throw new Error('A highlight needs some text.');
    return write(() => addHighlight(draft));
  },
  'highlights:update': ({ url, id, patch }) => write(() => updateHighlight(url, id, patch)),
  'highlights:delete': ({ url, id }) => write(() => deleteHighlight(url, id)),
  'highlights:delete-all': () => write(() => deleteAll()),
  'highlights:search': async ({ query }) => searchHighlights(await allPages(), query),
  'highlights:pages': () => allPages(),
};

export const listener = createListener<BackgroundApi>('background', handlers);
