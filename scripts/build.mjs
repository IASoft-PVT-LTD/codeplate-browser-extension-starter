// Builds the extension into dist/<browser>/, ready to load unpacked or zip.
//   npm run build                     dist/chrome/ (Chrome, Edge, Brave, Opera…)
//                                     and dist/chrome-e2e/ (the test build, below)
//   npm run build:firefox             dist/firefox/
//   node scripts/build.mjs --target=all
//   npm run dev                       dist/chrome/, rebuilt on every save
//
// Three Vite builds, because the three kinds of extension code load differently:
//   pages       popup.html, options.html, sidepanel.html: normal web pages
//               (ES modules, shared chunks in assets/)
//   background  the service worker: one ES module file, background.js
//   content     the content script: one classic script, content.js (browsers
//               don't load content scripts as modules, so it's an IIFE with
//               everything inlined)
// Then it copies content.css and the icons, and writes manifest.json from
// src/manifest.ts. Nothing else: no plugins, no generated code to learn.
//
// The test build, dist/chrome-e2e/, is a copy of dist/chrome/ whose manifest
// also allows the test sites (TEST_HOSTS in src/manifest.ts) at install. The
// e2e tests, screenshots and store images load it. It is never zipped or
// published: scripts/zip.mjs packs only dist/chrome and dist/firefox, and the
// manifest check fails if a test site reaches either of them.
import { copyFileSync, cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { buildManifest } from '../src/manifest.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const watch = process.argv.includes('--watch');
const targets = (arg('target') ?? 'chrome') === 'all' ? ['chrome', 'firefox'] : [arg('target') ?? 'chrome'];

const common = (outDir) => ({
  configFile: false,
  root: ROOT,
  logLevel: 'warn',
  // Extension pages load from chrome-extension://<id>/, so absolute paths work.
  base: '/',
  build: {
    outDir,
    emptyOutDir: false,
    target: 'es2022',
    minify: true,
    // Readable stack traces in the browser's extension error log, and in store review.
    sourcemap: false,
    modulePreload: { polyfill: false },
    watch: watch ? {} : null,
    reportCompressedSize: false,
  },
});

async function buildTarget(target) {
  const out = join(ROOT, 'dist', target);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const base = common(out);

  await build({
    ...base,
    root: join(ROOT, 'src', 'pages'),
    build: {
      ...base.build,
      rolldownOptions: {
        input: {
          popup: join(ROOT, 'src/pages/popup.html'),
          options: join(ROOT, 'src/pages/options.html'),
          sidepanel: join(ROOT, 'src/pages/sidepanel.html'),
        },
      },
    },
  });
  await build({
    ...base,
    build: { ...base.build, lib: { entry: join(ROOT, 'src/background/index.ts'), formats: ['es'], fileName: () => 'background.js' } },
  });
  await build({
    ...base,
    build: { ...base.build, lib: { entry: join(ROOT, 'src/content/index.ts'), formats: ['iife'], name: 'contentScript', fileName: () => 'content.js' } },
  });

  copyFileSync(join(ROOT, 'src/content/content.css'), join(out, 'content.css'));
  cpSync(join(ROOT, 'assets/icons'), join(out, 'icons'), { recursive: true });
  writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(buildManifest(target), null, 2)}\n`);
  console.log(`built dist/${target}/ (manifest ${buildManifest(target).version})`);
  if (target === 'chrome' && !watch) buildTestCopy(out);
}

/** dist/chrome-e2e/: the same files, and a manifest that also allows the test sites. */
function buildTestCopy(from) {
  const out = join(ROOT, 'dist', 'chrome-e2e');
  rmSync(out, { recursive: true, force: true });
  cpSync(from, out, { recursive: true });
  writeFileSync(join(out, 'manifest.json'), `${JSON.stringify(buildManifest('chrome', { e2e: true }), null, 2)}\n`);
  console.log('built dist/chrome-e2e/ (the test build: never zip or publish it)');
}

for (const t of targets) {
  if (t !== 'chrome' && t !== 'firefox') throw new Error(`Unknown --target=${t}: use chrome, firefox or all`);
  await buildTarget(t);
}
if (watch) console.log('Watching for changes. After a rebuild, reload the extension (chrome://extensions → ↻) and the page.');
