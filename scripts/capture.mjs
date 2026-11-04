// Validation driver only. This proxy is never included in the runtime app.
// Forward unmodified, fresh official responses when the sandbox browser cannot
// reach external HTTPS directly. Screenshots never use recorded test fixtures.
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { parseBoard } from '../src/api.ts';
import { generateMaze, DIRECTIONS, VECTORS } from '../src/maze.ts';

const server = spawn(process.execPath, ['scripts/preview.mjs'], { stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('exit', code => reject(new Error(`Preview exited: ${code}`))); });
let browser;
try {
  await mkdir('artifacts/screenshots', { recursive: true });
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.clock.install({ time: new Date() });
  const payloads = new Map(), errors = [], localFailures = [], audits = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', r => { if (r.url().includes('/preview/') && r.status() >= 400) localFailures.push(r.url()); });
  await page.route('https://api.squeekchain.com/v1/**', async route => {
    try {
      const response = await fetch(route.request().url(), { signal: AbortSignal.timeout(6000) });
      const body = await response.text();
      if (response.ok) payloads.set(route.request().url().split('/v1/')[1], JSON.parse(body));
      await route.fulfill({ status: response.status, body, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' } });
    } catch { await route.abort('failed'); }
  });
  await page.goto('http://127.0.0.1:4173/preview/');
  await page.getByRole('button', { name: 'Start sprint' }).waitFor({ timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  await page.clock.runFor(150);
  await page.screenshot({ path: 'artifacts/screenshots/desktop-ready.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/screenshots/mobile-ready.png' });
  const firstScreen = await page.getByRole('button', { name: 'Start sprint' }).boundingBox();
  await page.getByRole('button', { name: 'Start sprint' }).click();
  await page.locator('.start-overlay').waitFor({ state: 'detached' });
  const board = parseBoard(payloads.get('core'), payloads.get('economy/state'));
  const maze = generateMaze(board.seed), d = DIRECTIONS.find(d => maze.cells[1 + VECTORS[d].y][1 + VECTORS[d].x]);
  const keys = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
  await page.keyboard.down(keys[d]); await page.clock.runFor(70); await page.keyboard.up(keys[d]);
  await page.clock.runFor(150);
  await page.screenshot({ path: 'artifacts/screenshots/mobile-playing.png' });
  for (const state of ['playing', 'result']) {
    if (state === 'result') { await page.clock.fastForward(60000); await page.getByRole('heading', { name: 'Sprint complete.' }).waitFor(); }
    const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    audits.push({ state, violations: audit.violations.map(v => ({ id: v.id, impact: v.impact })) });
  }
  await page.screenshot({ path: 'artifacts/screenshots/mobile-result.png' });
  const visual = await page.evaluate(() => {
    const bg = getComputedStyle(document.body).backgroundColor;
    const fg = getComputedStyle(document.querySelector('.instrument > span')).color;
    return { bodyBackground: bg, secondaryText: fg, displayFontLoaded: document.fonts.check('24px Silkscreen'), horizontalOverflow: document.documentElement.scrollWidth > innerWidth };
  });
  const record = { checkedAt: new Date().toISOString(), source: 'Current unmodified official API responses, forwarded by the validation driver; not recorded fixtures', servedFrom: '/preview/', firstScreenAt390: { mainAction: firstScreen, inViewport: firstScreen.y + firstScreen.height < 844 }, board: { round: board.round, height: board.height, anchorHash: board.hash }, visual, audits, scriptErrors: errors, localResourceFailures: localFailures, screenshots: ['desktop-ready.png', 'mobile-ready.png', 'mobile-playing.png', 'mobile-result.png'] };
  await writeFile('artifacts/visual-check.json', JSON.stringify(record, null, 2) + '\n');
  console.log(JSON.stringify(record, null, 2));
  if (errors.length || localFailures.length || visual.horizontalOverflow || audits.some(a => a.violations.length) || !record.firstScreenAt390.inViewport) process.exitCode = 1;
} finally { await browser?.close(); server.kill('SIGTERM'); }
