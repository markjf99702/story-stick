// Exact fractions, kept as a BigInt numerator over a BigInt denominator.
// Every length is a fraction of an inch, so 3' 7-5/16" + 11 3/8" or 1100mm ÷ 3 comes out exactly;
// rounding only happens when a number is shown.

const abs = a => (a < 0n ? -a : a);
function gcd(a, b) {
  a = abs(a); b = abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

// Q(3, 4) is 3/4. Always stored in lowest terms with a positive denominator.
export function Q(n, d = 1n) {
  n = BigInt(n); d = BigInt(d);
  if (d === 0n) throw new RangeError('zero denominator');
  if (d < 0n) { n = -n; d = -d; }
  const g = gcd(n, d);
  return g > 1n ? { n: n / g, d: d / g } : { n, d };
}

export const ZERO = Q(0);
export const ONE = Q(1);

export const add = (a, b) => Q(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a, b) => Q(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a, b) => Q(a.n * b.n, a.d * b.d);
export function div(a, b) {
  if (b.n === 0n) throw new RangeError('divide by zero');
  return Q(a.n * b.d, a.d * b.n);
}
export const neg = a => ({ n: -a.n, d: a.d });
export const absQ = a => ({ n: abs(a.n), d: a.d });
export const sign = a => (a.n > 0n ? 1 : a.n < 0n ? -1 : 0);
export const cmp = (a, b) => sign(sub(a, b));
export const eq = (a, b) => a.n === b.n && a.d === b.d;
export const isZero = a => a.n === 0n;
export const isInt = a => a.d === 1n;
export const min = (a, b) => (cmp(a, b) <= 0 ? a : b);
export const max = (a, b) => (cmp(a, b) >= 0 ? a : b);

// Whole-number parts, as BigInt.
export function floor(a) {
  const q = a.n / a.d;
  return a.n < 0n && q * a.d !== a.n ? q - 1n : q;
}
export const ceil = a => -floor(neg(a));
// Nearest whole number; a half goes away from zero (1/32 rounds up to 1/16, the way a tape is read).
export function round(a) {
  const t = floor(Q(abs(a.n) * 2n + a.d, 2n * a.d));
  return a.n < 0n ? -t : t;
}

// True when the denominator is a power of two: an exact tape reading (halves, quarters ... 64ths and beyond).
export function isDyadic(a) {
  const d = a.d;
  return (d & (d - 1n)) === 0n;
}

const bits = x => x.toString(2).length;
export function toNumber(a) {
  let { n, d } = a;
  // Keep very long fractions inside the range of a float before dividing.
  const extra = Math.max(bits(abs(n)), bits(d)) - 1000;
  if (extra > 0) { n >>= BigInt(extra); d >>= BigInt(extra); if (d === 0n) d = 1n; }
  return Number(n) / Number(d);
}

// "43.3125" → 693/16, exactly.
export function fromDecimal(text) {
  const m = /^(\d*)(?:\.(\d*))?$/.exec(text);
  if (!m || (!m[1] && !m[2])) throw new SyntaxError('not a number: ' + text);
  const frac = m[2] || '';
  return Q(BigInt((m[1] || '0') + frac), 10n ** BigInt(frac.length));
}

// For storage: "693/16".
export const toText = a => `${a.n}/${a.d}`;
export function fromText(s) {
  const m = /^(-?\d+)\/(\d+)$/.exec(String(s));
  if (!m) throw new SyntaxError('not a fraction: ' + s);
  return Q(BigInt(m[1]), BigInt(m[2]));
}
