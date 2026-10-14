// Drafts the store listing and the privacy policy from the manifest, so what
// the user pastes into the Chrome Web Store (and Edge Add-ons) matches what the
// extension really asks for:
//   docs/store-listing.md     the listing and privacy-practices fields, with a
//                             justification for every permission and host
//                             pattern (REASONS in src/manifest.ts)
//   docs/privacy-policy.md    a privacy policy draft to publish on the user's site
//
//   npm run listing              write both (creates them, or refreshes them)
//   npm run listing -- --check   only say whether they're missing or out of date
//
// The parts between `<!-- listing:auto NAME -->` and `<!-- /listing:auto -->`
// come from the manifest and brand.ts and are rewritten on every run; edit
// everything else freely (your edits stay). Lines marked [TODO] are for the
// agent and the user to fill in. `npm run zip` prints a note while a draft is
// missing, out of date or has a [TODO] left.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRAND } from '../src/shared/brand.ts';
import { REASONS, buildManifest } from '../src/manifest.ts';

export const FILES = { listing: 'docs/store-listing.md', policy: 'docs/privacy-policy.md' };

/** What each permission means for the user, for the privacy policy (the store's own install warnings, in plain words). */
const PLAIN = {
  storage: 'store its data in your browser',
  contextMenus: 'add items to the right-click menu',
  sidePanel: 'show a side panel',
  activeTab: 'read the page you are on, only after you click the extension or use its menu item or shortcut',
  scripting: 'run its own script on pages it has access to',
  alarms: 'run at set times',
  notifications: 'show notifications',
  tabs: 'see the address and title of your open tabs',
  downloads: 'save files to your downloads',
  identity: 'sign you in',
  offscreen: 'do work in a hidden page of its own',
  clipboardWrite: 'copy text to your clipboard',
  unlimitedStorage: 'store more than the usual limit in your browser',
};

const lines = (...l) => l.filter((x) => x !== null && x !== undefined).join('\n');

/** The Chrome manifest's permissions and host access, split the way the store asks for them. */
export function permissionsOf(m = buildManifest('chrome')) {
  const contentHosts = (m.content_scripts ?? []).flatMap((c) => c.matches ?? []);
  return {
    required: m.permissions ?? [],
    optional: m.optional_permissions ?? [],
    hosts: [...new Set([...(m.host_permissions ?? []), ...contentHosts])],
    optionalHosts: m.optional_host_permissions ?? [],
  };
}

/** Host patterns grouped by their reason, so the same sentence isn't repeated per pattern. */
function byReason(patterns, label = '') {
  const groups = new Map();
  for (const p of patterns) {
    const r = REASONS[p] ?? '[TODO: no reason in REASONS (src/manifest.ts)]';
    groups.set(r, [...(groups.get(r) ?? []), p]);
  }
  return [...groups].map(([reason, list]) => `- ${list.map((p) => `\`${p}\``).join(', ')}${label}: ${reason}`);
}

/** The generated blocks, by file and block name. */
export function blocks(m = buildManifest('chrome')) {
  const p = permissionsOf(m);
  const shortcuts = Object.entries(m.commands ?? {}).map(([name, c]) => {
    const what = name === '_execute_action' ? `Open ${BRAND.name}` : c.description;
    return `- ${what}: ${c.suggested_key?.default ?? 'no default key (users set one at chrome://extensions/shortcuts)'}`;
  });
  const justification = lines(
    ...p.required.map((x) => `- **${x}**: ${REASONS[x] ?? '[TODO: no reason in REASONS (src/manifest.ts)]'}`),
    ...p.optional.map((x) => `- **${x}** (optional, asked for when needed): ${REASONS[x] ?? '[TODO: no reason in REASONS]'}`),
    p.hosts.length || p.optionalHosts.length ? '' : null,
    p.hosts.length || p.optionalHosts.length ? '**Host permission justification** (one field in the dashboard):' : null,
    p.hosts.length || p.optionalHosts.length ? '' : null,
    ...byReason(p.hosts),
    ...byReason(p.optionalHosts, ' (optional: asked for one site at a time, nothing at install)'),
  );
  const access = lines(
    ...p.required.map((x) => `- ${PLAIN[x] ? `${PLAIN[x][0].toUpperCase()}${PLAIN[x].slice(1)}` : x} (\`${x}\`).`),
    ...p.optional.map((x) => `- Only if you allow it when asked: ${PLAIN[x] ?? x} (\`${x}\`).`),
    p.hosts.length ? `- Read and change the pages it runs on (${p.hosts.map((h) => `\`${h}\``).join(', ')}), only to do what is described above.` : null,
    p.optionalHosts.length ? `- Only on the sites you allow, when it asks: read and change those pages (${p.optionalHosts.map((h) => `\`${h}\``).join(', ')}). You can take the access back at any time in the browser's extension settings.` : null,
  );
  return {
    listing: {
      basics: lines(
        `- **Name:** ${m.name} (manifest \`name\`, 75 characters at most)`,
        `- **Summary:** ${m.description} (manifest \`description\`, 132 characters at most)`,
        `- **Version:** ${m.version}`,
        `- **Homepage URL:** ${m.homepage_url}`,
      ),
      shortcuts: shortcuts.length ? lines(...shortcuts) : '- None.',
      permissions: justification,
    },
    policy: {
      summary: `${BRAND.name}: ${BRAND.privacy}`,
      access,
      contact: `Questions about this policy: ${BRAND.homepage}`,
    },
  };
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const auto = (name, body) => `<!-- listing:auto ${name} -->\n${body}\n<!-- /listing:auto -->`;

/** A new docs/store-listing.md. */
function listingDraft(b) {
  return `# Store listing: ${BRAND.name}

Drafted by \`npm run listing\` from \`src/manifest.ts\` and \`src/shared/brand.ts\`. The blocks between \`listing:auto\` markers are rewritten on every run; edit the rest. Fill in every [TODO], then paste each part into the Chrome Web Store Developer Dashboard (and Microsoft Partner Center for Edge Add-ons). docs/recipes/publish-to-chrome-web-store.md walks through it.

## Store listing tab

${auto('basics', b.basics)}

### Description

[TODO: what it does and for whom, in two or three short paragraphs; how to use it; what it stores. Plain words, no keyword lists (a policy violation). Start from: ${BRAND.tagline}]

Keyboard shortcuts:

${auto('shortcuts', b.shortcuts)}

- **Category:** [TODO: e.g. Productivity, Tools, Shopping]
- **Language:** [TODO]
- **Graphics:** \`npm run store\` makes them in \`shots/store/\`: screenshots (1280×800), the small promo tile (440×280), the store icon (128×128).
- **Support URL or email:** [TODO]

## Privacy practices tab

### Single purpose

[TODO: one sentence. Start from: ${BRAND.tagline}]

### Permission justifications

${auto('permissions', b.permissions)}

### Remote code

No, I am not using remote code. (Everything the extension runs is in the package: AGENTS.md rule 2, enforced by the manifest check.)

### Data usage

[TODO: tick each kind of data the extension collects or sends off the browser, and nothing else. If nothing leaves the browser, tick none. Then certify the three limited-use statements, only if they are true.]

### Privacy policy URL

[TODO: the address where docs/privacy-policy.md is published on the user's site. Needed whenever any user data is collected or sent.]
`;
}

/** A new docs/privacy-policy.md. */
function policyDraft(b) {
  return `# Privacy policy: ${BRAND.name}

[TODO: publish this page on the user's site and put its address in the store listing's privacy tab. Remove this line.]

Last updated: ${today()}

${auto('summary', b.summary)}

## What the extension can do

To work, ${BRAND.name} asks the browser for these permissions:

${auto('access', b.access)}

## What it stores, and where

[TODO: what it keeps (for example, the text you highlight and your notes), where (only in this browser; settings synced by your browser account; a server: which, and why), and for how long.]

## What leaves your browser

[TODO: "Nothing." if that is true. Otherwise: what is sent, to whom, why, and how it is protected. Data is never sold or used for anything unrelated to the extension.]

## Deleting your data

[TODO: how to delete it, for example from the options page, and that removing the extension deletes what it stored in the browser.]

## Contact

${auto('contact', b.contact)}
`;
}

/** Replaces each auto block's body in `text` with the fresh one; returns the new text and which blocks were missing. */
export function refresh(text, fresh) {
  const missing = [];
  let out = text;
  for (const [name, body] of Object.entries(fresh)) {
    const re = new RegExp(`<!-- listing:auto ${name} -->\\n[\\s\\S]*?\\n<!-- /listing:auto -->`);
    if (re.test(out)) out = out.replace(re, () => auto(name, body));
    else missing.push(name);
  }
  return { text: out, missing };
}

/** For each draft: 'missing', 'stale' (an auto block differs from the manifest), 'todo' ([TODO] left) or 'ok'. */
export function status(root = '.') {
  const b = blocks();
  const out = {};
  for (const [key, file] of Object.entries(FILES)) {
    const path = resolve(root, file);
    if (!existsSync(path)) {
      out[file] = 'missing';
      continue;
    }
    const text = readFileSync(path, 'utf8');
    const { text: next, missing } = refresh(text, b[key]);
    out[file] = next !== text || missing.length ? 'stale' : /\[TODO\b/.test(text) ? 'todo' : 'ok';
  }
  return out;
}

/** Writes (or refreshes) both drafts; returns what it did per file. */
export function write(root = '.') {
  const b = blocks();
  const done = {};
  for (const [key, file] of Object.entries(FILES)) {
    const path = resolve(root, file);
    if (!existsSync(path)) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, key === 'listing' ? listingDraft(b.listing) : policyDraft(b.policy));
      done[file] = 'created';
      continue;
    }
    const text = readFileSync(path, 'utf8');
    const { text: next, missing } = refresh(text, b[key]);
    if (next !== text) writeFileSync(path, next);
    done[file] = `${next !== text ? 'refreshed' : 'up to date'}${missing.length ? ` (no ${missing.join(', ')} block: add the markers back, or delete the file to start again)` : ''}`;
  }
  return done;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) {
    const s = status();
    for (const [f, v] of Object.entries(s)) console.log(`${f}: ${v}`);
    process.exitCode = Object.values(s).some((v) => v === 'missing' || v === 'stale') ? 1 : 0;
  } else {
    for (const [f, v] of Object.entries(write())) console.log(`${f}: ${v}`);
    console.log('Fill in every [TODO], keep the rest true, and run this again after changing permissions (src/manifest.ts).');
  }
}
