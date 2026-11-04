import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { generateMaze } from '../src/maze.ts';

const font = (await readFile('node_modules/@fontsource/silkscreen/files/silkscreen-latin-400-normal.woff2')).toString('base64');
const maze = generateMaze('squeek-maze-sprint:og-artwork');
let art = '';
maze.cells.forEach((row,y) => row.forEach((open,x) => { if (!open) art += `<rect x="${x*20}" y="${y*20}" width="17" height="17" rx="1" fill="#29373d" stroke="#60747a"/>`; }));
maze.squeeks.forEach(({x,y}) => { art += `<rect x="${x*20+7}" y="${y*20+7}" width="4" height="4" fill="#f4d45c"/>`; });
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><defs><style>@font-face{font-family:Silkscreen;src:url(data:font/woff2;base64,${font})}text{font-family:Silkscreen,monospace;font-weight:400}</style></defs><rect width="1200" height="630" fill="#111619"/><path d="M48 48v534" stroke="#f4d45c" stroke-width="6"/><text x="80" y="122" fill="#f4d45c" font-size="40">Squeek</text><text x="80" y="190" fill="#eef2ef" font-size="44">Maze Sprint</text><text x="80" y="304" fill="#eef2ef" font-size="48">One maze.</text><text x="80" y="370" fill="#eef2ef" font-size="48">Sixty seconds.</text><text x="82" y="473" fill="#6bddda" font-size="20">The real wheel sets the pace.</text><text x="82" y="561" fill="#a8b4b7" font-size="18">Powered by Squeekchain</text><g transform="translate(726 106)">${art}<g transform="translate(174 186) scale(3)" shape-rendering="crispEdges"><path fill="#dca477" d="M3 1h4v3h3V1h4v5h1v7h-2v2H4v-2H2V6h1z"/><path fill="#f5dfbd" d="M5 8h7v6H5z"/><path fill="#111619" d="M5 6h2v2H5zm6 0h2v2h-2z"/><path fill="#eef2ef" d="M7 12h4v2H7z"/></g></g></svg>`;
await mkdir('public/licenses', {recursive:true});
await writeFile('public/licenses/silkscreen-OFL.txt', await readFile('node_modules/@fontsource/silkscreen/LICENSE'));
const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1});
  await page.setContent(`<style>body{margin:0}</style>${svg}`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({path:'public/og-image.png'});
  console.log('Generated 1200×630 Open Graph image and retained font license.');
} finally { await browser.close(); }
