import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { unzipSync } from 'fflate';

const required = ['package.json','package-lock.json','index.html','tsconfig.json','vite.config.ts','playwright.config.ts','README.md','DESIGN.md','LICENSE','.gitignore'];
const roots = ['src','tests','scripts','public','dist','artifacts'];
const files = [...required];
async function visit(path) {
  for (const e of await readdir(path, {withFileTypes:true})) {
    assert.ok(!['node_modules','.cache','.git','.github'].includes(e.name), `Generated or prohibited directory: ${path}/${e.name}`);
    const name = `${path}/${e.name}`;
    assert.ok(!e.isSymbolicLink(), `No symlink/submodule artifact: ${name}`);
    if (e.isDirectory()) await visit(name); else files.push(name);
  }
}
for (const root of roots) await visit(root);
let total = 0;
for (const file of files) { const info = await stat(file); assert.ok(info.isFile() && info.size > 0, `Missing/empty: ${file}`); total += info.size; }
assert.ok(total <= 8388608, `Submission is ${total} bytes; maximum 8388608`);
const pkg = JSON.parse(await readFile('package.json','utf8')), lock = JSON.parse(await readFile('package-lock.json','utf8'));
assert.deepEqual(pkg.dependencies, lock.packages[''].dependencies);
assert.deepEqual(pkg.devDependencies, lock.packages[''].devDependencies);
const html = await readFile('dist/index.html','utf8');
for (const item of ['<title>','name="description"','property="og:title"','property="og:image"','rel="icon"']) assert.ok(html.includes(item), `Missing metadata: ${item}`);
for (const match of html.matchAll(/(?:src|href|content)="([^"<>]+)"/g)) {
  const url = match[1];
  if (!url.startsWith('./')) continue;
  await stat(resolve(dirname('dist/index.html'),url));
}
assert.ok(!/(?:src|href)="\/(?!\/)/.test(html), 'Root-relative asset URL');
const png = await readFile('dist/og-image.png'); assert.equal(png.readUInt32BE(16),1200); assert.equal(png.readUInt32BE(20),630);
const source = unzipSync(await readFile('dist/source.zip'));
for (const file of required) assert.ok(source[`squeek-maze-sprint/${file}`], `Source download missing ${file}`);
for (const [file, bytes] of Object.entries(source)) {
  assert.ok(!/\/(?:node_modules|\.git|\.github|\.env|test\/scratch)\//.test(file), `Source archive contains forbidden file ${file}`);
  const path = file.slice('squeek-maze-sprint/'.length);
  assert.deepEqual(Buffer.from(bytes), await readFile(path), `Source download is stale: ${path}`);
}
assert.ok(files.filter(f=>f.endsWith('.zip')).every(f=>['public/source.zip','dist/source.zip'].includes(f)), 'Unnecessary archive');
console.log(JSON.stringify({passed:true, submissionFiles:files.length, submissionBytes:total, maximumBytes:8388608, productionFiles:files.filter(f=>f.startsWith('dist/')).length, sourceArchiveFiles:Object.keys(source).length, checks:['required files','relative asset URLs','metadata and 1200×630 image','lockfile matches manifests','complete source ZIP matches delivered source byte for byte','no generated dependency/cache or symlink directories','no unnecessary archives','8 MiB budget']},null,2));
