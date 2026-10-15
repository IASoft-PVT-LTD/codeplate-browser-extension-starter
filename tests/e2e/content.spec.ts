// The content script on a real page: the selection toolbar, painting,
// restoring after a reload, the note editor, the right-click/shortcut path,
// and per-site disabling.
import { clickText, expect, ORIGIN, painted, selectText, test } from './fixtures';

const QUOTE = 'readers argued with their books';

test('select text, pick a color: the highlight is saved and painted', async ({ page, ext }) => {
  await page.goto('/article.html');
  await ext.tabIdFor('/article.html');
  await selectText(page, QUOTE);
  const toolbar = page.getByTestId('mg-toolbar');
  await expect(toolbar).toBeVisible();
  await page.getByTestId('mg-color-green').click();
  await expect(toolbar).toBeHidden();

  await expect.poll(async () => (await ext.pages())[0]?.highlights.map((h) => [h.anchor.exact, h.color])).toEqual([[QUOTE, 'green']]);
  const [record] = await ext.pages();
  expect(record.title).toBe('Notes in the Margin: A Short History');
  expect(record.url).toBe(`${ORIGIN}/article.html`);
  await expect.poll(() => painted(page, 'marginalia-green')).toBe(1);
});

test('highlights come back after a reload, and repaint when changed elsewhere', async ({ page, ext }) => {
  await page.goto('/article.html');
  await ext.tabIdFor('/article.html');
  const h = await ext.add({ url: `${ORIGIN}/article.html`, title: 'x', anchor: { exact: 'Writing while reading slows you down', prefix: '', suffix: '' }, color: 'blue' });
  await expect.poll(() => painted(page, 'marginalia-blue')).toBe(1);

  await page.reload();
  await expect.poll(() => painted(page, 'marginalia-blue')).toBe(1);

  // A note added from somewhere else (the side panel) underlines it on the page.
  await ext.api.evaluate(
    async ({ id, url }) => chrome.runtime.sendMessage({ to: 'background', type: 'highlights:update', data: { url, id, patch: { note: 'n' } } }),
    { id: h.id, url: `${ORIGIN}/article.html` },
  );
  await expect.poll(() => painted(page, 'marginalia-note')).toBe(1);
});

test('click a highlight to add a note, change its color, or delete it', async ({ page, ext }) => {
  await page.goto('/article.html');
  await ext.tabIdFor('/article.html');
  await selectText(page, QUOTE);
  await page.getByTestId('mg-color-yellow').click();
  await expect.poll(() => painted(page, 'marginalia-yellow')).toBe(1);

  await clickText(page, 'argued with');
  const editor = page.getByTestId('mg-editor');
  await expect(editor).toBeVisible();
  await expect(editor).toContainText(QUOTE);
  await page.getByTestId('mg-note-input').fill('The oldest form of commenting.');
  await page.getByTestId('mg-editor-color-pink').click();
  await page.getByTestId('mg-save').click();
  await expect(editor).toBeHidden();
  await expect.poll(async () => (await ext.pages())[0]?.highlights[0]).toMatchObject({ note: 'The oldest form of commenting.', color: 'pink' });
  await expect.poll(() => painted(page, 'marginalia-note')).toBe(1);

  await clickText(page, 'argued with');
  await page.getByTestId('mg-delete').click();
  await expect.poll(async () => (await ext.pages()).length).toBe(0);
  await expect.poll(() => painted(page, 'marginalia-pink')).toBe(0);
});

test('the right-click menu and shortcut path: highlight with a note opens the editor', async ({ page, ext }) => {
  await page.goto('/article.html');
  const tab = await ext.tabIdFor('/article.html');
  // The settings say: no toolbar, so only the menu/shortcut path makes highlights.
  await ext.setSettings({ version: 2, selectionToolbar: false, defaultColor: 'blue' });
  await page.waitForTimeout(200);
  await selectText(page, 'Scribes copying manuscripts');
  await expect(page.getByTestId('mg-toolbar')).toBeHidden();

  // What the service worker sends on a menu click or Alt+Shift+H (src/background/menus.ts).
  const reply = await ext.api.evaluate(
    (id) => chrome.tabs.sendMessage(id, { to: 'tab', type: 'page:highlight-selection', data: { withNote: true } }),
    tab,
  );
  expect(reply).toMatchObject({ ok: true, value: { color: 'blue', anchor: { exact: 'Scribes copying manuscripts' } } });
  await expect(page.getByTestId('mg-editor')).toBeVisible();
  await page.getByTestId('mg-note-input').fill('Complaints about the cold');
  await page.getByTestId('mg-note-input').press('Control+Enter');
  await expect.poll(async () => (await ext.pages())[0]?.highlights[0]?.note).toBe('Complaints about the cold');
});

test('turned off for a site: nothing is painted and the toolbar stays away', async ({ page, ext }) => {
  await page.goto('/article.html');
  await ext.tabIdFor('/article.html');
  await ext.add({ url: `${ORIGIN}/article.html`, title: 'x', anchor: { exact: 'Keep your notes short', prefix: '', suffix: '' }, color: 'yellow' });
  await expect.poll(() => painted(page, 'marginalia-yellow')).toBe(1);

  await ext.setSettings({ version: 2, disabledSites: ['localhost'] });
  await expect.poll(() => painted(page, 'marginalia-yellow')).toBe(0);
  await selectText(page, 'Keep your notes short');
  await page.waitForTimeout(150);
  await expect(page.getByTestId('mg-toolbar')).toBeHidden();

  await ext.setSettings({ version: 2, disabledSites: [] });
  await expect.poll(() => painted(page, 'marginalia-yellow')).toBe(1);
});
