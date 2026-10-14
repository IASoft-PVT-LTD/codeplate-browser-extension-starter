import { describe, expect, it } from 'vitest';
import { exportFile, toJson, toMarkdown } from '../../src/shared/export';
import type { PageRecord } from '../../src/shared/highlights';
import { isSupportedUrl, pageKey, shortUrl, siteOf } from '../../src/shared/url';

describe('urls', () => {
  it('keys a page without its #fragment or tracking parameters', () => {
    expect(pageKey('https://Example.com/post?id=3&utm_source=news&fbclid=x#comments')).toBe('https://example.com/post?id=3');
    expect(pageKey('https://example.com/post?utm_medium=mail')).toBe('https://example.com/post');
    expect(pageKey('http://example.com/')).toBe('http://example.com/');
  });

  it('names the site without www', () => {
    expect(siteOf('https://www.example.com/a')).toBe('example.com');
    expect(siteOf('http://localhost:8891/x')).toBe('localhost');
  });

  it('only supports http and https pages', () => {
    expect(isSupportedUrl('https://a.com')).toBe(true);
    expect(isSupportedUrl('chrome://extensions')).toBe(false);
    expect(isSupportedUrl('file:///C:/a.html')).toBe(false);
  });

  it('shortens urls for lists', () => {
    expect(shortUrl('https://www.example.com/a/b?x=1')).toBe('example.com/a/b?x=1');
    expect(shortUrl('https://example.com/')).toBe('example.com');
  });
});

const pages: PageRecord[] = [
  {
    url: 'https://example.com/a',
    title: 'A [draft] page',
    highlights: [
      { id: '1', url: 'https://example.com/a', anchor: { exact: 'line one\nline two', prefix: '', suffix: '' }, color: 'yellow', note: 'My note', createdAt: Date.UTC(2026, 9, 1), updatedAt: 0 },
      { id: '2', url: 'https://example.com/a', anchor: { exact: 'second', prefix: '', suffix: '' }, color: 'blue', note: '', createdAt: Date.UTC(2026, 9, 2), updatedAt: 0 },
    ],
  },
];
const NOW = Date.UTC(2026, 9, 14);

describe('export', () => {
  it('writes Markdown: a section per page, quotes, notes', () => {
    const md = toMarkdown(pages, NOW);
    expect(md).toContain('# Marginalia highlights');
    expect(md).toContain('## [A \\[draft\\] page](https://example.com/a)');
    expect(md).toContain('> line one\n> line two\n\nMy note');
    expect(md).toContain('<sub>blue · 2026-10-02</sub>');
  });

  it('writes versioned JSON that reads back', () => {
    const data = JSON.parse(toJson(pages, NOW));
    expect(data).toMatchObject({ app: 'Marginalia', format: 1, exportedAt: '2026-10-14T00:00:00.000Z' });
    expect(data.pages).toEqual(pages);
  });

  it('names files by app and date', () => {
    expect(exportFile(pages, 'markdown', NOW)).toMatchObject({ name: 'marginalia-2026-10-14.md', mime: 'text/markdown' });
    expect(exportFile(pages, 'json', NOW).name).toBe('marginalia-2026-10-14.json');
  });
});
