// Stairs: risers, treads, run and stringer from the total rise, checked against US house code.
import { stairs, IRC } from '../tools.js';
import { Q } from '../rational.js';
import { store } from '../store.js';
import { $, fmt, lenField, readLen, stepper, check } from '../ui.js';
import { stairsSVG } from '../draw.js';
import * as F from '../format.js';

export default {
  id: 'stairs',
  name: 'Stairs',
  nav: 'Stairs',
  line: 'Risers, treads, run and stringer from the total rise, checked against code.',
  render(main) {
    const s = { rise: '9′', tread: '10-1/2″', run: '', max: '7-3/4″', thick: '1″', risers: null, ...store.tool('stairs') };
    main.innerHTML = `
      <div class="tool">
        <header class="tool-head">
          <h1>Stairs</h1>
          <p class="lede">From the total rise: how many risers and how tall, the treads, the run, and the stringer, checked against the US house code.</p>
        </header>
        <div class="tool-grid">
          <section class="card form">
            ${lenField('st-rise', 'Total rise', s.rise, { placeholder: '9′', hint: 'Finished floor to finished floor' })}
            ${lenField('st-tread', 'Tread depth', s.tread, { placeholder: '10-1/2″', hint: 'Front of one riser to the next' })}
            ${lenField('st-run', 'Total run, if it has to fit', s.run, { placeholder: 'Optional', hint: 'Leave empty to use the tread depth' })}
            ${lenField('st-max', 'Tallest riser allowed', s.max, { placeholder: '7-3/4″', hint: 'IRC: 7-3/4″' })}
            ${lenField('st-thick', 'Tread thickness', s.thick, { placeholder: '1″', hint: 'For cutting the stringer’s bottom step' })}
          </section>
          <section class="card result">
            <div class="stats two">
              <div class="stat"><span class="lbl">Risers</span>${stepper('st-n', '–', 'Risers')}</div>
              <div class="stat readout"><span class="lbl">Each riser</span><span class="v" id="st-h">–</span><span class="h" id="st-hh"></span></div>
            </div>
            <p class="note" id="st-note"></p>
            <dl class="facts" id="st-facts"></dl>
            <ul class="checks" id="st-checks"></ul>
            <div id="st-draw"></div>
            <div id="st-more"></div>
            <p class="tip">These are the numbers in the International Residential Code (R311.7), which most US towns use for houses. Your local code, and stairs for decks, basements or businesses, can differ, so check before you build. Headroom (6 ft 8 in at least), nosings and handrails aren’t checked here.</p>
          </section>
        </div>
      </div>`;

    let last = null;
    const update = (keepCount = true) => {
      if (!keepCount) s.risers = null;
      for (const k of ['rise', 'tread', 'run', 'max', 'thick']) s[k] = $(`#st-${k}`).value;
      store.saveTool('stairs', s);
      const rise = readLen('st-rise'), tread = readLen('st-tread'), run = readLen('st-run');
      const maxRiser = readLen('st-max') ?? IRC.maxRiser, treadThick = readLen('st-thick') ?? Q(0);
      $('#st-tread').disabled = !!run;
      const r = stairs({ rise, tread, run, maxRiser, risers: s.risers, treadThick });
      last = r;
      const note = $('#st-note');
      if (r.error) {
        $('#st-n').textContent = '–'; $('#st-h').textContent = '–'; $('#st-hh').textContent = '';
        for (const id of ['st-facts', 'st-checks', 'st-draw', 'st-more']) $('#' + id).innerHTML = '';
        note.textContent = r.error; note.className = 'note bad';
        return;
      }
      $('#st-n').textContent = r.n;
      $('#st-h').innerHTML = fmt.html(r.riser);
      $('#st-hh').textContent = [fmt.hair(r.riser), fmt.show === 'mm' ? '' : F.decInText(r.riser)].filter(Boolean).join(' · ');
      note.className = 'note';
      note.innerHTML = s.risers != null && s.risers !== r.fewest
        ? `The fewest risers under ${fmt.len(maxRiser)} is ${r.fewest}. <button type="button" class="link-btn" id="st-fewest">Use ${r.fewest}</button>`
        : r.treads ? `${r.n} risers and ${r.treads} ${r.treads === 1 ? 'tread' : 'treads'}; the top step is the floor above.` : 'One step: no treads.';
      const fact = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
      $('#st-facts').innerHTML = r.treads ? [
        fact('Treads', `${r.treads} at ${fmt.html(r.tread)}`),
        fact('Total run', fmt.html(r.totalRun)),
        fact('Stringer', `${fmt.html(r.stringer)}${r.stock ? ` <small>buy ${r.stock}-foot boards</small>` : ' <small>longer than a 20-foot board</small>'}`),
        fact('Angle', F.degText(r.angle, 1)),
        fact('2 risers + tread', fmt.html(r.comfort, fmt.show === 'mm' ? 'mm' : 'in')),
      ].join('') : '';
      $('#st-checks').innerHTML = r.checks.filter(c => r.treads || c.id !== 'comfort').map(c => check(c.ok, c.text, c.note)).join('');
      $('#st-draw').innerHTML = stairsSVG({ riser: r.riser, tread: r.tread, n: r.n, rise, totalRun: r.totalRun });
      $('#st-more').innerHTML = r.treads ? `
        <h2>Laying out the stringer</h2>
        <p>Set a framing square to <b>${fmt.html(r.riser)}</b> on the tongue and <b>${fmt.html(r.tread)}</b> on the body, and step it along the board ${r.n} times. Cut the bottom step <b>${fmt.html(treadThick)}</b> short (<b>${fmt.html(r.firstRiser)}</b>) so it comes out the same as the rest once the treads are on.</p>
        <h2>Each step</h2>
        <table class="steps"><thead><tr><th>Step</th><th>Top, from the floor</th><th>From the first riser</th></tr></thead>
          <tbody>${r.steps.map((st, i) => `<tr><td>${i + 1 === r.n ? 'Floor above' : i + 1}</td><td>${fmt.html(st.height)}</td><td>${fmt.html(st.run)}</td></tr>`).join('')}</tbody></table>` : '';
    };

    main.querySelectorAll('input').forEach(i => i.addEventListener('input', () => update(false)));
    main.querySelector('[data-stepper="st-n"]').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b || !last?.n) return;
      s.risers = Math.min(60, Math.max(1, (s.risers ?? last.n) + Number(b.dataset.d)));
      update();
    });
    main.addEventListener('click', e => { if (e.target.id === 'st-fewest') { s.risers = null; update(); } });
    update();
  },
};
