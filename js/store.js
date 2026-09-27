// Keeps tapes, the lumber list, settings and what was last typed in each tool, in this browser only.
import { Q, toText, fromText } from './rational.js';

const KEY = 'story-stick';
const MAX_TAPES = 20, MAX_LINES = 300;

export const DEFAULTS = { den: 16, show: 'ftin', money: '$' };

const newTape = () => ({ id: Math.random().toString(36).slice(2, 10), name: '', at: Date.now(), lines: [] });

function read() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    if (data && data.v === 1 && data.tape && Array.isArray(data.tapes)) {
      data.settings = { ...DEFAULTS, ...data.settings };
      data.tools ||= {};
      data.lumber ||= [];
      return data;
    }
  } catch { /* a private window, blocked storage or bad data: start fresh */ }
  return { v: 1, settings: { ...DEFAULTS }, tape: newTape(), tapes: [], tools: {}, lumber: [] };
}

let state = read();

function write() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* can't save here; it still works for this visit */ }
}

// A value on the tape, stored as text so it keeps every digit: { n: '875', d: '16', dim: 1 }.
export const pack = v => ({ q: toText(v.q), dim: v.dim, ...(v.count ? { of: toText(v.count.of), each: toText(v.count.each) } : {}) });
export function unpack(p) {
  const v = { q: fromText(p.q), dim: p.dim };
  if (p.of) v.count = { of: fromText(p.of), each: fromText(p.each) };
  return v;
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

  tool(name) { return (state.tools[name] ||= {}); },
  saveTool(name, values) { state.tools[name] = { ...state.tools[name], ...values }; write(); },

  get lumber() { return state.lumber; },
  addLumber(item) { state.lumber.push({ id: Math.random().toString(36).slice(2, 10), ...item }); write(); },
  removeLumber(id) { state.lumber = state.lumber.filter(x => x.id !== id); write(); },
  clearLumber() { state.lumber = []; write(); },

  clearAll() {
    state = { v: 1, settings: { ...DEFAULTS }, tape: newTape(), tapes: [], tools: {}, lumber: [] };
    write();
  },
};

export { Q };
