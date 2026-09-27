// Uses the app in Chromium through the real page:  node test/e2e.mjs  (needs Playwright)
// Types sums on the keypad the way a thumb would, reuses answers from the tape, changes the rounding,
// works each shop tool, and checks the page keeps its tapes, fits a phone and works offline.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(join(execSync('npm root -g').toString().trim(), 'playwright')); }
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
const problems = [];

async function device(viewport, touch) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: touch });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await ctx.newPage();
  page.on('pageerror', e => problems.push(e.message));
  page.on('console', m => { if (m.type() === 'error') problems.push(m.text()); });
  page.on('requestfailed', r => problems.push('failed: ' + r.url()));
  page.on('request', r => { if (!r.url().startsWith(base)) problems.push('left the site: ' + r.url()); });
  return { ctx, page };
}

const squash = s => s.replace(/[\s ]+/g, ' ').trim();
const text = async (page, sel) => squash(await page.locator(sel).innerText());
const fits = async (page, where) => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${where} scrolls sideways`);
const keys = async (page, list, pad = '#keys') => { for (const k of list) await page.click(`${pad} [data-k="${k}"]`); };
const tapeLines = async page => (await page.locator('#lines .line .r').allInnerTexts()).map(squash);

// ---------- On a phone: the calculator ----------
const phone = await device({ width: 390, height: 844 }, true);
let page = phone.page;
await page.goto(base);
await page.evaluate(() => document.fonts.ready);
assert.equal(await page.title(), 'Story Stick');
assert.equal(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), true, 'a phone gets the touch layout');
assert.equal(await page.getAttribute('#expr', 'inputmode'), 'none', 'the phone keyboard stays away from the sum');
assert.match(await text(page, '#lines'), /Each sum prints here/);
await fits(page, 'the calculator');

// 3′ 7-5/16″ + 11 3/8″, typed on the keypad.
await keys(page, ['3', 'ft', '7', 'space', '5', '/16', 'in', 'plus', '1', '1', 'space', '3', '/8', 'in']);
assert.equal(await page.inputValue('#expr'), '3′ 7 5/16″ + 11 3/8″');
assert.match(await page.getAttribute('#read', 'class'), /live/, 'the answer shows while typing');
await keys(page, ['equals']);
assert.deepEqual(await tapeLines(page), ['= 4′ 6-11/16″']);
assert.equal(await text(page, '#also'), '54-11/16″ 54.6875″ 1389.1 mm');
assert.equal(await text(page, '#hair'), '', 'exact: no hair');

// A sign after = carries on from the answer; a third of it is a hair under 1′ 6-1/4″.
await keys(page, ['divide', '3', 'equals']);
assert.equal(await page.inputValue('#expr'), '4′ 6-11/16″ ÷ 3');
assert.equal(await text(page, '#hair'), '− a hair: 0.021″');
assert.equal((await tapeLines(page))[1], '= 1′ 6-1/4″−');

// Tap the first answer on the tape to use it again, then add metric.
await page.click('#lines [data-line="0"]');
assert.equal(await page.inputValue('#expr'), '4′ 6-11/16″');
await keys(page, ['plus', '1', '1', '0', '0', 'mm', 'equals']);
assert.equal((await tapeLines(page))[2], '= 8′ 2″−');
assert.equal(await text(page, '#hair'), '− a hair: 0.005″');

// How many 11-3/4″ pieces in 8′: a count, with what's left over.
await keys(page, ['8', 'ft', 'divide', '1', '1', 'space', '3', '/4', 'in', 'equals']);
assert.equal(await text(page, '#read'), '≈ 8.1702');
assert.match(await text(page, '#also'), /8 whole, 2″ left over/);

// Board feet from three lengths.
await keys(page, ['2', 'in', 'times', '6', 'in', 'times', '8', 'ft', 'equals']);
assert.match(await text(page, '#also'), /8 bd ft/);

// Backspace takes a sign in one press; C clears.
await keys(page, ['7', 'plus']);
assert.equal(await page.inputValue('#expr'), '7 + ');
await keys(page, ['back']);
assert.equal(await page.inputValue('#expr'), '7');
await keys(page, ['clear']);
assert.equal(await page.inputValue('#expr'), '');

// Something that doesn't make sense says why, and prints nothing.
await page.fill('#expr', '1 ÷ 2′');
await keys(page, ['equals']);
assert.equal(await text(page, '#read'), 'Can’t divide a number by a length.');
assert.equal((await tapeLines(page)).length, 5);
await keys(page, ['clear']);

// Rounding to eighths changes every reading, the tape included; back to sixteenths after.
await page.click('#settingsBtn');
await page.click('[data-seg=den] [data-v="8"]');
await page.click('.sheet .close');
assert.equal((await tapeLines(page))[0], '= 4′ 6-3/4″−', 'rounded up, so a hair under');
await page.click('#settingsBtn');
await page.click('[data-seg=den] [data-v="16"]');
await page.click('.sheet .close');
assert.equal((await tapeLines(page))[0], '= 4′ 6-11/16″');

// The tape is still there after a reload; a new tape keeps the old one in the list.
await page.reload();
await page.evaluate(() => document.fonts.ready);
assert.equal((await tapeLines(page)).length, 5, 'the tape survives a reload');
await page.click('#newTape');
assert.equal((await tapeLines(page)).length, 0);
await page.click('#tapesBtn');
assert.equal(await page.locator('.tape-row').count(), 2);
await page.fill('.tape-row:nth-child(2) .tape-title', 'Kitchen cabinets');
await page.locator('.tape-row:nth-child(2) .tape-title').dispatchEvent('change');
await page.click('.tape-row:nth-child(2) [data-act=open]');
assert.equal((await tapeLines(page)).length, 5, 'the old tape opens again');
assert.equal(await text(page, '#tapeName'), 'Kitchen cabinets');

// The help sheet's examples type themselves in.
await page.click('#helpBtn');
await page.click('[data-try="3 ft 7 in"]');
assert.equal(await page.inputValue('#expr'), '3 ft 7 in');
assert.equal(await text(page, '#also'), '43″ 1092.2 mm', 'no decimal when it says the same');
await keys(page, ['clear']);

// ---------- On a phone: the tools, typed with the slide-up keypad ----------
async function tool(name) {
  await page.click('#toolsBtn');
  await page.click(`.menu a:has-text("${name}")`);
  await page.locator('.tool-head h1', { hasText: name }).waitFor();
}
async function padType(id, list) {
  await page.tap('#' + id);
  assert.equal(await page.isHidden('#dock'), false, 'the keypad slides up for a length');
  await keys(page, ['clear', ...list], '#dock .keys');
  await page.click('#dockDone');
  await page.locator('#dock').waitFor({ state: 'hidden', timeout: 2000 });
}

await tool('Even spacing');
await page.click('[data-p=balusters]');
await padType('sp-space', ['6', 'ft']);
assert.equal(await page.inputValue('#sp-space'), '6′');
assert.equal(await text(page, '#sp-n'), '13');
assert.equal(await text(page, '#sp-gapv'), '3-3⁄4″');
assert.equal(await page.locator('#sp-marks li').count(), 13);
assert.equal(await text(page, '#sp-marks li:nth-child(2) .r'), '9″');
await page.click('[data-stepper=sp-n] [data-d="1"]');
assert.equal(await text(page, '#sp-n'), '14');
assert.match(await text(page, '#sp-note'), /fewest .* is 13/);
await page.click('[data-seg=at] [data-v=center]');
assert.equal(await text(page, '#sp-mh'), 'Centres from the left end');
await fits(page, 'even spacing');

await tool('Divide a board');
await page.fill('#dv-len', "8'");
await page.fill('#dv-kerf', '1/8');
assert.match(await text(page, '#dv-stats'), /Each part 2′ 7-15⁄16″ − a hair: 0.021″/i);
await page.click('[data-seg=mode] [data-v=pieces]');
await page.fill('#dv-piece', '11 3/4');
assert.match(await text(page, '#dv-stats'), /Pieces 8/i);
assert.match(await text(page, '#dv-stats'), /Offcut 1″/i);
await fits(page, 'divide a board');

await tool('Stairs');
await page.fill('#st-rise', "9'");
await page.fill('#st-tread', '10-1/2');
assert.equal(await text(page, '#st-n'), '14');
assert.match(await text(page, '#st-facts'), /buy 16-foot boards/);
assert.equal(await page.locator('#st-checks .check.no').count(), 1, 'a steep, short-tread stair fails the comfort rule only');
assert.equal(await page.locator('.steps tbody tr').count(), 14);
await page.fill('#st-run', "12' 6\"");
assert.equal(await page.isDisabled('#st-tread'), true, 'a set run decides the tread');
await fits(page, 'stairs');

await tool('Miters');
for (let i = 0; i < 4; i++) await page.click('[data-stepper=mt-sides] [data-d="1"]');
assert.equal(await text(page, '#mt-miter'), '22.5°');
assert.match(await text(page, '#mt-trim'), /31\.62° miter 33\.86° bevel/);
await page.click('[data-seg=spring] [data-v="45"]');
assert.match(await text(page, '#mt-trim'), /35\.26° miter 30° bevel/);
await fits(page, 'miters');

await tool('Board feet');
await page.click('[data-q="8/4"]');
await page.fill('#bf-width', '6');
await page.fill('#bf-length', '8');
await page.fill('#bf-price', '$10');
await page.fill('#bf-what', 'White oak');
assert.equal(await text(page, '#bf-out'), '8 bd ft');
assert.equal(await text(page, '#bf-cost'), '$80.00');
await page.click('#bf-add');
await page.fill('#bf-count', '3');
await page.fill('#bf-what', 'Walnut');
await page.click('#bf-add');
assert.equal(await page.locator('.lumber li').count(), 2);
assert.match(await text(page, '.total'), /32 bd ft \$320.00/);
await fits(page, 'board feet');

await tool('Triangles and square');
await page.fill('#tr-rise', '6');
await page.fill('#tr-run', '12');
await page.fill('#tr-diag', '');
assert.match(await text(page, '#tr-stats'), /Diagonal 1′ 1-7⁄16″/i);
assert.match(await text(page, '#tr-stats'), /Pitch 6 in 12/i);
await page.fill('#sq-w', "8'");
await page.fill('#sq-l', "12'");
assert.match(await text(page, '#sq-345'), /mark 6′ along one side and 8′ along the other.*exactly 10′ apart/);
await page.fill('#sq-d1', `14' 5"`);
await page.fill('#sq-d2', `14' 5-1/2"`);
assert.match(await text(page, '#sq-out'), /Out by 1\/2″/);
await fits(page, 'triangles');

await tool('Convert');
await page.fill('#cv-v', '18mm');
assert.match(await text(page, '#cv-near'), /32nd 23⁄32″ 0.0101″ over/i);
await page.click('[data-seg=chart] [data-v="64"]');
assert.equal(await page.locator('#cv-chart tr').count(), 63);
await fits(page, 'convert');

// Everything typed in the tools is still there after a reload.
await page.reload();
await page.evaluate(() => document.fonts.ready);
assert.equal(await page.inputValue('#cv-v'), '18mm');
await tool('Board feet');
assert.equal(await page.locator('.lumber li').count(), 2, 'the lumber list survives a reload');

// Works offline once it has been opened.
await page.goto(base);
await page.waitForFunction(() => navigator.serviceWorker?.controller, null, { timeout: 10000 }).catch(() => {});
await phone.ctx.setOffline(true);
await page.reload();
await page.evaluate(() => document.fonts.ready);
assert.equal(await page.title(), 'Story Stick', 'the page did not load offline');
await keys(page, ['1', 'ft', 'plus', '1', 'in', 'equals']);
assert.match((await tapeLines(page)).at(-1), /1′ 1″/, 'and still works it out offline');
await tool('Stairs');
assert.equal(await text(page, '#st-n'), '14', 'the tools open offline too');
await phone.ctx.setOffline(false);
await phone.ctx.close();

// ---------- On a laptop: typing on the keyboard ----------
const laptop = await device({ width: 1280, height: 800 }, false);
page = laptop.page;
await page.goto(base);
await page.evaluate(() => document.fonts.ready);
assert.equal(await page.evaluate(() => document.activeElement.id), 'expr', 'the sum box has the cursor');
await page.keyboard.type(`3' 7-5/16" + 11 3/8"`);
await page.keyboard.press('Enter');
assert.deepEqual(await tapeLines(page), ['= 4′ 6-11/16″']);
await page.keyboard.type('*2');
assert.equal(await page.inputValue('#expr'), '4′ 6-11/16″ × 2');
await page.keyboard.press('Enter');
assert.equal((await tapeLines(page))[1], '= 9′ 1-3/8″');
await page.keyboard.type('5');
assert.equal(await page.inputValue('#expr'), '5', 'a number after = starts again');
await page.keyboard.press('Escape');
assert.equal(await page.inputValue('#expr'), '');
for (const s of ['', 'spacing', 'divide', 'stairs', 'miters', 'board-feet', 'triangle', 'convert']) {
  await page.goto(base + '#/' + s);
  await page.locator(s ? '.tool-head' : '.calc').waitFor();
  await fits(page, `${s || 'the calculator'} on a laptop`);
}
assert.equal(await page.locator('#dock').count(), 0, 'no slide-up keypad with a mouse and keyboard');
await laptop.ctx.close();

assert.deepEqual(problems.filter(p => !p.startsWith('failed:')), [], 'problems while using it');
await browser.close();
server.close();
console.log('all good');
