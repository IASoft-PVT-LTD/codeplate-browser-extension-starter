// Export buttons: turn stored pages into a file and download it. A download
// started from an extension page needs no "downloads" permission.
import { exportFile } from '../shared/export';
import type { PageRecord } from '../shared/highlights';
import { el } from './dom';
import { icon } from './icons';

export function download(name: string, mime: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** "Export: Markdown · JSON" buttons; `pages()` is read when one is clicked. */
export function exportButtons(pages: () => Promise<PageRecord[]>): HTMLElement[] {
  const make = (format: 'markdown' | 'json', label: string) =>
    el(
      'button',
      {
        class: 'btn',
        title: `Download as ${label}`,
        'data-testid': `export-${format}`,
        onclick: async () => {
          const f = exportFile(await pages(), format);
          download(f.name, f.mime, f.content);
        },
      },
      icon('download', 14),
      label,
    );
  return [make('markdown', 'Markdown'), make('json', 'JSON')];
}
