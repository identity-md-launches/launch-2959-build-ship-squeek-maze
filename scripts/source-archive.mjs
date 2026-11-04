import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { zipSync } from 'fflate';

// Explicit allowlist: no workspace metadata, environment, dependencies or caches.
const files = ['package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'playwright.config.ts', 'index.html', 'README.md', 'DESIGN.md', 'LICENSE', '.gitignore'];
async function addDirectory(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const name = `${path}/${entry.name}`;
    if (entry.isDirectory()) await addDirectory(name);
    else if (entry.isFile() && !name.endsWith('source.zip') && name !== 'artifacts/export-check.json' && !(path.startsWith('artifacts') && /\.(png|jpe?g|webp)$/.test(name))) files.push(name);
  }
}
for (const directory of ['src', 'scripts', 'tests', 'public', 'artifacts']) if (existsSync(directory)) await addDirectory(directory);
const entries = {};
for (const name of files.sort()) {
  entries[`squeek-maze-sprint/${name}`] = [new Uint8Array(await readFile(name)), { mtime: new Date('2026-01-01T00:00:00Z') }];
}
await mkdir('public', { recursive: true });
const archive = zipSync(entries, { level: 9 });
await writeFile('public/source.zip', archive);
console.log(`Source download: ${Object.keys(entries).length} files, ${archive.length} bytes.`);
