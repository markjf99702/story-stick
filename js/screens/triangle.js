// Right triangles and squaring up: diagonals, angles, roof pitch, and checking a frame by its diagonals.
import { triangle, squareCheck } from '../tools.js';
import { store } from '../store.js';
import { $, fmt, lenField, readLen } from '../ui.js';
import { triangleSVG } from '../draw.js';
import * as F from '../format.js';
import { toNumber } from '../rational.js';

const num = x => (typeof x === 'number' ? x : toNumber(x));

export default {
  id: 'triangle',
  name: 'Triangles and square',
  nav: 'Triangles',
  line: 'Diagonals, angles and roof pitch, and squaring a frame by its diagonals.',
  render(main) {
    const s = { rise: '6″', run: '12″', diag: '', w: '8′', l: '12′', d1: '', d2: '', ...store.tool('triangle') };
    main.innerHTML = `
      <div class="tool">
        <header class="tool-head">
          <h1>Triangles and square</h1>
          <p class="lede">Give any two sides of a right triangle for the third, the angle and the roof pitch. Or check a frame, a deck or a slab form for square by its diagonals.</p>
        </header>
        <div class="tool-grid">
          <section class="card">
            <h2>A right triangle</h2>
            <div class="trio">
              ${lenField('tr-rise', 'Rise', s.rise, { placeholder: '6″' })}
              ${lenField('tr-run', 'Run', s.run, { placeholder: '12″' })}
              ${lenField('tr-diag', 'Diagonal', s.diag, { placeholder: '–' })}
            </div>
            <p class="note" id="tr-note"></p>
            <div class="stats two" id="tr-stats"></div>
            <div id="tr-draw"></div>
          </section>
          <section class="card">
            <h2>Is it square?</h2>
            <div class="pair">
              ${lenField('sq-w', 'One side', s.w, { placeholder: '8′' })}
              ${lenField('sq-l', 'The side next to it', s.l, { placeholder: '12′' })}
            </div>
            <div id="sq-target"></div>
            <div class="pair">
              ${lenField('sq-d1', 'One diagonal', s.d1, { placeholder: 'Measure it' })}
              ${lenField('sq-d2', 'The other diagonal', s.d2, { placeholder: 'Measure it' })}
            </div>
            <div id="sq-out"></div>
            <div id="sq-345"></div>
          </section>
        </div>
      </div>`;

    // Whole feet read better without the 0″ in a sentence: 6′, not 6′ 0″.
    const even = q => fmt.len(q).replace(/′ 0″$/, '′');
    const stat = (k, v, h = '') => `<div class="stat readout"><span class="lbl">${k}</span><span class="v">${v}</span>${h ? `<span class="h">${h}</span>` : ''}</div>`;
    const update = () => {
      for (const [k, id] of [['rise', 'tr-rise'], ['run', 'tr-run'], ['diag', 'tr-diag'], ['w', 'sq-w'], ['l', 'sq-l'], ['d1', 'sq-d1'], ['d2', 'sq-d2']]) s[k] = $('#' + id).value;
      store.saveTool('triangle', s);

      const rise = readLen('tr-rise'), run = readLen('tr-run'), diag = readLen('tr-diag');
      const note = $('#tr-note');
      const given = [rise, run, diag].filter(Boolean).length;
      const r = given === 3 ? { error: 'Leave one of the three empty, and Story Stick works it out.' } : triangle({ rise, run, diag });
      if (r.error) {
        note.textContent = r.error; note.className = 'note bad';
        $('#tr-stats').innerHTML = ''; $('#tr-draw').innerHTML = '';
      } else {
        const missing = !diag ? 'diag' : !run ? 'run' : 'rise';
        const names = { rise: 'Rise', run: 'Run', diag: 'Diagonal' };
        note.className = 'note'; note.textContent = '';
        const pitch = typeof r.pitch === 'number' ? F.dec(r.pitch, 2) : F.numText(r.pitch).replace('≈ ', '');
        $('#tr-stats').innerHTML = stat(names[missing], fmt.html(r[missing]), fmt.hair(r[missing]))
          + stat('Angle', F.degText(r.angle, 2), `${F.degText(90 - r.angle, 2)} at the other end`)
          + stat('Pitch', `${pitch} <small>in 12</small>`, `${F.dec(r.slope, 1)}% slope`)
          + stat('Per foot of run', `${F.dec((12 * num(r.diag)) / num(r.run), 2)}″`, 'of diagonal (the rafter table)');
        $('#tr-draw').innerHTML = triangleSVG({ rise: r.rise, run: r.run, labels: { rise: fmt.len(r.rise), run: fmt.len(r.run), diag: fmt.len(r.diag), angle: F.degText(r.angle, 1) } });
      }

      const w = readLen('sq-w'), l = readLen('sq-l'), d1 = readLen('sq-d1'), d2 = readLen('sq-d2');
      const sq = w && l ? squareCheck({ width: w, length: l, d1, d2 }) : null;
      $('#sq-target').innerHTML = sq ? `<div class="stat readout wide"><span class="lbl">Each diagonal, when it’s square</span><span class="v">${fmt.html(sq.target)}</span><span class="h">${fmt.hair(sq.target)}</span></div>` : '';
      let out = '';
      if (sq && sq.diff) {
        out = sq.square
          ? `<p class="verdict ok">Square: the diagonals are within 1/32″ of each other.</p>`
          : `<p class="verdict no">Out by ${fmt.len(sq.diff)}. Push the two corners at the ends of the ${sq.longer === 1 ? 'first' : 'second'} diagonal toward each other until both read about ${fmt.len(sq.middle)}.</p>`;
        if (sq.sidesOff) out += `<p class="note">The diagonals average ${fmt.len(sq.middle)}, not ${fmt.len(sq.target)}: check that the sides really are ${fmt.len(w)} and ${fmt.len(l)}, and that opposite sides match.</p>`;
      }
      $('#sq-out').innerHTML = out;
      const t = sq?.tri;
      $('#sq-345').innerHTML = t ? `<div class="tri345"><h3>Or use 3-4-5</h3><p>From a corner, mark <b>${even(t.a)}</b> along one side and <b>${even(t.b)}</b> along the other. When the corner is square, the two marks are exactly <b>${even(t.c)}</b> apart.</p></div>` : '';
    };

    main.querySelectorAll('input').forEach(i => i.addEventListener('input', update));
    update();
  },
};
