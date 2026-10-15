// Remakes the README and catalog images in docs/media/ from fresh screenshots
// and the first store image (as cover.png).
//   npm run media
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';

const r = spawnSync(process.execPath, ['scripts/store-assets.mjs', ...process.argv.slice(2)], { stdio: 'inherit' });
if (r.status !== 0) process.exit(1);
mkdirSync('docs/media', { recursive: true });
const copies = {
  'shots/store/screenshot-1.png': 'cover.png',
  'shots/page.png': 'page.png',
  'shots/popup.png': 'popup.png',
  'shots/sidepanel.png': 'sidepanel.png',
  'shots/options.png': 'options.png',
  'shots/page-dark.png': 'page-dark.png',
  'shots/popup-dark.png': 'popup-dark.png',
  'shots/sidepanel-dark.png': 'sidepanel-dark.png',
};
for (const [from, to] of Object.entries(copies)) {
  copyFileSync(from, `docs/media/${to}`);
  console.log(`docs/media/${to}`);
}
