// Demo highlights for screenshots and store images, on the test pages in
// tests/pages/. `exact` must be text that's on the page. When you change the
// sample (rename-and-rebrand.md), change these and the test pages together.
const DAY = 86_400_000;

export const DEMO_PAGES = [
  {
    path: '/article.html',
    title: 'Notes in the Margin: A Short History',
    highlights: [
      { exact: 'one of the oldest ways people have of talking back to what they read', color: 'yellow', note: 'Opening line for the talk.', age: 3 * DAY },
      { exact: 'Writing while reading slows you down in a useful way.', color: 'green', note: '', age: 2 * DAY },
      { exact: 'A highlight is a bookmark for an idea; a note is the idea itself, in your own words.', color: 'blue', note: 'This is the whole point of the app. Use it on the landing page.', age: DAY },
      { exact: 'A small collection you actually read is worth more than a large one you never open.', color: 'pink', note: '', age: 3_600_000 },
    ],
  },
  {
    path: '/recipes.html',
    title: 'Weeknight Bread, Simplified',
    highlights: [
      { exact: 'let it rise slowly in the fridge overnight', color: 'green', note: 'Try on Thursday.', age: 5 * DAY },
      { exact: 'Let it cool for at least an hour', color: 'pink', note: 'Patience!', age: 5 * DAY },
    ],
  },
];

/**
 * Stores the demo highlights straight into chrome.storage.local (in the
 * format of src/shared/highlights.ts), from an extension page.
 */
export async function seedDemo(api, origin) {
  const now = Date.now();
  const items = {};
  let n = 0;
  for (const p of DEMO_PAGES) {
    const url = `${origin}${p.path}`;
    items[`page:${url}`] = {
      url,
      title: p.title,
      highlights: p.highlights.map((h) => ({
        id: `demo-${++n}`,
        url,
        anchor: { exact: h.exact, prefix: '', suffix: '' },
        color: h.color,
        note: h.note,
        createdAt: now - h.age,
        updatedAt: now - h.age,
      })),
    };
  }
  await api.evaluate(async (data) => {
    await chrome.storage.local.clear();
    await chrome.storage.local.set(data);
  }, items);
}
