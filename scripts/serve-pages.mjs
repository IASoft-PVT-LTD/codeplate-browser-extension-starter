// Serves the test pages in tests/pages/ over http, so the content script runs
// on them (it only runs on http and https pages).
//   node scripts/serve-pages.mjs [--port=8891]
// The e2e tests start it on E2E_PORT (8891); `npm run shots` on SHOTS_PORT (8892).
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../tests/pages/', import.meta.url)));
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' };

export function servePages(port) {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    const file = normalize(join(ROOT, path === '/' ? 'article.html' : path));
    if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    createReadStream(file).pipe(res);
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, '127.0.0.1', () => ok(server));
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv.find((a) => a.startsWith('--port='))?.slice(7) ?? process.env.E2E_PORT ?? 8891);
  await servePages(port);
  console.log(`test pages on http://localhost:${port}/`);
}
