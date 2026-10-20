// Shows numbers the way a tape reads: 4′ 6-11/16″, rounded to the nearest 1/16 (or 1/8, 1/32, 1/64),
// with what the rounding left out ("+ a hair: 0.012″"), plus decimal inches and millimetres.
// Lengths come in as exact fractions of an inch, or as plain JS numbers where a square root or an angle is involved.
import { Q, mul, sub, round, toNumber, isInt, isDyadic, floor, absQ, sign } from './rational.js';

export const DENS = [8, 16, 32, 64];
const MINUS = '−';

const num = x => (typeof x === 'number' ? x : toNumber(x));

// Rounds to the nearest 1/den of an inch: t is the count of 1/den, rem what's left over (exact − shown), in inches.
export function ticks(x, den) {
  if (typeof x === 'number') {
    const t = Math.sign(x) * Math.round(Math.abs(x) * den);
    const rem = x - t / den;
    return { t: t || 0, rem: Math.abs(rem) < 1e-9 ? 0 : rem };
  }
  const t = round(mul(x, Q(den)));
  return { t: Number(t), rem: toNumber(sub(x, Q(t, BigInt(den)))) };
}

// Splits a count of 1/den into feet, inches and a fraction in lowest terms.
export function parts(t, den) {
  const neg = t < 0, a = Math.abs(t);
  const ft = Math.floor(a / (12 * den));
  const inTicks = a - ft * 12 * den;
  const inch = Math.floor(inTicks / den);
  let n = inTicks - inch * den, d = den;
  while (n && n % 2 === 0) { n /= 2; d /= 2; }
  return { neg, ft, inch, n, d: n ? d : 0, whole: Math.floor(a / den) };
}

// Trims a fixed-point number: 54.6875, 54.7, 54.
// An exact fraction is rounded exactly, a half away from zero as on a tape: 6.35 to one place is 6.4.
export function dec(x, places = 4) {
  if (typeof x !== 'number') return decExact(x, places);
  const v = x;
  if (!Number.isFinite(v)) return '—';
  let s = v.toFixed(places);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  if (s === '-0') s = '0';
  return s.replace('-', MINUS);
}
function decExact(q, places) {
  const scale = 10n ** BigInt(places);
  const t = round(mul(q, Q(scale)));
  const a = t < 0n ? -t : t;
  const frac = places ? String(a % scale).padStart(places, '0').replace(/0+$/, '') : '';
  return (t < 0n ? MINUS : '') + (a / scale) + (frac ? '.' + frac : '');
}

// Inches with a fraction, no feet: 54-11/16″ (or 11/16″, or 54″).
function inchesOf(p, mark = '″') {
  if (!p.n) return `${p.whole}${mark}`;
  return p.whole ? `${p.whole}-${p.n}/${p.d}${mark}` : `${p.n}/${p.d}${mark}`;
}

// A length as text. show: 'ftin' (4′ 6-11/16″), 'in' (54-11/16″) or 'mm' (1389.4 mm).
export function lenText(x, { den = 16, show = 'ftin' } = {}) {
  if (show === 'mm') return mmText(x);
  const p = parts(ticks(x, den).t, den);
  const sgn = p.neg ? MINUS : '';
  if (show === 'in' || p.whole < 12) return sgn + inchesOf(p);
  const rest = p.inch || p.n ? inchesOf({ ...p, whole: p.inch }) : '0″';
  return `${sgn}${p.ft}′ ${rest}`;
}

// The same, as HTML with a stacked fraction: 4′ 6<span class="fr"><sup>11</sup>⁄<sub>16</sub></span>″.
export function lenHTML(x, { den = 16, show = 'ftin' } = {}) {
  if (show === 'mm') return mmHTML(x);
  const p = parts(ticks(x, den).t, den);
  const sgn = p.neg ? MINUS : '';
  const fr = p.n ? `<span class="fr"><sup>${p.n}</sup>⁄<sub>${p.d}</sub></span>` : '';
  const inches = (whole, always) => (whole || !fr || always ? `${whole}` : '') + (whole && fr ? '<span class="dash">-</span>' : '') + fr + '″';
  if (show === 'in' || p.whole < 12) return sgn + inches(p.whole);
  return `${sgn}${p.ft}′&#8202;<span class="in">${inches(p.inch, !p.n)}</span>`;
}

// Millimetres from an exact length are exact too (25.4 is 127/5); a square root or an angle stays a float.
const MM = Q(127, 5);
const mmOf = x => (typeof x === 'number' ? x * 25.4 : mul(x, MM));
export function mmText(x, places = 1) { return `${dec(mmOf(x), places)} mm`; }
function mmHTML(x) { return `${dec(mmOf(x), 1)}<small> mm</small>`; }
export const decInText = (x, places = 4) => `${dec(x, places)}″`;
export const decFtText = (x, places = 4) => `${dec(num(x) / 12, places)} ft`;

// What rounding left out, when it left anything: { more: true, text: '0.012″', mm: '0.30 mm' } or null.
// One too small to show at 4 places reads 'under 0.0001″', so an answer that isn't exact never looks exact.
// (A square root's or an angle's own float error is already nothing here: ticks() drops it.)
export function hair(x, den) {
  const { rem } = ticks(x, den);
  if (!rem) return null;
  const a = Math.abs(rem);
  const shown = a.toFixed(a >= 0.001 ? 3 : 4);
  return { more: rem > 0, text: Number(shown) ? `${shown}″` : 'under 0.0001″', mm: `${(a * 25.4).toFixed(2)} mm` };
}
export function hairText(x, den) {
  const h = hair(x, den);
  return h ? `${h.more ? '+' : MINUS} a hair: ${h.text}` : '';
}

// A plain number: 36, 13 5/8, 4.2857.
export function numText(q) {
  if (typeof q === 'number') return dec(q, 4);
  if (isInt(q)) return String(q.n).replace('-', MINUS);
  if (isDyadic(q) && q.d <= 64n) {
    const neg = sign(q) < 0, a = absQ(q), w = floor(a), r = sub(a, Q(w));
    return (neg ? MINUS : '') + (w ? `${w} ` : '') + `${r.n}/${r.d}`;
  }
  return (isInt(mul(q, Q(10000))) ? '' : '≈ ') + dec(q, 4);
}

export function areaText(q) {
  const sqin = num(q);
  return Math.abs(sqin) >= 144 ? `${dec(sqin / 144, 3)} sq ft` : `${dec(sqin, 3)} sq in`;
}
export function volumeText(q) {
  const cuin = num(q);
  return Math.abs(cuin) >= 1728 / 4 ? `${dec(cuin / 1728, 3)} cu ft` : `${dec(cuin, 2)} cu in`;
}
export const boardFeetText = q => `${dec(num(q) / 144, 2)} bd ft`;

// Text that types back in to exactly the same value: 4′ 6-11/16″, 1100mm, 33-1/3″, 2 1/3.
export function exactText(v) {
  const { q, dim } = v;
  if (dim === 1) {
    if (isDyadic(q) && q.d <= 1n << 20n) return lenText(q, { den: Number(q.d), show: 'ftin' });
    const mm = mul(q, Q(127, 5));
    if (isInt(mul(mm, Q(1000)))) return `${dec(toNumber(mm), 3)}mm`;
    return mixed(q) + '″';
  }
  if (dim === 0) {
    if (isInt(q)) return String(q.n).replace('-', MINUS);
    if (isInt(mul(q, Q(1000000))) && !isDyadic(q)) return dec(toNumber(q), 6);
    return mixed(q, ' ');
  }
  // An area or a volume goes back in as that many square (or cubic) inches.
  return `(${mixed(q)}″${' × 1″'.repeat(dim - 1)})`;
}
function mixed(q, sep = '-') {
  const neg = sign(q) < 0, a = absQ(q), w = floor(a), r = sub(a, Q(w));
  const s = r.n ? (w ? `${w}${sep}${r.n}/${r.d}` : `${r.n}/${r.d}`) : `${w}`;
  return (neg ? MINUS : '') + s;
}

export function money(x, sign = '$') {
  const v = num(x);
  return `${v < 0 ? MINUS : ''}${sign}${Math.abs(v).toFixed(2)}`;
}

export const degText = (d, places = 2) => `${dec(d, places)}°`;
