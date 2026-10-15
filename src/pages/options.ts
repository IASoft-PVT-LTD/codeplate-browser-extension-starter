// The options page (right-click the toolbar button → Options, or the gear in
// the popup). Every control saves at once with saveSettings(); there's no Save
// button. Sections: Highlighting, Appearance, Sites, Keyboard shortcuts, Your
// data, About (with the CodePlate credit the free license asks for).
import { BRAND, CREDIT } from '../shared/brand';
import { allPages, listPages, onHighlightsChange } from '../shared/highlights';
import { sendToBackground } from '../shared/messages';
import { COLORS, THEMES, onSettingsChange, saveSettings, type Settings } from '../shared/settings';
import { el, replace } from '../ui/dom';
import { exportButtons } from '../ui/export';
import { icon, logo, type IconName } from '../ui/icons';
import { startPage } from '../ui/page';

const app = document.getElementById('app')!;
document.title = `${BRAND.name} settings`;
let settings = await startPage();

const section = (id: string, title: string, iconName: IconName, ...body: (Node | null)[]) =>
  el('section', { class: 'panel', id, 'aria-labelledby': `${id}-title`, 'data-testid': `section-${id}` }, el('h2', { id: `${id}-title` }, icon(iconName, 18), title), ...body);

const row = (label: string, hint: string, control: Node) =>
  el('div', { class: 'row' }, el('div', { class: 'grow' }, el('div', { class: 'label' }, label), el('div', { class: 'hint' }, hint)), control);

const switchInput = (checked: boolean, label: string, testid: string, onChange: (v: boolean) => void) =>
  el(
    'label',
    { class: 'switch' },
    el('input', { type: 'checkbox', role: 'switch', checked, 'aria-label': label, 'data-testid': testid, onchange: (e: Event) => onChange((e.target as HTMLInputElement).checked) }),
    el('span', {}),
  );

function highlighting(): HTMLElement {
  const swatches = el(
    'div',
    { class: 'swatches', role: 'radiogroup', 'aria-label': 'Default color' },
    COLORS.map((c) =>
      el('button', {
        class: `swatch swatch-${c}`,
        role: 'radio',
        'aria-checked': String(settings.defaultColor === c),
        'aria-label': c,
        title: c,
        'data-testid': `default-color-${c}`,
        onclick: () => void saveSettings({ defaultColor: c }),
      }),
    ),
  );
  return section(
    'highlighting',
    'Highlighting',
    'pencil',
    row('Default color', 'The color of a new highlight from the toolbar, right-click menu or shortcut.', swatches),
    row(
      'Color toolbar on selection',
      'Show the color toolbar when you select text on a page. Off: use the right-click menu or the shortcut.',
      switchInput(settings.selectionToolbar, 'Color toolbar on selection', 'toolbar-toggle', (v) => void saveSettings({ selectionToolbar: v })),
    ),
  );
}

function appearance(): HTMLElement {
  const labels: Record<Settings['theme'], string> = { system: 'System', light: 'Light', dark: 'Dark' };
  return section(
    'appearance',
    'Appearance',
    'settings',
    row(
      'Theme',
      'For the popup, the side panel, this page and the note editor on pages.',
      el(
        'div',
        { class: 'tabs', role: 'radiogroup', 'aria-label': 'Theme' },
        THEMES.map((t) =>
          el('button', { role: 'radio', 'aria-checked': String(settings.theme === t), 'aria-selected': String(settings.theme === t), 'data-testid': `theme-${t}`, onclick: () => void saveSettings({ theme: t }) }, labels[t]),
        ),
      ),
    ),
  );
}

function sites(): HTMLElement {
  const input = el('input', { type: 'text', placeholder: 'example.com', 'aria-label': 'Site to turn off', 'data-testid': 'site-input', class: 'text' });
  const add = (e: Event) => {
    e.preventDefault();
    const site = input.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
    if (site) void saveSettings({ disabledSites: [...settings.disabledSites, site] });
  };
  const list = settings.disabledSites.length
    ? el(
        'ul',
        { class: 'sites', 'data-testid': 'disabled-sites' },
        settings.disabledSites.map((s) =>
          el(
            'li',
            {},
            icon('globe', 16),
            el('span', { class: 'grow' }, s),
            el(
              'button',
              { class: 'btn', 'data-testid': `enable-${s}`, onclick: () => void saveSettings({ disabledSites: settings.disabledSites.filter((x) => x !== s) }) },
              'Turn on',
            ),
          ),
        ),
      )
    : el('p', { class: 'hint', 'data-testid': 'no-disabled-sites' }, `${BRAND.name} is on everywhere. Turn it off for a site here, or with the switch in the popup.`);
  return section(
    'sites',
    'Sites',
    'globe',
    el('p', { class: 'hint' }, `${BRAND.name} doesn't show or make highlights on these sites. Your highlights there are kept.`),
    list,
    el('form', { class: 'add-site', onsubmit: add }, input, el('button', { class: 'btn', type: 'submit', 'data-testid': 'site-add' }, 'Turn off')),
  );
}

async function shortcuts(): Promise<HTMLElement> {
  const commands = await chrome.commands.getAll();
  const names: Record<string, string> = { _execute_action: `Open ${BRAND.name}` };
  return section(
    'shortcuts',
    'Keyboard shortcuts',
    'keyboard',
    el(
      'ul',
      { class: 'keys' },
      commands.map((c) =>
        el(
          'li',
          {},
          el('span', { class: 'grow' }, names[c.name ?? ''] ?? c.description ?? c.name ?? ''),
          c.shortcut ? el('span', {}, c.shortcut.split('+').map((k, i) => [i ? '+' : '', el('kbd', {}, k)])) : el('span', { class: 'hint' }, 'Not set'),
        ),
      ),
    ),
    el(
      'button',
      // Extension pages may open the browser's own pages with chrome.tabs.create (links to them are blocked).
      { class: 'btn', onclick: () => void chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }) },
      icon('external', 14),
      'Change shortcuts',
    ),
  );
}

async function data(): Promise<HTMLElement> {
  const pages = await listPages();
  const count = pages.reduce((n, p) => n + p.count, 0);
  let armed = false;
  const del = el('button', {
    class: 'btn danger',
    'data-testid': 'delete-all',
    disabled: count === 0,
    onclick: async () => {
      if (!armed) {
        armed = true;
        del.textContent = `Click again to delete ${count} highlight${count === 1 ? '' : 's'}`;
        return;
      }
      await sendToBackground('highlights:delete-all', {});
    },
  }, 'Delete all highlights');
  return section(
    'data',
    'Your data',
    'shield',
    el(
      'p',
      { class: 'hint', 'data-testid': 'data-summary' },
      `${count} highlight${count === 1 ? '' : 's'} on ${pages.length} page${pages.length === 1 ? '' : 's'}. They're stored in this browser only and never sent anywhere.`,
    ),
    el('div', { class: 'buttons' }, el('span', { class: 'label' }, 'Export everything'), ...exportButtons(allPages), el('span', { class: 'grow' }), del),
  );
}

function about(): HTMLElement {
  const { version } = chrome.runtime.getManifest();
  return section(
    'about',
    'About',
    'note',
    el(
      'div',
      { class: 'about' },
      logo(44),
      el('div', {}, el('div', { class: 'label' }, `${BRAND.name} ${version}`), el('div', { class: 'hint' }, BRAND.tagline)),
    ),
    el('p', { class: 'hint' }, `Privacy: ${BRAND.privacy}`),
    el(
      'p',
      { class: 'credit', 'data-testid': 'credit' },
      el('a', { href: CREDIT.url, target: '_blank', rel: 'noreferrer' }, CREDIT.text),
    ),
  );
}

async function draw(): Promise<void> {
  replace(
    app,
    el('header', { class: 'page-head' }, logo(36), el('div', {}, el('h1', {}, BRAND.name), el('div', { class: 'hint' }, 'Settings'))),
    highlighting(),
    appearance(),
    sites(),
    await shortcuts(),
    await data(),
    about(),
  );
}

await draw();
onSettingsChange(async (s) => {
  settings = s;
  await draw();
});
onHighlightsChange(null, () => void draw());
