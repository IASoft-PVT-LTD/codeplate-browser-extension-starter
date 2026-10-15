// The list of highlights, used by the popup and the side panel: a card per
// highlight with its quote, note, time and actions (go to, edit note, delete).
// Changes go to the service worker; the list redraws from storage events.
import type { Highlight } from '../shared/highlights';
import { sendToBackground } from '../shared/messages';
import { el, relativeTime, replace } from './dom';
import { icon } from './icons';

export interface ListOptions {
  /** Ids not found on the open page (marked "Not on page"). */
  missing?: string[];
  /** Clicking the quote: scroll to it on the page, or open its page. */
  onOpen: (h: Highlight) => void;
  /** Text under the quote, e.g. the page title in "All pages". */
  subtitle?: (h: Highlight) => string;
}

export function highlightCard(h: Highlight, opts: ListOptions): HTMLElement {
  const card = el('article', { class: 'card', 'data-color': h.color, 'data-testid': 'highlight', 'data-id': h.id });
  const noteBox = el('div', {});

  const showNote = () => replace(noteBox, h.note.trim() ? el('div', { class: 'note', 'data-testid': 'highlight-note' }, h.note) : null);
  const editNote = () => {
    const input = el('textarea', { value: h.note, 'aria-label': 'Note', placeholder: 'Add a note…', 'data-testid': 'note-input' });
    const save = async () => {
      await sendToBackground('highlights:update', { url: h.url, id: h.id, patch: { note: input.value } });
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void save();
      if (e.key === 'Escape') showNote();
    });
    replace(
      noteBox,
      input,
      el(
        'div',
        { class: 'edit-row' },
        el('button', { class: 'btn', onclick: showNote }, 'Cancel'),
        el('button', { class: 'btn primary', 'data-testid': 'note-save', onclick: () => void save() }, 'Save note'),
      ),
    );
    input.focus();
  };
  showNote();

  const missing = opts.missing?.includes(h.id);
  replace(
    card,
    el('button', { class: 'quote', title: 'Show on the page', 'data-testid': 'highlight-quote', onclick: () => opts.onOpen(h) }, h.anchor.exact),
    noteBox,
    el(
      'div',
      { class: 'meta' },
      missing ? el('span', { class: 'badge', title: "The page changed and this text isn't on it any more" }, 'Not on page') : null,
      el('span', { class: 'grow', title: new Date(h.createdAt).toLocaleString() }, opts.subtitle?.(h) ?? relativeTime(h.createdAt)),
      el(
        'span',
        { class: 'actions' },
        el('button', { class: 'icon-btn', title: h.note ? 'Edit note' : 'Add a note', 'aria-label': h.note ? 'Edit note' : 'Add a note', 'data-testid': 'edit-note', onclick: editNote }, icon('pencil', 16)),
        el(
          'button',
          {
            class: 'icon-btn danger',
            title: 'Delete highlight',
            'aria-label': 'Delete highlight',
            'data-testid': 'delete-highlight',
            onclick: () => void sendToBackground('highlights:delete', { url: h.url, id: h.id }),
          },
          icon('trash', 16),
        ),
      ),
    ),
  );
  return card;
}

export function emptyState(title: string, body: (Node | string)[]): HTMLElement {
  return el('div', { class: 'empty', 'data-testid': 'empty' }, el('div', { class: 'art' }, icon('note', 36)), el('h2', {}, title), el('p', {}, ...body));
}
