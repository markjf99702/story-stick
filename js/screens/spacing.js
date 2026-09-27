// Even spacing: balusters, pickets, fence boards, shelf-pin holes.
import { spacing } from '../tools.js';
import { store } from '../store.js';
import { $, esc, fmt, lenField, readLen, seg, onSeg, stepper, marksList } from '../ui.js';
import { spacingSVG } from '../draw.js';
import * as F from '../format.js';

const PRESETS = {
  balusters: { width: '1-1/2″', gap: '3-7/8″', ends: 'gaps', at: 'left' },
  pickets: { width: '3-1/2″', gap: '2-1/2″', ends: 'gaps', at: 'left' },
  boards: { width: '5-1/2″', gap: '1/4″', ends: 'items', at: 'left' },
  pins: { width: '1/4″', gap: '1-3/4″', ends: 'items', at: 'center' },
};

export default {
  id: 'spacing',
  name: 'Even spacing',
  nav: 'Spacing',
  line: 'Balusters, pickets, boards, shelf pins: how many, the gap, and the marks.',
  render(main) {
    const s = { space: '6′', width: '1-1/2″', gap: '3-7/8″', ends: 'gaps', at: 'left', count: null, ...store.tool('spacing') };
    main.innerHTML = `
      <div class="tool">
        <header class="tool-head">
          <h1>Even spacing</h1>
          <p class="lede">For balusters, pickets, fence boards or shelf-pin holes: how many to use, the gap between them, and where each one goes.</p>
        </header>
        <div class="tool-grid">
          <section class="card form">
            <div class="presets" role="group" aria-label="Start from">
              <span>Start from</span>
              <button type="button" class="chip" data-p="balusters">Balusters</button>
              <button type="button" class="chip" data-p="pickets">Pickets</button>
              <button type="button" class="chip" data-p="boards">Fence boards</button>
              <button type="button" class="chip" data-p="pins">Shelf pins</button>
            </div>
            ${lenField('sp-space', 'Space to fill', s.space, { placeholder: '6′', hint: 'Between the posts, or end to end' })}
            ${lenField('sp-width', 'Width of each one', s.width, { placeholder: '1-1/2″' })}
            ${lenField('sp-gap', 'Largest gap', s.gap, { placeholder: '4″' })}
            <div class="field"><span class="label">At the ends</span>
              ${seg('ends', [['gaps', 'A gap at each end'], ['items', 'One at each end']], s.ends, 'At the ends')}</div>
            <p class="hint small">Railings: code wants gaps a 4″ ball can’t pass through (IRC R312.1.3), so keep them under 4″.</p>
          </section>
          <section class="card result">
            <div class="stats two">
              <div class="stat"><span class="lbl">How many</span>${stepper('sp-n', '–', 'How many')}</div>
              <div class="stat readout"><span class="lbl">Gap</span><span class="v" id="sp-gapv">–</span><span class="h" id="sp-gaph"></span></div>
            </div>
            <p class="note" id="sp-note"></p>
            <div id="sp-draw"></div>
            <div class="marks-head">
              <h2 id="sp-mh">Marks from the left end</h2>
              ${seg('at', [['left', 'Left edges'], ['center', 'Centres']], s.at, 'Mark')}
            </div>
            <div id="sp-marks"></div>
            <p class="tip">Each mark is measured from the end, so rounding doesn’t build up along the run. A spacer block cut to the gap saves marking most of them.</p>
          </section>
        </div>
      </div>`;

    let last = null;
    const update = (keepCount = true) => {
      if (!keepCount) s.count = null;
      s.space = $('#sp-space').value; s.width = $('#sp-width').value; s.gap = $('#sp-gap').value;
      store.saveTool('spacing', s);
      const space = readLen('sp-space'), width = readLen('sp-width'), gap = readLen('sp-gap');
      const out = $('#sp-n'), gv = $('#sp-gapv'), gh = $('#sp-gaph'), note = $('#sp-note');
      const blank = () => { $('#sp-draw').innerHTML = ''; $('#sp-marks').innerHTML = ''; gv.textContent = '–'; gh.textContent = ''; };
      if (!space || width === null) {
        out.textContent = '–'; blank(); last = null;
        note.textContent = 'Fill in the space and the width of each one.';
        return;
      }
      const r = spacing({ space, width, maxGap: gap, count: s.count, ends: s.ends });
      last = r;
      out.textContent = r.n ?? '–';
      if (r.error) { blank(); note.textContent = r.error; note.className = 'note bad'; return; }
      gv.innerHTML = fmt.html(r.gap);
      gh.textContent = [fmt.hair(r.gap), fmt.show === 'mm' ? '' : F.decInText(r.gap)].filter(Boolean).join(' · ');
      const bits = [`${r.n} with ${r.gaps} ${r.gaps === 1 ? 'gap' : 'gaps'}.`];
      if (s.count != null && r.fewest != null && s.count !== r.fewest) bits.push(`The fewest that keeps gaps at ${fmt.len(gap)} or less is ${r.fewest}. <button type="button" class="link-btn" id="sp-fewest">Use ${r.fewest}</button>`);
      if (r.over) bits.push(`<b>The gaps are bigger than ${esc(fmt.len(gap))}.</b>`);
      note.innerHTML = bits.join(' ');
      note.className = 'note' + (r.over ? ' bad' : '');
      $('#sp-draw').innerHTML = spacingSVG({ space, width, marks: r.marks, ends: s.ends });
      $('#sp-mh').textContent = s.at === 'center' ? 'Centres from the left end' : 'Left edges from the left end';
      $('#sp-marks').innerHTML = marksList(r.marks.map(m => fmt.html(s.at === 'center' ? m.center : m.left)));
    };

    main.querySelectorAll('input').forEach(i => i.addEventListener('input', () => update(false)));
    onSeg(main, 'ends', v => { s.ends = v; update(false); });
    onSeg(main, 'at', v => { s.at = v; update(); });
    main.querySelector('.presets').addEventListener('click', e => {
      const p = PRESETS[e.target.closest('[data-p]')?.dataset.p];
      if (!p) return;
      $('#sp-width').value = p.width; $('#sp-gap').value = p.gap;
      Object.assign(s, { ends: p.ends, at: p.at });
      main.querySelectorAll('[data-seg=ends] button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === p.ends)));
      main.querySelectorAll('[data-seg=at] button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.v === p.at)));
      update(false);
    });
    main.querySelector('[data-stepper="sp-n"]').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      const least = s.ends === 'items' ? 2 : 1;
      s.count = Math.max(least, (s.count ?? last?.n ?? least) + Number(b.dataset.d));
      update();
    });
    main.addEventListener('click', e => { if (e.target.id === 'sp-fewest') { s.count = null; update(); } });
    update();
  },
};
