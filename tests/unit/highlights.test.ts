import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_NOTE,
  addHighlight,
  allPages,
  deleteAll,
  deleteHighlight,
  listForPage,
  listPages,
  onHighlightsChange,
  pageItemKey,
  searchHighlights,
  updateHighlight,
  type NewHighlight,
} from '../../src/shared/highlights';
import { installFakeChrome } from '../fakes/chrome';

let fake: ReturnType<typeof installFakeChrome>;
beforeEach(() => {
  fake = installFakeChrome();
});

const A = 'https://example.com/a';
const B = 'https://example.com/b';
const draft = (url: string, exact: string, extra: Partial<NewHighlight> = {}): NewHighlight => ({
  url,
  title: `Page ${url.slice(-1)}`,
  anchor: { exact, prefix: '', suffix: '' },
  color: 'yellow',
  ...extra,
});

describe('highlights', () => {
  it('stores one item per page under page:<url>', async () => {
    const h = await addHighlight(draft(A, 'first'));
    expect(h.id).toMatch(/[0-9a-f-]{36}/);
    expect([...fake.local.keys()]).toEqual([pageItemKey(A)]);
    expect(await listForPage(A)).toEqual([h]);
    expect(await listForPage(B)).toEqual([]);
  });

  it('keeps highlights in the order they were made', async () => {
    await addHighlight(draft(A, 'one'), 1);
    await addHighlight(draft(A, 'two'), 2);
    expect((await listForPage(A)).map((h) => h.anchor.exact)).toEqual(['one', 'two']);
  });

  it('updates a note and color, and cuts very long notes', async () => {
    const h = await addHighlight(draft(A, 'text'), 1);
    const u = await updateHighlight(A, h.id, { note: 'x'.repeat(MAX_NOTE + 10), color: 'blue' }, 5);
    expect(u?.note).toHaveLength(MAX_NOTE);
    expect(u?.color).toBe('blue');
    expect(u?.updatedAt).toBe(5);
    expect(await updateHighlight(A, 'missing', { note: 'x' })).toBeNull();
  });

  it('removes a page once its last highlight is deleted', async () => {
    const one = await addHighlight(draft(A, 'one'));
    const two = await addHighlight(draft(A, 'two'));
    expect(await deleteHighlight(A, one.id)).toBe(true);
    expect(await listForPage(A)).toEqual([two]);
    await deleteHighlight(A, two.id);
    expect(fake.local.size).toBe(0);
    expect(await deleteHighlight(A, two.id)).toBe(false);
  });

  it('lists pages newest first, and deletes everything', async () => {
    await addHighlight(draft(A, 'old'), 1);
    await addHighlight(draft(B, 'new'), 2);
    expect((await listPages()).map((p) => [p.url, p.count])).toEqual([
      [B, 1],
      [A, 1],
    ]);
    fake.local.set('unrelated', 1);
    expect(await deleteAll()).toBe(2);
    expect([...fake.local.keys()]).toEqual(['unrelated']);
  });

  it('tells listeners about changes to one page, or any page', async () => {
    const one = vi.fn();
    const any = vi.fn();
    onHighlightsChange(A, one);
    onHighlightsChange(null, any);
    await addHighlight(draft(B, 'b'));
    expect(one).not.toHaveBeenCalled();
    expect(any).toHaveBeenCalledTimes(1);
    await addHighlight(draft(A, 'a'));
    expect(one).toHaveBeenCalledWith(expect.objectContaining({ url: A }));
  });
});

describe('searchHighlights', () => {
  it('matches every word in quote, note, title or address, newest first', async () => {
    await addHighlight(draft(A, 'The quick brown fox', { note: 'animals' }), 1);
    await addHighlight(draft(B, 'Slow fermentation', { note: 'bread' }), 2);
    const pages = await allPages();
    expect(searchHighlights(pages, '').map((h) => h.highlight.anchor.exact)).toEqual(['Slow fermentation', 'The quick brown fox']);
    expect(searchHighlights(pages, 'QUICK animals').map((h) => h.highlight.anchor.exact)).toEqual(['The quick brown fox']);
    expect(searchHighlights(pages, 'fermentation page')).toHaveLength(1);
    expect(searchHighlights(pages, 'example.com/a')).toHaveLength(1);
    expect(searchHighlights(pages, 'quick bread')).toHaveLength(0);
  });
});
