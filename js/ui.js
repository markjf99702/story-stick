// Pieces every screen uses: formatting with the current settings, form fields, the sheet, toasts, copying.
import { store } from './store.js';
import * as F from './format.js';
import { tryLength, tryNumber } from './measure.js';

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Lengths and numbers shown the way the settings say.
export const fmt = {
  get den() { return store.settings.den; },
  get show() { return store.settings.show; },
  get bare() { return store.settings.show === 'mm' ? 'mm' : 'in'; },
  len: (x, show) => F.lenText(x, { den: fmt.den, show: show || fmt.show }),
  html: (x, show) => F.lenHTML(x, { den: fmt.den, show: show || fmt.show }),
  // The same length in the other ways: tape reading, inches, decimal, millimetres.
  alt(x) {
    const out = [];
    if (fmt.show !== 'ftin') out.push(F.lenText(x, { den: fmt.den, show: 'ftin' }));
    if (fmt.show !== 'in') out.push(F.lenText(x, { den: fmt.den, show: 'in' }));
    const d = F.decInText(x);
    if (d !== F.lenText(x, { den: fmt.den, show: 'in' })) out.push(d);
    if (fmt.show !== 'mm') out.push(F.mmText(x));
    return out;
  },
  hair: x => (fmt.show === 'mm' ? '' : F.hairText(x, fmt.den)),
  money: x => F.money(x, store.settings.money || '$'),
  // Whole feet without the 0″: 10′.
  even: x => fmt.len(x).replace(/′ 0″$/, '′'),
  // A reading inside a sentence.
  rd: (x, show) => `<span class="rd">${esc(F.lenText(x, { den: fmt.den, show: show || fmt.show }))}</span>`,
};

export const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

// A box for a length. Anything the calculator reads works here, sums included; the line under it says how it reads.
export function lenField(id, label, value = '', { placeholder = '', hint = '', bare = '' } = {}) {
  return `<label class="field" for="${id}">
      <span class="label">${label}</span>
      <input id="${id}" class="len" type="text" value="${esc(value)}" placeholder="${esc(placeholder)}"
        autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="next"${touch ? ' inputmode="none"' : ''}${bare ? ` data-bare="${bare}"` : ''}${hint ? ` data-hint="${esc(hint)}"` : ''}>
      <span class="reads" id="${id}-reads" aria-live="polite">${hint ? esc(hint) : ''}</span>
    </label>`;
}
export function numField(id, label, value = '', { placeholder = '', hint = '', step = '' } = {}) {
  return `<label class="field" for="${id}">
      <span class="label">${label}</span>
      <input id="${id}" class="num" type="text" inputmode="decimal" value="${esc(value)}" placeholder="${esc(placeholder)}"
        autocomplete="off" spellcheck="false"${step ? ` data-step="${step}"` : ''}${hint ? ` data-hint="${esc(hint)}"` : ''}>
      <span class="reads" id="${id}-reads">${hint ? esc(hint) : ''}</span>
    </label>`;
}

// Reads a field and writes the line under it: "= 6′ 0″", or what's wrong.
export function readLen(id, { quiet = false } = {}) {
  const input = document.getElementById(id);
  const reads = document.getElementById(id + '-reads');
  const bare = input.dataset.bare || fmt.bare;
  const r = tryLength(input.value, { bare });
  if (reads) {
    reads.classList.toggle('bad', !!r.error);
    if (r.error) reads.textContent = r.error;
    else if (r.q && !quiet) reads.innerHTML = `= ${fmt.html(r.q)}`;
    else reads.textContent = input.dataset.hint || '';
  }
  return r.q;
}
export function readNum(id) {
  const input = document.getElementById(id);
  const reads = document.getElementById(id + '-reads');
  const r = tryNumber(input.value);
  if (reads) {
    reads.classList.toggle('bad', !!r.error);
    reads.textContent = r.error || input.dataset.hint || '';
  }
  return r.q;
}

// A row of choices that behaves like radio buttons.
export function seg(name, options, value, label = '') {
  return `<div class="seg" role="radiogroup"${label ? ` aria-label="${esc(label)}"` : ''} data-seg="${name}">${options.map(([v, text]) =>
    `<button type="button" role="radio" data-v="${esc(v)}" aria-checked="${String(v) === String(value)}">${text}</button>`).join('')}</div>`;
}
export function onSeg(root, name, fn) {
  const el = root.querySelector(`[data-seg="${name}"]`);
  el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    el.querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', String(x === b)));
    fn(b.dataset.v);
  });
}

// A number with − and + either side.
export function stepper(id, value, label) {
  return `<div class="stepper" data-stepper="${id}">
      <button type="button" data-d="-1" aria-label="One fewer">−</button>
      <output id="${id}" aria-label="${esc(label)}">${value}</output>
      <button type="button" data-d="1" aria-label="One more">+</button>
    </div>`;
}

// The line of checks under a result.
export const check = (ok, text, note = '') =>
  `<li class="check ${ok ? 'ok' : 'no'}"><span class="mark" aria-hidden="true">${ok ? ICON.ok : ICON.no}</span><span>${text}${note ? ` <small>${note}</small>` : ''}</span></li>`;

// A tape-style list of marks: number, then the reading.
export function marksList(items, { start = 1 } = {}) {
  return `<ol class="marks">${items.map((m, i) => `<li><span class="n">${i + start}</span><span class="r">${m}</span></li>`).join('')}</ol>`;
}

let toastTimer;
export function toast(text) {
  const t = document.getElementById('toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2400);
}

// The sheet that slides up for settings, tapes and help.
export function openSheet(html, onClose) {
  const sheet = document.getElementById('sheet');
  // A fresh body each time, so listeners from the last sheet don't pile up.
  const body = document.createElement('div');
  body.className = 'sheet-body';
  sheet.querySelector('.sheet-body').replaceWith(body);
  body.innerHTML = html;
  const title = body.querySelector('h2');
  if (title) { title.id = 'sheetTitle'; sheet.setAttribute('aria-labelledby', 'sheetTitle'); }
  sheet.onclose = () => { body.innerHTML = ''; onClose?.(); };
  if (!sheet.open) sheet.showModal();
  return body;
}
export function closeSheet() {
  const sheet = document.getElementById('sheet');
  if (sheet.open) sheet.close();
}

// Copies text, or selects it on the page when the browser won't allow copying.
export async function copyText(text, fallbackEl) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied');
    return true;
  } catch {
    if (fallbackEl) {
      fallbackEl.hidden = false;
      fallbackEl.value = text;
      fallbackEl.focus();
      fallbackEl.select();
      toast('Selected: copy it from here');
    }
    return false;
  }
}

export const ICON = {
  ok: '<svg viewBox="0 0 20 20" width="18" height="18"><path d="M4.5 10.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  no: '<svg viewBox="0 0 20 20" width="18" height="18"><path d="M5.5 5.5l9 9M14.5 5.5l-9 9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  back: '<svg viewBox="0 0 28 20" width="28" height="20" aria-hidden="true"><path d="M9 2h15a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9l-7-8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12.5 6.5l7 7M19.5 6.5l-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  gear: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M10.3 2.5h3.4l.5 2.6a7.6 7.6 0 0 1 1.9 1.1l2.5-.9 1.7 3-2 1.7a7.7 7.7 0 0 1 0 2.2l2 1.7-1.7 3-2.5-.9a7.6 7.6 0 0 1-1.9 1.1l-.5 2.6h-3.4l-.5-2.6a7.6 7.6 0 0 1-1.9-1.1l-2.5.9-1.7-3 2-1.7a7.7 7.7 0 0 1 0-2.2l-2-1.7 1.7-3 2.5.9a7.6 7.6 0 0 1 1.9-1.1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  help: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="9.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9.4 9.3a2.7 2.7 0 1 1 3.9 2.4c-.8.4-1.3 1-1.3 1.9v.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="17.2" r="1.15" fill="currentColor"/></svg>',
  x: '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
};
