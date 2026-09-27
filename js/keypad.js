// The shop keypad: big keys, a fraction row drawn like a tape blade, and marks for feet, inches and mm.
// The calculator has it on screen all the time; on a touch screen it also slides up for any length box in the tools.
import { applyKey } from './keys.js';
import { $, ICON, touch } from './ui.js';

// [key, label, aria-label, class, span]
const ROWS = [
  [['/2', '<sup>1</sup>⁄<sub>2</sub>', 'halves', 'frac t2'], ['/4', '<sup>1</sup>⁄<sub>4</sub>', 'quarters', 'frac t4'], ['/8', '<sup>1</sup>⁄<sub>8</sub>', 'eighths', 'frac t8'], ['/16', '<sup>1</sup>⁄<sub>16</sub>', 'sixteenths', 'frac t16'], ['slash', '<b>/</b>', 'fraction bar', 'frac t0']],
  [['clear', 'C', 'Clear', 'fn'], ['back', ICON.back, 'Delete', 'fn'], ['open', '(', 'Open bracket', 'fn'], ['close', ')', 'Close bracket', 'fn'], ['divide', '÷', 'Divide', 'op']],
  [['7'], ['8'], ['9'], ['ft', '′<small>ft</small>', 'feet', 'unit'], ['times', '×', 'Times', 'op']],
  [['4'], ['5'], ['6'], ['in', '″<small>in</small>', 'inches', 'unit'], ['minus', '−', 'Minus', 'op']],
  [['1'], ['2'], ['3'], ['mm', 'mm', 'millimetres', 'unit'], ['plus', '+', 'Plus', 'op']],
  [['0'], ['.', '.', 'point'], ['space', 'space', 'Space', 'fn wide'], ['equals', '=', 'Equals', 'eq']],
];

export function keypadHTML({ equals = '=', equalsLabel = 'Equals' } = {}) {
  return ROWS.map(row => row.map(([k, label = k, aria = '', cls = 'd']) => {
    const isEq = k === 'equals';
    return `<button type="button" class="k ${cls}" data-k="${k}"${aria || isEq ? ` aria-label="${isEq ? equalsLabel : aria}"` : ''}>${isEq ? equals : label}</button>`;
  }).join('')).join('');
}

// Makes a keypad type into an input. before(key) can take over a key (return true) or supply the last answer.
export function bindKeypad(keys, { target, onEquals, before, last } = {}) {
  // Keep the focus (and the caret) in the box while keys are pressed.
  keys.addEventListener('pointerdown', e => { if (e.target.closest('.k')) e.preventDefault(); });
  keys.addEventListener('click', e => {
    const b = e.target.closest('.k');
    if (!b) return;
    const key = b.dataset.k;
    b.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit');
    if (before && before(key)) return;
    if (key === 'equals') { onEquals?.(); return; }
    const input = target();
    if (!input) return;
    const focused = document.activeElement === input;
    const s = focused ? input.selectionStart ?? input.value.length : input.value.length;
    const t = focused ? input.selectionEnd ?? s : s;
    const r = applyKey(input.value, s, t, key, last?.() || '');
    input.value = r.text;
    if (focused) input.setSelectionRange(r.caret, r.caret);
    input.scrollLeft = input.scrollWidth;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

// On a touch screen, the keypad slides up under a length box instead of the phone's own keyboard.
let dockInput = null;
export function initDock() {
  if (!touch) return;
  const dock = document.createElement('div');
  dock.className = 'dock';
  dock.id = 'dock';
  dock.hidden = true;
  dock.innerHTML = `
    <div class="dock-head">
      <span class="dock-label" id="dockLabel"></span>
      <button type="button" class="dock-btn" id="dockKb">Keyboard</button>
      <button type="button" class="dock-btn done" id="dockDone">Done</button>
    </div>
    <div class="keys">${keypadHTML({ equals: 'Next', equalsLabel: 'Next box' })}</div>`;
  document.body.append(dock);
  dock.addEventListener('pointerdown', e => { if (e.target.closest('button')) e.preventDefault(); });
  bindKeypad(dock.querySelector('.keys'), {
    target: () => dockInput,
    onEquals: () => {
      const boxes = [...document.querySelectorAll('#app input:not([type=checkbox]):not([disabled])')].filter(x => x.offsetParent);
      const next = boxes[boxes.indexOf(dockInput) + 1];
      if (next) next.focus(); else dockInput?.blur();
    },
  });
  $('#dockDone', dock).addEventListener('click', () => dockInput?.blur());
  $('#dockKb', dock).addEventListener('click', () => {
    // Switch this box to the phone's own keyboard.
    const input = dockInput;
    input.inputMode = 'text';
    input.dataset.kb = '1';
    hide();
    input.blur();
    setTimeout(() => input.focus(), 50);
  });

  document.addEventListener('focusin', e => {
    const input = e.target;
    if (!(input instanceof HTMLInputElement) || !input.classList.contains('len') || input.dataset.kb) return;
    dockInput = input;
    const label = input.closest('.field')?.querySelector('.label')?.textContent || '';
    $('#dockLabel', dock).textContent = label;
    dock.hidden = false;
    document.body.classList.add('docked');
    requestAnimationFrame(() => {
      const r = input.getBoundingClientRect(), top = dock.getBoundingClientRect().top;
      if (r.bottom > top - 12 || r.top < 60) window.scrollBy({ top: r.top - Math.max(80, (top - r.height) / 2.4), behavior: 'smooth' });
    });
  });
  document.addEventListener('focusout', e => {
    if (e.target !== dockInput) return;
    setTimeout(() => { if (document.activeElement !== dockInput) hide(); }, 0);
  });
  function hide() {
    dock.hidden = true;
    document.body.classList.remove('docked');
    dockInput = null;
  }
}
