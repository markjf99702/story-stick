// Miters: frames with any number of sides, trim around a corner, and crown moulding.
import { frame, frameSide, trimMiter, crown } from '../tools.js';
import { toNumber } from '../rational.js';
import { store } from '../store.js';
import { $, fmt, lenField, numField, readLen, readNum, seg, onSeg, stepper } from '../ui.js';
import { frameSVG } from '../draw.js';
import * as F from '../format.js';

const SHAPES = { 3: 'Triangle', 4: 'Square', 5: 'Pentagon', 6: 'Hexagon', 8: 'Octagon', 10: 'Decagon', 12: 'Dodecagon' };

export default {
  id: 'miters',
  name: 'Miters',
  nav: 'Miters',
  line: 'Saw settings for frames with any number of sides, trim and crown.',
  render(main) {
    const s = { sides: 4, inside: '10″', width: '2″', corner: '90', spring: '38', springOther: '', ...store.tool('miters') };
    main.innerHTML = `
      <div class="tool">
        <header class="tool-head">
          <h1>Miters</h1>
          <p class="lede">Saw settings for a frame with any number of sides, for trim that turns a corner, and for crown moulding.</p>
        </header>
        <div class="tool-grid">
          <section class="card">
            <h2>A frame</h2>
            <div class="frame-row">
              <div id="mt-frame" class="frame-pic"></div>
              <div>
                <div class="field"><span class="label">Sides</span>${stepper('mt-sides', s.sides, 'Sides')}</div>
                <p class="shape" id="mt-shape"></p>
              </div>
            </div>
            <div class="stats two">
              <div class="stat readout"><span class="lbl">Saw miter</span><span class="v" id="mt-miter"></span></div>
              <div class="stat readout"><span class="lbl">Each corner</span><span class="v" id="mt-corner"></span></div>
            </div>
            <p class="note" id="mt-fnote"></p>
            <div class="pair">
              ${lenField('mt-inside', 'Inside length of a side', s.inside, { placeholder: '10″', hint: 'The short edge, where the picture or glass sits' })}
              ${lenField('mt-width', 'Width of the stock', s.width, { placeholder: '2″' })}
            </div>
            <dl class="facts" id="mt-lengths"></dl>
          </section>
          <section class="card">
            <h2>Trim and crown around a corner</h2>
            ${numField('mt-cornerA', 'Angle between the walls, in degrees', s.corner, { placeholder: '90', hint: 'Square corners are 90°, inside or outside. A bay window might be 135°.' })}
            <div class="field"><span class="label">Crown’s spring angle</span>
              ${seg('spring', [['38', '38° <small>52/38 crown</small>'], ['45', '45° <small>45/45 crown</small>'], ['other', 'Other']], ['38', '45'].includes(s.spring) ? s.spring : 'other', 'Spring angle')}
            </div>
            <div id="mt-other-f">${numField('mt-other', 'Spring angle, in degrees', s.springOther, { placeholder: '40', hint: 'How far the back of the crown leans from the wall' })}</div>
            <div class="settings-out" id="mt-trim"></div>
            <p class="tip">Most compound miter saws have stops at 31.6° and 33.9° (52/38 crown) and 35.3° and 30° (45/45). Cut a test pair from scrap first: walls are seldom exactly square.</p>
          </section>
        </div>
      </div>`;

    const deg = d => F.degText(d, 2);
    const update = () => {
      s.inside = $('#mt-inside').value; s.width = $('#mt-width').value;
      s.corner = $('#mt-cornerA').value; s.springOther = $('#mt-other').value;
      store.saveTool('miters', s);

      // The frame.
      const fr = frame(s.sides);
      $('#mt-sides').textContent = s.sides;
      $('#mt-shape').textContent = SHAPES[s.sides] || `${s.sides} sides`;
      $('#mt-frame').innerHTML = frameSVG(s.sides);
      $('#mt-miter').textContent = deg(fr.miter);
      $('#mt-corner').textContent = deg(fr.corner);
      $('#mt-fnote').textContent = fr.miter > 50
        ? `Most miter saws stop at 45° to 60°. For ${deg(fr.miter)}, use a sled or a jig on the table saw.`
        : `Set the saw ${deg(fr.miter)} off square and cut both ends of every piece.`;
      const inside = readLen('mt-inside'), width = readLen('mt-width');
      const long = inside && width ? frameSide({ sides: s.sides, inside, width }) : null;
      $('#mt-lengths').innerHTML = long ? `
        <div><dt>Long point to long point</dt><dd>${fmt.html(long)}</dd></div>
        <div><dt>All ${s.sides} pieces, end to end</dt><dd>${fmt.html(long * s.sides)} <small>plus a kerf for every cut</small></dd></div>` : '';

      // Trim and crown.
      $('#mt-other-f').hidden = s.spring !== 'other';
      const cornerQ = readNum('mt-cornerA');
      const spring = s.spring === 'other' ? readNum('mt-other') : Number(s.spring);
      const corner = cornerQ ? toNumber(cornerQ) : null;
      const springN = spring == null ? null : typeof spring === 'number' ? spring : toNumber(spring);
      const out = $('#mt-trim');
      if (!corner || corner <= 0 || corner >= 180) { out.innerHTML = '<p class="note bad">Give an angle between 0° and 180°.</p>'; return; }
      const trim = trimMiter(corner);
      let html = `<div class="setting"><h3>Flat trim, baseboard, casing</h3><p><span class="big">${deg(trim)}</span> miter<small>, no bevel</small></p></div>`;
      if (springN && springN > 0 && springN < 90) {
        const c = crown({ corner, spring: springN });
        html += `<div class="setting"><h3>Crown laid flat on the saw</h3><p><span class="big">${deg(c.miter)}</span> miter <span class="big">${deg(c.bevel)}</span> bevel</p></div>
          <div class="setting"><h3>Crown upside down against the fence</h3><p><span class="big">${deg(c.nested)}</span> miter<small>, no bevel</small></p></div>`;
      } else if (s.spring === 'other') html += '<p class="note bad">Give a spring angle between 0° and 90°.</p>';
      out.innerHTML = html;
    };

    main.querySelectorAll('input').forEach(i => i.addEventListener('input', update));
    onSeg(main, 'spring', v => { s.spring = v; update(); });
    main.querySelector('[data-stepper="mt-sides"]').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      s.sides = Math.min(24, Math.max(3, s.sides + Number(b.dataset.d)));
      update();
    });
    update();
  },
};
