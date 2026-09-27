// Divide a board: equal parts with the kerf allowed for, or how many pieces of a set length it gives.
import { divideEqual, piecesOf } from '../tools.js';
import { ZERO } from '../rational.js';
import { store } from '../store.js';
import { $, fmt, lenField, readLen, seg, onSeg, stepper } from '../ui.js';
import { boardSVG } from '../draw.js';

export default {
  id: 'divide',
  name: 'Divide a board',
  nav: 'Divide',
  line: 'Equal parts with the saw kerf allowed for, or how many pieces fit.',
  render(main) {
    const s = { mode: 'equal', length: '8′', parts: 3, piece: '11-3/4″', kerf: '1/8″', ...store.tool('divide') };
    main.innerHTML = `
      <div class="tool">
        <header class="tool-head">
          <h1>Divide a board</h1>
          <p class="lede">Split a length into equal parts with the saw kerf allowed for, or see how many pieces of one length a board gives and what’s left.</p>
        </header>
        <div class="tool-grid">
          <section class="card form">
            ${seg('mode', [['equal', 'Equal parts'], ['pieces', 'Pieces of a length']], s.mode, 'Divide into')}
            ${lenField('dv-len', 'Board length', s.length, { placeholder: '8′' })}
            <div class="field" id="dv-parts-f"><span class="label">How many parts</span>${stepper('dv-parts', s.parts, 'How many parts')}</div>
            <div id="dv-piece-f">${lenField('dv-piece', 'Each piece', s.piece, { placeholder: '11-3/4″' })}</div>
            ${lenField('dv-kerf', 'Saw kerf', s.kerf, { placeholder: '1/8″', hint: 'What the blade takes. 0 to mark without cutting.' })}
          </section>
          <section class="card result">
            <div class="stats three" id="dv-stats"></div>
            <p class="note" id="dv-note"></p>
            <div id="dv-draw"></div>
            <h2 id="dv-lh">Each part, from the left end</h2>
            <div id="dv-list"></div>
            <p class="tip" id="dv-tip">Each reading is measured from the left end, so rounding doesn’t build up. The kerf falls to the right of each part: cut on the waste side of the line.</p>
          </section>
        </div>
      </div>`;

    const showMode = () => {
      $('#dv-parts-f').hidden = s.mode !== 'equal';
      $('#dv-piece-f').hidden = s.mode !== 'pieces';
    };
    const stat = (k, v, h = '', cls = '') => `<div class="stat readout ${cls}"><span class="lbl">${k}</span><span class="v">${v}</span>${h ? `<span class="h">${h}</span>` : ''}</div>`;

    const update = () => {
      s.length = $('#dv-len').value; s.piece = $('#dv-piece').value; s.kerf = $('#dv-kerf').value;
      store.saveTool('divide', s);
      $('#dv-parts').textContent = s.parts;
      const length = readLen('dv-len'), kerf = readLen('dv-kerf') ?? ZERO;
      const piece = s.mode === 'pieces' ? readLen('dv-piece') : null;
      const note = $('#dv-note');
      const blank = msg => { $('#dv-stats').innerHTML = ''; $('#dv-draw').innerHTML = ''; $('#dv-list').innerHTML = ''; note.textContent = msg; note.className = 'note bad'; };
      if (!length) return blank('Fill in the board length.');
      const r = s.mode === 'equal' ? divideEqual({ length, parts: s.parts, kerf }) : piece ? piecesOf({ length, piece, kerf }) : { error: 'Fill in the length of each piece.' };
      if (r.error) return blank(r.error);
      note.className = 'note';
      if (s.mode === 'equal') {
        $('#dv-stats').innerHTML = stat('Each part', fmt.html(r.piece), fmt.hair(r.piece), 'wide')
          + stat('Cuts', r.cuts) + stat('Lost to the saw', fmt.html(r.waste));
        note.textContent = '';
      } else {
        $('#dv-stats').innerHTML = stat('Pieces', r.n, '', 'wide') + stat('Cuts', r.cuts) + stat('Offcut', fmt.html(r.offcut));
        note.textContent = r.offcut.n === 0n ? 'Nothing useful is left over.' : '';
      }
      $('#dv-draw').innerHTML = boardSVG({ length, pieces: r.pieces, offcut: s.mode === 'pieces' ? r.offcut : null });
      $('#dv-lh').textContent = s.mode === 'equal' ? 'Each part, from the left end' : 'Each piece, from the left end';
      $('#dv-list').innerHTML = `<ol class="spans">${r.pieces.map((p, i) => `<li><span class="n">${i + 1}</span><span class="r">${fmt.html(p.start)}</span><span class="to">to</span><span class="r">${fmt.html(p.end)}</span></li>`).join('')}</ol>`;
    };

    main.querySelectorAll('input').forEach(i => i.addEventListener('input', update));
    onSeg(main, 'mode', v => { s.mode = v; showMode(); update(); });
    main.querySelector('[data-stepper="dv-parts"]').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      s.parts = Math.min(500, Math.max(2, s.parts + Number(b.dataset.d)));
      update();
    });
    showMode();
    update();
  },
};
