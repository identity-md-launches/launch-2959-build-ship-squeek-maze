import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const root = resolve('dist');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.zip': 'application/zip', '.txt': 'text/plain; charset=utf-8' };
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (!url.pathname.startsWith('/preview/')) { response.writeHead(404).end('Use /preview/'); return; }
    const path = decodeURIComponent(url.pathname.slice('/preview/'.length));
    const file = resolve(root, path || 'index.html');
    if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) { response.writeHead(404).end('Not found'); return; }
    response.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(await readFile(file));
  } catch { response.writeHead(404).end('Not found'); }
});
server.listen(4173, '127.0.0.1', () => console.log('Static export at http://127.0.0.1:4173/preview/'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit()));
