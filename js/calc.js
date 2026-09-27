// The calculator: an LCD, the shop keypad, and a paper tape like an adding machine's.
// Tap a line on the tape to use its answer again. Old tapes are kept in the list under Tapes.
import { evaluate, preview, UNITS } from './measure.js';
import { Q, mul, sub, floor, isInt, sign, toNumber } from './rational.js';
import * as F from './format.js';
import { store, unpack } from './store.js';
import { $, esc, fmt, touch, toast, openSheet, closeSheet, copyText, ICON } from './ui.js';
import { keypadHTML, bindKeypad } from './keypad.js';

const EXAMPLES = [
  [`3′ 7-5/16″ + 11 3/8″`, 'add two readings'],
  [`8′ ÷ 3`, 'a third of a board'],
  [`8′ ÷ 11-3/4″`, 'how many fit'],
  [`2″ × 6″ × 8′`, 'board feet'],
  ['1100mm', 'metric in'],
];

let done = null; // the answer on show after =, until the next key
let input, els;

export function renderCalc(main) {
  main.innerHTML = `
    <section class="calc">
      <div class="roll-wrap">
        <div class="roll-head">
          <button type="button" class="roll-name" id="tapesBtn" aria-haspopup="dialog">
            <span id="tapeName"></span><span class="count" id="tapeCount"></span>
          </button>
          <button type="button" class="chip" id="helpBtn" aria-label="How to type">${ICON.help}<span>How to type</span></button>
          <button type="button" class="chip" id="newTape">New tape</button>
        </div>
        <div class="roll" id="roll"><ol id="lines" aria-label="Paper tape"></ol></div>
      </div>
      <div class="case">
        <div class="lcd" id="lcd">
          <input id="expr" class="expr" type="text" aria-label="Sum" placeholder="3′ 7 5/16″ + 11 3/8″"
            autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done"${touch ? ' inputmode="none"' : ''}>
          <div class="read" id="read" aria-live="polite"></div>
          <div class="hair" id="hair"></div>
          <div class="also" id="also"></div>
        </div>
        <div class="keys" id="keys">${keypadHTML()}</div>
      </div>
    </section>`;
  input = $('#expr', main);
  els = { read: $('#read', main), hair: $('#hair', main), also: $('#also', main), lines: $('#lines', main), roll: $('#roll', main), lcd: $('#lcd', main) };

  bindKeypad($('#keys', main), {
    target: () => input,
    onEquals: equals,
    before(key) {
      if (key === 'clear' && !input.value) { done = null; show(null); return true; }
      if (key === 'back' && done) { done = null; input.classList.remove('done'); return false; }
      if (done && key !== 'equals' && key !== 'clear') {
        // After =, a sign carries on from the answer; anything else starts a new sum.
        const carry = ['plus', 'minus', 'times', 'divide'].includes(key);
        input.value = carry ? F.exactText(done) : '';
        done = null;
        input.classList.remove('done');
      }
      return false;
    },
  });

  input.addEventListener('input', () => { if (!input.value) done = null; live(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); equals(); }
    else if (e.key === 'Escape') { e.preventDefault(); input.value = ''; done = null; input.classList.remove('done'); show(null); }
    else if (e.key === 'ArrowUp' && !input.value) {
      const lines = store.tape.lines;
      if (lines.length) { e.preventDefault(); input.value = lines[lines.length - 1].e; done = null; live(); }
    }
  });
  // Typing after = : a sign carries on from the answer, anything else starts again.
  input.addEventListener('beforeinput', e => {
    if (!done) return;
    if (e.inputType === 'deleteContentBackward') { done = null; input.classList.remove('done'); return; }
    if (!e.inputType.startsWith('insert')) return;
    e.preventDefault();
    const data = e.data ?? e.dataTransfer?.getData('text/plain') ?? '';
    const op = /^[+\-−*x×/÷]$/.test(data) ? data.replace('*', '×').replace('x', '×').replace('-', '−').replace('/', '÷') : null;
    input.value = op ? `${F.exactText(done)} ${op} ` : data;
    done = null;
    input.classList.remove('done');
    input.setSelectionRange(input.value.length, input.value.length);
    live();
  });
  els.lcd.addEventListener('click', e => { if (!touch && e.target !== input) input.focus(); });

  $('#newTape', main).addEventListener('click', () => {
    if (!store.tape.lines.length) { toast('This tape is already empty'); return; }
    store.newTape();
    done = null; input.value = ''; show(null); drawTape();
    toast('New tape. The old one is under Tapes.');
  });
  $('#tapesBtn', main).addEventListener('click', tapesSheet);
  $('#helpBtn', main).addEventListener('click', helpSheet);
  els.lines.addEventListener('click', e => {
    const ex = e.target.closest('[data-example]');
    if (ex) { input.value = ex.dataset.example; done = null; input.classList.remove('done'); live(); if (!touch) input.focus(); return; }
    const b = e.target.closest('[data-line]');
    if (b) useLine(Number(b.dataset.line));
  });

  drawTape();
  if (done) { input.value = store.tape.lines.at(-1)?.e || ''; input.classList.add('done'); show(done); }
  else live();
  if (!touch) input.focus();
}

function equals() {
  const text = input.value.trim();
  if (!text) return;
  if (done) return;
  let v;
  try { v = evaluate(text, { bare: fmt.bare }); } catch (e) {
    showError(e.message);
    return;
  }
  store.addLine(text, v);
  done = v;
  input.classList.add('done');
  show(v);
  drawTape();
}

function live() {
  input.classList.remove('done');
  const text = input.value;
  if (!text.trim()) { show(null); return; }
  const v = preview(text, { bare: fmt.bare });
  if (v) show(v, true);
  else { els.read.classList.add('live'); els.read.classList.remove('err'); }
}

function showError(message) {
  els.read.className = 'read err';
  els.read.textContent = message;
  els.hair.textContent = '';
  els.also.innerHTML = '';
}

// The answer, in the LCD: the reading, what rounding left out, and the same answer in other units.
function show(v, isLive = false) {
  els.read.className = 'read' + (isLive ? ' live' : '') + (v ? '' : ' idle');
  if (!v) {
    els.read.innerHTML = fmt.html(Q(0));
    els.hair.textContent = '';
    els.also.innerHTML = '';
    return;
  }
  const r = readout(v);
  els.read.innerHTML = r.main;
  els.read.classList.toggle('long', r.long);
  els.hair.textContent = r.hair || '';
  els.also.innerHTML = r.also.map(a => `<span>${a}</span>`).join('');
}

export function readout(v) {
  const { q, dim } = v;
  if (dim === 1) {
    const main = fmt.html(q);
    return { main, hair: fmt.hair(q), also: fmt.alt(q).map(esc), long: fmt.len(q).length > 13 };
  }
  if (dim === 0) {
    const main = esc(F.numText(q));
    const also = [];
    if (v.count && sign(q) > 0) {
      const whole = floor(q), left = sub(v.count.of, mul(Q(whole), v.count.each));
      also.push(`${whole} whole, ${esc(fmt.len(left))} left over`);
    } else {
      if (!isInt(q)) also.push(esc(F.dec(q, 6)));
      also.push(`as a length: ${esc(fmt.len(mul(q, UNITS[fmt.bare])))}`);
    }
    return { main, also, long: main.length > 13 };
  }
  const x = toNumber(q);
  if (dim === 2) {
    const also = [`${F.dec(x, 2)} sq in`, `${F.dec(x / 144, 3)} sq ft`, `${F.dec(x * 0.00064516, 4)} m²`].filter(a => a !== F.areaText(q));
    return { main: esc(F.areaText(q)), also, long: true };
  }
  const also = [F.boardFeetText(q), `${F.dec(x, 1)} cu in`, `${F.dec(x / 46656, 3)} cu yd`, `${F.dec(x * 1.6387064e-5, 5)} m³`].filter(a => a !== F.volumeText(q));
  return { main: esc(F.volumeText(q)), also, long: true };
}

// A short answer for the tape, with a small + or − when rounding left a hair.
export function tapeText(v) {
  if (v.dim === 1) {
    const h = fmt.show === 'mm' ? null : F.hair(v.q, fmt.den);
    return esc(fmt.len(v.q)) + (h ? `<sup class="h" title="${h.more ? '+' : '−'} ${h.text}">${h.more ? '+' : '−'}</sup>` : '');
  }
  if (v.dim === 0) {
    if (v.count && sign(v.q) > 0) {
      const whole = floor(v.q), left = sub(v.count.of, mul(Q(whole), v.count.each));
      return `${esc(F.numText(v.q))} <span class="eq">·</span> ${whole} + ${esc(fmt.len(left))}`;
    }
    return esc(F.numText(v.q));
  }
  return esc(v.dim === 2 ? F.areaText(v.q) : `${F.volumeText(v.q)} · ${F.boardFeetText(v.q)}`);
}

const pretty = e => esc(e).replace(/'/g, '′').replace(/"/g, '″').replace(/\*/g, '×');
const when = t => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const clock = t => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
export const tapeTitle = (t, withTime = false) => t.name || `Tape from ${when(t.at)}${withTime ? `, ${clock(t.at)}` : ''}`;

function drawTape() {
  const t = store.tape;
  $('#tapeName').textContent = tapeTitle(t);
  $('#tapeCount').textContent = t.lines.length ? ` · ${t.lines.length} ${t.lines.length === 1 ? 'sum' : 'sums'}` : '';
  if (!t.lines.length) {
    els.lines.innerHTML = `<li class="empty">
        <p>Each sum prints here when you press =. Tap one to use its answer again.</p>
        <p class="try">Try one:</p>
        ${EXAMPLES.map(([x, why]) => `<button type="button" class="ex" data-example="${esc(x)}"><span>${esc(x)}</span><small>${esc(why)}</small></button>`).join('')}
      </li>`;
  } else {
    els.lines.innerHTML = t.lines.map((l, i) => {
      const v = unpack(l.v);
      return `<li><button type="button" class="line" data-line="${i}" aria-label="Use ${esc(fmt.len(v.q))}">
          <span class="e">${pretty(l.e)}</span><span class="r"><span class="eq">=</span> ${tapeText(v)}</span></button></li>`;
    }).join('');
  }
  els.roll.scrollTop = els.roll.scrollHeight;
}

// Puts a past answer into the sum: on its own, after a sign, or added on with a +.
function useLine(i) {
  const l = store.tape.lines[i];
  if (!l) return;
  const v = unpack(l.v);
  let text = F.exactText(v);
  const cur = done ? '' : input.value.replace(/\s+$/, '');
  if (!cur) input.value = text;
  else {
    if (text.startsWith('−')) text = `(${text})`;
    input.value = /[+−\-×÷(]$/.test(cur) ? `${cur}${/\($/.test(cur) ? '' : ' '}${text}` : `${cur} + ${text}`;
  }
  done = null;
  input.classList.remove('done');
  live();
  toast(`Using ${v.dim === 1 ? fmt.len(v.q) : F.numText(v.q)}`);
  if (!touch) input.focus();
}

function tapesSheet() {
  const all = [store.tape, ...store.tapes];
  const row = (t, i) => {
    const last = t.lines.at(-1);
    return `<li class="tape-row${i === 0 ? ' current' : ''}" data-id="${t.id}">
        <input class="tape-title" value="${esc(t.name)}" placeholder="${esc(tapeTitle({ ...t, name: '' }, true))}" aria-label="Name this tape" maxlength="60">
        <p class="meta">${i === 0 ? 'On the calculator now · ' : ''}${t.lines.length} ${t.lines.length === 1 ? 'sum' : 'sums'}${last ? ` · last: <span class="rd">${tapeText(unpack(last.v))}</span>` : ''}</p>
        <div class="row-btns">
          ${i ? '<button type="button" class="btn small" data-act="open">Open</button>' : ''}
          <button type="button" class="btn small" data-act="copy">Copy</button>
          <button type="button" class="btn small quiet" data-act="delete">${i ? 'Delete' : 'Clear'}</button>
        </div>
      </li>`;
  };
  const body = openSheet(`
    <div class="sheet-top"><h2>Tapes</h2><button type="button" class="close" value="close" aria-label="Close">${ICON.x}</button></div>
    <p class="hint">The last ${20} tapes are kept in this browser. Name one to find it again.</p>
    <ol class="tape-list">${all.map(row).join('')}</ol>
    <textarea class="copy-fallback" hidden readonly aria-label="Tape as text"></textarea>`);
  body.addEventListener('change', e => {
    const box = e.target.closest('.tape-title');
    if (box) { store.nameTape(box.closest('[data-id]').dataset.id, box.value.trim()); drawTape(); }
  });
  body.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.classList.contains('close')) return closeSheet();
    const id = b.closest('[data-id]')?.dataset.id;
    const t = all.find(x => x.id === id);
    if (b.dataset.act === 'open') { store.openTape(id); done = null; input.value = ''; show(null); drawTape(); closeSheet(); }
    if (b.dataset.act === 'copy') copyText(tapeAsText(t), $('.copy-fallback', body));
    if (b.dataset.act === 'delete') {
      if (!confirm(`${id === store.tape.id ? 'Clear' : 'Delete'} “${tapeTitle(t, true)}”?`)) return;
      store.deleteTape(id); done = null; input.value = ''; show(null); drawTape(); closeSheet();
    }
  });
}

export function tapeAsText(t) {
  const lines = t.lines.map(l => {
    const v = unpack(l.v);
    const r = v.dim === 1 ? fmt.len(v.q) : v.dim === 0 ? F.numText(v.q) : v.dim === 2 ? F.areaText(v.q) : F.volumeText(v.q);
    return `${l.e.replace(/'/g, '′').replace(/"/g, '″')}\n  = ${r}`;
  });
  return `${tapeTitle(t)}\n\n${lines.join('\n')}\n`;
}

const KF = n => `<span class="kf"><sup>1</sup>⁄<sub>${n}</sub></span>`;

function helpSheet() {
  const rows = [
    ['3′ 7-5/16″', 'feet, inches and a fraction'],
    ['3\'7 5/16', 'the marks can be left off after feet'],
    ['3 ft 7 in', 'or written as words'],
    ['43.3125', 'decimal inches'],
    ['1100mm', 'millimetres, centimetres (cm) or metres (m)'],
    ['7″ ÷ 2', 'a length times or divided by a number'],
    ['8′ ÷ 11-3/4″', 'a length divided by a length: how many fit'],
    ['4′ × 8′', 'an area; three lengths make a volume and board feet'],
  ];
  const body = openSheet(`
    <div class="sheet-top"><h2>How to type</h2><button type="button" class="close" aria-label="Close">${ICON.x}</button></div>
    <p>Type a length the way you'd write it down. On the keypad, a number and then ${KF(16)} counts sixteenths: <b>5</b> ${KF(16)} is 5/16. Press <b>space</b> between whole inches and the fraction: <b>7</b> space <b>5</b> ${KF(16)} is 7 5/16. A fraction key on its own is one of them: ${KF(2)} is 1/2.</p>
    <ul class="help-list">${rows.map(([x, why]) => `<li><button type="button" class="ex" data-try="${esc(x)}"><span>${esc(x)}</span><small>${esc(why)}</small></button></li>`).join('')}</ul>
    <p class="hint">A plain number added to a length counts as inches (or millimetres, if Settings shows millimetres). × and ÷ go before + and −; use brackets to change that.</p>
    <p class="hint">Answers are exact, however many steps they take. They're rounded to the nearest ${fmt.den === 16 ? '1/16' : '1/' + fmt.den} only for showing, and <b>+ a hair</b> or <b>− a hair</b> says how much the rounding left out. Change the rounding in Settings.</p>`);
  body.addEventListener('click', e => {
    if (e.target.closest('.close')) return closeSheet();
    const b = e.target.closest('[data-try]');
    if (b) { input.value = b.dataset.try; done = null; closeSheet(); live(); if (!touch) input.focus(); }
  });
}
