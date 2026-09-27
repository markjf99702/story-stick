// Reads a sum the way it would be written in a shop:  3' 7-5/16" + 11 3/8"   8' ÷ 3   2" × 6" × 8'
// and works it out exactly. A value is { q, dim }: q is an exact fraction in inches (square inches for an
// area, cubic inches for a volume), and dim is 0 for a plain number, 1 for a length, 2 for an area, 3 for a volume.
import { Q, ZERO, add, sub, mul, div, neg, cmp, isInt, isZero, fromDecimal } from './rational.js';

export const UNITS = {
  in: Q(1),
  ft: Q(12),
  yd: Q(36),
  mm: Q(5, 127), // 1 mm is 1/25.4 in
  cm: Q(50, 127),
  m: Q(5000, 127),
};
// Which unit may follow which inside one measurement (3' 7", 1m 20cm): always a smaller one of the same kind.
const RANK = { yd: 5, ft: 4, in: 3, frac: 2, m: 13, cm: 12, mm: 11 };
const KIND = ['a number', 'a length', 'an area', 'a volume'];

export class MeasureError extends Error {
  constructor(message, incomplete = false) {
    super(message);
    this.incomplete = incomplete; // true when the sum just isn't finished yet (3' +)
  }
}

const VULGAR = { '½': '1/2', '¼': '1/4', '¾': '3/4', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8', '⅓': '1/3', '⅔': '2/3', '⅙': '1/6', '⅚': '5/6', '⅕': '1/5', '⅖': '2/5', '⅗': '3/5', '⅘': '4/5' };
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹', SUB = '₀₁₂₃₄₅₆₇₈₉';

// Tidies the ways people type marks and fractions into one form.
export function normalize(text) {
  return String(text ?? '')
    .replace(/[½¼¾⅛⅜⅝⅞⅓⅔⅙⅚⅕⅖⅗⅘]/g, c => ' ' + VULGAR[c])
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, s => ' ' + [...s].map(c => SUP.indexOf(c)).join(''))
    .replace(/[₀₁₂₃₄₅₆₇₈₉]+/g, s => [...s].map(c => SUB.indexOf(c)).join(''))
    .replace(/[⁄∕]/g, '/')
    .replace(/''|′′/g, '"')
    .replace(/[′’‘`´]/g, "'")
    .replace(/[″“”]/g, '"')
    .replace(/[−–—]/g, '-')
    .replace(/[✕✖∗·]/g, '×')
    .replace(/(\d),(?=\d{3}(?!\d))/g, '$1') // 1,100 is eleven hundred
    .replace(/(\d),(\d)/g, '$1.$2') // 1,5 is one and a half
    .replace(/,/g, ' ')
    .replace(/ /g, ' ');
}

const WORD = /^(feet|foot|ft|inches|inch|in|yards|yard|yds|yd|millimet(?:er|re)s?|mm|centimet(?:er|re)s?|cm|met(?:er|re)s?|m)(?![a-z])/i;
function unitOf(word) {
  const w = word.toLowerCase();
  if (w.startsWith('f')) return 'ft';
  if (w.startsWith('i')) return 'in';
  if (w.startsWith('y')) return 'yd';
  if (w === 'mm' || w.startsWith('milli')) return 'mm';
  if (w === 'cm' || w.startsWith('centi')) return 'cm';
  return 'm';
}

export function tokenize(text) {
  const s = normalize(text);
  const out = [];
  let i = 0, sp = true; // sp: there was a space (or the start) before this token
  while (i < s.length) {
    const c = s[i], rest = s.slice(i);
    if (/\s/.test(c)) { sp = true; i++; continue; }
    let m, tok;
    if ((m = /^(\d+\.?\d*|\.\d+)/.exec(rest))) tok = { t: 'num', v: m[1], len: m[1].length };
    else if ((m = WORD.exec(rest))) tok = { t: 'unit', v: unitOf(m[1]), len: m[1].length, text: m[1] };
    else if (c === "'") tok = { t: 'unit', v: 'ft', len: 1, text: "'" };
    else if (c === '"') tok = { t: 'unit', v: 'in', len: 1, text: '"' };
    else if (c === '+' || c === '-') tok = { t: 'op', v: c, len: 1 };
    else if (c === '×' || c === '*' || c === 'x' || c === 'X') tok = { t: 'op', v: '×', len: 1 };
    else if (c === '÷' || c === ':') tok = { t: 'op', v: '÷', len: 1 };
    else if (c === '/') tok = { t: 'slash', v: '/', len: 1 };
    else if (c === '(' || c === '[') tok = { t: 'lp', v: '(', len: 1 };
    else if (c === ')' || c === ']') tok = { t: 'rp', v: ')', len: 1 };
    else throw new MeasureError(`Story Stick doesn’t know “${c}”.`);
    tok.sp = sp;
    tok.at = i;
    out.push(tok);
    i += tok.len;
    sp = false;
  }
  return out;
}

const V = (q, dim, extra) => ({ q, dim, ...extra });
const isWhole = t => t && t.t === 'num' && /^\d+$/.test(t.v);

// Works out a sum. Options: bare, the unit a plain number takes when it's added to a length ('in' or 'mm').
export function evaluate(text, { bare = 'in' } = {}) {
  const toks = tokenize(text);
  if (!toks.length) throw new MeasureError('Nothing to work out.', true);
  let p = 0;
  const peek = (k = 0) => toks[p + k];
  const next = () => toks[p++];
  const end = what => new MeasureError(`Finish the sum: something needs to come after ${what}.`, true);

  function combine(a, b, op) {
    if (a.dim !== b.dim) {
      // A plain number next to a length in + or − is taken as inches (or mm): 3' + 2 is 3' 2".
      if (a.dim === 0 && b.dim === 1) a = V(mul(a.q, UNITS[bare]), 1);
      else if (a.dim === 1 && b.dim === 0) b = V(mul(b.q, UNITS[bare]), 1);
      else throw new MeasureError(`Can’t ${op === '+' ? 'add' : 'take'} ${KIND[b.dim]} ${op === '+' ? 'to' : 'from'} ${KIND[a.dim]}.`);
    }
    return V(op === '+' ? add(a.q, b.q) : sub(a.q, b.q), a.dim);
  }

  function times(a, b) {
    const dim = a.dim + b.dim;
    if (dim > 3) throw new MeasureError('That goes past a volume: length × length × length is as far as it goes.');
    return V(mul(a.q, b.q), dim);
  }

  function divide(a, b) {
    if (isZero(b.q)) throw new MeasureError('Can’t divide by zero.');
    const dim = a.dim - b.dim;
    if (dim < 0) throw new MeasureError(`Can’t divide ${KIND[a.dim]} by ${KIND[b.dim]}.`);
    const v = V(div(a.q, b.q), dim);
    // A length ÷ a length is a count: remember what went into what, for "7 whole, 2-1/4" left over".
    if (a.dim === 1 && b.dim === 1) v.count = { of: a.q, each: b.q };
    return v;
  }

  function expr() {
    let v = term();
    while (peek() && peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
      const op = next();
      if (!peek()) throw end(op.v === '+' ? '+' : '−');
      v = combine(v, term(), op.v);
    }
    return v;
  }

  function term() {
    let v = unary();
    while (peek() && ((peek().t === 'op' && (peek().v === '×' || peek().v === '÷')) || peek().t === 'slash')) {
      const op = next();
      const isTimes = op.v === '×';
      if (!peek()) throw end(isTimes ? '×' : '÷');
      const r = unary();
      v = isTimes ? times(v, r) : divide(v, r);
    }
    return v;
  }

  function unary() {
    const t = peek();
    if (t && t.t === 'op' && (t.v === '-' || t.v === '+')) {
      next();
      if (!peek()) throw end(t.v === '-' ? '−' : '+');
      const v = unary();
      return t.v === '-' ? V(neg(v.q), v.dim) : v;
    }
    return primary();
  }

  function primary() {
    const t = peek();
    if (!t) throw new MeasureError('Finish the sum.', true);
    if (t.t === 'lp') {
      next();
      if (!peek()) throw end('(');
      let v = expr();
      if (!peek()) throw new MeasureError('Close the bracket.', true);
      if (peek().t !== 'rp') throw stray(peek());
      next();
      // (3 + 4)" puts a unit on a plain number in brackets.
      if (peek() && peek().t === 'unit') {
        const u = next();
        if (v.dim !== 0) throw new MeasureError('Put the unit marks on the numbers inside the brackets.');
        v = V(mul(v.q, UNITS[u.v]), 1);
      }
      return v;
    }
    if (t.t === 'num') return measurement();
    throw stray(t);
  }

  function stray(t) {
    if (t.t === 'rp') return new MeasureError('There’s a ) without a (.');
    if (t.t === 'unit') return new MeasureError(`A unit mark (${t.text}) needs a number in front of it.`);
    if (t.t === 'op' || t.t === 'slash') return new MeasureError(`Two signs in a row: put a number before ${t.v === '/' ? '÷' : t.v === '-' ? '−' : t.v}.`);
    if (t.t === 'lp') return new MeasureError('Put a sign (+ − × ÷) before the bracket.');
    return new MeasureError('Put a sign (+ − × ÷) between the numbers.');
  }

  // One number: 7, 7.5, 5/16, 7 5/16, 7-5/16, each with an optional unit after it.
  function quantity() {
    const a = next();
    let q = fromDecimal(a.v), text = a.v, frac = false;
    const fracAt = k => peek(k) && peek(k).t === 'slash' && !peek(k).sp && isWhole(peek(k + 1)) && !peek(k + 1).sp;
    if (isWhole(a) && fracAt(0)) {
      next(); const b = next();
      if (BigInt(b.v) === 0n) throw new MeasureError(`A fraction can’t have 0 on the bottom (${a.v}/${b.v}).`);
      q = Q(BigInt(a.v), BigInt(b.v)); text = `${a.v}/${b.v}`; frac = true;
    } else if (isWhole(a) && isWhole(peek()) && peek().sp && fracAt(1)) {
      mixed(); // 7 5/16
    } else if (isWhole(a) && peek() && peek().t === 'op' && peek().v === '-' && !peek().sp && isWhole(peek(1)) && !peek(1).sp && fracAt(2)) {
      next(); mixed(); // 7-5/16, the way a tape reading is written
    }
    function mixed() {
      const n = next(); next(); const d = next();
      if (BigInt(d.v) === 0n) throw new MeasureError(`A fraction can’t have 0 on the bottom (${n.v}/${d.v}).`);
      q = add(q, Q(BigInt(n.v), BigInt(d.v)));
      text = `${a.v} ${n.v}/${d.v}`;
    }
    let unit = null, mark = '';
    if (peek() && peek().t === 'unit') { const u = next(); unit = u.v; mark = u.text; }
    return { q, unit, text: text + mark, proper: frac && cmp(q, Q(1)) < 0 };
  }

  // Numbers written side by side make one measurement: 3' 7", 3'7 5/16, 3 ft 7 in, 7" 5/16, 1m 20cm.
  function measurement() {
    const first = quantity();
    let total = first.unit ? V(mul(first.q, UNITS[first.unit]), 1) : V(first.q, 0);
    let last = first, rank = first.unit ? RANK[first.unit] : 0;
    for (;;) {
      const t = peek();
      if (!t) break;
      const joined = t.t === 'op' && t.v === '-' && !t.sp && last.unit === 'ft' && peek(1)?.t === 'num' && !peek(1).sp; // 3'-7"
      if (!joined && t.t !== 'num') break;
      const back = p;
      if (joined) next();
      const q2 = quantity();
      if (!last.unit) {
        throw new MeasureError(q2.unit
          ? `Put a sign (+ − × ÷) between ${last.text} and ${q2.text}.`
          : `Two numbers side by side (${last.text} ${q2.text}). Put a sign between them, or a / for a fraction.`);
      }
      let unit = q2.unit, r;
      if (!unit) {
        if (last.unit === 'ft' && rank === RANK.ft) { unit = 'in'; r = RANK.in; } // 3' 7 is 3' 7"
        else if (last.unit === 'in' && rank === RANK.in && q2.proper) { unit = 'in'; r = RANK.frac; } // 7" 5/16
      } else if (unit === 'in' && last.unit === 'in' && rank === RANK.in && q2.proper) r = RANK.frac; // 7" 5/16"
      else r = RANK[unit];
      if (!unit || r >= rank || Math.floor(r / 10) !== Math.floor(rank / 10)) {
        if (joined) { p = back; break; } // 3'-2' is a subtraction after all
        throw new MeasureError(`Put a sign (+ − × ÷) between ${last.text} and ${q2.text}.`);
      }
      total = V(add(total.q, mul(q2.q, UNITS[unit])), 1);
      last = { ...q2, unit }; rank = r;
    }
    return total;
  }

  const v = expr();
  if (p < toks.length) throw stray(peek());
  return v;
}

// While typing: the sum so far, leaving off a sign at the end (3' 7" + shows 3' 7").
export function preview(text, opts) {
  let trimmed = String(text ?? '').replace(/[\s+\-−–×x*÷/(:]+$/i, '');
  if (!trimmed.trim()) return null;
  const open = (trimmed.match(/[([]/g) || []).length - (trimmed.match(/[)\]]/g) || []).length;
  if (open > 0) trimmed += ')'.repeat(open);
  try { return evaluate(trimmed, opts); } catch { return null; }
}

// A box that wants a length. A plain number is taken in the given unit ('in', 'ft' or 'mm').
export function parseLength(text, { bare = 'in' } = {}) {
  const v = evaluate(text, { bare });
  if (v.dim === 0) return mul(v.q, UNITS[bare]);
  if (v.dim !== 1) throw new MeasureError(`That’s ${KIND[v.dim]}, not a length.`);
  return v.q;
}

// A box that wants a plain number (a count, an angle, a price).
export function parseNumber(text) {
  const v = evaluate(text);
  if (v.dim !== 0) throw new MeasureError(`That’s ${KIND[v.dim]}; this wants a plain number.`);
  return v.q;
}

// Like parseLength, but empty or unfinished gives null instead of an error.
export function tryLength(text, opts) {
  if (!String(text ?? '').trim()) return { q: null };
  try { return { q: parseLength(text, opts) }; } catch (e) { return { q: null, error: e.message }; }
}
export function tryNumber(text) {
  if (!String(text ?? '').trim()) return { q: null };
  try { return { q: parseNumber(text) }; } catch (e) { return { q: null, error: e.message }; }
}

export const kindOf = dim => KIND[dim];
export { isInt, ZERO };
