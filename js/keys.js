// What each key on the keypad does to the text being typed. Pure, so the tests can press keys without a page.
// applyKey(text, start, end, key, last) → { text, caret }. start/end is the selection; last is the previous
// answer as text, so a sign pressed first carries on from it, the way a calculator does.

export const OPS = { plus: '+', minus: '−', times: '×', divide: '÷' };
const UNIT = { ft: '′', in: '″', mm: 'mm' };
const endsWithOp = s => /[+−\-×÷]\s*$/.test(s);
const endsWithUnit = s => /(′|″|'|"|mm|cm|\bm|ft|in)\s*$/.test(s);

export function applyKey(text, start, end, key, last = '') {
  let before = text.slice(0, start);
  const after = text.slice(end);
  const put = s => ({ text: before + s + after, caret: (before + s).length });

  if (key === 'clear') return { text: '', caret: 0 };
  if (key === 'back') {
    if (start !== end) return { text: before + after, caret: start };
    if (!before) return { text, caret: 0 };
    // A sign with its spaces, or a unit, goes in one press.
    const m = before.match(/\s*[+−×÷]\s*$/) || before.match(/(mm|cm)$/) || before.match(/\s+$/);
    before = before.slice(0, -(m ? m[0].length : 1));
    return { text: before + after, caret: before.length };
  }
  if (/^\d$/.test(key) || key === '.') {
    if (endsWithUnit(before) && !/\s$/.test(before)) return put(' ' + key); // 3′ then 7 is 3′ 7
    if (/\)$/.test(before)) return put(' × ' + key);
    return put(key);
  }
  if (key === 'space') {
    if (!before.trim() || /\s$/.test(before)) return { text, caret: start };
    return put(' ');
  }
  if (UNIT[key]) {
    before = before.replace(/\s+$/, '');
    return put(UNIT[key]);
  }
  if (OPS[key]) {
    const op = OPS[key];
    if (!before.trim()) {
      if (last) { before = last; return put(` ${op} `); }
      return op === '−' ? put('−') : { text, caret: start };
    }
    if (endsWithOp(before)) {
      // Minus after another sign makes a negative number; any other sign replaces the last one.
      if (op === '−' && !/[−\-]\s*$/.test(before)) return put('−');
      before = before.replace(/\s*[+−\-×÷]\s*$/, '');
      if (!before.trim()) return { text: after, caret: 0 };
    }
    before = before.replace(/\s+$/, '');
    if (/\($/.test(before)) return op === '−' ? put('−') : { text, caret: start };
    return put(` ${op} `);
  }
  if (key === 'slash') return (before = before.replace(/\s+$/, ''), put('/'));
  if (/^\/\d+$/.test(key)) {
    // A fraction key: the number just typed is the top (5 then /16 is 5/16); with no number, it's 1/16.
    const m = before.match(/(^|[^\d./])(\d+)$/);
    if (m) return put(key);
    const gap = /[\d′″'")]$/.test(before) || /mm$/.test(before) ? ' ' : '';
    return put(gap + '1' + key);
  }
  if (key === 'open') {
    const gap = before && !/[\s(]$/.test(before) ? (endsWithOp(before) ? '' : ' × ') : '';
    return put(gap + '(');
  }
  if (key === 'close') return (before = before.replace(/\s+$/, ''), put(')'));
  return { text, caret: start };
}
