// The arithmetic, the reading of sums, the rounding and every tool's maths, without a browser:
//   node --test test/unit.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import * as R from '../js/rational.js';
import { evaluate, preview, parseLength, parseNumber, tokenize, normalize, tryLength, UNITS } from '../js/measure.js';
import * as F from '../js/format.js';
import * as T from '../js/tools.js';
import { applyKey } from '../js/keys.js';

const { Q } = R;
const close = (a, b, eps = 1e-6, msg) => assert.ok(Math.abs(a - b) < eps, msg || `${a} is not close to ${b}`);
const same = (a, b, msg) => assert.ok(R.eq(a, b), msg || `${R.toText(a)} is not ${R.toText(b)}`);
// Inches as an exact fraction, from a whole number and a fraction: inch(54, 11, 16) is 54 11/16″.
const inch = (w, n = 0, d = 1) => R.add(Q(w), Q(n, d));
const val = (text, opts) => evaluate(text, opts);
const len = (text, opts) => {
  const v = evaluate(text, opts);
  assert.equal(v.dim, 1, `${text} should be a length`);
  return v.q;
};
const fails = (text, pattern) => assert.throws(() => evaluate(text), pattern, `${text} should not work out`);

// ---------- Fractions ----------

test('fractions stay in lowest terms with the sign on top', () => {
  assert.deepEqual(Q(6, 8), { n: 3n, d: 4n });
  assert.deepEqual(Q(3, -4), { n: -3n, d: 4n });
  assert.deepEqual(Q(0, 5), { n: 0n, d: 1n });
  assert.throws(() => Q(1, 0));
  same(R.add(Q(1, 2), Q(1, 3)), Q(5, 6));
  same(R.sub(Q(1, 16), Q(1, 8)), Q(-1, 16));
  same(R.mul(Q(3, 4), Q(8, 9)), Q(2, 3));
  same(R.div(Q(3, 4), Q(3, 8)), Q(2));
  assert.throws(() => R.div(Q(1), Q(0)));
  assert.equal(R.cmp(Q(1, 3), Q(1, 4)), 1);
  assert.equal(R.cmp(Q(-1, 3), Q(-1, 4)), -1);
});

test('floor, ceil and round, including negatives and halves', () => {
  assert.equal(R.floor(Q(7, 2)), 3n);
  assert.equal(R.floor(Q(-7, 2)), -4n);
  assert.equal(R.floor(Q(-6, 2)), -3n);
  assert.equal(R.ceil(Q(7, 2)), 4n);
  assert.equal(R.ceil(Q(-7, 2)), -3n);
  assert.equal(R.ceil(Q(8, 2)), 4n);
  assert.equal(R.round(Q(1, 2)), 1n, 'a half rounds up');
  assert.equal(R.round(Q(-1, 2)), -1n, 'and away from zero when negative');
  assert.equal(R.round(Q(49, 100)), 0n);
  assert.equal(R.round(Q(-51, 100)), -1n);
  assert.equal(R.round(Q(5, 2)), 3n);
});

test('decimals are read exactly', () => {
  same(R.fromDecimal('43.3125'), Q(693, 16));
  same(R.fromDecimal('.5'), Q(1, 2));
  same(R.fromDecimal('7.'), Q(7));
  same(R.fromDecimal('0.1'), Q(1, 10));
  assert.throws(() => R.fromDecimal('.'));
  assert.equal(R.isDyadic(Q(11, 16)), true);
  assert.equal(R.isDyadic(Q(1, 3)), false);
  assert.equal(R.isDyadic(Q(5)), true);
  same(R.fromText(R.toText(Q(-5500, 127))), Q(-5500, 127));
  close(R.toNumber(Q(5500, 127)), 43.30708661);
  // Very long fractions still turn into a sensible float.
  const huge = Q(10n ** 400n + 1n, 3n * 10n ** 399n);
  close(R.toNumber(huge), 10 / 3, 1e-9);
});

// ---------- Reading sums ----------

test('marks and fractions are tidied however they are typed', () => {
  assert.equal(normalize('7½″').trim(), '7 1/2"');
  assert.equal(normalize('3′ 7⁵⁄₁₆″'), "3' 7 5/16\"");
  assert.equal(normalize("7''"), '7"');
  assert.equal(normalize('1,100 mm'), '1100 mm');
  assert.equal(normalize('1,5'), '1.5');
  assert.equal(normalize('8’ − 3”'), "8' - 3\"");
  assert.deepEqual(tokenize('3 ft 7 in').map(t => t.t + ':' + t.v), ['num:3', 'unit:ft', 'num:7', 'unit:in']);
  assert.deepEqual(tokenize('2x4').map(t => t.v), ['2', '×', '4']);
  assert.throws(() => tokenize('3 & 4'), /doesn’t know “&”/);
  assert.equal(normalize('90°'), '90', 'a degree sign is fine in an angle');
});

test('lengths typed the ways people write them', () => {
  const cases = [
    [`3' 7-5/16"`, inch(43, 5, 16)],
    [`3'7 5/16`, inch(43, 5, 16)],
    [`3'-7 5/16"`, inch(43, 5, 16)],
    [`3' 7 5/16"`, inch(43, 5, 16)],
    ['3 ft 7 in', inch(43)],
    ['3 feet 7 inches', inch(43)],
    ['3 foot 7 inch', inch(43)],
    [`3′ 7⁵⁄₁₆″`, inch(43, 5, 16)],
    [`7" 5/16`, inch(7, 5, 16)],
    [`7" 5/16"`, inch(7, 5, 16)],
    [`11 3/8"`, inch(11, 3, 8)],
    [`11-3/8"`, inch(11, 3, 8)],
    [`5/16"`, Q(5, 16)],
    [`7½"`, inch(7, 1, 2)],
    [`½"`, Q(1, 2)],
    [`3.5'`, inch(42)],
    [`3 1/2'`, inch(42)],
    [`3/4'`, inch(9)],
    [`8'`, inch(96)],
    [`2 yd 1'`, inch(84)],
    ['1100mm', Q(5500, 127)],
    ['1100 mm', Q(5500, 127)],
    ['1,100 mm', Q(5500, 127)],
    ['25.4mm', Q(1)],
    ['2.54 cm', Q(1)],
    ['1m 20cm', R.mul(Q(1200), UNITS.mm)],
    ['1 metre', R.mul(Q(1000), UNITS.mm)],
    ['304.8 millimeters', Q(12)],
    [`(3 + 4)"`, Q(7)],
  ];
  for (const [text, want] of cases) same(len(text), want, `${text} should be ${R.toText(want)} in`);
});

test('a plain number stays a number, and becomes inches next to a length', () => {
  const v = val('43.3125');
  assert.equal(v.dim, 0);
  same(v.q, Q(693, 16));
  same(len(`3' + 2`), inch(38));
  same(len(`2 + 3'`), inch(38));
  same(len(`3' + 2 × 3`), inch(42), 'the 2 × 3 is worked out first, then taken as inches');
  same(len(`3' + 10`, { bare: 'mm' }), R.add(Q(36), R.mul(Q(10), UNITS.mm)));
  assert.equal(val('12 × 3').dim, 0);
  same(val('12 × 3').q, Q(36));
});

test('the sum in the brief: 3′ 7-5/16″ + 11 3/8″ is 4′ 6-11/16″', () => {
  const q = len(`3' 7-5/16" + 11 3/8"`);
  same(q, inch(54, 11, 16));
  assert.equal(F.lenText(q), '4′ 6-11/16″');
});

test('hyphens: a tape reading, or a subtraction', () => {
  same(val('10-3/4').q, Q(43, 4), '10-3/4 is ten and three quarters');
  same(val('10 - 3/4').q, Q(37, 4), 'with spaces it takes away');
  same(val('10-3').q, Q(7), 'no fraction after it: take away');
  same(len(`3'-2'`), inch(12), 'feet from feet');
  same(len(`8' -2"`), inch(94));
  same(len(`-7-5/16"`), R.neg(inch(7, 5, 16)));
});

test('a slash: a fraction when it is tight, a division when it is not', () => {
  same(val('24/3').q, Q(8));
  same(val('24 / 3').q, Q(8));
  same(len(`7'/2`), inch(42));
  same(len(`96"/3`), inch(32));
  same(val('1.5/2').q, Q(3, 4));
  same(val('1/2/2').q, Q(1, 4));
  same(len(`7 5/16" / 2`), Q(117, 32));
});

test('the usual order: × and ÷ before + and −, brackets first', () => {
  same(len(`3' + 2" ÷ 2`), inch(37));
  same(len(`(3' + 2") ÷ 2`), inch(19));
  same(len(`8' - 2 × 3-1/2"`), inch(89));
  same(val('2 + 3 × 4').q, Q(14));
  same(val('(2 + 3) × 4').q, Q(20));
  same(val('-(2 + 3)').q, Q(-5));
  same(val('--2').q, Q(2));
  same(val('2 x 3 * 4 × 5').q, Q(120));
  same(val('[2 + 3] × 2').q, Q(10));
});

test('multiplying and dividing lengths', () => {
  same(len(`7-5/16" × 3`), inch(21, 15, 16));
  same(len(`3 × 7-5/16"`), inch(21, 15, 16));
  same(len(`8' ÷ 3`), inch(32));
  same(len(`100" ÷ 3`), Q(100, 3));
  const area = val(`4' × 8'`);
  assert.equal(area.dim, 2);
  same(area.q, Q(4608));
  const vol = val(`2" × 6" × 8'`);
  assert.equal(vol.dim, 3);
  same(vol.q, Q(1152));
  assert.equal(F.boardFeetText(vol.q), '8 bd ft');
  same(len(`4' × 8' ÷ 2'`), inch(192), 'an area over a length is a length');
});

test('a length divided by a length is a count, with what is left over', () => {
  const v = val(`8' ÷ 11-3/4"`);
  assert.equal(v.dim, 0);
  same(v.q, Q(384, 47));
  same(v.count.of, Q(96));
  same(v.count.each, Q(47, 4));
  const whole = R.floor(v.q);
  assert.equal(whole, 8n);
  same(R.sub(v.count.of, R.mul(Q(whole), v.count.each)), Q(2));
  assert.equal(val(`(8' ÷ 2') + 1`).count, undefined, 'the count only stays for a plain division');
});

test('sums that do not make sense say why', () => {
  fails('2 3', /Two numbers side by side/);
  fails(`3' 2'`, /Put a sign/);
  fails(`3" 2'`, /Put a sign/);
  fails(`3' 1100mm`, /Put a sign/);
  fails(`7" 5`, /Put a sign/);
  fails(`1 ÷ 2'`, /Can’t divide a number by a length/);
  fails(`3' ÷ 0`, /Can’t divide by zero/);
  fails(`3' ÷ (2' - 24")`, /Can’t divide by zero/);
  fails('5/0', /0 on the bottom/);
  fails('7 5/0', /0 on the bottom/);
  fails(`3' + 4' × 4'`, /Can’t add an area to a length/);
  fails(`3' × 3' × 3' × 3'`, /past a volume/);
  fails(`"`, /needs a number/);
  fails(`3 + × 4`, /Two signs in a row/);
  fails(`3)`, /\) without a \(/);
  fails(`3 (4)`, /Put a sign/);
  assert.equal(val(`(3 + 4)' × 2"`).dim, 2, 'a length × a length is fine: an area');
  fails(`(3' + 4')"`, /unit marks on the numbers inside/);
  assert.throws(() => evaluate('3 +'), e => e.incomplete === true);
  assert.throws(() => evaluate('(3 + 4'), e => e.incomplete === true);
  assert.throws(() => evaluate(''), e => e.incomplete === true);
});

test('while typing, the preview leaves off a sign at the end and closes brackets', () => {
  same(preview(`3' 7" +`).q, inch(43));
  same(preview(`3' 7" + `).q, inch(43));
  same(preview(`(3' + 2"`).q, inch(38));
  same(preview(`5/`).q, Q(5));
  assert.equal(preview(''), null);
  assert.equal(preview('2 3'), null);
});

test('boxes that want a length or a number', () => {
  same(parseLength('43.3125'), Q(693, 16));
  same(parseLength('8', { bare: 'ft' }), inch(96));
  same(parseLength(`8' 6"`, { bare: 'ft' }), inch(102));
  same(parseLength('4/4'), Q(1), 'quarters: 4/4 is an inch');
  same(parseLength('8/4'), Q(2));
  same(parseLength('18', { bare: 'mm' }), R.mul(Q(18), UNITS.mm));
  assert.throws(() => parseLength(`4' × 8'`), /an area, not a length/);
  same(parseNumber('3 × 4'), Q(12));
  assert.throws(() => parseNumber(`3'`), /plain number/);
  assert.deepEqual(tryLength('  '), { q: null });
  assert.match(tryLength('2 3').error, /Two numbers/);
});

// ---------- Showing lengths ----------

test('rounding to the nearest 1/16, 1/8, 1/32 or 1/64', () => {
  assert.deepEqual(F.ticks(Q(1, 32), 16), { t: 1, rem: -1 / 32 }, '1/32 rounds up to 1/16');
  assert.equal(F.ticks(Q(-1, 32), 16).t, -1);
  assert.equal(F.ticks(Q(3, 64), 32).t, 2, '3/64 rounds up to 2/32');
  assert.equal(F.ticks(Q(1, 3), 8).t, 3);
  assert.equal(F.ticks(0.7, 16).t, 11);
  assert.equal(F.ticks(-0.7, 16).t, -11);
  close(F.ticks(Q(1, 3), 16).rem, 1 / 3 - 5 / 16);
  assert.equal(F.ticks(Q(5, 16), 16).rem, 0);
});

test('tape readings', () => {
  const t = (q, o) => F.lenText(q, o);
  assert.equal(t(inch(54, 11, 16)), '4′ 6-11/16″');
  assert.equal(t(inch(54, 11, 16), { show: 'in' }), '54-11/16″');
  assert.equal(t(inch(11, 3, 8)), '11-3/8″', 'under a foot: inches only');
  assert.equal(t(Q(96)), '8′ 0″');
  assert.equal(t(Q(97)), '8′ 1″');
  assert.equal(t(inch(96, 1, 4)), '8′ 1/4″');
  assert.equal(t(Q(3, 4)), '3/4″');
  assert.equal(t(Q(0)), '0″');
  assert.equal(t(Q(1, 100)), '0″', 'too small to show');
  assert.equal(t(R.neg(inch(54, 11, 16))), '−4′ 6-11/16″');
  assert.equal(t(inch(11, 31, 32)), '1′ 0″', '11 31/32 rounds up into the next foot');
  assert.equal(t(inch(7, 5, 16), { den: 8 }), '7-3/8″', '5/16 rounds up to 3/8');
  assert.equal(t(inch(7, 9, 32), { den: 32 }), '7-9/32″');
  assert.equal(t(inch(7, 9, 32), { den: 16 }), '7-5/16″');
  assert.equal(t(inch(7, 17, 64), { den: 64 }), '7-17/64″');
  assert.equal(t(Q(5500, 127)), '3′ 7-5/16″', '1100 mm');
  assert.equal(t(Q(5500, 127), { show: 'mm' }), '1100 mm');
  assert.equal(t(Math.SQRT2 * 12), '1′ 5″');
  assert.equal(F.lenHTML(inch(54, 11, 16)), '4′&#8202;<span class="in">6<span class="dash">-</span><span class="fr"><sup>11</sup>⁄<sub>16</sub></span>″</span>');
  assert.equal(F.lenHTML(Q(3, 4)), '<span class="fr"><sup>3</sup>⁄<sub>4</sub></span>″');
  assert.equal(F.lenHTML(Q(96)), '8′&#8202;<span class="in">0″</span>');
});

test('what rounding leaves out: a hair over or under', () => {
  assert.equal(F.hair(inch(54, 11, 16), 16), null);
  const h = F.hair(R.add(inch(54, 11, 16), Q(12, 1000)), 16);
  assert.deepEqual(h, { more: true, text: '0.012″', mm: '0.30 mm' });
  assert.equal(F.hairText(R.add(inch(54, 11, 16), Q(12, 1000)), 16), '+ a hair: 0.012″');
  assert.equal(F.hairText(R.sub(inch(54, 11, 16), Q(9, 1000)), 16), '− a hair: 0.009″');
  assert.equal(F.hairText(R.add(inch(1), Q(4, 10000)), 16), '+ a hair: 0.0004″');
  // 1100 mm is 43.30709″; the nearest 1/16 is 43 5/16 (43.3125), so it's a hair under.
  assert.equal(F.hairText(Q(5500, 127), 16), '− a hair: 0.005″');
  assert.equal(F.hairText(Q(5500, 127), 64), '− a hair: 0.005″');
  assert.equal(F.hairText(Q(5500, 127), 32), '− a hair: 0.005″');
  assert.equal(F.hairText(Q(5500, 127), 8), '+ a hair: 0.057″', 'at 1/8 it rounds down to 43 1/4');
});

test('decimals, millimetres and plain numbers', () => {
  assert.equal(F.dec(54.6875), '54.6875');
  assert.equal(F.dec(54.69952), '54.6995');
  assert.equal(F.dec(54), '54');
  assert.equal(F.dec(-0.00001), '0');
  assert.equal(F.dec(-2.5), '−2.5');
  assert.equal(F.mmText(inch(54, 11, 16)), '1389.1 mm');
  assert.equal(F.mmText(Q(1)), '25.4 mm');
  assert.equal(F.decFtText(inch(54)), '4.5 ft');
  assert.equal(F.numText(Q(36)), '36');
  assert.equal(F.numText(Q(109, 8)), '13 5/8');
  assert.equal(F.numText(Q(-109, 8)), '−13 5/8');
  assert.equal(F.numText(Q(3, 4)), '3/4');
  assert.equal(F.numText(Q(384, 47)), '≈ 8.1702');
  assert.equal(F.numText(Q(1, 5)), '0.2');
  assert.equal(F.areaText(Q(4608)), '32 sq ft');
  assert.equal(F.areaText(Q(84)), '84 sq in');
  assert.equal(F.volumeText(Q(1152)), '0.667 cu ft');
  assert.equal(F.money(Q(1234, 100)), '$12.34');
  assert.equal(F.money(10, '£'), '£10.00');
  assert.equal(F.degText(31.6166), '31.62°');
});

test('every answer types back in to exactly the same value', () => {
  const values = [
    { q: inch(54, 11, 16), dim: 1 }, { q: Q(5500, 127), dim: 1 }, { q: Q(100, 3), dim: 1 }, { q: Q(-775, 16), dim: 1 },
    { q: Q(96), dim: 1 }, { q: Q(1, 1024), dim: 1 }, { q: Q(0), dim: 1 }, { q: Q(7, 3), dim: 0 }, { q: Q(5, 2), dim: 0 },
    { q: Q(109, 8), dim: 0 }, { q: Q(-4), dim: 0 }, { q: Q(4608), dim: 2 }, { q: Q(1153, 2), dim: 3 },
    { q: R.mul(Q(1234567), UNITS.mm), dim: 1 }, { q: Q(1, 3), dim: 0 },
  ];
  for (const v of values) {
    const text = F.exactText(v);
    const back = evaluate(text);
    assert.equal(back.dim, v.dim, `${text} keeps its kind`);
    same(back.q, v.q, `${text} types back in exactly`);
  }
  assert.equal(F.exactText({ q: inch(54, 11, 16), dim: 1 }), '4′ 6-11/16″');
  assert.equal(F.exactText({ q: Q(5500, 127), dim: 1 }), '1100mm');
  assert.equal(F.exactText({ q: Q(100, 3), dim: 1 }), '33-1/3″');
  assert.equal(F.exactText({ q: Q(7, 3), dim: 0 }), '2 1/3');
});

test('random sums of tape readings come out exactly, and read back exactly', () => {
  let seed = 7;
  const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let i = 0; i < 400; i++) {
    const parts = [];
    let total = Q(0);
    for (let k = 0; k < 1 + rnd(4); k++) {
      const ft = rnd(12), inches = rnd(12), n = rnd(16);
      const q = R.add(Q(ft * 12 + inches), Q(n, 16));
      const style = rnd(3);
      const text = style === 0 ? `${ft}' ${inches}-${n}/16"` : style === 1 ? `${ft}'${inches} ${n}/16` : `${ft} ft ${inches} ${n}/16 in`;
      const neg = k > 0 && rnd(3) === 0;
      parts.push((k ? (neg ? ' - ' : ' + ') : '') + text);
      total = neg ? R.sub(total, q) : R.add(total, q);
    }
    const got = len(parts.join(''));
    same(got, total, parts.join(''));
    same(len(F.lenText(got, { den: 16 })), got, 'a sixteenths answer reads back exactly');
  }
});

// ---------- Even spacing ----------

test('balusters: 6 feet between posts, 1-1/2″ balusters, gaps no more than 4″', () => {
  const s = T.spacing({ space: Q(72), width: Q(3, 2), maxGap: Q(4) });
  assert.equal(s.n, 13);
  assert.equal(s.gaps, 14);
  same(s.gap, Q(15, 4));
  same(s.marks[0].left, Q(15, 4));
  same(s.marks[12].right, R.sub(Q(72), Q(15, 4)), 'the last gap is the same as the first');
  same(s.marks[1].left, R.add(Q(15, 4), R.add(Q(3, 2), Q(15, 4))));
  same(s.marks[0].center, R.add(Q(15, 4), Q(3, 4)));
  assert.equal(s.over, false);
  // One fewer baluster makes the gap too big.
  const fewer = T.spacing({ space: Q(72), width: Q(3, 2), maxGap: Q(4), count: 12 });
  assert.ok(R.cmp(fewer.gap, Q(4)) > 0);
  assert.equal(fewer.over, true);
});

test('spacing with an item at each end', () => {
  const s = T.spacing({ space: Q(72), width: Q(3, 2), maxGap: Q(4), ends: 'items' });
  assert.equal(s.n, 14);
  assert.equal(s.gaps, 13);
  same(s.gap, Q(51, 13));
  same(s.marks[0].left, Q(0));
  same(s.marks[13].right, Q(72));
  // Exactly fitting gaps count as fine: 10 boards 5″ wide with 5″ gaps fill 95″.
  const exact = T.spacing({ space: Q(95), width: Q(5), maxGap: Q(5), ends: 'items' });
  assert.equal(exact.n, 10);
  same(exact.gap, Q(5));
});

test('spacing: every gap is equal and the marks fill the space', () => {
  let seed = 3;
  const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let i = 0; i < 300; i++) {
    const space = Q(24 + rnd(200) * 16 + rnd(16), 16), width = Q(rnd(64), 16), maxGap = Q(8 + rnd(96), 16);
    for (const ends of ['gaps', 'items']) {
      const s = T.spacing({ space, width, maxGap, ends });
      if (s.error) { assert.match(s.error, /fit/); continue; }
      assert.ok(R.cmp(s.gap, maxGap) <= 0, 'no gap is bigger than allowed');
      const least = ends === 'items' ? 2 : 1;
      if (s.n > least) {
        const one = T.spacing({ space, width, count: s.n - 1, ends });
        assert.ok(one.error || R.cmp(one.gap, maxGap) > 0, 'and it is the fewest that does it');
      }
      const first = ends === 'items' ? Q(0) : s.gap;
      same(s.marks[0].left, first);
      same(R.sub(space, s.marks[s.n - 1].right), first);
      for (let k = 1; k < s.n; k++) same(R.sub(s.marks[k].left, s.marks[k - 1].right), s.gap);
    }
  }
});

test('spacing: things that do not fit, and missing sizes', () => {
  assert.match(T.spacing({ space: Q(10), width: Q(3), count: 4 }).error, /won’t fit/);
  assert.match(T.spacing({ space: Q(0), width: Q(3), maxGap: Q(4) }).error, /space/);
  assert.match(T.spacing({ space: Q(10), width: Q(3) }).error, /largest gap/);
  assert.match(T.spacing({ space: Q(10), width: Q(3), count: 1, ends: 'items' }).error, /at least 2/);
  const one = T.spacing({ space: Q(3), width: Q(1), maxGap: Q(4) });
  assert.equal(one.n, 1);
  same(one.gap, Q(1));
  // Width zero: marks only (say, evenly spaced screws).
  const pts = T.spacing({ space: Q(48), width: Q(0), maxGap: Q(6), ends: 'items' });
  assert.equal(pts.n, 9);
  same(pts.gap, Q(6));
});

// ---------- Divide a board ----------

test('dividing a board into equal parts with a kerf', () => {
  const d = T.divideEqual({ length: Q(48), parts: 3, kerf: Q(1, 8) });
  same(d.piece, Q(191, 12));
  assert.equal(d.cuts, 2);
  same(d.pieces[2].end, Q(48));
  same(d.pieces[1].start, R.add(Q(191, 12), Q(1, 8)));
  same(d.waste, Q(1, 4));
  assert.equal(F.lenText(d.piece), '1′ 3-15/16″');
  assert.equal(F.hairText(d.piece, 16), '− a hair: 0.021″');
  const plain = T.divideEqual({ length: Q(96), parts: 4, kerf: Q(0) });
  same(plain.piece, Q(24));
  assert.match(T.divideEqual({ length: Q(1), parts: 9, kerf: Q(1, 8) }).error, /eat the whole board/);
  assert.match(T.divideEqual({ length: Q(10), parts: 1 }).error, /2 parts/);
});

test('how many pieces of a set length come out of a board', () => {
  const p = T.piecesOf({ length: Q(96), piece: Q(47, 4), kerf: Q(1, 8) });
  assert.equal(p.n, 8); // 8 × 11.75 + 7 × 0.125 = 94.875
  same(p.offcut, R.sub(Q(96), R.add(Q(94), Q(1))), 'what is left after the eighth cut');
  assert.equal(p.cuts, 8);
  // Exactly fits: 4 pieces of 23-29/32″ with 1/8″ kerfs is 96″, and no last cut.
  const fit = T.piecesOf({ length: Q(96), piece: R.div(R.sub(Q(96), Q(3, 8)), Q(4)), kerf: Q(1, 8) });
  assert.equal(fit.n, 4);
  assert.equal(fit.cuts, 3);
  same(fit.offcut, Q(0));
  // Less than a kerf left: it turns to sawdust.
  const dust = T.piecesOf({ length: Q(96), piece: Q(1529, 64), kerf: Q(1, 8) }); // 1/16″ left after the fourth piece
  assert.equal(dust.n, 4);
  assert.equal(dust.cuts, 4);
  same(dust.offcut, Q(0));
  assert.match(T.piecesOf({ length: Q(10), piece: Q(12) }).error, /Not even one/);
});

// ---------- Stairs ----------

test('stairs for a 9-foot rise', () => {
  const s = T.stairs({ rise: Q(108), tread: Q(21, 2) });
  assert.equal(s.n, 14, '108 ÷ 7.75 is 13.9, so 14 risers');
  assert.equal(s.treads, 13);
  same(s.riser, Q(54, 7));
  assert.equal(F.lenText(s.riser, { den: 16 }), '7-11/16″');
  same(s.totalRun, Q(273, 2));
  close(s.angle, Math.atan((54 / 7) / 10.5) * 180 / Math.PI);
  close(s.stringer, Math.hypot(108, 136.5));
  assert.equal(s.stock, 16);
  same(s.steps[13].height, Q(108), 'the last riser lands on the floor above');
  same(s.steps[13].run, Q(273, 2));
  assert.deepEqual(s.checks.map(c => c.ok), [true, true, false, true], '2R + T is 25.9″: a steep, short-tread stair');
  same(s.comfort, R.add(Q(108, 7), Q(21, 2)));
});

test('stairs that fit a set run, a chosen number of risers, and the code checks', () => {
  const s = T.stairs({ rise: Q(42), run: Q(40), treadThick: Q(1) });
  assert.equal(s.n, 6);
  same(s.riser, Q(7));
  same(s.tread, Q(8), '40″ of run over 5 treads');
  assert.equal(s.checks.find(c => c.id === 'tread').ok, false);
  same(s.firstRiser, Q(6));
  const more = T.stairs({ rise: Q(42), tread: Q(11), risers: 7 });
  same(more.riser, Q(6));
  assert.equal(more.fewest, 6);
  assert.equal(more.checks.find(c => c.id === 'comfort').ok, false, '2 × 6 + 11 = 23');
  const tooFew = T.stairs({ rise: Q(42), tread: Q(10), risers: 5 });
  assert.equal(tooFew.checks.find(c => c.id === 'riser').ok, false, '8.4″ risers');
  const tall = T.stairs({ rise: Q(160) });
  assert.equal(tall.checks.find(c => c.id === 'flight').ok, false);
  const one = T.stairs({ rise: Q(7) });
  assert.equal(one.n, 1);
  assert.equal(one.treads, 0);
  assert.equal(one.stock, null);
  const exact = T.stairs({ rise: Q(31) }); // exactly four 7¾″ risers
  assert.equal(exact.n, 4);
  assert.match(T.stairs({ rise: Q(0) }).error, /total rise/);
});

// ---------- Miters ----------

test('frames with equal sides', () => {
  assert.deepEqual(T.frame(4), { miter: 45, corner: 90 });
  assert.deepEqual(T.frame(6), { miter: 30, corner: 120 });
  assert.deepEqual(T.frame(8), { miter: 22.5, corner: 135 });
  assert.deepEqual(T.frame(3), { miter: 60, corner: 60 });
  close(T.frame(5).miter, 36);
  close(T.frameSide({ sides: 4, inside: Q(10), width: Q(2) }), 14);
  close(T.frameSide({ sides: 6, inside: Q(10), width: Q(2) }), 10 + 4 * Math.tan(Math.PI / 6));
  close(T.frameSide({ sides: 8, inside: Q(12), width: Q(3, 2) }), 12 + 3 * (Math.SQRT2 - 1));
  assert.equal(T.trimMiter(90), 45);
  assert.equal(T.trimMiter(135), 22.5);
});

test('crown moulding matches the published saw settings', () => {
  // 52/38 crown in a square corner: miter 31.62°, bevel 33.86° (the detents on most compound miter saws).
  const a = T.crown({ corner: 90, spring: 38 });
  close(a.miter, 31.62, 0.005);
  close(a.bevel, 33.86, 0.005);
  assert.equal(a.nested, 45);
  // 45/45 crown: miter 35.26°, bevel 30.00°.
  const b = T.crown({ corner: 90, spring: 45 });
  close(b.miter, 35.26, 0.005);
  close(b.bevel, 30, 1e-9);
  // A 135° corner (a bay): 52/38 crown, miter 14.31°, bevel 17.55°.
  const c = T.crown({ corner: 135, spring: 38 });
  close(c.miter, 14.31, 0.01);
  close(c.bevel, 17.55, 0.01);
  assert.equal(c.nested, 22.5);
  // A straight run needs no angle at all.
  const d = T.crown({ corner: 180, spring: 38 });
  close(d.miter, 0, 1e-9);
  close(d.bevel, 0, 1e-9);
  // Checked from first principles with vectors, independently of the formulas in tools.js. Walls meet at the
  // origin: wall A runs along x, wall B at the corner angle from it, z is up. The crown along wall A leans out
  // from the wall at the spring angle. Laid flat on the saw, its back is the table and its edge is on the fence.
  const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  for (const corner of [60, 90, 100, 120, 135, 150]) {
    for (const spring of [30, 38, 45, 52]) {
      const g = T.crown({ corner, spring });
      const S = rad(spring), h = rad(corner) / 2;
      const along = [1, 0, 0], across = [0, Math.sin(S), Math.cos(S)];
      const table = cross(along, across); // the crown's back, lying on the saw table
      const cut = [Math.sin(h), -Math.cos(h), 0]; // the plane that halves the corner
      close(g.bevel, deg(Math.asin(Math.abs(dot(cut, table)))), 1e-9, `bevel ${corner}/${spring}`);
      close(g.miter, deg(Math.atan(Math.abs(dot(cut, across)) / Math.abs(dot(cut, along)))), 1e-9, `miter ${corner}/${spring}`);
    }
  }
});

// ---------- Board feet ----------

test('board feet', () => {
  same(T.boardFeet({ thick: Q(2), width: Q(6), length: Q(96) }), Q(8));
  same(T.boardFeet({ thick: parseLength('8/4'), width: Q(6), length: parseLength('8', { bare: 'ft' }) }), Q(8));
  same(T.boardFeet({ thick: parseLength('4/4'), width: Q(12), length: Q(12) }), Q(1), 'the definition: 1″ × 12″ × 12″');
  same(T.boardFeet({ thick: parseLength('5/4'), width: Q(7), length: Q(120), count: 3 }), Q(175, 8));
  assert.equal(F.dec(T.boardFeet({ thick: parseLength('5/4'), width: Q(7), length: Q(120), count: 3 }), 2), '21.88');
});

// ---------- Right triangles and square ----------

test('right triangles from any two sides', () => {
  const a = T.triangle({ rise: Q(3), run: Q(4) });
  close(a.diag, 5);
  close(a.angle, 36.8699, 1e-4);
  same(a.pitch, Q(9));
  close(a.slope, 75);
  const b = T.triangle({ rise: Q(6), diag: Q(10) });
  close(b.run, 8);
  const c = T.triangle({ run: Q(12), diag: Q(13) });
  close(c.rise, 5);
  close(c.pitch, 5);
  const roof = T.triangle({ rise: Q(6), run: Q(12) });
  same(roof.pitch, Q(6));
  close(roof.angle, 26.5651, 1e-4);
  assert.match(T.triangle({ rise: Q(6) }).error, /two of the three/);
  assert.match(T.triangle({ rise: Q(6), diag: Q(5) }).error, /longer than the rise/);
  assert.match(T.triangle({ run: Q(6), diag: Q(6) }).error, /longer than the run/);
});

test('checking a frame for square by its diagonals', () => {
  const sq = T.squareCheck({ width: Q(36), length: Q(48), d1: Q(60), d2: Q(60) });
  close(sq.target, 60);
  assert.equal(sq.square, true);
  assert.equal(sq.sidesOff, false);
  const off = T.squareCheck({ width: Q(36), length: Q(48), d1: inch(60, 3, 8), d2: inch(59, 5, 8) });
  assert.equal(off.square, false);
  same(off.diff, Q(3, 4));
  assert.equal(off.longer, 1);
  same(off.middle, Q(60));
  const other = T.squareCheck({ width: Q(36), length: Q(48), d1: Q(59), d2: Q(60) });
  assert.equal(other.longer, 2);
  assert.equal(other.sidesOff, true);
  assert.equal(T.squareCheck({ width: Q(36), length: Q(48), d1: inch(60, 1, 32), d2: Q(60) }).square, true);
});

test('the biggest 3-4-5 that fits', () => {
  assert.deepEqual(T.threeFourFive(Q(120), Q(168)), { a: Q(108), b: Q(144), c: Q(180), unit: 'ft', k: 3 });
  assert.deepEqual(T.threeFourFive(Q(168), Q(120)), { a: Q(108), b: Q(144), c: Q(180), unit: 'ft', k: 3 }, 'either way round');
  assert.equal(T.threeFourFive(Q(36), Q(48)).k, 1);
  assert.deepEqual(T.threeFourFive(Q(20), Q(30)), { a: Q(18), b: Q(24), c: Q(30), unit: 'in', k: 6 });
  assert.equal(T.threeFourFive(Q(2), Q(2)), null);
});

// ---------- Convert ----------

test('the nearest fraction at each size', () => {
  const rows = T.nearestFractions(Q(3, 10));
  assert.deepEqual(rows.map(r => `${r.t}/${r.den}`), ['1/2', '1/4', '2/8', '5/16', '10/32', '19/64']);
  close(rows[3].off, 5 / 16 - 0.3);
  close(rows[5].off, 19 / 64 - 0.3);
  const mm18 = T.nearestFractions(R.mul(Q(18), UNITS.mm), [32, 64]);
  assert.deepEqual(mm18.map(r => r.t), [23, 45], '18 mm is about 23/32″, or 45/64″');
  const chart = T.fractionChart(16);
  assert.equal(chart.length, 15);
  assert.deepEqual(chart[7], { n: 1, d: 2, inches: 0.5, mm: 12.7 });
  assert.deepEqual(chart[4], { n: 5, d: 16, inches: 0.3125, mm: 7.9375 });
});

// ---------- The keypad ----------

// Presses keys one after another at the end of the text, the way a thumb types.
function press(list, { text = '', last = '' } = {}) {
  for (const k of list) text = applyKey(text, text.length, text.length, k, last).text;
  return text;
}

test('the keypad types a tape reading the natural way', () => {
  assert.equal(press(['3', 'ft', '7', 'space', '5', '/16', 'in', 'plus', '1', '1', 'space', '3', '/8', 'in']), '3′ 7 5/16″ + 11 3/8″');
  assert.equal(press(['3', 'ft', '7']), '3′ 7', 'a number after a unit gets a space');
  assert.equal(press(['/2']), '1/2', 'a fraction key on its own is one of them');
  assert.equal(press(['7', 'space', '/2']), '7 1/2');
  assert.equal(press(['7', 'in', '/4']), '7″ 1/4');
  assert.equal(press(['5', '/16']), '5/16', 'the number before it counts them');
  assert.equal(press(['1', '5', '/16']), '15/16');
  assert.equal(press(['1', '1', '0', '0', 'mm']), '1100mm');
  assert.equal(press(['7', 'space', 'in']), '7″', 'a unit sticks to its number');
  assert.equal(press(['1', 'slash', '3']), '1/3');
  assert.equal(press(['1', 'space', 'space']), '1 ', 'one space is enough');
  assert.equal(press(['space']), '');
  for (const text of ['3′ 7 5/16″ + 11 3/8″', '7 1/2', '15/16', '1100mm']) evaluate(text);
});

test('signs on the keypad', () => {
  assert.equal(press(['3', 'plus', 'minus']), '3 + −', 'minus after a sign makes a negative');
  assert.equal(press(['3', 'plus', 'times']), '3 × ', 'another sign replaces the last');
  assert.equal(press(['minus', '3']), '−3');
  assert.equal(press(['plus']), '', 'nothing to add to yet');
  assert.equal(press(['times', '2'], { last: '4′ 6-11/16″' }), '4′ 6-11/16″ × 2', 'a sign first carries on from the last answer');
  assert.equal(press(['open', '3', 'plus', '4', 'close', 'in']), '(3 + 4)″');
  assert.equal(press(['2', 'open']), '2 × (', 'a bracket after a number multiplies');
  assert.equal(press(['open', 'minus', '2']), '(−2');
  assert.equal(press(['open', 'close', '5']).endsWith(' × 5'), true);
  same(evaluate(press(['3', 'plus', 'minus', '2'])).q, Q(1));
});

test('backspace and clear', () => {
  assert.equal(press(['7', 'plus', 'back']), '7', 'a sign and its spaces go in one press');
  assert.equal(press(['1', '0', '0', 'mm', 'back']), '100');
  assert.equal(press(['3', 'ft', 'back']), '3');
  assert.equal(press(['back']), '');
  assert.equal(press(['3', 'ft', '7', 'clear']), '');
  // In the middle of the text: works at the caret.
  const mid = applyKey('3′ 7″', 3, 3, '1');
  assert.deepEqual(mid, { text: '3′ 17″', caret: 4 });
  const sel = applyKey('3′ 7″', 3, 5, 'back');
  assert.deepEqual(sel, { text: '3′ ', caret: 3 });
});

// ---------- The offline copy ----------

test('the service worker keeps a copy of every file the page uses', async () => {
  const root = new URL('../', import.meta.url);
  const sw = await readFile(new URL('sw.js', root), 'utf8');
  const shell = JSON.parse(sw.match(/const SHELL = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
  const walk = async dir => (await readdir(new URL(dir, root), { withFileTypes: true }))
    .flatMap(e => (e.isDirectory() ? [] : [dir + e.name]));
  const needed = [
    ...(await walk('css/')), ...(await walk('js/')), ...(await walk('js/screens/')), ...(await walk('fonts/')),
    'index.html', 'icon.svg', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png',
  ];
  for (const f of needed) assert.ok(shell.includes(f), `sw.js is missing ${f}`);
  for (const f of shell.filter(f => f !== './')) await readFile(new URL(f, root)); // and every file it lists exists
});
