import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { coreFixture, economyFixture, FIXTURE_NOW, statusFixture } from '../fixtures';
import { parseBoard } from '../../src/api';
import { DIRECTIONS, generateMaze, VECTORS, type Direction } from '../../src/maze';

const identity = parseBoard(coreFixture, economyFixture, FIXTURE_NOW);
const maze = generateMaze(identity.seed);
const initialDirection = DIRECTIONS.find(d => maze.cells[1 + VECTORS[d].y][1 + VECTORS[d].x])!;
const keyFor: Record<Direction, string> = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };

async function officialFixtures(page: Page) {
  await page.clock.install({ time: new Date(FIXTURE_NOW) });
  const wheel = structuredClone(statusFixture);
  let online = true, polls = 0;
  await page.route('https://api.squeekchain.com/v1/**', async route => {
    if (!online) { await route.abort('failed'); return; }
    const url = route.request().url();
    if (url.endsWith('/status')) polls++;
    await route.fulfill({ json: url.endsWith('/status') ? wheel : url.endsWith('/core') ? coreFixture : economyFixture, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  return { wheel, offline: () => { online = false; }, online: () => { online = true; }, polls: () => polls };
}

async function ready(page: Page) {
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Start sprint' })).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
}

test('production export loads under a subpath; first screen and controls fit 320, 390, 768 and 1440', async ({ page }) => {
  await officialFixtures(page);
  const errors: string[] = [], localFailures: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('response', response => { if (response.url().includes('/preview/') && response.status() >= 400) localFailures.push(response.url()); });
  await ready(page);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width < 800 ? 844 : 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const start = await page.getByRole('button', { name: 'Start sprint' }).boundingBox();
    expect(start!.y).toBeGreaterThan(0); expect(start!.y + start!.height).toBeLessThan(width < 800 ? 844 : 900);
    expect(await page.locator('.maze').isVisible()).toBe(true);
    await expect(page.locator('.signal-time')).toBeVisible();
  }
  expect(errors).toEqual([]); expect(localFailures).toEqual([]);
  await expect(page).toHaveTitle(/Squeek Maze Sprint/);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', './og-image.png');
  const response = await page.request.get('og-image.png'); expect(response.ok()).toBe(true);
});

test('keyboard collects Squeeks; pause freezes the timer; rules trap focus and return it', async ({ page }) => {
  await officialFixtures(page); await ready(page);
  await page.getByRole('button', { name: 'Start sprint' }).click();
  await expect(page.locator('.start-overlay')).toHaveCount(0);
  await page.keyboard.down(keyFor[initialDirection]); await page.clock.runFor(70); await page.keyboard.up(keyFor[initialDirection]);
  await expect(page.getByTestId('score')).not.toHaveText('0000');
  await page.keyboard.press('p');
  await expect(page.getByRole('button', { name: 'Resume sprint', exact: true })).toHaveCount(2);
  const timer = await page.getByTestId('timer').innerText();
  await page.clock.runFor(2000); await expect(page.getByTestId('timer')).toHaveText(timer);
  await page.getByRole('button', { name: 'Rules', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Got it' }).focus(); await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Close dialog' })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Rules', exact: true })).toBeFocused();
  await page.keyboard.press('p'); await page.clock.runFor(200);
  await expect(page.getByTestId('timer')).not.toHaveText(timer);
});

test('fresh status polls change the visible modifier; a lost signal returns to neutral without replacing the maze', async ({ page }) => {
  const feed = await officialFixtures(page); await ready(page);
  await page.getByRole('button', { name: 'Start sprint' }).click();
  await expect(page.getByText('Hazards take 35% longer', { exact: true })).toBeVisible();
  feed.wheel.measurement.rpmMilli = 45000;
  await page.clock.runFor(5300);
  await expect(page.getByText('You move 10% faster', { exact: true })).toBeVisible();
  expect(feed.polls()).toBeGreaterThan(2);
  feed.offline(); await page.clock.runFor(5300);
  await expect(page.getByText('Standard movement speeds', { exact: true })).toBeVisible();
  await expect(page.locator('.board-round')).toHaveText('Round #1261');
  await expect(page.locator('.signal-label')).toHaveText('Wheel signal unavailable');
});

test('a full 60-second run yields a saved local result, a real PNG and a replay', async ({ page, context }) => {
  await officialFixtures(page); await ready(page);
  await page.getByRole('button', { name: 'Start sprint' }).click();
  // Wait for the fresh official board to lock before jumping the clock past the API timeout.
  await expect(page.getByRole('button', { name: 'Pause sprint' })).toBeEnabled();
  await page.keyboard.down(keyFor[initialDirection]); await page.clock.runFor(70); await page.keyboard.up(keyFor[initialDirection]);
  await page.clock.fastForward(60000);
  await expect(page.getByRole('heading', { name: 'Sprint complete.' })).toBeVisible();
  const counts = (await page.locator('.result-overlay > p').first().textContent())!;
  expect(counts).toMatch(/^(1 Squeek|\d+ Squeeks) · (1 bump|\d+ bumps)$/);
  expect(counts).not.toMatch(/\b1 (Squeeks|bumps)\b/);
  await expect(page.getByTestId('timer')).toHaveText('0.0s');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('squeek-maze-sprint:best:v1') ?? '[]')[0].score)).toBeGreaterThan(0);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save card' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^squeek-sprint-1261-\d+\.png$/);
  const path = `test/scratch/result-${test.info().project.name}.png`; await download.saveAs(path);
  const { readFile } = await import('node:fs/promises'); const image = await readFile(path);
  expect([...image.subarray(0,8)]).toEqual([137,80,78,71,13,10,26,10]);
  expect(image.readUInt32BE(16)).toBe(1200); expect(image.readUInt32BE(20)).toBe(630);
  if (test.info().project.name === 'chromium') {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.getByRole('button', { name: 'Share result' }).click();
    await expect(page.getByRole('status').filter({hasText:'Result copied.'})).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Round #1261');
  }
  await page.evaluate(() => { Object.defineProperty(navigator, 'share', { value: undefined }); Object.defineProperty(navigator, 'clipboard', { value: undefined }); });
  await page.getByRole('button', { name: 'Share result' }).click();
  await expect(page.getByRole('textbox', { name: 'Result to copy' })).toHaveValue(/Squeek Maze Sprint/);
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('button', { name: 'Play again' }).click();
  await expect(page.getByTestId('score')).toHaveText('0000');
  await expect(page.locator('.instrument.best strong')).not.toHaveText('----');
  await page.reload(); await expect(page.locator('.instrument.best strong')).not.toHaveText('----');
});

test('API failure alone enables demo; retry restores official data with no fabricated round', async ({ page }) => {
  const feed = await officialFixtures(page); feed.offline();
  await page.goto('./'); await expect(page.getByRole('button', { name: 'Start demo' })).toBeEnabled();
  await expect(page.locator('.signal-label')).toHaveText('Offline demo');
  await expect(page.locator('.board-round')).toHaveText('Demo board');
  await expect(page.locator('.round-section')).not.toContainText('#1261');
  feed.online(); await page.getByRole('button', { name: 'Retry live data' }).click();
  await expect(page.getByRole('button', { name: 'Start sprint' })).toBeEnabled();
  await expect(page.locator('.signal-label')).toHaveText('Live wheel · resting');
});

test('touch direction pad and swipe move the hamster on a 390px phone', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width:390, height:844 }, hasTouch:true, isMobile:true });
  const page = await context.newPage();
  await officialFixtures(page); await ready(page);
  await page.getByRole('button', {name:'Start sprint'}).tap();
  const before = await page.locator('.maze').getAttribute('aria-label');
  await page.getByRole('button', { name:`Move ${initialDirection}` }).tap();
  await expect(page.locator('.maze')).not.toHaveAttribute('aria-label',before!);
  await page.getByRole('button', { name:'Pause sprint' }).tap();
  await expect(page.getByRole('heading',{name:'Take a breather.'})).toBeVisible();
  await page.getByRole('button',{name:'Resume sprint',exact:true}).last().tap();
  // Trusted touch gesture through the engine's pointer event path.
  if (test.info().project.name === 'chromium') {
    const cdp = await context.newCDPSession(page), bounds = (await page.locator('.arena').boundingBox())!;
    const position = {x:bounds.x+100,y:bounds.y+100};
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[position]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:position.x+35,y:position.y}]});
    await page.clock.runFor(180);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  }
  await context.close();
});

test('landscape phones and touch tablets keep the whole board, start action and direction pad on one screen', async ({ browser }) => {
  const inside = (box: { x: number; y: number; width: number; height: number } | null, w: number, h: number) =>
    !!box && box.width > 0 && box.height > 0 && box.x >= 0 && box.y >= 0 && box.x + box.width <= w && box.y + box.height <= h;
  for (const [width, height] of [[844, 390], [852, 393], [667, 375], [932, 430], [1024, 768], [1440, 900]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: false });
    const page = await context.newPage();
    await officialFixtures(page); await ready(page);
    const arena = await page.locator('.arena').boundingBox();
    expect(inside(arena, width, height), `${width}x${height} board`).toBe(true);
    if (height < 600) expect(arena!.width, `${width}x${height} board size`).toBeGreaterThan(height * 0.6);
    expect(inside(await page.getByRole('button', { name: 'Start sprint' }).boundingBox(), width, height), `${width}x${height} start`).toBe(true);
    await page.getByRole('button', { name: 'Start sprint' }).tap();
    for (const d of ['up', 'left', 'down', 'right']) expect(inside(await page.getByRole('button', { name: `Move ${d}` }).boundingBox(), width, height), `${width}x${height} ${d}`).toBe(true);
    expect(inside(await page.locator('.arena').boundingBox(), width, height), `${width}x${height} board while playing`).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const before = await page.locator('.maze').getAttribute('aria-label');
    await page.getByRole('button', { name: `Move ${initialDirection}` }).tap();
    await expect(page.locator('.maze')).not.toHaveAttribute('aria-label', before!);
    await context.close();
  }
});

test('rules, data provenance and reduced-motion states pass axe WCAG AA checks', async ({ page }) => {
  await officialFixtures(page); await page.emulateMedia({reducedMotion:'reduce'}); await ready(page);
  for (const state of ['ready','rules','data']) {
    if (state !== 'ready') await page.getByRole('button',{name:state === 'rules' ? 'Rules' : 'Source & data',exact:true}).click();
    const audit = await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
    expect(audit.violations.map(v=>({id:v.id,description:v.description,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
    if (state !== 'ready') await page.getByRole('button',{name:'Close dialog'}).click();
  }
  await page.getByRole('button',{name:'Start sprint'}).click();
  expect(await page.locator('.player').evaluate(el=>getComputedStyle(el).transitionDuration)).toBe('0s');
  expect(await page.locator('.hazard').first().evaluate(el=>getComputedStyle(el).transitionDuration)).toBe('0s');
});

test('source archive is a real downloadable ZIP; full hashes remain available without clipping', async ({ page }) => {
  await officialFixtures(page); await ready(page);
  await page.getByRole('button',{name:'Source & data',exact:true}).click();
  await expect(page.locator('.provenance')).toContainText(identity.hash!);
  const response = await page.request.get('source.zip'); expect(response.ok()).toBe(true);
  expect((await response.body()).subarray(0,2).toString()).toBe('PK');
  await page.setViewportSize({width:320,height:844});
  expect(await page.locator('.modal').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
});

test('200% text enlargement keeps the HUD readable and the primary action reachable', async ({ page }) => {
  await officialFixtures(page); await page.setViewportSize({width:390,height:844}); await ready(page);
  await page.addStyleTag({content:'html { font-size: 200%; }'});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const digits = await page.locator('.instrument strong').all();
  for (let i = 0; i < digits.length; i++) for (let j = i + 1; j < digits.length; j++) {
    const a = (await digits[i].boundingBox())!, b = (await digits[j].boundingBox())!;
    expect(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y).toBe(false);
  }
  await page.getByRole('button',{name:'Start sprint'}).scrollIntoViewIfNeeded();
  await page.getByRole('button',{name:'Start sprint'}).click();
  await expect(page.getByRole('button',{name:'Pause sprint'})).toBeEnabled();
});

test('opening rules while a fresh board is loading keeps the new run paused', async ({ page }) => {
  await officialFixtures(page); await ready(page);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('https://api.squeekchain.com/v1/core', async route => {
    await held; await route.fulfill({ json: coreFixture, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await page.getByRole('button',{name:'Start sprint'}).click();
  await expect(page.getByRole('button',{name:'Getting ready…'})).toBeDisabled();
  await page.getByRole('button',{name:'Rules',exact:true}).click();
  release();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.clock.runFor(1500);
  await expect(page.getByTestId('timer')).toHaveText('60.0s');
  await page.getByRole('button',{name:'Close dialog'}).click();
  await expect(page.getByRole('heading',{name:'Take a breather.'})).toBeVisible();
});

test('a late Retry response cannot replace a maze or rewind a run that has started', async ({ page }) => {
  const feed = await officialFixtures(page); feed.wheel.measurement.provenance = 'simulated'; await ready(page);
  let release!: () => void, calls = 0;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('https://api.squeekchain.com/v1/core', async route => {
    calls++; if (calls === 1) await held;
    await route.fulfill({ json: coreFixture, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await page.getByRole('button',{name:'Retry live data',exact:true}).click();
  await expect(page.getByRole('button',{name:'Checking API…'})).toBeDisabled();
  await page.getByRole('button',{name:'Start sprint'}).click();
  await page.locator('.start-overlay').waitFor({state:'detached'});
  await page.clock.runFor(1100);
  release(); await expect(page.getByRole('button',{name:'Retry live data',exact:true})).toBeEnabled();
  await page.clock.runFor(100);
  expect(parseFloat(await page.getByTestId('timer').innerText())).toBeLessThan(59);
});
