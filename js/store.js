// Keeps tapes, the lumber list, settings and what was last typed in each tool, in this browser only.
import { Q, toText, fromText } from './rational.js';

const KEY = 'story-stick';
const MAX_TAPES = 20, MAX_LINES = 300;

export const DEFAULTS = { den: 16, show: 'ftin', money: '$' };
const DENS = [8, 16, 32, 64], SHOWS = ['ftin', 'in', 'mm'];

const newTape = () => ({ id: Math.random().toString(36).slice(2, 10), name: '', at: Date.now(), lines: [] });
const fresh = () => ({ v: 1, settings: { ...DEFAULTS }, tape: newTape(), tapes: [], tools: {}, lumber: [] });

// The save, from its text, or null when there isn't one this page can read.
function parse(text) {
  try {
    const data = JSON.parse(text);
    if (data && data.v === 1 && data.tape && Array.isArray(data.tapes)) {
      data.settings = { ...DEFAULTS, ...data.settings };
      // A save edited by hand, or written by a later version, may not all make sense here. Settings the page
      // can't use go back to the defaults, and a tape with no list of lines gets an empty one; lines that
      // don't read back are kept, and skipped where the tape is shown (tryUnpack).
      if (!DENS.includes(data.settings.den)) data.settings.den = DEFAULTS.den;
      if (!SHOWS.includes(data.settings.show)) data.settings.show = DEFAULTS.show;
      if (typeof data.tape !== 'object') data.tape = newTape();
      data.tapes = data.tapes.filter(t => t && typeof t === 'object');
      for (const t of [data.tape, ...data.tapes]) if (!Array.isArray(t.lines)) t.lines = [];
      if (!data.tools || typeof data.tools !== 'object') data.tools = {};
      if (!Array.isArray(data.lumber)) data.lumber = [];
      return data;
    }
  } catch { /* bad data: start fresh */ }
  return null;
}

// The save's text as this copy of the page last read or wrote it. Another copy, in a second tab or the installed
// app, may save in between, so each save here first folds in what that copy saved (merge) instead of writing over it.
let saved = null;
function read() {
  try { saved = localStorage.getItem(KEY); } catch { /* a private window or blocked storage: start fresh */ }
  return parse(saved) || fresh();
}

let state = read();

function write(merging = true) {
  try {
    const now = localStorage.getItem(KEY);
    const theirs = merging && now !== saved ? parse(now) : null;
    if (theirs) state = merge(state, parse(saved) || NOTHING, theirs);
    const text = JSON.stringify(state);
    localStorage.setItem(KEY, text);
    saved = text;
  } catch { /* can't save here; it still works for this visit */ }
}

// ---------- Two copies open at once ----------
// What this copy changed since it last read or wrote the save is kept, and the rest comes from the save as the other
// copy left it. Tapes, the lines on each tape and the lumber list merge one at a time, so whatever either copy added
// stays, and whatever either took away stays away, unless the other has put new sums on it since. The tape on this
// copy's calculator stays there, whole, even if the other copy cleared or deleted it.
const NOTHING = { settings: DEFAULTS, tape: null, tapes: [], tools: {}, lumber: [] }; // before there was a save
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pick = (mine, base, theirs) => (same(mine, base) ? theirs : mine);
const when = line => (typeof line?.at === 'number' ? line.at : 0);

function merge(mine, base, theirs) {
  const id = mine.tape.id;
  const all = s => (s.tape ? [s.tape, ...s.tapes] : s.tapes);
  const others = s => all(s).filter(t => t.id !== id);
  const there = all(theirs).find(t => t.id === id);
  const tape = there ? mergeTape(mine.tape, all(base).find(t => t.id === id), there) : mine.tape;
  // The other copy's own tape goes in the list here, unless it's a blank one it has only just started.
  const started = t => !t.lines.length && !t.name && !all(base).some(b => b.id === t.id);
  // A tape has changed when its sums have: a new name alone doesn't bring back a tape the other copy deleted.
  const newSums = (was, now) => !same(was.lines, now.lines);
  const tapes = mergeList(mine.tapes, others(base), others(theirs).filter(t => !started(t)), t => t.id, mergeTape, newSums);
  const lumber = mergeList(mine.lumber, base.lumber, theirs.lumber, x => x?.id ?? JSON.stringify(x));
  return {
    ...theirs, ...mine,
    settings: pickEach(mine.settings, base.settings, theirs.settings),
    tools: pickEach(mine.tools, base.tools, theirs.tools),
    tape,
    tapes: [...tapes.added, ...tapes.list].slice(0, MAX_TAPES),
    lumber: [...lumber.list, ...lumber.added],
  };
}

// A tape both copies have: the name as either renamed it, and the lines from both, in the order they were added.
function mergeTape(mine, base, theirs) {
  const lines = mergeList(mine.lines, base?.lines || [], theirs.lines, line => JSON.stringify(line));
  return {
    ...theirs, ...mine,
    name: pick(mine.name, base?.name, theirs.name),
    lines: lines.added.length ? [...lines.list, ...lines.added].sort((a, b) => when(a) - when(b)).slice(-MAX_LINES) : lines.list,
  };
}

// A list, item by item. list: the save's items in its order, less those this copy took away, with both(...) merging
// an item both copies have. added: the ones only this copy has added. Something one copy took away but the other has
// changed since (a tape with new sums on it) is kept: a copy that hadn't seen the sums can't have meant to drop them.
function mergeList(mine, base, theirs, keyOf, both = m => m, changed = (was, now) => !same(was, now)) {
  const keys = list => {
    const seen = new Map();
    return list.map(x => {
      const k = String(keyOf(x));
      seen.set(k, (seen.get(k) || 0) + 1);
      return `${k} ${seen.get(k)}`; // the same item twice is two items
    });
  };
  const km = keys(mine), kb = keys(base), kt = keys(theirs);
  const inMine = new Map(km.map((k, i) => [k, mine[i]])), inBase = new Map(kb.map((k, i) => [k, base[i]]));
  const inTheirs = new Set(kt);
  const list = [];
  theirs.forEach((x, i) => {
    if (inMine.has(kt[i])) list.push(both(inMine.get(kt[i]), inBase.get(kt[i]), x));
    else if (!inBase.has(kt[i]) || changed(inBase.get(kt[i]), x)) list.push(x); // new or changed in the other copy
  });
  return { list, added: mine.filter((x, i) => !inTheirs.has(km[i]) && (!inBase.has(km[i]) || changed(inBase.get(km[i]), x))) };
}

// Settings, and what was last typed in each tool: one at a time, as whichever copy changed it.
function pickEach(mine = {}, base = {}, theirs = {}) {
  const out = {};
  for (const k of new Set([...Object.keys(theirs), ...Object.keys(mine)])) {
    const v = pick(mine[k], base[k], theirs[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

// A value on the tape, stored as text so it keeps every digit: { n: '875', d: '16', dim: 1 }.
export const pack = v => ({ q: toText(v.q), dim: v.dim, ...(v.count ? { of: toText(v.count.of), each: toText(v.count.each) } : {}) });
export function unpack(p) {
  if (![0, 1, 2, 3].includes(p.dim)) throw new SyntaxError('not a kind of value: ' + p.dim);
  const v = { q: fromText(p.q), dim: p.dim };
  if (p.of) v.count = { of: fromText(p.of), each: fromText(p.each) };
  return v;
}
// A line's answer, or null when it doesn't read back.
export function tryUnpack(line) {
  try { return unpack(line.v); } catch { return null; }
}

export const store = {
  get settings() { return state.settings; },
  setting(key, value) { state.settings[key] = value; write(); },

  get tape() { return state.tape; },
  get tapes() { return state.tapes; },
  addLine(expr, value) {
    state.tape.lines.push({ e: expr, v: pack(value), at: Date.now() });
    if (state.tape.lines.length > MAX_LINES) state.tape.lines.splice(0, state.tape.lines.length - MAX_LINES);
    write();
  },
  removeLine(i) { state.tape.lines.splice(i, 1); write(); },
  nameTape(id, name) {
    const t = id === state.tape.id ? state.tape : state.tapes.find(x => x.id === id);
    if (t) { t.name = String(name || '').slice(0, 60); write(); }
  },
  // Starts a fresh tape; the old one goes to the top of the list if it has anything on it.
  newTape() {
    if (state.tape.lines.length) state.tapes.unshift(state.tape);
    state.tapes = state.tapes.slice(0, MAX_TAPES);
    state.tape = newTape();
    write();
  },
  openTape(id) {
    const i = state.tapes.findIndex(t => t.id === id);
    if (i < 0) return;
    const [t] = state.tapes.splice(i, 1);
    if (state.tape.lines.length) state.tapes.unshift(state.tape);
    state.tape = t;
    write();
  },
  deleteTape(id) {
    if (id === state.tape.id) state.tape = newTape();
    else state.tapes = state.tapes.filter(t => t.id !== id);
    write();
  },

  // What was last typed in a tool. Reading it adds nothing to the save, so it can't hide what another copy typed there.
  tool(name) { return state.tools[name] || {}; },
  saveTool(name, values) { state.tools[name] = { ...state.tools[name], ...values }; write(); },

  get lumber() { return state.lumber; },
  addLumber(item) { state.lumber.push({ id: Math.random().toString(36).slice(2, 10), ...item }); write(); },
  removeLumber(id) { state.lumber = state.lumber.filter(x => x.id !== id); write(); },
  clearLumber() { state.lumber = []; write(); },

  // Everything, including whatever another open copy saved.
  clearAll() {
    state = fresh();
    write(false);
  },
};

export { Q };
