// The extension's own pages: popup, side panel and options, each opened in a
// tab and pointed at a test page with ?tab=<id> (a real popup can't be opened
// by a test; the page is the same).
import { readFileSync } from 'node:fs';
import { expect, ORIGIN, painted, test } from './fixtures';

const ARTICLE = `${ORIGIN}/article.html`;
const RECIPES = `${ORIGIN}/recipes.html`;
const anchor = (exact: string) => ({ exact, prefix: '', suffix: '' });

test.describe('popup', () => {
  test('lists the page highlights, searches them, exports them', async ({ page, ext }) => {
    await page.goto('/article.html');
    const tab = await ext.tabIdFor('/article.html');
    await ext.add({ url: ARTICLE, title: 'Notes in the Margin', anchor: anchor('readers argued with their books'), color: 'yellow', note: 'talking back' });
    await ext.add({ url: ARTICLE, title: 'Notes in the Margin', anchor: anchor('Keep your notes short'), color: 'green' });

    const popup = await ext.open(`popup.html?tab=${tab}`, { width: 360, height: 600 });
    await expect(popup.getByTestId('highlight')).toHaveCount(2);
    await expect(popup.getByTestId('count')).toHaveText('2 highlights on this page');
    await expect(popup.getByTestId('highlight-note')).toHaveText('talking back');

    await popup.getByTestId('search').fill('short');
    await expect(popup.getByTestId('highlight')).toHaveCount(1);
    await expect(popup.getByTestId('highlight-quote')).toHaveText('Keep your notes short');

    // Clicking a quote scrolls the page to it and flashes it.
    await popup.getByTestId('highlight-quote').click();
    await expect.poll(() => painted(page, 'marginalia-flash')).toBe(1);

    const download = popup.waitForEvent('download');
    await popup.getByTestId('export-markdown').click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^marginalia-\d{4}-\d{2}-\d{2}\.md$/);
    const text = readFileSync((await file.path())!, 'utf8');
    expect(text).toContain('> readers argued with their books');
    expect(text).toContain('talking back');
  });

  test('the site switch turns the extension off and on for this site', async ({ page, ext }) => {
    await page.goto('/article.html');
    const tab = await ext.tabIdFor('/article.html');
    await ext.add({ url: ARTICLE, title: 'x', anchor: anchor('Keep your notes short'), color: 'yellow' });
    const popup = await ext.open(`popup.html?tab=${tab}`, { width: 360, height: 600 });
    await expect(popup.getByText('localhost', { exact: true })).toBeVisible();

    await popup.getByTestId('site-toggle').uncheck();
    await expect(popup.getByTestId('empty')).toContainText('Off on localhost');
    expect((await ext.settings()).disabledSites).toEqual(['localhost']);
    await expect.poll(() => painted(page, 'marginalia-yellow')).toBe(0);

    await popup.getByTestId('site-toggle').check();
    await expect(popup.getByTestId('highlight')).toHaveCount(1);
    await expect.poll(() => painted(page, 'marginalia-yellow')).toBe(1);
  });

  test('says so on pages it can not run on', async ({ ext }) => {
    const blank = await ext.context.newPage();
    await blank.goto('about:blank');
    const tab = await ext.api.evaluate(async () => (await chrome.tabs.query({})).at(-1)!.id!);
    const popup = await ext.open(`popup.html?tab=${tab}`, { width: 360, height: 600 });
    await expect(popup.getByTestId('empty')).toContainText("can't run here");
  });
});

test.describe('side panel', () => {
  test('this page and all pages, with note editing and delete', async ({ page, ext }) => {
    await page.goto('/article.html');
    const tab = await ext.tabIdFor('/article.html');
    const h = await ext.add({ url: ARTICLE, title: 'Notes in the Margin', anchor: anchor('Writing while reading slows you down'), color: 'blue' });
    await ext.add({ url: RECIPES, title: 'Weeknight Bread, Simplified', anchor: anchor('Let it cool for at least an hour'), color: 'pink', note: 'Patience' });

    const panel = await ext.open(`sidepanel.html?tab=${tab}`, { width: 400, height: 800 });
    await expect(panel.getByTestId('panel-page')).toHaveText('Notes in the Margin: A Short History');
    await expect(panel.getByTestId('highlight')).toHaveCount(1);

    // Add a note in the panel: saved, and underlined on the page.
    await panel.getByTestId('edit-note').click();
    await panel.getByTestId('note-input').fill('Slow is good');
    await panel.getByTestId('note-save').click();
    await expect(panel.getByTestId('highlight-note')).toHaveText('Slow is good');
    await expect.poll(() => painted(page, 'marginalia-note')).toBe(1);

    await panel.getByTestId('view-all').click();
    await expect(panel.getByTestId('page-group')).toHaveCount(2);
    await panel.getByTestId('search').fill('patience');
    await expect(panel.getByTestId('highlight')).toHaveCount(1);
    await expect(panel.getByTestId('page-group')).toContainText('Weeknight Bread');

    const download = panel.waitForEvent('download');
    await panel.getByTestId('export-json').click();
    const data = JSON.parse(readFileSync((await (await download).path())!, 'utf8'));
    expect(data.pages).toHaveLength(2);

    await panel.getByTestId('view-page').click();
    await panel.getByTestId('search').fill('');
    await panel.getByTestId('delete-highlight').click();
    await expect(panel.getByTestId('empty')).toBeVisible();
    await expect.poll(() => painted(page, 'marginalia-blue')).toBe(0);
    expect((await ext.pages()).map((p) => p.url)).toEqual([RECIPES]);
    expect(h.id).toBeTruthy();
  });
});

test.describe('options', () => {
  test('shows the CodePlate credit in About', async ({ ext }) => {
    const options = await ext.open('options.html');
    const credit = options.getByTestId('credit');
    await expect(credit).toBeVisible();
    await expect(credit).toHaveText('Built with CodePlate (codeplate.io)');
    await expect(credit.locator('a')).toHaveAttribute('href', 'https://codeplate.io');
  });

  test('saves settings as they change', async ({ ext }) => {
    const options = await ext.open('options.html');
    await options.getByTestId('default-color-blue').click();
    await expect(options.getByTestId('default-color-blue')).toHaveAttribute('aria-checked', 'true');
    await options.getByTestId('toolbar-toggle').uncheck();
    await options.getByTestId('theme-dark').click();
    await expect(options.locator('html')).toHaveAttribute('data-theme', 'dark');

    await options.getByTestId('site-input').fill('https://www.Example.com/some/page');
    await options.getByTestId('site-add').click();
    await expect(options.getByTestId('disabled-sites')).toContainText('example.com');
    expect(await ext.settings()).toMatchObject({ defaultColor: 'blue', selectionToolbar: false, theme: 'dark', disabledSites: ['example.com'] });

    await options.getByTestId('enable-example.com').click();
    await expect(options.getByTestId('no-disabled-sites')).toBeVisible();
  });

  test('migrates settings saved by version 1', async ({ ext }) => {
    await ext.setSettings({ color: 'pink', toolbar: false, theme: 'light' });
    const options = await ext.open('options.html');
    await expect(options.getByTestId('default-color-pink')).toHaveAttribute('aria-checked', 'true');
    await expect(options.getByTestId('toolbar-toggle')).not.toBeChecked();
    await expect.poll(() => ext.settings()).toMatchObject({ version: 2, defaultColor: 'pink', selectionToolbar: false, disabledSites: [] });
  });

  test('lists the keyboard shortcuts and deletes all data after a second click', async ({ ext }) => {
    await ext.add({ url: ARTICLE, title: 'x', anchor: anchor('Keep your notes short'), color: 'yellow' });
    const options = await ext.open('options.html');
    await expect(options.getByTestId('section-shortcuts')).toContainText('Highlight the selected text');
    await expect(options.getByTestId('data-summary')).toContainText('1 highlight on 1 page');
    await options.getByTestId('delete-all').click();
    await expect(options.getByTestId('delete-all')).toHaveText('Click again to delete 1 highlight');
    await options.getByTestId('delete-all').click();
    await expect(options.getByTestId('data-summary')).toContainText('0 highlights on 0 pages');
  });
});

test.describe('shortcuts', () => {
  // A suggested key the browser keeps for itself (or another extension already uses) is
  // silently left unassigned: chrome://extensions/shortcuts shows "Not set". Ask the
  // browser what it really assigned (a fresh profile, so no other extension is in the way).
  test('every suggested shortcut is assigned by the browser', async ({ ext }) => {
    const { suggested, assigned, os } = await ext.api.evaluate(async () => {
      const { os } = await chrome.runtime.getPlatformInfo();
      const commands = (chrome.runtime.getManifest().commands ?? {}) as Record<string, { suggested_key?: Record<string, string> }>;
      const suggested = Object.fromEntries(
        Object.entries(commands).flatMap(([name, c]) => (c.suggested_key ? [[name, c.suggested_key[os] ?? c.suggested_key.default]] : [])),
      );
      const assigned = Object.fromEntries((await chrome.commands.getAll()).map((c) => [c.name, c.shortcut || 'Not set']));
      return { suggested, assigned, os };
    });
    expect(Object.keys(suggested).length).toBeGreaterThan(0);
    for (const [name, key] of Object.entries(suggested)) {
      // macOS reports keys as symbols (⌥⇧M): there, only check that one was assigned.
      if (os === 'mac') expect(assigned[name], `${name} (${key})`).not.toBe('Not set');
      else expect(assigned[name], `${name}: suggested ${key}`).toBe(key);
    }
  });
});
