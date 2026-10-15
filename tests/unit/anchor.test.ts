// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { CONTEXT, describeRange, findAnchor, indexText, locate } from '../../src/shared/anchor';

function page(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body;
}

/** A range over the n-th occurrence of `text` in the body's text. */
function select(text: string, nth = 0): Range {
  const index = indexText(document.body);
  let at = -1;
  for (let i = 0; i <= nth; i++) at = index.text.indexOf(text, at + 1);
  const find = (offset: number) => index.nodes.findLast((n) => n.start <= offset)!;
  const a = find(at);
  const b = find(at + text.length - 1);
  const r = document.createRange();
  r.setStart(a.node, at - a.start);
  r.setEnd(b.node, at + text.length - b.start);
  return r;
}

describe('anchors', () => {
  it('describes a selection with its context and finds it again', () => {
    page('<p>Long before anyone could select text, readers argued with their books.</p>');
    const anchor = describeRange(select('readers argued'), indexText(document.body))!;
    expect(anchor.exact).toBe('readers argued');
    expect(anchor.prefix.endsWith('select text, ')).toBe(true);
    expect(anchor.prefix.length).toBeLessThanOrEqual(CONTEXT);
    expect(anchor.suffix.startsWith(' with their')).toBe(true);
    expect(findAnchor(anchor, indexText(document.body))?.toString()).toBe('readers argued');
  });

  it('works across elements', () => {
    page('<p>One <b>bold</b> move and <i>an italic</i> end.</p>');
    const anchor = describeRange(select('bold move and an'), indexText(document.body))!;
    expect(anchor.exact).toBe('bold move and an');
    expect(findAnchor(anchor, indexText(document.body))?.toString()).toBe('bold move and an');
  });

  it('picks the right copy of repeated text by its context', () => {
    page('<p>the cat sat here.</p><p>a dog sat there.</p><p>the bird sat nowhere.</p>');
    const anchor = describeRange(select('sat', 1), indexText(document.body))!;
    const found = findAnchor(anchor, indexText(document.body))!;
    expect(found.startContainer.textContent).toBe('a dog sat there.');
  });

  it('still finds text after the page changes around it', () => {
    page('<p>Intro.</p><p>Keep your notes short and honest.</p>');
    const anchor = describeRange(select('notes short'), indexText(document.body))!;
    page('<aside>New banner!</aside><p>Intro.</p><p>Keep your notes short and honest.</p><footer>More</footer>');
    expect(findAnchor(anchor, indexText(document.body))?.toString()).toBe('notes short');
  });

  it('returns null when the text is gone', () => {
    page('<p>Something else entirely.</p>');
    expect(findAnchor({ exact: 'vanished words', prefix: '', suffix: '' }, indexText(document.body))).toBeNull();
  });

  it('ignores scripts, styles and ignored elements', () => {
    page('<p>Visible</p><script>var hidden = 1</script><style>p{}</style><div data-skip>skip me</div>');
    expect(indexText(document.body, (el) => el.hasAttribute('data-skip')).text).toBe('Visible');
  });

  it('rejects empty or whitespace-only selections', () => {
    page('<p>a   b</p>');
    expect(describeRange(select('   '), indexText(document.body))).toBeNull();
  });

  it('locates by best context score', () => {
    expect(locate({ exact: 'x', prefix: 'b', suffix: '' }, 'ax bx cx')).toEqual([4, 5]);
  });
});
