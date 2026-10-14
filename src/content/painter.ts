// Draws highlights with the CSS Custom Highlight API: ranges registered in
// CSS.highlights and styled by ::highlight() rules in content.css. The page's
// DOM is never changed (no <mark> wrappers), so the extension can't break a
// page's layout or scripts, and removing a highlight is just forgetting a range.
import { findAnchor, indexText } from '../shared/anchor';
import type { Highlight } from '../shared/highlights';
import { COLORS } from '../shared/settings';

/** Highlight names, styled in src/content/content.css. */
export const PAINT = {
  color: (c: string) => `marginalia-${c}`,
  note: 'marginalia-note',
  flash: 'marginalia-flash',
} as const;

export interface Painted {
  ranges: Map<string, Range>;
  /** Ids of highlights whose text isn't on the page (any more, or yet). */
  missing: string[];
}

const supported = () => typeof CSS !== 'undefined' && 'highlights' in CSS && typeof Highlight !== 'undefined';

export function clearPaint(): void {
  if (!supported()) return;
  for (const c of COLORS) CSS.highlights.delete(PAINT.color(c));
  CSS.highlights.delete(PAINT.note);
  CSS.highlights.delete(PAINT.flash);
}

/** Finds every highlight in the page and paints it; replaces whatever was painted before. */
export function paint(highlights: Highlight[], root: HTMLElement = document.body): Painted {
  const ranges = new Map<string, Range>();
  const missing: string[] = [];
  clearPaint();
  if (!supported() || !root) return { ranges, missing: highlights.map((h) => h.id) };
  const index = indexText(root);
  const byColor = new Map<string, Range[]>();
  const withNotes: Range[] = [];
  for (const h of highlights) {
    const range = findAnchor(h.anchor, index);
    if (!range) {
      missing.push(h.id);
      continue;
    }
    ranges.set(h.id, range);
    byColor.set(h.color, [...(byColor.get(h.color) ?? []), range]);
    if (h.note.trim()) withNotes.push(range);
  }
  for (const [color, list] of byColor) CSS.highlights.set(PAINT.color(color), new Highlight(...list));
  if (withNotes.length) CSS.highlights.set(PAINT.note, new Highlight(...withNotes));
  return { ranges, missing };
}

/** The id of the highlight under a point on screen, if any. */
export function hitTest(ranges: Map<string, Range>, x: number, y: number): string | null {
  const caret = caretAt(x, y);
  if (!caret) return null;
  for (const [id, range] of ranges) {
    try {
      if (range.isPointInRange(caret.node, caret.offset)) {
        // isPointInRange is true at the very end too; make sure the point is on the text.
        const rects = [...range.getClientRects()];
        if (rects.some((r) => x >= r.left - 1 && x <= r.right + 1 && y >= r.top - 1 && y <= r.bottom + 1)) return id;
      }
    } catch {
      // The range's nodes left the page.
    }
  }
  return null;
}

function caretAt(x: number, y: number): { node: Node; offset: number } | null {
  const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
  const pos = doc.caretPositionFromPoint?.(x, y);
  if (pos) return { node: pos.offsetNode, offset: pos.offset };
  const range = document.caretRangeFromPoint?.(x, y);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}

/** Scrolls a highlight into view and flashes it for a moment. */
export function reveal(range: Range): void {
  const target = range.startContainer.parentElement;
  target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  if (!supported()) return;
  const flash = new Highlight(range);
  flash.priority = 1;
  CSS.highlights.set(PAINT.flash, flash);
  setTimeout(() => CSS.highlights.get(PAINT.flash) === flash && CSS.highlights.delete(PAINT.flash), 1400);
}
