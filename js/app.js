// The page: which screen goes with which address, the header and its menus, settings, and going offline.
import { store } from './store.js';
import { renderCalc } from './calc.js';
import { initDock } from './keypad.js';
import { $, $$, esc, seg, onSeg, openSheet, closeSheet, toast, ICON } from './ui.js';
import * as F from './format.js';
import { Q } from './rational.js';
import spacing from './screens/spacing.js';
import divide from './screens/divide.js';
import stairs from './screens/stairs.js';
import miters from './screens/miters.js';
import boardFeet from './screens/boardfeet.js';
import triangle from './screens/triangle.js';
import convert from './screens/convert.js';

// Small line drawings for the menu, one per screen.
const PICS = {
  calc: '<rect x="3" y="5" width="13" height="13" rx="3"/><circle cx="9.5" cy="11.5" r="2.6"/><path d="M16 14.5h5v3.5h-5M18 14.5v1.6M20 14.5v1.6"/>',
  spacing: '<path d="M3 4v17M21 4v17M3 7h18M3 18h18M7.5 7v11M12 7v11M16.5 7v11"/>',
  divide: '<rect x="2" y="9" width="20" height="6" rx="1"/><path d="M8.7 7v10M15.3 7v10"/>',
  stairs: '<path d="M2 20h4.5v-4h4v-4h4v-4h4V4H22"/><path d="M2 20l16-14" stroke-dasharray="2 2.4"/>',
  miters: '<path d="M4 20V6l3 3v8h8l3 3z"/><path d="M4 20l3-3"/>',
  'board-feet': '<rect x="3" y="15" width="18" height="4" rx="1"/><rect x="5" y="10" width="15" height="4" rx="1"/><rect x="4" y="5" width="13" height="4" rx="1"/>',
  triangle: '<path d="M3 20h17V5z"/><path d="M16.5 20v-3.5H20"/>',
  convert: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
};

const CALC = { id: '', key: 'calc', name: 'Calculator', nav: 'Calculator', line: 'Add, take away, times and divide feet, inches and fractions.', render: renderCalc };
export const SCREENS = [CALC, spacing, divide, stairs, miters, boardFeet, triangle, convert];
const keyOf = s => s.key || s.id;
const pic = s => `<svg class="pic" viewBox="0 0 24 24" aria-hidden="true">${PICS[keyOf(s)]}</svg>`;

const main = document.getElementById('app');

function route() {
  const id = location.hash.replace(/^#\/?/, '').split('/')[0];
  const screen = SCREENS.find(s => s.id === id) || CALC;
  document.body.dataset.screen = keyOf(screen);
  document.title = screen === CALC ? 'Story Stick' : `${screen.name} · Story Stick`;
  $$('.nav a').forEach(a => a.setAttribute('aria-current', a.dataset.id === screen.id ? 'page' : 'false'));
  $('#toolsBtn .now').textContent = screen.nav;
  closeSheet();
  document.activeElement?.blur?.();
  screen.render(main);
  window.scrollTo(0, 0);
}

function drawNav() {
  $('#nav').innerHTML = SCREENS.map(s => `<a href="#/${s.id}" data-id="${s.id}">${esc(s.nav)}</a>`).join('');
}

function toolsSheet() {
  const body = openSheet(`
    <div class="sheet-top"><h2>Tools</h2><button type="button" class="close" aria-label="Close">${ICON.x}</button></div>
    <ul class="menu">${SCREENS.map(s => `
      <li><a href="#/${s.id}" class="${location.hash.replace(/^#\/?/, '') === s.id ? 'here' : ''}">${pic(s)}<span><b>${esc(s.name)}</b><small>${esc(s.line)}</small></span></a></li>`).join('')}
    </ul>`);
  body.addEventListener('click', e => {
    if (e.target.closest('.close')) closeSheet();
    const a = e.target.closest('a');
    if (a && a.getAttribute('href') === location.hash) closeSheet();
  });
}

function settingsSheet() {
  const s = store.settings;
  const sample = Q(875, 16);
  const body = openSheet(`
    <div class="sheet-top"><h2>Settings</h2><button type="button" class="close" aria-label="Close">${ICON.x}</button></div>
    <div class="field"><span class="label">Round fractions to the nearest</span>
      ${seg('den', [[8, '1/8″'], [16, '1/16″'], [32, '1/32″'], [64, '1/64″']], s.den, 'Round to')}</div>
    <div class="field"><span class="label">Show lengths as</span>
      ${seg('show', [['ftin', esc(F.lenText(sample, { den: s.den }))], ['in', esc(F.lenText(sample, { den: s.den, show: 'in' }))], ['mm', F.mmText(sample, 0)]], s.show, 'Show lengths as')}
      <span class="reads">In millimetres, a plain number added to a length counts as millimetres.</span></div>
    <label class="field" for="moneySign"><span class="label">Money sign, for board feet</span>
      <input id="moneySign" type="text" value="${esc(s.money)}" maxlength="3" autocomplete="off" style="max-width:6em"></label>
    <div class="about">
      <p>Tapes, the lumber list and what you last typed in each tool are kept in this browser, on this device. Nothing is sent anywhere. It works offline, and you can add it to your home screen.</p>
      <button type="button" class="btn quiet" id="forget">Clear everything</button>
      <footer class="jd-foot">
        <a href="https://junkdrawer.works/">Part of junkdrawer.works</a>
        <span aria-hidden="true">·</span>
        <a href="https://junkdrawer.works/privacy.html">Privacy</a>
      </footer>
    </div>`);
  onSeg(body, 'den', v => { store.setting('den', Number(v)); rerender(body); });
  onSeg(body, 'show', v => { store.setting('show', v); rerender(body); });
  $('#moneySign', body).addEventListener('input', e => store.setting('money', e.target.value.trim() || '$'));
  body.addEventListener('click', e => {
    if (e.target.closest('.close')) closeSheet();
    if (e.target.closest('#forget') && confirm('Clear every tape, the lumber list and the settings?')) {
      store.clearAll(); closeSheet(); route(); toast('Cleared');
    }
  });
}
// Settings change how everything reads, so draw the screen again underneath.
function rerender(body) {
  const show = $('[data-seg=show]', body);
  const sample = Q(875, 16), den = store.settings.den;
  const labels = [F.lenText(sample, { den }), F.lenText(sample, { den, show: 'in' }), F.mmText(sample, 0)];
  $$('button', show).forEach((b, i) => { b.textContent = labels[i]; });
  const y = scrollY;
  const screen = SCREENS.find(s => keyOf(s) === document.body.dataset.screen) || CALC;
  screen.render(main);
  window.scrollTo(0, y);
}

// The strip of tape blade under the header, drawn once with real sixteenth marks.
function drawBlade() {
  const px = 44, inches = 40, ticks = [];
  for (let i = 0; i <= inches * 16; i++) {
    const x = (i * px) / 16;
    const h = i % 16 === 0 ? 12 : i % 8 === 0 ? 8.5 : i % 4 === 0 ? 6.5 : i % 2 === 0 ? 5 : 3.5;
    ticks.push(`M${x.toFixed(2)} 0v${h}`);
  }
  const nums = [];
  for (let i = 1; i < inches; i++) {
    const foot = i % 12 === 0;
    nums.push(`<text x="${i * px - 2}" y="21.5" text-anchor="end" class="${foot ? 'ft' : ''}">${foot ? `${i / 12}F` : i % 12}</text>`);
  }
  $('#blade').innerHTML = `<svg viewBox="0 0 ${inches * px} 24" width="${inches * px}" height="24" aria-hidden="true"><path d="${ticks.join('')}"/>${nums.join('')}</svg>`;
}

drawNav();
drawBlade();
initDock();
$('#toolsBtn').addEventListener('click', toolsSheet);
$('#settingsBtn').addEventListener('click', settingsSheet);
$('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); }); // a tap outside closes it
window.addEventListener('hashchange', route);
route();

// For the tests and the screenshots.
window.storyStick = { store, route };

if ('serviceWorker' in navigator && !('single' in document.documentElement.dataset) && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
