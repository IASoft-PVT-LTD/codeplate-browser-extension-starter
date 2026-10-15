// What the extension shows inside web pages: the color toolbar under a text
// selection and the note editor. Both live in one shadow root on <html>, so the
// page's CSS can't restyle them and theirs can't leak into the page.
// Styles: src/content/ui.css.ts. Every control has a data-testid for the e2e tests.
import type { Highlight } from '../shared/highlights';
import { COLORS, type Color, type Theme } from '../shared/settings';
import { el, replace } from '../ui/dom';
import { icon } from '../ui/icons';
import { UI_CSS } from './ui.css';

export const HOST_TAG = 'marginalia-ui';

export interface NoteEditorActions {
  save: (note: string, color: Color) => void;
  remove: () => void;
}

export class PageUi {
  private host: HTMLElement;
  private root: ShadowRoot;
  private toolbar: HTMLElement;
  private editor: HTMLElement;

  constructor() {
    this.host = document.createElement(HOST_TAG);
    // `all: initial` cuts off inherited page styles; the host takes no space.
    this.host.setAttribute('style', 'all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;');
    this.root = this.host.attachShadow({ mode: 'open' });
    this.root.append(el('style', {}, UI_CSS));
    this.toolbar = el('div', { class: 'toolbar', role: 'toolbar', 'aria-label': 'Highlight', hidden: true, 'data-testid': 'mg-toolbar' });
    this.editor = el('div', { class: 'editor', role: 'dialog', 'aria-label': 'Note', hidden: true, 'data-testid': 'mg-editor' });
    this.root.append(this.toolbar, this.editor);
    document.documentElement.append(this.host);
  }

  setTheme(theme: Theme): void {
    this.host.dataset.theme = theme;
    this.root.host.setAttribute('data-theme', theme);
  }

  /** True if an event happened inside the extension's own UI. */
  contains(target: EventTarget | null): boolean {
    return target === this.host;
  }

  /** Shows the toolbar under `rect` (the selection's bounding box, in viewport pixels). */
  showToolbar(rect: DOMRect, defaultColor: Color, onPick: (color: Color, withNote: boolean) => void): void {
    replace(
      this.toolbar,
      COLORS.map((c) =>
        el('button', {
          class: `swatch swatch-${c}${c === defaultColor ? ' is-default' : ''}`,
          title: `Highlight ${c}`,
          'aria-label': `Highlight ${c}`,
          'data-testid': `mg-color-${c}`,
          onmousedown: (e: Event) => e.preventDefault(), // keep the page's selection
          onclick: () => onPick(c, false),
        }),
      ),
      el('span', { class: 'sep', 'aria-hidden': 'true' }),
      el(
        'button',
        { class: 'tool', title: 'Highlight with a note', 'aria-label': 'Highlight with a note', 'data-testid': 'mg-note', onmousedown: (e: Event) => e.preventDefault(), onclick: () => onPick(defaultColor, true) },
        icon('note', 16),
      ),
    );
    this.toolbar.hidden = false;
    this.place(this.toolbar, rect, 196, 40);
  }

  hideToolbar(): void {
    this.toolbar.hidden = true;
  }

  get toolbarVisible(): boolean {
    return !this.toolbar.hidden;
  }

  get editorOpen(): boolean {
    return !this.editor.hidden;
  }

  /** Opens the note editor for a highlight, under `rect`. */
  openEditor(h: Highlight, rect: DOMRect, actions: NoteEditorActions): void {
    let color = h.color;
    const textarea = el('textarea', { class: 'note', rows: 4, placeholder: 'Add a note…', 'aria-label': 'Note', 'data-testid': 'mg-note-input', value: h.note });
    const swatches = el('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Color' });
    const drawSwatches = () =>
      replace(
        swatches,
        COLORS.map((c) =>
          el('button', {
            class: `swatch swatch-${c}`,
            role: 'radio',
            'aria-checked': String(c === color),
            'aria-label': c,
            title: c,
            'data-testid': `mg-editor-color-${c}`,
            onclick: () => {
              color = c;
              drawSwatches();
            },
          }),
        ),
      );
    drawSwatches();
    const save = () => {
      actions.save(textarea.value, color);
      this.closeEditor();
    };
    replace(
      this.editor,
      el('blockquote', { class: 'quote' }, h.anchor.exact.length > 160 ? `${h.anchor.exact.slice(0, 160).trim()}…` : h.anchor.exact),
      textarea,
      el(
        'div',
        { class: 'row' },
        swatches,
        el('span', { class: 'grow' }),
        el(
          'button',
          {
            class: 'tool danger',
            title: 'Delete highlight',
            'aria-label': 'Delete highlight',
            'data-testid': 'mg-delete',
            onclick: () => {
              actions.remove();
              this.closeEditor();
            },
          },
          icon('trash', 16),
        ),
        el('button', { class: 'btn', 'data-testid': 'mg-cancel', onclick: () => this.closeEditor() }, 'Cancel'),
        el('button', { class: 'btn primary', 'data-testid': 'mg-save', onclick: save }, 'Save'),
      ),
    );
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save();
      if (e.key === 'Escape') this.closeEditor();
      // Keep the page's own keyboard shortcuts away from typing.
      e.stopPropagation();
    });
    this.editor.hidden = false;
    this.place(this.editor, rect, 320, 230);
    textarea.focus();
  }

  closeEditor(): void {
    this.editor.hidden = true;
  }

  /** Puts a box under (or, near the bottom of the window, above) a rect, inside the viewport. */
  private place(box: HTMLElement, rect: DOMRect, width: number, height: number): void {
    const margin = 8;
    const left = Math.min(Math.max(margin, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - margin);
    const below = rect.bottom + margin;
    const top = below + height > window.innerHeight ? Math.max(margin, rect.top - height - margin) : below;
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
  }

  destroy(): void {
    this.host.remove();
  }
}
