// Finding highlighted text again. A highlight is stored as a text quote: the
// exact text plus up to CONTEXT characters on each side. When the page loads,
// every place the exact text appears is scored by how much of the context
// matches, and the best one wins. That survives most page changes (ads,
// reordered sidebars, new comments) without storing fragile DOM paths.
import type { Anchor } from './highlights';

export const CONTEXT = 32;

/** Elements whose text isn't readable page text. */
const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'TEMPLATE', 'IFRAME', 'SVG', 'CANVAS']);

export interface TextIndex {
  text: string;
  nodes: { node: Text; start: number }[];
}

/** All readable text under `root`, in document order, with where each text node starts. */
export function indexText(root: Node, ignore?: (el: Element) => boolean): TextIndex {
  const nodes: TextIndex['nodes'] = [];
  let text = '';
  const doc = root.ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (n.nodeType === Node.ELEMENT_NODE) {
        const el = n as Element;
        if (SKIP.has(el.tagName.toUpperCase()) || ignore?.(el)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_SKIP;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text;
    nodes.push({ node: t, start: text.length });
    text += t.data;
  }
  return { text, nodes };
}

/** The offset in index.text of a (text node, offset) point, or -1 if the node isn't indexed. */
function offsetOf(index: TextIndex, node: Node, offset: number): number {
  if (node.nodeType === Node.TEXT_NODE) {
    const entry = index.nodes.find((e) => e.node === node);
    return entry ? entry.start + offset : -1;
  }
  // An element boundary (a triple-click selects up to the start of the next
  // paragraph): the first indexed text that starts at or after the point.
  const point = (node.ownerDocument ?? (node as Document)).createRange();
  point.setStart(node, offset);
  for (const e of index.nodes) if (point.comparePoint(e.node, 0) >= 0) return e.start;
  return index.text.length;
}

/** Turns a selection range into an anchor, or null if it holds no indexed text. */
export function describeRange(range: Range, index: TextIndex): Anchor | null {
  const start = offsetOf(index, range.startContainer, range.startOffset);
  const end = offsetOf(index, range.endContainer, range.endOffset);
  if (start < 0 || end < 0 || end <= start) return null;
  const exact = index.text.slice(start, end);
  if (!exact.trim()) return null;
  return {
    exact,
    prefix: index.text.slice(Math.max(0, start - CONTEXT), start),
    suffix: index.text.slice(end, end + CONTEXT),
  };
}

/** How many characters agree, counting from the end of `a` and `b` (for prefixes). */
function commonSuffix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}
function commonPrefix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

/** Where an anchor is in the text: [start, end) offsets, or null if the text isn't there. */
export function locate(anchor: Anchor, text: string): [number, number] | null {
  let best: [number, number] | null = null;
  let bestScore = -1;
  for (let at = text.indexOf(anchor.exact); at !== -1; at = text.indexOf(anchor.exact, at + 1)) {
    const end = at + anchor.exact.length;
    const score =
      commonSuffix(text.slice(Math.max(0, at - anchor.prefix.length), at), anchor.prefix) +
      commonPrefix(text.slice(end, end + anchor.suffix.length), anchor.suffix);
    if (score > bestScore) {
      best = [at, end];
      bestScore = score;
    }
  }
  return best;
}

/** A DOM range for [start, end) of index.text. */
export function rangeFor(index: TextIndex, start: number, end: number): Range | null {
  const doc = index.nodes[0]?.node.ownerDocument;
  if (!doc) return null;
  const pos = (offset: number, isEnd: boolean) => {
    for (const e of index.nodes) {
      const len = e.node.data.length;
      // An end exactly at a node boundary stays in the earlier node.
      if (isEnd ? offset <= e.start + len : offset < e.start + len) return { node: e.node, offset: offset - e.start };
    }
    return null;
  };
  const a = pos(start, false);
  const b = pos(end, true);
  if (!a || !b) return null;
  const range = doc.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  return range;
}

/** Finds an anchor in the page: a range, or null if the text is gone. */
export function findAnchor(anchor: Anchor, index: TextIndex): Range | null {
  const at = locate(anchor, index.text);
  return at ? rangeFor(index, at[0], at[1]) : null;
}
