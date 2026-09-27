// Board feet: work out board feet and cost, and keep a list for the lumber yard.
import { boardFeet } from '../tools.js';
import { Q, add, mul, toNumber, fromText, toText } from '../rational.js';
import { parseLength, tryNumber } from '../measure.js';
import { store } from '../store.js';
import { $, esc, fmt, lenField, numField, readLen, readNum, toast, copyText, ICON } from '../ui.js';
import * as F from '../format.js';

const QUARTERS = ['4/4', '5/4', '6/4', '8/4', '10/4', '12/4', '16/4'];
const bf = q => F.dec(q, 2);
// A price may come with its money sign: $8.50 or 8.50.
const priceOf = text => tryNumber(String(text).replace(/[^\d.,]/g, '')).q;

// A line on the list is kept as the text typed, so it reads the same way back.
function lineOf(item) {
  try {
    // The exact sizes are kept alongside the text typed, so a line reads the same whatever the settings are now.
    const t = item.t ? fromText(item.t) : parseLength(item.thick);
    const w = item.w ? fromText(item.w) : parseLength(item.width);
    const l = item.l ? fromText(item.l) : parseLength(item.length, { bare: 'ft' });
    const n = Number(item.count) || 1;
    const feet = boardFeet({ thick: t, width: w, length: l, count: n });
    const price = item.price ? fromText(item.price) : null;
    return { ...item, n, feet, cost: price ? mul(feet, price) : null };
  } catch { return null; }
}

export default {
  id: 'board-feet',
  name: 'Board feet',
  nav: 'Board feet',
  line: 'Board feet and cost, and a list to take to the lumber yard.',
  render(main) {
    const s = { thick: '4/4', width: '6″', length: '8′', count: '1', price: '', what: '', ...store.tool('board-feet') };
    main.innerHTML = `
      <div class="tool">
        <header class="tool-head">
          <h1>Board feet</h1>
          <p class="lede">Board feet and cost for rough or dimensional lumber, and a running list to take to the lumber yard.</p>
        </header>
        <div class="tool-grid">
          <section class="card form">
            <div class="presets" role="group" aria-label="Thickness in quarters">
              <span>Thickness</span>
              ${QUARTERS.map(q => `<button type="button" class="chip" data-q="${q}">${q}</button>`).join('')}
            </div>
            ${lenField('bf-thick', 'Thickness', s.thick, { placeholder: '4/4', hint: 'In quarters (8/4 is 2″), or any size' })}
            <div class="pair">
              ${lenField('bf-width', 'Width', s.width, { placeholder: '6″' })}
              ${lenField('bf-length', 'Length', s.length, { placeholder: '8′', hint: 'A plain number is feet', bare: 'ft' })}
            </div>
            <div class="pair">
              ${numField('bf-count', 'How many', s.count, { placeholder: '1' })}
              ${numField('bf-price', `Price per board foot`, s.price, { placeholder: `${store.settings.money}0.00`, hint: 'Optional' })}
            </div>
            <label class="field" for="bf-what"><span class="label">What it is</span>
              <input id="bf-what" type="text" value="${esc(s.what)}" placeholder="Walnut, white oak, 2×6 SPF…" maxlength="40" autocomplete="off"><span class="reads">Optional</span></label>
            <div class="add-row">
              <div class="readout inline"><span class="v" id="bf-out">–</span><span class="h" id="bf-cost"></span></div>
              <button type="button" class="btn primary" id="bf-add">Add to list</button>
            </div>
          </section>
          <section class="card result">
            <h2>The list</h2>
            <div id="bf-list"></div>
            <textarea class="copy-fallback" hidden readonly aria-label="List as text"></textarea>
            <p class="tip">Yards sell rough hardwood by its thickness before planing, in quarters of an inch, and some round the width to the nearest inch. Ask how yours counts. Dimensional lumber (a 2×6) is counted at its name, not its planed size.</p>
          </section>
        </div>
      </div>`;

    let current = null;
    const update = () => {
      for (const k of ['thick', 'width', 'length', 'count', 'price', 'what']) s[k] = $(`#bf-${k}`).value;
      store.saveTool('board-feet', s);
      const t = readLen('bf-thick'), w = readLen('bf-width'), l = readLen('bf-length');
      const n = readNum('bf-count'), price = priceOf($('#bf-price').value);
      const count = n ? Math.max(1, Math.round(toNumber(n))) : 1;
      current = null;
      if (t && w && l) {
        const feet = boardFeet({ thick: t, width: w, length: l, count });
        current = { feet, price, count, t, w, l };
        $('#bf-out').innerHTML = `${bf(feet)} <small>bd ft</small>`;
        $('#bf-cost').textContent = price ? fmt.money(mul(feet, price)) : '';
      } else {
        $('#bf-out').textContent = '–';
        $('#bf-cost').textContent = '';
      }
      $('#bf-add').disabled = !current;
    };

    const drawList = () => {
      const lines = store.lumber.map(lineOf).filter(Boolean);
      if (!lines.length) {
        $('#bf-list').innerHTML = '<p class="empty-note">Nothing on the list yet. Fill in a board and press Add to list.</p>';
        return;
      }
      let feet = Q(0), cost = Q(0), priced = 0;
      for (const x of lines) { feet = add(feet, x.feet); if (x.cost) { cost = add(cost, x.cost); priced++; } }
      $('#bf-list').innerHTML = `
        <ul class="lumber">${lines.map(x => `
          <li>
            <div class="what"><b>${esc(x.what || 'Boards')}</b><span>${x.n} × ${esc(x.thick)} × ${esc(x.width)} × ${esc(x.length)}</span></div>
            <div class="nums"><span>${bf(x.feet)} bd ft</span>${x.cost ? `<small>${fmt.money(x.cost)}</small>` : ''}</div>
            <button type="button" class="x" data-del="${x.id}" aria-label="Take ${esc(x.what || 'these boards')} off the list">${ICON.x}</button>
          </li>`).join('')}
        </ul>
        <div class="total"><span>Total</span><b>${bf(feet)} bd ft</b>${priced ? `<b>${fmt.money(cost)}</b>` : ''}</div>
        ${priced && priced < lines.length ? '<p class="hint small">The total cost leaves out lines with no price.</p>' : ''}
        <div class="row-btns">
          <button type="button" class="btn" id="bf-copy">Copy the list</button>
          <button type="button" class="btn quiet" id="bf-clear">Clear the list</button>
        </div>`;
    };

    const listText = () => {
      const lines = store.lumber.map(lineOf).filter(Boolean);
      let feet = Q(0), cost = Q(0);
      const rows = lines.map(x => {
        feet = add(feet, x.feet); if (x.cost) cost = add(cost, x.cost);
        return `${x.what || 'Boards'}: ${x.n} × ${x.thick} × ${x.width} × ${x.length} = ${bf(x.feet)} bd ft${x.cost ? `, ${fmt.money(x.cost)}` : ''}`;
      });
      return `Lumber list\n\n${rows.join('\n')}\n\nTotal: ${bf(feet)} bd ft${lines.some(x => x.cost) ? `, ${fmt.money(cost)}` : ''}\n`;
    };

    main.querySelectorAll('input').forEach(i => i.addEventListener('input', update));
    main.querySelector('.presets').addEventListener('click', e => {
      const q = e.target.closest('[data-q]')?.dataset.q;
      if (q) { $('#bf-thick').value = q; update(); }
    });
    $('#bf-add').addEventListener('click', () => {
      if (!current) return;
      const pr = priceOf($('#bf-price').value);
      store.addLumber({ thick: s.thick.trim(), width: s.width.trim(), length: s.length.trim(), t: toText(current.t), w: toText(current.w), l: toText(current.l), count: current.count, price: pr ? toText(pr) : '', what: s.what.trim() });
      drawList();
      toast(`Added ${bf(current.feet)} bd ft`);
    });
    $('#bf-list').addEventListener('click', e => {
      const del = e.target.closest('[data-del]');
      if (del) { store.removeLumber(del.dataset.del); drawList(); return; }
      if (e.target.closest('#bf-copy')) copyText(listText(), main.querySelector('.copy-fallback'));
      if (e.target.closest('#bf-clear') && confirm('Clear the whole list?')) { store.clearLumber(); drawList(); }
    });
    update();
    drawList();
  },
};
