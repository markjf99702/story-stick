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
assert.equal(await page.evaluate(() => document.getElementById('roll').scrollTop), 0, 'an empty tape starts at the top, where it says what it is');
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

// Shown in millimetres, a plain number added to a length counts as millimetres.
await page.click('#settingsBtn');
await page.click('[data-seg=show] [data-v="mm"]');
await page.click('.sheet .close');
assert.equal((await tapeLines(page))[0], '= 1389.1 mm');
await keys(page, ['1', 'ft', 'plus', '5', 'equals']);
assert.equal(await text(page, '#read'), '309.8 mm');
await page.click('#settingsBtn');
await page.click('[data-seg=show] [data-v="ftin"]');
await page.click('.sheet .close');
assert.equal((await tapeLines(page))[5], '= 1′ 3/16″+', '12″ + 5 mm is a hair over 1′ 3/16″');

// The tape is still there after a reload; a new tape keeps the old one in the list.
await page.reload();
await page.evaluate(() => document.fonts.ready);
assert.equal((await tapeLines(page)).length, 6, 'the tape survives a reload');
await page.click('#newTape');
assert.equal((await tapeLines(page)).length, 0);
await page.click('#tapesBtn');
assert.equal(await page.locator('.tape-row').count(), 2);
await page.fill('.tape-row:nth-child(2) .tape-title', 'Kitchen cabinets');
await page.locator('.tape-row:nth-child(2) .tape-title').dispatchEvent('change');
await page.click('.tape-row:nth-child(2) [data-act=open]');
assert.equal((await tapeLines(page)).length, 6, 'the old tape opens again');
assert.equal(await text(page, '#tapeName'), 'Kitchen cabinets');

// The help sheet's examples type themselves in.
await page.click('#helpBtn');
assert.match(await text(page, '#sheet .sheet-body'), /the way you’d write it down.*They’re rounded/, 'curly apostrophes, like the rest of the page');
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
// The keypad offers the last length from the calculator's tape.
await page.tap('#sp-space');
assert.equal(await text(page, '#dockTape'), 'TAPE 1′ 3/16″');
await page.click('#dockTape');
assert.equal(await page.inputValue('#sp-space'), '309.8mm', 'exactly, as millimetres');
assert.equal(await text(page, '#sp-space-reads'), '= 1′ 3⁄16″');
await page.click('#dockDone');
assert.equal(await page.getAttribute('#sp-gap', 'placeholder'), '3-7/8″', 'a railing gap has to stay under 4″');
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
// After the Balusters preset, a gap of 4″ or more says a 4″ ball would pass, even within the largest gap given.
const BALL = 'A 4″ ball would pass: railings need less than 4″.';
await page.fill('#sp-gap', '4-1/4');
assert.equal(await text(page, '#sp-gapv'), '4-1⁄8″');
assert.equal(await text(page, '#sp-note'), `12 with 13 gaps. ${BALL}`);
assert.match(await page.getAttribute('#sp-note', 'class'), /bad/);
await page.fill('#sp-gap', '3-7/8');
assert.doesNotMatch(await text(page, '#sp-note'), /ball/, 'not when the gap is under 4″');
await page.fill('#sp-gap', '4-1/4');
await page.reload();
await page.locator('#sp-note').waitFor();
assert.equal(await text(page, '#sp-note'), `12 with 13 gaps. ${BALL}`, 'it remembers Balusters was chosen');
// Pickets, fence boards and shelf pins have no such rule.
await page.click('[data-p=pickets]');
await page.fill('#sp-gap', '4-1/4');
assert.equal(await text(page, '#sp-note'), '9 with 10 gaps.');
assert.doesNotMatch(await page.getAttribute('#sp-note', 'class'), /bad/);
await fits(page, 'even spacing');

await tool('Divide a board');
await page.fill('#dv-len', "8'");
await page.fill('#dv-kerf', '1/8');
assert.match(await text(page, '#dv-stats'), /Each part 2′ 7-15⁄16″ − a hair: 0.021″/i);
await page.click('[data-seg=mode] [data-v=pieces]');
await page.fill('#dv-piece', '11 3/4');
assert.match(await text(page, '#dv-stats'), /Pieces 8/i);
assert.match(await text(page, '#dv-stats'), /Offcut 1″/i);
await page.fill('#dv-kerf', '-1/8');
assert.equal(await text(page, '#dv-note'), 'The kerf can’t be less than nothing.');
assert.equal(await text(page, '#dv-list'), '', 'no overlapping pieces');
await page.fill('#dv-kerf', '1/8');
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
// With reduced motion on, the slide-up keypad brings a box into view without a smooth scroll.
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.evaluate(() => {
  const scrollBy = window.scrollBy.bind(window);
  window.scrolled = [];
  window.scrollBy = o => { window.scrolled.push(o); scrollBy(o); };
  document.activeElement?.blur();
  scrollTo(0, 0);
  document.getElementById('st-thick').focus({ preventScroll: true });
});
await page.waitForFunction(() => window.scrolled.length > 0, null, { timeout: 5000 });
assert.equal(await page.evaluate(() => window.scrolled[0].behavior), 'auto');
await page.click('#dockDone');
await page.emulateMedia({ reducedMotion: 'no-preference' });
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
// How many is whole boards, at least one: none, fewer or a typo blanks the result and says why.
for (const [count, why] of [['0', 'At least 1.'], ['-2', 'At least 1.'], ['abc', 'Story Stick doesn’t know “a”.']]) {
  await page.fill('#bf-count', count);
  assert.equal(await text(page, '#bf-count-reads'), why);
  assert.equal(await text(page, '#bf-out'), '–', `no board feet for ${count} boards`);
  assert.equal(await page.isDisabled('#bf-add'), true, `and nothing to add for ${count} boards`);
}
await page.fill('#bf-count', '2.5');
assert.equal(await text(page, '#bf-count-reads'), 'Whole boards: counted as 3');
assert.equal(await text(page, '#bf-out'), '24 bd ft');
await page.fill('#bf-count', '3');
assert.equal(await text(page, '#bf-count-reads'), '', 'a whole number says nothing');
assert.equal(await page.isDisabled('#bf-add'), false);

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
// 1/8″ is exactly 3.175 mm, so 3.18 to two places.
await page.fill('#cv-v', '1/8"');
assert.match(await text(page, '#cv-out'), /Millimetres 3\.18 mm Metres 0\.00318 m/i);
assert.equal(await text(page, '#cv-chart tr:nth-child(8)'), '1⁄8″ 0.125000 3.18');
// A negative size reads the same way as a positive one.
await page.fill('#cv-v', "-13'");
assert.match(await text(page, '#cv-out'), /^Feet and inches −13′ 0″ Inches −156″ /i);
await page.fill('#cv-v', '-1/32"');
assert.match(await text(page, '#cv-near'), /sixteenth −1⁄16″ 0.0313″ under/i);
await page.fill('#cv-v', '18mm');
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
assert.equal(await text(page, '#lines .line .e'), '3′ 7-5/16″ + 11 3/8″', 'typed marks print as feet and inch marks');
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

// ---------- On narrow phones ----------
// The header tightens up under 380px, and under 340px the tools button is just ≡, still named for screen readers.
for (const width of [360, 320]) {
  const narrow = await device({ width, height: 740 }, true);
  for (const s of ['', 'spacing', 'divide', 'stairs', 'miters', 'board-feet', 'triangle', 'convert']) {
    await narrow.page.goto(base + '#/' + s);
    await narrow.page.waitForFunction(key => document.body.dataset.screen === key, s || 'calc');
    await narrow.page.evaluate(() => document.fonts.ready);
    await fits(narrow.page, `${s || 'the calculator'} at ${width}px`);
  }
  assert.equal(await narrow.page.getByRole('button', { name: 'Convert', exact: true }).count(), 1, `the tools button names the screen at ${width}px`);
  assert.equal(await narrow.page.locator('#toolsBtn .now').evaluate(e => e.getBoundingClientRect().width > 1), width >= 340, 'and shows the name only when there is room');
  // The frame drawing gives way, so the Sides stepper's + stays inside the card.
  await narrow.page.goto(base + '#/miters');
  await narrow.page.waitForFunction(() => document.body.dataset.screen === 'miters');
  assert.equal(await narrow.page.evaluate(() => {
    const card = document.querySelector('.frame-row').closest('.card').getBoundingClientRect();
    return document.querySelector('[data-stepper="mt-sides"]').getBoundingClientRect().right <= card.right - 16;
  }), true, `the Sides stepper stays inside its card at ${width}px`);
  await narrow.ctx.close();
}

// ---------- The keyboard focus ring ----------
// Ink in light mode, where tape yellow would be lost on the yellow keys and the page; tape yellow in dark mode.
for (const [scheme, colour] of [['light', 'rgb(28, 29, 31)'], ['dark', 'rgb(195, 153, 0)']]) {
  const ring = await device({ width: 1280, height: 800 }, false);
  await ring.page.emulateMedia({ colorScheme: scheme });
  await ring.page.goto(base);
  await ring.page.locator('.calc').waitFor();
  await ring.page.keyboard.press('Tab'); // from the sum box to the first key
  assert.equal(await ring.page.evaluate(() => document.activeElement.matches('.k:focus-visible') && getComputedStyle(document.activeElement).outlineColor), colour, `the focus ring in ${scheme} mode`);
  await ring.ctx.close();
}

// Clear everything takes the answer off the LCD too, so a sign after it has nothing to carry on from.
await page.goto(base + '#/');
await page.locator('.calc').waitFor();
await page.keyboard.type(`5' + 1"`);
await page.keyboard.press('Enter');
assert.equal(await text(page, '#read'), '5′ 1″');
await page.click('#settingsBtn');
page.once('dialog', d => d.accept());
await page.click('#forget');
assert.match(await page.getAttribute('#read', 'class'), /idle/, 'the LCD is cleared');
assert.equal(await text(page, '#also'), '');
await page.keyboard.type('+');
assert.equal(await page.inputValue('#expr'), '+');
await page.keyboard.press('Escape');

// Shown in millimetres, thickness in quarters still means inches; a plain number is millimetres.
await page.click('#settingsBtn');
await page.click('[data-seg=show] [data-v="mm"]');
await page.click('.sheet .close');
await page.goto(base + '#/board-feet');
await page.locator('.tool-head').waitFor();
assert.equal(await text(page, '#bf-out'), '4 bd ft', '4/4 × 6″ × 8′ with lengths in millimetres');
assert.equal(await text(page, '#bf-thick-reads'), '= 25.4 mm');
await page.click('[data-q="8/4"]');
assert.equal(await text(page, '#bf-out'), '8 bd ft');
await page.fill('#bf-what', 'White oak');
await page.fill('#bf-price', '12');
await page.click('#bf-add');
assert.equal(await text(page, '.lumber li'), 'White oak 8/4 × 152.4 mm × 2438.4 mm 8 bd ft $96.00');
await page.fill('#bf-thick', '25');
assert.equal(await text(page, '#bf-out'), '3.94 bd ft', '25 is millimetres');
// A line added in millimetres before quarters were read as inches kept 8/4 as 2 mm; it reads right now.
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('story-stick'));
  s.lumber.push({ id: 'old', thick: '8/4', width: '6″', length: '8′', t: '10/127', w: '6/1', l: '96/1', count: 1, price: '12/1', what: 'Red oak' });
  localStorage.setItem('story-stick', JSON.stringify(s));
});
await page.reload();
await page.locator('.lumber li').nth(1).waitFor();
assert.equal(await text(page, '.lumber li:nth-child(2)'), 'Red oak 8/4 × 152.4 mm × 2438.4 mm 8 bd ft $96.00');
assert.match(await text(page, '.total'), /16 bd ft \$192.00/);
await laptop.ctx.close();

// ---------- A save that doesn't all read back ----------
// Edited by hand, or written by a later version: what reads back shows, and the rest is kept in the save.
const odd = await device({ width: 1280, height: 800 }, false);
page = odd.page;
await page.goto(base);
const save = data => page.evaluate(d => localStorage.setItem('story-stick', JSON.stringify(d)), data);
await save({
  v: 1, settings: { den: 'abc', show: 'yards' },
  tape: { id: 'a', name: 'Odd one', at: 1, lines: [{ e: '1"', v: { q: 'x', dim: 1 }, at: 1 }, { e: '2"', v: { q: '2/1', dim: 1 }, at: 2 }] },
  tapes: [{ id: 'b', name: 'No lines', at: 1 }],
});
await page.reload();
assert.deepEqual(await tapeLines(page), ['= 2″'], 'the line that reads back is on the tape');
assert.equal(await text(page, '#tapeCount'), '· 1 sum');
await page.keyboard.type('3"');
await page.keyboard.press('Enter');
assert.equal(await text(page, '#read'), '3″');
assert.deepEqual(await tapeLines(page), ['= 2″', '= 3″']);
await page.click('#tapesBtn');
assert.match(await text(page, '.tape-row:nth-child(2) .meta'), /^0 sums$/);
await page.click('.sheet .close');
const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('story-stick')));
assert.equal(kept.tape.lines.length, 3, 'the line that does not read back is kept');
assert.deepEqual([kept.settings.den, kept.settings.show], [16, 'ftin']);
await save({ v: 1, tape: { id: 'c', name: '', at: 1 }, tapes: [] });
await page.reload();
assert.match(await text(page, '#lines'), /Each sum prints here/);
await page.keyboard.type(`1' + 1"`);
await page.keyboard.press('Enter');
assert.deepEqual(await tapeLines(page), ['= 1′ 1″']);
await odd.ctx.close();

// ---------- Two copies open at once ----------
// Two tabs, or the installed app and a tab: each saves what the other saved too, instead of writing over it.
const two = await device({ width: 1280, height: 800 }, false);
const tabs = [two.page, await two.ctx.newPage()];
tabs[1].on('pageerror', e => problems.push(e.message));
tabs[1].on('console', m => { if (m.type() === 'error') problems.push(m.text()); });
const sum = async (tab, s) => { await tab.keyboard.type(s); await tab.keyboard.press('Enter'); };
await tabs[0].goto(base);
await sum(tabs[0], '1"');
await tabs[1].goto(base); // the second copy opens on the same tape
assert.deepEqual(await tapeLines(tabs[1]), ['= 1″']);
await sum(tabs[1], '2"');
await sum(tabs[0], '3"');
assert.deepEqual(await tapeLines(tabs[0]), ['= 1″', '= 2″', '= 3″'], 'the other tab’s sum joins the tape');
await sum(tabs[1], '4"');
// Drawn again with the other tab's sum after it, the answer on show keeps its own sum.
await tabs[0].click('#settingsBtn');
await tabs[0].click('[data-seg=den] [data-v="32"]');
await tabs[0].click('.sheet .close');
assert.deepEqual(await tapeLines(tabs[0]), ['= 1″', '= 2″', '= 3″', '= 4″']);
assert.equal(await tabs[0].inputValue('#expr'), '3"');
assert.equal(await text(tabs[0], '#read'), '3″');
for (const [tab, what] of [[tabs[0], 'Oak'], [tabs[1], 'Walnut']]) {
  await tab.goto(base + '#/board-feet');
  await tab.fill('#bf-what', what);
  await tab.click('#bf-add');
}
assert.deepEqual(await tabs[1].locator('.lumber .what b').allInnerTexts(), ['Oak', 'Walnut']);
await tabs[0].reload();
await tabs[0].locator('.lumber li').nth(1).waitFor();
assert.deepEqual(await tabs[0].locator('.lumber .what b').allInnerTexts(), ['Oak', 'Walnut'], 'the lumber list from both');
assert.equal(await tabs[0].evaluate(() => JSON.parse(localStorage.getItem('story-stick')).tape.lines.length), 4);
await two.ctx.close();

// ---------- Other tools' offline copies ----------
// The other tools under junkdrawer.works/ keep their offline copies in the same caches as this one.
// When its service worker takes over, it clears out an old copy of its own and leaves theirs alone.
const shared = await device({ width: 1280, height: 800 }, false);
page = shared.page;
await page.goto(base + 'icon.svg'); // the same site, before the page has set up its service worker
await page.evaluate(async () => {
  await (await caches.open('another-tool-v1')).put('another-tool/index.html', new Response('theirs'));
  await (await caches.open('story-stick-x-v1')).put('story-stick-x/index.html', new Response('a tool whose name starts the same'));
  await (await caches.open('story-stick-v0')).put('index.html', new Response('an old copy'));
});
await page.goto(base);
await page.waitForFunction(() => navigator.serviceWorker?.controller); // it takes over the page after clearing out
assert.equal(await page.evaluate(() => caches.has('another-tool-v1')), true, 'the offline copy of another tool is left alone');
assert.equal(await page.evaluate(async () => (await caches.match('another-tool/index.html', { cacheName: 'another-tool-v1' }))?.text()), 'theirs', 'and what was in it');
assert.equal(await page.evaluate(() => caches.has('story-stick-x-v1')), true, 'and one whose name starts with this one’s');
assert.equal(await page.evaluate(() => caches.has('story-stick-v0')), false, 'an old copy of this one is cleared out');
await shared.ctx.close();

assert.deepEqual(problems.filter(p => !p.startsWith('failed:')), [], 'problems while using it');
await browser.close();
server.close();
console.log('all good');
