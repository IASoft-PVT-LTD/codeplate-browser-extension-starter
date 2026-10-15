// The checks: one command that tells you whether the extension still works.
//   npm run check
// Runs, in order:
//   env        every environment variable the scripts and tests read is in .env.example
//   assets     assets.json matches the files in assets/ (PNG sizes too)
//   typecheck  tsc (strict) over the extension, the tests and the configs
//   lint       eslint (eslint.config.js): basics, plus no eval/new Function
//   unit       vitest: settings and migrations, highlights storage, messaging and
//              the service worker's handlers (over a fake `chrome`), anchors in
//              jsdom, export, the manifest source, color contrast, the credit
//   build      dist/chrome/, dist/firefox/ and the test build dist/chrome-e2e/
//              (scripts/build.mjs)
//   manifest   both store builds as a store would see them: permissions
//              allowlisted and justified, CSP, no remote code, icons, files, no
//              test sites; and the test build is the Chrome build plus the test
//              sites only (checks/manifest.mjs)
//   e2e        Playwright with the test build loaded in a real browser:
//              highlighting on a test page, notes, reloads, per-site switch,
//              popup, side panel, options, export, settings migration, shortcuts
//              (finds a browser, or installs Playwright's Chromium once:
//              scripts/lib/browser.mjs)
// No step uses the network (except a one-time browser download if none is found).
// A failing step doesn't stop the later ones (except build → manifest, e2e),
// so one run shows every problem. The last line is
// CODEPLATE CHECKS: PASS or FAIL (<n> failed).
//   --skip=e2e,build   skip steps (for a quick loop; always finish with a full run)
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensureBrowser } from '../scripts/lib/browser.mjs';
import { checkBuild, checkTestBuild } from './manifest.mjs';

const skip = new Set((process.argv.find((a) => a.startsWith('--skip='))?.slice(7) ?? '').split(',').filter(Boolean));
const results = [];
// One command line for the shell (npx needs a shell on Windows).
const line = (cmd, args) => [cmd, ...args].map((a) => (/[\s"]/.test(a) ? `"${a}"` : a)).join(' ');

// The output of the step that's running, so the summary can repeat the end of
// a failed step's output (long logs scroll away).
let stepOutput = '';
function sh(cmd, args, env = process.env) {
  const r = spawnSync(line(cmd, args), { env, encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024 });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  process.stdout.write(out);
  stepOutput += out;
  return r.status === 0;
}

async function step(name, fn, needs = []) {
  const missing = needs.filter((n) => results.find((r) => r.name === n && !r.ok));
  if (skip.has(name) || missing.length) {
    const why = skip.has(name) ? 'skipped' : `skipped (${missing.join(', ')} failed)`;
    console.log(`\n--- ${name}: ${why}`);
    results.push({ name, ok: !missing.length, skipped: true });
    return;
  }
  console.log(`\n--- ${name}`);
  const start = Date.now();
  let ok = false;
  stepOutput = '';
  const log = console.log;
  console.log = (...a) => {
    stepOutput += `${a.join(' ')}\n`;
    log(...a);
  };
  try {
    ok = await fn();
  } catch (e) {
    console.error(e);
    stepOutput += `${e?.stack ?? e}\n`;
  } finally {
    console.log = log;
  }
  const seconds = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`--- ${name}: ${ok ? 'pass' : 'FAIL'} (${seconds}s)`);
  results.push({ name, ok, seconds, tail: ok ? '' : stepOutput.trim().split('\n').slice(-30).join('\n') });
}

function sourceFiles(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...sourceFiles(p));
    else if (/\.(ts|mjs|js)$/.test(e.name)) out.push(p);
  }
  return out;
}

// Set by Node, CI or the test tools, not by the project.
const PLATFORM_VARS = new Set(['NODE_ENV', 'CI', 'DEBUG']);

await step('env', () => {
  const documented = new Set([...readFileSync('.env.example', 'utf8').matchAll(/^([A-Z0-9_]+)=/gm)].map((m) => m[1]));
  const missing = new Map();
  for (const f of [...sourceFiles('src'), ...sourceFiles('scripts'), ...sourceFiles('checks'), ...sourceFiles('tests'), 'playwright.config.ts']) {
    for (const m of readFileSync(f, 'utf8').matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
      if (!documented.has(m[1]) && !PLATFORM_VARS.has(m[1])) missing.set(m[1], f);
    }
  }
  for (const [v, f] of missing) console.log(`${v} (read in ${f}) is not in .env.example: add it there with a comment.`);
  if (sourceFiles('src').some((f) => /process\.env/.test(readFileSync(f, 'utf8')))) {
    console.log('src/ reads process.env: extension code runs in the browser, where there is no environment. Put settings in src/shared/settings.ts or constants in src/shared/brand.ts.');
    return false;
  }
  if (!missing.size) console.log(`${documented.size} variables documented in .env.example`);
  return missing.size === 0;
});

await step('assets', () => {
  const { assets } = JSON.parse(readFileSync('assets.json', 'utf8'));
  const listed = new Set(assets.map((a) => a.path));
  let ok = true;
  const onDisk = readdirSync('assets', { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));
  for (const f of new Set(onDisk.map((p) => p.replaceAll('\\', '/')))) {
    if (!listed.has(f)) {
      console.log(`${f} is not listed in assets.json`);
      ok = false;
    }
  }
  for (const a of assets) {
    if (!existsSync(a.path)) {
      console.log(`${a.path} is listed in assets.json but missing`);
      ok = false;
      continue;
    }
    if (a.path.endsWith('.png')) {
      const b = readFileSync(a.path);
      const w = b.readUInt32BE(16);
      const h = b.readUInt32BE(20);
      if (w !== a.width || h !== a.height) {
        console.log(`${a.path} is ${w}×${h}, assets.json says ${a.width}×${a.height}`);
        ok = false;
      }
    }
  }
  if (ok) console.log(`${assets.length} assets match assets.json`);
  return ok;
});

await step('typecheck', () => sh('npx', ['tsc', '--noEmit']));

await step('lint', () => sh('npx', ['eslint', '.']));

await step('unit', () => sh('npx', ['vitest', 'run']));

await step('build', () => sh(process.execPath, ['scripts/build.mjs', '--target=all']));

await step(
  'manifest',
  () => {
    let ok = true;
    for (const dir of ['dist/chrome', 'dist/firefox']) {
      const { problems, notes } = checkBuild(dir);
      for (const n of notes) console.log(`note (${dir}): ${n}`);
      for (const p of problems) console.log(`${dir}: ${p}`);
      if (!problems.length) console.log(`${dir}: manifest, permissions, CSP, icons and files are fine`);
      ok &&= problems.length === 0;
    }
    const test = checkTestBuild('dist/chrome', 'dist/chrome-e2e');
    for (const p of test.problems) console.log(p);
    if (!test.problems.length) console.log('dist/chrome-e2e: the store build plus the test sites only (never zipped)');
    return ok && test.problems.length === 0;
  },
  ['build'],
);

await step(
  'e2e',
  async () => {
    await ensureBrowser();
    const ok = sh('npx', ['playwright', 'test']);
    if (!ok) console.log('Screenshots and traces of failures are in .data/test-results/.');
    return ok;
  },
  ['build'],
);

const failed = results.filter((r) => !r.ok);
for (const r of failed.filter((f) => f.tail)) console.log(`\n=== ${r.name} failed; the end of its output:\n${r.tail}`);
console.log('\n' + results.map((r) => `${r.ok ? (r.skipped ? 'skip' : 'pass') : 'FAIL'}  ${r.name}${r.seconds ? ` (${r.seconds}s)` : ''}`).join('\n'));
console.log(failed.length ? `CODEPLATE CHECKS: FAIL (${failed.length} failed)` : 'CODEPLATE CHECKS: PASS');
process.exitCode = failed.length ? 1 : 0;
