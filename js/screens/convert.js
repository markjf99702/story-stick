// Convert: fractions, decimals and millimetres, the nearest fraction at each size, and a chart.
import { nearestFractions, fractionChart } from '../tools.js';
import { store } from '../store.js';
import { $, fmt, lenField, readLen, seg, onSeg } from '../ui.js';
import * as F from '../format.js';
import { toNumber } from '../rational.js';

export default {
  id: 'convert',
  name: 'Convert',
  nav: 'Convert',
  line: 'Fractions, decimals and millimetres, and the nearest fraction.',
  render(main) {
    const s = { v: '18mm', chart: 16, ...store.tool('convert') };
    main.innerHTML = `
      <div class="tool">
        <header class="tool-head">
          <h1>Convert</h1>
          <p class="lede">Type a size any way: a fraction, decimal inches, millimetres. See it every other way, and the nearest fraction at each size.</p>
        </header>
        <div class="tool-grid">
          <section class="card">
            ${lenField('cv-v', 'Size', s.v, { placeholder: '18mm, 0.3125, 7/16″' })}
            <dl class="facts conv" id="cv-out"></dl>
            <h2>Nearest fraction</h2>
            <table class="near"><thead><tr><th>To the nearest</th><th>Reads</th><th>Off by</th></tr></thead><tbody id="cv-near"></tbody></table>
          </section>
          <section class="card">
            <div class="marks-head"><h2>Fractions of an inch</h2>
              ${seg('chart', [[8, '8ths'], [16, '16ths'], [32, '32nds'], [64, '64ths']], s.chart, 'Chart size')}</div>
            <table class="chart"><thead><tr><th>Fraction</th><th>Decimal</th><th>mm</th></tr></thead><tbody id="cv-chart"></tbody></table>
          </section>
        </div>
      </div>`;

    const NAMES = { 2: 'half', 4: 'quarter', 8: 'eighth', 16: 'sixteenth', 32: '32nd', 64: '64th' };
    const update = () => {
      s.v = $('#cv-v').value;
      store.saveTool('convert', s);
      const q = readLen('cv-v', { quiet: true });
      if (!q) { $('#cv-out').innerHTML = ''; $('#cv-near').innerHTML = ''; return; }
      const row = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
      $('#cv-out').innerHTML = [
        row(toNumber(q) >= 12 ? 'Feet and inches' : 'Inches', F.lenHTML(q, { den: fmt.den, show: 'ftin' }) + (fmt.hair(q) ? ` <small>${fmt.hair(q)}</small>` : '')),
        toNumber(q) >= 12 ? row('Inches', F.lenHTML(q, { den: fmt.den, show: 'in' })) : '',
        row('Decimal inches', F.decInText(q, 5)),
        row('Decimal feet', F.decFtText(q, 5)),
        row('Millimetres', F.mmText(q, 2)),
        row('Metres', `${F.dec(toNumber(q) * 0.0254, 5)} m`),
      ].join('');
      $('#cv-near').innerHTML = nearestFractions(q).map(r => {
        const off = Math.abs(r.off) < 1e-9 ? '<span class="exact">exact</span>' : `${F.dec(Math.abs(r.off), 4)}″ ${r.off > 0 ? 'over' : 'under'}`;
        return `<tr><td>${NAMES[r.den]}</td><td>${F.lenHTML(r.t / r.den, { den: r.den, show: 'in' })}</td><td>${off}</td></tr>`;
      }).join('');
    };
    const chart = () => {
      $('#cv-chart').innerHTML = fractionChart(Number(s.chart)).map(r =>
        `<tr${r.d <= 4 ? ' class="major"' : ''}><td><span class="fr"><sup>${r.n}</sup>⁄<sub>${r.d}</sub></span>″</td><td>${r.inches.toFixed(Math.max(3, Math.log2(s.chart) | 0))}</td><td>${r.mm.toFixed(2)}</td></tr>`).join('');
    };

    $('#cv-v').addEventListener('input', update);
    onSeg(main, 'chart', v => { s.chart = Number(v); store.saveTool('convert', s); chart(); });
    update();
    chart();
  },
};
