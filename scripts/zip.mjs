// The store upload: builds the extension, checks it like a store would
// (checks/manifest.mjs), refuses the template's placeholders
// (checks/placeholders.mjs: the name, the codeplate.io homepage, the
// example.com Firefox id), and zips the build with manifest.json at the top.
//   npm run zip                      dist/<name>-<version>-chrome.zip (Chrome Web Store, Edge Add-ons)
//   npm run zip -- --firefox         also dist/<name>-<version>-firefox.zip (addons.mozilla.org)
//   npm run zip -- --no-build
//   npm run zip -- --allow-placeholders   a draft, dist/<name>-<version>-chrome-draft.zip, to test
//                                         the package itself; never upload it
// The zip holds only dist/chrome/ or dist/firefox/: no sources, tests or
// node_modules, and never the test build dist/chrome-e2e/ (it is allowed on
// the test sites; the manifest check fails a store build that is).
// It also notes whether docs/store-listing.md and docs/privacy-policy.md are
// missing or out of date with the manifest (`npm run listing` drafts them).
// (addons.mozilla.org may also ask for the source code: zip the project
// without node_modules and dist, and say "npm ci && npm run build:firefox".)
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { checkBuild } from '../checks/manifest.mjs';
import { findPlaceholders } from '../checks/placeholders.mjs';
import { status as listingStatus } from './listing.mjs';

const args = process.argv.slice(2);
const targets = args.includes('--firefox') ? ['chrome', 'firefox'] : ['chrome'];
const draft = args.includes('--allow-placeholders');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

const placeholders = findPlaceholders({ packageName: pkg.name, firefox: targets.includes('firefox') });
if (placeholders.length) {
  for (const p of placeholders) console.log(`${draft ? 'draft' : 'FAIL'}: ${p}`);
  if (!draft) {
    console.log("Not zipping: the store would get the template's placeholders. Fix the lines above (or add --allow-placeholders for a draft zip to test, never to upload).");
    process.exit(1);
  }
}
if (!args.includes('--no-build')) {
  const r = spawnSync(process.execPath, ['scripts/build.mjs', '--target=all'], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(1);
}

// --- a small zip writer (deflate, no dependencies) ---
const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function dosTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}
export function zip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const { time, date } = dosTime(new Date());
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const packed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    chunks.push(local, nameBuf, packed);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(8, 10);
    c.writeUInt16LE(time, 12);
    c.writeUInt16LE(date, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(packed.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(nameBuf.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, nameBuf);
    offset += 30 + nameBuf.length + packed.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, centralBuf, end]);
}

function filesIn(dir) {
  return readdirSync(dir, { recursive: true })
    .map((f) => join(dir, String(f)))
    .filter((f) => statSync(f).isFile() && !f.endsWith('.zip'))
    .sort();
}

let failed = false;
for (const t of targets) {
  // Only the store builds: dist/chrome-e2e/ (the test build) is never packed.
  if (t !== 'chrome' && t !== 'firefox') throw new Error(`zip: unknown target ${t}`);
  const dir = join('dist', t);
  const { problems, notes } = checkBuild(dir);
  for (const n of notes) console.log(`note: ${n}`);
  if (problems.length) {
    for (const p of problems) console.log(`FAIL: ${p}`);
    failed = true;
    continue;
  }
  const entries = filesIn(dir).map((f) => ({ name: relative(dir, f).replaceAll('\\', '/'), data: readFileSync(f) }));
  const out = join('dist', `${pkg.name}-${pkg.version}-${t}${draft && placeholders.length ? '-draft' : ''}.zip`);
  writeFileSync(out, zip(entries));
  console.log(`${out}: ${entries.length} files, ${(statSync(out).size / 1024).toFixed(0)} KB`);
}
for (const [file, state] of Object.entries(listingStatus())) {
  if (state === 'missing') console.log(`note: ${file} is missing: \`npm run listing\` drafts it from the manifest`);
  if (state === 'stale') console.log(`note: ${file} is out of date with the manifest: run \`npm run listing\``);
  if (state === 'todo') console.log(`note: ${file} still has [TODO] lines to fill in before submitting`);
}
process.exitCode = failed ? 1 : 0;
