// Renders the README screenshots (docs/*.png) and the link preview (og.png):  node tools/screenshots.mjs
// Needs Playwright, and upng-js from `npm install`. Nothing is random, so the same pictures come out every time.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
const UPNG = require('upng-js');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let body;
  try { body = await readFile(join(root, path === '/' ? 'index.html' : path)); } catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'text/html' });
  res.end(body);
}).listen(0);
const base = `http://localhost:${server.address().port}/`;
const browser = await pw.chromium.launch();
await mkdir(join(root, 'docs'), { recursive: true });

// A 256-colour palette keeps the PNGs small.
async function save(shot, path) {
  const img = UPNG.decode(shot);
  await writeFile(join(root, path), Buffer.from(UPNG.encode(UPNG.toRGBA8(img), img.width, img.height, 256)));
}

async function open(viewport, deviceScaleFactor, hash = '') {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor, hasTouch: viewport.width < 800, serviceWorkers: 'block', reducedMotion: 'reduce', colorScheme: 'light' });
  const page = await ctx.newPage();
  await page.goto(base + hash);
  await page.evaluate(() => document.fonts.ready);
  return page;
}
const keys = async (page, list) => { for (const k of list) await page.click(`#keys [data-k="${k}"]`); };
const scrollTo = (page, sel, pad = 70) => page.evaluate(([s, p]) => window.scrollTo(0, document.querySelector(s).getBoundingClientRect().top + scrollY - p), [sel, pad]);

// A bookcase's worth of sums on the tape, ending with a board split five ways (a hair over 1′ 6-7/8″).
async function bookcase(page) {
  await keys(page, ['3', 'ft', '7', 'space', '5', '/16', 'in', 'plus', '1', '1', 'space', '3', '/8', 'in', 'equals']);
  await keys(page, ['8', 'ft', 'divide', '1', '1', 'space', '3', '/4', 'in', 'equals']);
  await keys(page, ['2', 'in', 'times', '6', 'in', 'times', '8', 'ft', 'equals']);
  await keys(page, ['8', 'ft', 'minus', '2', 'times', '3', '/4', 'in', 'equals']);
  await keys(page, ['divide', '5', 'equals']);
  await page.evaluate(() => {
    const t = window.storyStick.store.tape;
    window.storyStick.store.nameTape(t.id, 'Bookcase');
  });
  await page.evaluate(() => window.storyStick.route());
}

// Phone screenshots for the README.
{
  let page = await open({ width: 390, height: 844 }, 2);
  await bookcase(page);
  await page.waitForTimeout(200);
  await save(await page.screenshot(), 'docs/phone-calc.png');
  await page.context().close();

  page = await open({ width: 390, height: 844 }, 2, '#/spacing');
  await scrollTo(page, '.card.result', 96);
  await page.waitForTimeout(150);
  await save(await page.screenshot(), 'docs/phone-spacing.png');
  await page.context().close();

  page = await open({ width: 390, height: 844 }, 2, '#/stairs');
  await scrollTo(page, '.card.result', 96);
  await page.waitForTimeout(150);
  await save(await page.screenshot(), 'docs/phone-stairs.png');
  await page.context().close();
}

// Link preview, 1200 x 630: the name and a line on the left, the app's own calculator on the right.
{
  const page = await open({ width: 390, height: 844 }, 2);
  await keys(page, ['3', 'ft', '7', 'space', '5', '/16', 'in', 'plus', '1', '1', 'space', '3', '/8', 'in', 'equals']);
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.evaluate(async () => {
    const blade = document.getElementById('blade').innerHTML;
    const lcd = document.querySelector('.lcd').outerHTML;
    const keys = document.querySelector('#keys').outerHTML;
    document.body.innerHTML = `
      <div class="og">
        <div class="blade og-blade">${blade}</div>
        <div class="og-text">
          <div class="og-brand"><img src="icon.svg" alt="" width="84" height="84"><h1>Story Stick</h1></div>
          <p>A calculator that works in feet, inches and sixteenths.</p>
          <ul><li>Exact fractions, read like a tape</li><li>Spacing, stairs, miters, board feet</li><li>Works offline, no account</li></ul>
        </div>
        <div class="og-calc"><div class="case">${lcd}${keys}</div></div>
      </div>`;
    const style = document.createElement('style');
    style.textContent = `
      body { width: 1200px; height: 630px; overflow: hidden; margin: 0; }
      .og { position: relative; width: 1200px; height: 630px; overflow: hidden; background: var(--bg); }
      .og-blade { position: absolute; left: 0; right: 0; top: 0; height: 24px; }
      .og-text { position: absolute; left: 70px; top: 128px; width: 560px; }
      .og-brand { display: flex; align-items: center; gap: 22px; }
      .og-brand img { border-radius: 18px; display: block; }
      .og-brand h1 { font: 700 88px/1 var(--disp); text-transform: uppercase; letter-spacing: .04em; margin: 0; white-space: nowrap; }
      .og-text p { font: 600 38px/1.2 var(--sans); color: var(--ink); margin: 34px 0 30px; }
      .og-text ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
      .og-text li { font: 600 27px/1.2 var(--disp); color: var(--ink-2); display: flex; align-items: center; gap: 14px; letter-spacing: .01em; }
      .og-text li::before { content: ''; width: 18px; height: 11px; border-radius: 2px; background: var(--tape); box-shadow: inset 0 -2px 0 var(--tape-2); }
      .og-calc { position: absolute; right: 64px; top: 74px; width: 440px; }
      .og-calc .case { --kh: 60px; }
      .og-calc .case::before { display: none; }
      .toast { display: none !important; }`;
    document.head.append(style);
    await document.fonts.ready;
  });
  await page.waitForTimeout(200);
  await page.setViewportSize({ width: 1200, height: 630 });
  const shot = await page.screenshot({ clip: { x: 0, y: 0, width: 1200, height: 630 }, scale: 'css' });
  await save(shot, 'og.png');
  await page.context().close();
}

await browser.close();
server.close();
console.log('screenshots written');
