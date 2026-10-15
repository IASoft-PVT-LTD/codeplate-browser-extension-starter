// Export formats. Pure functions over stored pages; the pages' export buttons
// (src/ui/export.ts) turn the result into a download.
import { BRAND } from './brand';
import type { PageRecord } from './highlights';

export interface ExportFile {
  name: string;
  mime: string;
  content: string;
}

const day = (t: number) => new Date(t).toISOString().slice(0, 10);

/** One "## Page" section per page, a quote per highlight, the note under it. */
export function toMarkdown(pages: PageRecord[], now = Date.now()): string {
  const out = [`# ${BRAND.name} highlights`, '', `Exported ${day(now)}.`, ''];
  for (const page of pages) {
    out.push(`## [${escapeMd(page.title || page.url)}](${page.url})`, '');
    for (const h of page.highlights) {
      out.push(...h.anchor.exact.trim().split(/\r?\n/).map((line) => `> ${line}`));
      if (h.note.trim()) out.push('', ...h.note.trim().split(/\r?\n/));
      out.push('', `<sub>${h.color} · ${day(h.createdAt)}</sub>`, '');
    }
  }
  return out.join('\n');
}

const escapeMd = (s: string) => s.replace(/([[\]\\])/g, '\\$1');

/** A versioned JSON file: what an import (or another app) reads back. */
export function toJson(pages: PageRecord[], now = Date.now()): string {
  return JSON.stringify({ app: BRAND.name, format: 1, exportedAt: new Date(now).toISOString(), pages }, null, 2);
}

export function exportFile(pages: PageRecord[], format: 'markdown' | 'json', now = Date.now()): ExportFile {
  const base = `${BRAND.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${day(now)}`;
  return format === 'json'
    ? { name: `${base}.json`, mime: 'application/json', content: toJson(pages, now) }
    : { name: `${base}.md`, mime: 'text/markdown', content: toMarkdown(pages, now) };
}
