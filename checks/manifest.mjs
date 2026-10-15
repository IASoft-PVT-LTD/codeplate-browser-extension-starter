// Checks a built extension (dist/chrome or dist/firefox) the way a store
// review would look at it:
//   - manifest_version 3; name ≤ 75 and description ≤ 132 characters; a valid version
//   - every permission and host pattern is in the allowlist below AND has a
//     reason in REASONS (src/manifest.ts)
//   - permissions that slow down or fail review are named
//   - the extension pages' CSP loads scripts only from the extension: no
//     'unsafe-eval', 'unsafe-inline', remote hosts or data: in script-src
//   - no remote code: no <script src="http…"> in the pages, no eval / new Function
//     in the built JavaScript
//   - every file the manifest names exists; icons are PNGs of the size their key says
//   - at most 4 commands with suggested keys (Chrome's limit), none of them a
//     key Chrome or Edge keeps for itself (it would show as "Not set")
//   - no test site (TEST_HOSTS in src/manifest.ts: localhost, *.test) in a
//     store build; checkTestBuild() proves dist/chrome-e2e/ is dist/chrome/
//     plus exactly those test sites, and nothing else
//
//   node checks/manifest.mjs [dist/chrome] [--target=chrome|firefox]
// Also used by `npm run check` (the `manifest` step) and `npm run zip`.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REASONS, TEST_HOSTS } from '../src/manifest.ts';

/** Permissions this template may ask for. Adding one here is a decision: docs/recipes/add-a-permission.md. */
export const ALLOWED = new Set([
  'storage', 'contextMenus', 'sidePanel', 'activeTab', 'scripting', 'alarms', 'notifications', 'tabs',
  'downloads', 'identity', 'offscreen', 'clipboardWrite', 'unlimitedStorage', 'commands', 'menus',
]);
/** Allowed, but the stores look harder at them: say so. */
const SENSITIVE = {
  tabs: 'tabs shows "Read your browsing history" at install; activeTab or the content script often does the job.',
  scripting: 'scripting with broad host access is reviewed closely.',
  identity: 'identity: the listing must explain the sign-in.',
  unlimitedStorage: 'unlimitedStorage: needed only past about 10 MB of chrome.storage.local.',
};
const BROAD_HOSTS = new Set(['<all_urls>', '*://*/*', 'http://*/*', 'https://*/*']);

/**
 * Suggested keys the browser keeps for itself, so an extension asking for one
 * gets none: chrome://extensions/shortcuts shows "Not set". Found by loading
 * an extension with each Alt+Shift key in Edge 155 on Windows (2026-10) and
 * reading chrome.commands.getAll(); Chrome's own shortcuts include Alt+Shift+A,
 * B, I and T. The e2e test "every suggested shortcut is assigned" checks the
 * keys in a real browser too.
 */
export const RESERVED_KEYS = new Set(['A', 'B', 'C', 'I', 'P', 'R', 'T', 'W', 'X', 'Z'].map((k) => `Alt+Shift+${k}`));

/** A host pattern for a test site (TEST_HOSTS, or another local/.test address): only the test build may have one. */
export function isTestHost(pattern) {
  if (TEST_HOSTS.includes(pattern)) return true;
  const host = /^[a-z*]+:\/\/([^/]+)/.exec(pattern)?.[1]?.replace(/:\d+$/, '') ?? '';
  return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(host) || /(^|\.)(test|localhost)$/.test(host);
}

function pngSize(buf) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length < 24 || !sig.every((b, i) => buf[i] === b)) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function files(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...files(p));
    else out.push(p);
  }
  return out;
}

/** Returns { problems: string[], notes: string[] } for a built extension folder. */
export function checkBuild(dir) {
  const problems = [];
  const notes = [];
  const fail = (m) => problems.push(m);
  const manifestPath = join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) return { problems: [`${manifestPath} is missing: run the build first`], notes };
  const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const isFirefox = Boolean(m.browser_specific_settings?.gecko);

  if (m.manifest_version !== 3) fail(`manifest_version is ${m.manifest_version}; it must be 3`);
  if (!m.name || m.name.length > 75) fail(`name must be 1–75 characters (is ${m.name?.length ?? 0})`);
  if (!m.description || m.description.length > 132) fail(`description must be 1–132 characters for the Chrome Web Store (is ${m.description?.length ?? 0})`);
  if (!/^\d{1,5}(\.\d{1,5}){0,3}$/.test(m.version ?? '')) fail(`version "${m.version}" must be 1 to 4 dot-separated numbers`);

  // Permissions and hosts
  const perms = [...(m.permissions ?? []), ...(m.optional_permissions ?? [])];
  const hosts = [...(m.host_permissions ?? []), ...(m.optional_host_permissions ?? []), ...(m.content_scripts ?? []).flatMap((c) => c.matches ?? [])];
  for (const p of perms) {
    if (!ALLOWED.has(p)) fail(`permission "${p}" isn't in the allowlist in checks/manifest.mjs (see docs/recipes/add-a-permission.md)`);
    if (!REASONS[p]) fail(`permission "${p}" has no reason in REASONS (src/manifest.ts)`);
    if (SENSITIVE[p]) notes.push(SENSITIVE[p]);
  }
  for (const h of new Set(hosts)) {
    if (isTestHost(h)) {
      fail(`host pattern "${h}" is a test site: only the test build (dist/chrome-e2e, TEST_HOSTS in src/manifest.ts) may have it, never a store build`);
      continue;
    }
    if (!REASONS[h]) fail(`host pattern "${h}" has no reason in REASONS (src/manifest.ts)`);
    const optionalOnly = (m.optional_host_permissions ?? []).includes(h) && !(m.host_permissions ?? []).includes(h) && !(m.content_scripts ?? []).some((c) => (c.matches ?? []).includes(h));
    if (BROAD_HOSTS.has(h) && optionalOnly) notes.push(`"${h}" is optional: nothing is asked at install, and the user allows one site at a time when the extension requests it (docs/recipes/optional-site-access.md). Say so in the permission justification.`);
    else if (BROAD_HOSTS.has(h)) notes.push(`"${h}" gives access to every site: the store lists it as "Read and change your data on all websites", and review takes longer. Justified here: ${REASONS[h] ? 'yes' : 'NO'}.`);
  }

  // CSP
  const csp = typeof m.content_security_policy === 'string' ? m.content_security_policy : m.content_security_policy?.extension_pages ?? '';
  const scriptSrc = csp.match(/script-src([^;]*)/)?.[1] ?? '';
  for (const bad of ["'unsafe-eval'", "'unsafe-inline'", 'http:', 'https:', 'data:', 'blob:', '*']) {
    if (scriptSrc.split(/\s+/).some((t) => t === bad || (bad.endsWith(':') && t.startsWith(bad)))) fail(`content_security_policy script-src allows ${bad}: extensions may only run their own code`);
  }
  if (/script-src[^;]*https?:\/\//.test(csp)) fail('content_security_policy loads scripts from a remote host');

  // Files the manifest names
  const named = new Set();
  const add = (f) => f && named.add(f);
  add(m.background?.service_worker);
  for (const f of m.background?.scripts ?? []) add(f);
  add(m.action?.default_popup);
  add(m.options_ui?.page ?? m.options_page);
  add(m.side_panel?.default_path);
  add(m.sidebar_action?.default_panel);
  for (const c of m.content_scripts ?? []) for (const f of [...(c.js ?? []), ...(c.css ?? [])]) add(f);
  for (const f of named) if (!existsSync(join(dir, f))) fail(`the manifest names ${f}, which isn't in ${dir}`);
  if (!isFirefox && m.background?.scripts) fail('background.scripts is Firefox-only; Chrome needs background.service_worker');
  if (isFirefox && m.background?.service_worker && !m.background?.scripts) fail('Firefox needs background.scripts');

  // Icons
  const iconSets = [m.icons ?? {}, m.action?.default_icon ?? {}];
  if (!m.icons?.['128']) fail('icons needs a 128 px icon (the store and the extensions page use it)');
  for (const set of iconSets) {
    for (const [size, f] of Object.entries(set)) {
      const p = join(dir, f);
      if (!existsSync(p)) {
        fail(`icon ${f} is missing`);
        continue;
      }
      const s = pngSize(readFileSync(p));
      if (!s) fail(`icon ${f} isn't a PNG`);
      else if (s.width !== Number(size) || s.height !== Number(size)) fail(`icon ${f} is ${s.width}×${s.height}, but its key says ${size}`);
    }
  }

  // Commands
  const keyed = Object.values(m.commands ?? {}).filter((c) => c.suggested_key).length;
  if (keyed > 4) fail(`${keyed} commands have suggested keys; Chrome allows 4`);
  for (const [name, c] of Object.entries(m.commands ?? {})) {
    for (const key of Object.values(c.suggested_key ?? {})) {
      if (RESERVED_KEYS.has(key)) fail(`command "${name}": ${key} is kept by Chrome or Edge, so the browser would leave it "Not set"; pick another (docs/recipes/context-menus-and-shortcuts.md)`);
    }
  }

  // Remote code
  for (const f of files(dir)) {
    if (f.endsWith('.html')) {
      const html = readFileSync(f, 'utf8');
      if (/<script[^>]+src=["']?(https?:)?\/\//i.test(html)) fail(`${f} loads a script from another site: remote code is forbidden in MV3`);
      if (/<script(?![^>]*\bsrc=)[^>]*>\s*\S/i.test(html)) fail(`${f} has an inline <script>: the CSP blocks it; move it into a .ts file`);
    }
    if (f.endsWith('.js')) {
      const js = readFileSync(f, 'utf8');
      if (/\beval\s*\(|\bnew\s+Function\s*\(/.test(js)) fail(`${f} contains eval or new Function, which MV3 forbids`);
      if (/import\s*\(\s*["']https?:/.test(js)) fail(`${f} imports code from the network, which MV3 forbids`);
    }
  }
  if (statSync(dir).isDirectory() && files(dir).some((f) => /\.map$/.test(f))) notes.push('source maps are included: fine, but they make the zip bigger');
  return { problems, notes };
}

/**
 * Proves the test build is the store build plus the test sites and nothing
 * else: the same files, byte for byte, and the same manifest except for
 * TEST_HOSTS added to host_permissions.
 */
export function checkTestBuild(storeDir = 'dist/chrome', testDir = 'dist/chrome-e2e') {
  const problems = [];
  for (const d of [storeDir, testDir]) if (!existsSync(join(d, 'manifest.json'))) return { problems: [`${d}/manifest.json is missing: run the build first`] };
  const store = JSON.parse(readFileSync(join(storeDir, 'manifest.json'), 'utf8'));
  const test = JSON.parse(readFileSync(join(testDir, 'manifest.json'), 'utf8'));
  const hosts = test.host_permissions ?? [];
  for (const h of TEST_HOSTS) if (!hosts.includes(h)) problems.push(`${testDir}: host_permissions lacks the test site ${h}`);
  const rest = hosts.filter((h) => !TEST_HOSTS.includes(h));
  const stripped = { ...test, host_permissions: rest };
  if (!rest.length) delete stripped.host_permissions;
  if (JSON.stringify(stripped) !== JSON.stringify(store)) problems.push(`${testDir}/manifest.json differs from ${storeDir}/manifest.json by more than the test sites: rebuild (npm run build)`);
  const list = (d) => files(d).map((f) => relative(d, f).replaceAll('\\', '/')).filter((f) => f !== 'manifest.json').sort();
  const a = list(storeDir);
  const b = list(testDir);
  if (a.join('\n') !== b.join('\n')) problems.push(`${testDir} doesn't hold the same files as ${storeDir}: rebuild (npm run build)`);
  else for (const f of a) if (!readFileSync(join(storeDir, f)).equals(readFileSync(join(testDir, f)))) problems.push(`${testDir}/${f} differs from ${storeDir}/${f}: rebuild (npm run build)`);
  return { problems };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dirs = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  let failed = 0;
  for (const dir of dirs.length ? dirs : ['dist/chrome']) {
    const { problems, notes } = checkBuild(dir);
    for (const n of notes) console.log(`note (${dir}): ${n}`);
    for (const p of problems) console.log(`FAIL (${dir}): ${p}`);
    if (!problems.length) console.log(`${dir}: manifest, permissions, CSP, icons and files are fine`);
    failed += problems.length;
  }
  process.exitCode = failed ? 1 : 0;
}
