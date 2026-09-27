// The maths behind each workshop tool. No page code here, so the tests run it in Node.
// Lengths are exact fractions of an inch wherever they can be; square roots and angles are plain numbers.
import { Q, ZERO, add, sub, mul, div, cmp, ceil, floor, toNumber, sign, isZero, absQ } from './rational.js';

const num = x => (typeof x === 'number' ? x : toNumber(x));
const RAD = Math.PI / 180;
const HALF = Q(1, 2);
const pos = x => x && sign(x) > 0;

// ---------- Even spacing ----------
// Balusters, pickets, fence boards, shelf-pin holes. ends: 'gaps' puts a gap at each end (balusters between
// posts); 'items' puts an item at each end (the first and last board flush with the ends).
// Give maxGap to get the fewest items that keep every gap no bigger than it, or count to use that many.
export function spacing({ space, width = ZERO, maxGap = null, count = null, ends = 'gaps' }) {
  if (!pos(space)) return { error: 'Give the space to fill.' };
  if (sign(width) < 0) return { error: 'The width can’t be less than nothing.' };
  const itemsAtEnds = ends === 'items';
  const least = itemsAtEnds ? 2 : 1;
  let fewest = null;
  if (maxGap && sign(maxGap) >= 0 && !isZero(add(width, maxGap))) {
    // n items, n + 1 gaps:  S = n·w + (n + 1)·g  →  n ≥ (S − g) / (w + g).  With items at the ends, n − 1 gaps.
    const need = div(itemsAtEnds ? add(space, maxGap) : sub(space, maxGap), add(width, maxGap));
    fewest = Math.max(least, Number(ceil(need)));
  }
  const n = count ?? fewest;
  if (n == null) return { error: 'Give the largest gap, or how many.' };
  if (n < least) return { error: itemsAtEnds ? 'With one at each end, that takes at least 2.' : 'That takes at least 1.' };
  if (n > 5000) return { error: 'That’s more than 5,000. Check the sizes.' };
  const gaps = itemsAtEnds ? n - 1 : n + 1;
  const gap = div(sub(space, mul(Q(n), width)), Q(gaps));
  if (sign(gap) < 0) return { error: `${n} won’t fit: together they’re wider than the space.`, n, fewest };
  const first = itemsAtEnds ? ZERO : gap;
  const marks = [];
  for (let i = 0; i < n; i++) {
    // Each mark measured from the start, so rounding never adds up along the run.
    const left = add(first, mul(Q(i), add(width, gap)));
    marks.push({ left, center: add(left, mul(width, HALF)), right: add(left, width) });
  }
  return { n, gap, gaps, marks, fewest, over: maxGap ? cmp(gap, maxGap) > 0 : false };
}

// ---------- Divide a board ----------
// Into equal parts, allowing for the saw kerf between them.
export function divideEqual({ length, parts, kerf = ZERO }) {
  if (!pos(length)) return { error: 'Give the length to divide.' };
  if (!Number.isInteger(parts) || parts < 2) return { error: 'Divide into 2 parts or more.' };
  if (parts > 500) return { error: 'That’s more than 500 parts.' };
  const cuts = parts - 1;
  const piece = div(sub(length, mul(Q(cuts), kerf)), Q(parts));
  if (sign(piece) <= 0) return { error: 'The saw cuts would eat the whole board.' };
  return { piece, cuts, parts, pieces: lay(parts, piece, kerf), waste: mul(Q(cuts), kerf) };
}

// Pieces of a set length: how many fit, and the offcut.
export function piecesOf({ length, piece, kerf = ZERO }) {
  if (!pos(length)) return { error: 'Give the length of the board.' };
  if (!pos(piece)) return { error: 'Give the length of one piece.' };
  const n = Number(floor(div(add(length, kerf), add(piece, kerf))));
  if (n < 1) return { error: 'Not even one piece fits.', n: 0 };
  if (n > 500) return { error: 'That’s more than 500 pieces.' };
  const left = sub(length, add(mul(Q(n), piece), mul(Q(n - 1), kerf)));
  // Nothing left: the last piece ends at the end of the board. Less than a kerf: the last cut turns it to dust.
  const lastCut = sign(left) > 0;
  const offcut = cmp(left, kerf) > 0 ? sub(left, kerf) : ZERO;
  return { n, cuts: lastCut ? n : n - 1, offcut, pieces: lay(n, piece, kerf) };
}

function lay(n, piece, kerf) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const start = mul(Q(i), add(piece, kerf));
    out.push({ start, end: add(start, piece) });
  }
  return out;
}

// ---------- Stairs ----------
// US residential code (IRC 2021, R311.7). Local codes can differ.
export const IRC = {
  maxRiser: Q(31, 4), // 7¾″, R311.7.5.1
  minTread: Q(10), // 10″, R311.7.5.2
  maxFlight: Q(151), // 12′ 7″ of rise between landings, R311.7.3
};
export const STOCK_FT = [8, 10, 12, 14, 16, 18, 20];

export function stairs({ rise, maxRiser = IRC.maxRiser, tread = Q(10), run = null, risers = null, treadThick = ZERO }) {
  if (!pos(rise)) return { error: 'Give the total rise, finished floor to finished floor.' };
  if (!pos(maxRiser)) return { error: 'Give the tallest riser you’ll allow.' };
  const fewest = Math.max(1, Number(ceil(div(rise, maxRiser))));
  const n = risers ?? fewest;
  if (n < 1) return { error: 'That takes at least 1 riser.' };
  if (n > 60) return { error: 'That’s more than 60 steps.' };
  const h = div(rise, Q(n));
  const treads = n - 1;
  let t = tread;
  if (run && treads > 0) t = div(run, Q(treads));
  if (treads > 0 && !pos(t)) return { error: 'Give a tread depth, or the run you have.' };
  if (!t) t = ZERO;
  const totalRun = mul(t, Q(treads));
  const hN = num(h), tN = num(t);
  const angle = treads ? Math.atan2(hN, tN) / RAD : 90;
  const stringer = Math.hypot(num(rise), num(totalRun));
  const stepDiag = Math.hypot(hN, tN);
  const stock = treads ? STOCK_FT.find(ft => ft * 12 >= stringer + stepDiag) ?? null : null;
  const comfort = add(mul(Q(2), h), t);
  const steps = [];
  for (let i = 1; i <= n; i++) steps.push({ height: mul(Q(i), h), run: mul(Q(i - 1), t) });
  const checks = [
    { id: 'riser', ok: cmp(h, IRC.maxRiser) <= 0, text: 'Risers 7¾″ or less', note: 'IRC R311.7.5.1' },
    { id: 'tread', ok: treads === 0 || cmp(t, IRC.minTread) >= 0, text: 'Treads 10″ or deeper', note: 'IRC R311.7.5.2' },
    { id: 'comfort', ok: treads === 0 || (cmp(comfort, Q(24)) >= 0 && cmp(comfort, Q(25)) <= 0), text: '2 risers + 1 tread between 24″ and 25″', note: 'a comfort rule, not code' },
    { id: 'flight', ok: cmp(rise, IRC.maxFlight) <= 0, text: 'No more than 12 ft 7 in of rise without a landing', note: 'IRC R311.7.3' },
  ];
  return {
    n, fewest, treads, riser: h, tread: t, totalRun, angle, stringer, stock, comfort, steps, checks,
    firstRiser: sub(h, treadThick), // the stringer's bottom step, cut down by the tread thickness
  };
}

// ---------- Miters ----------
// A frame with equal sides: the saw setting (from square) and each corner's angle.
export function frame(sides) {
  return { miter: 180 / sides, corner: 180 * (sides - 2) / sides };
}
// Long point to long point of one side, from its inside (short point) length and the stock's width.
export function frameSide({ sides, inside, width }) {
  return num(inside) + 2 * num(width) * Math.tan(Math.PI / sides);
}
// Trim that turns a corner (baseboard standing against the fence, casing, a frame): the saw's miter setting.
export const trimMiter = corner => 90 - corner / 2;
// Crown moulding. corner: the angle between the walls (90 for a square corner, inside or outside).
// spring: the angle between the back of the crown and the wall (38° for 52/38 crown, 45° for 45/45).
// Laid flat on the saw it needs a miter and a bevel; nested upside down against the fence, a miter only.
export function crown({ corner = 90, spring = 38 }) {
  const half = (corner * RAD) / 2, s = spring * RAD;
  return {
    miter: Math.atan(Math.sin(s) / Math.tan(half)) / RAD,
    bevel: Math.asin(Math.cos(s) * Math.cos(half)) / RAD,
    nested: 90 - corner / 2,
  };
}

// ---------- Board feet ----------
// A board foot is 144 cubic inches (1″ × 12″ × 12″). Thickness goes in quarters: 4/4 is 1″, 8/4 is 2″.
export function boardFeet({ thick, width, length, count = 1 }) {
  return div(mul(mul(mul(thick, width), length), Q(count)), Q(144));
}

// ---------- Right triangles ----------
// Give any two of rise, run and diagonal.
export function triangle({ rise = null, run = null, diag = null }) {
  const has = x => x != null && sign(x) > 0;
  let r = has(rise) ? rise : null, u = has(run) ? run : null, d = has(diag) ? diag : null;
  if ([r, u, d].filter(Boolean).length < 2) return { error: 'Give two of the three.' };
  if (r && u) d = Math.hypot(num(r), num(u));
  else if (r && d) {
    if (num(d) <= num(r)) return { error: 'The diagonal has to be longer than the rise.' };
    u = Math.sqrt(num(d) ** 2 - num(r) ** 2);
  } else {
    if (num(d) <= num(u)) return { error: 'The diagonal has to be longer than the run.' };
    r = Math.sqrt(num(d) ** 2 - num(u) ** 2);
  }
  const rise12 = typeof r === 'number' || typeof u === 'number' ? (12 * num(r)) / num(u) : div(mul(r, Q(12)), u);
  return {
    rise: r, run: u, diag: d,
    angle: Math.atan2(num(r), num(u)) / RAD,
    pitch: rise12, // inches of rise per 12 of run
    slope: (100 * num(r)) / num(u),
  };
}

// Is it square? The diagonal a rectangle should have, and what two measured diagonals say.
export function squareCheck({ width, length, d1 = null, d2 = null }) {
  if (!pos(width) || !pos(length)) return { error: 'Give both sides.' };
  const out = { target: Math.hypot(num(width), num(length)), tri: threeFourFive(width, length) };
  if (pos(d1) && pos(d2)) {
    const diff = sub(d1, d2);
    out.diff = absQ(diff);
    out.longer = sign(diff) >= 0 ? 1 : 2;
    out.square = cmp(absQ(diff), Q(1, 32)) <= 0;
    out.middle = mul(add(d1, d2), HALF); // push the long diagonal's corners in until both read about this
    out.sidesOff = Math.abs(num(out.middle) - out.target) > 1 / 8;
  }
  return out;
}

// The biggest 3-4-5 triangle that fits on the corner, in whole feet if it can, otherwise whole inches.
export function threeFourFive(a, b) {
  const short = Math.min(num(a), num(b)), long = Math.max(num(a), num(b));
  let k = Math.floor(Math.min(short / 36, long / 48) + 1e-9);
  if (k >= 1) return { a: Q(36 * k), b: Q(48 * k), c: Q(60 * k), unit: 'ft', k };
  k = Math.floor(Math.min(short / 3, long / 4) + 1e-9);
  if (k >= 1) return { a: Q(3 * k), b: Q(4 * k), c: Q(5 * k), unit: 'in', k };
  return null;
}

// ---------- Convert ----------
// The nearest fraction at each size, and how far off it is.
export const FRACTION_SIZES = [2, 4, 8, 16, 32, 64];
export function nearestFractions(x, dens = FRACTION_SIZES) {
  return dens.map(den => {
    const t = Number(floor(add(mul(x, Q(den)), HALF))); // half up
    return { den, t, off: num(sub(Q(t, BigInt(den)), x)) }; // off: shown − exact, in inches
  });
}
// Every 1/den from 1/den to (den−1)/den, in lowest terms, with decimals and millimetres.
export function fractionChart(den) {
  const out = [];
  for (let k = 1; k < den; k++) {
    const q = Q(k, BigInt(den));
    out.push({ n: Number(q.n), d: Number(q.d), inches: k / den, mm: (k / den) * 25.4 });
  }
  return out;
}
