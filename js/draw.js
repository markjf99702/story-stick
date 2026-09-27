// Small side-on drawings for the tools, as SVG. Colours come from the CSS, so they follow light and dark.
import { toNumber } from './rational.js';

const num = x => (typeof x === 'number' ? x : toNumber(x));
const f = x => Math.round(x * 10) / 10;

// A run of balusters (or pickets, or boards) between two posts.
export function spacingSVG({ space, width, marks, ends }) {
  const W = 1000, H = 190, post = 34, S = num(space), k = (W - 2 * post) / S;
  const items = marks.map(m => {
    const x = post + num(m.left) * k, w = Math.max(2, num(width) * k);
    return `<rect class="item" x="${f(x)}" y="30" width="${f(w)}" height="${H - 60}" rx="${w > 6 ? 1.5 : 0}"/>`;
  }).join('');
  // The first gap, measured.
  const g0 = ends === 'items' ? (marks[1] ? [num(marks[0].right), num(marks[1].left)] : null) : [0, num(marks[0].left)];
  const dim = g0 && (g0[1] - g0[0]) * k > 14
    ? `<g class="dim"><line x1="${f(post + g0[0] * k + 2)}" x2="${f(post + g0[1] * k - 2)}" y1="${H / 2}" y2="${H / 2}"/></g>` : '';
  return `<svg class="drawing spacing" viewBox="0 0 ${W} ${H}" role="img" aria-label="${marks.length} evenly spaced between two ends">
    <rect class="post" x="0" y="4" width="${post}" height="${H - 8}" rx="3"/>
    <rect class="post" x="${W - post}" y="4" width="${post}" height="${H - 8}" rx="3"/>
    <rect class="rail" x="${post}" y="18" width="${W - 2 * post}" height="12"/>
    <rect class="rail" x="${post}" y="${H - 30}" width="${W - 2 * post}" height="12"/>
    ${items}${dim}
  </svg>`;
}

// A board cut into pieces, with the kerfs between them.
export function boardSVG({ length, pieces, offcut = null }) {
  const W = 1000, H = 150, L = num(length), k = W / L;
  const parts = pieces.map((p, i) => {
    const x = num(p.start) * k, w = Math.max(1, (num(p.end) - num(p.start)) * k);
    const label = w > 34 ? `<text x="${f(x + w / 2)}" y="${H / 2 + 11}" text-anchor="middle">${i + 1}</text>` : '';
    return `<rect class="piece" x="${f(x)}" y="14" width="${f(w)}" height="${H - 28}"/>${label}`;
  }).join('');
  const kerfs = pieces.slice(0, -1).map(p => `<rect class="kerf" x="${f(num(p.end) * k - 1.5)}" y="8" width="3" height="${H - 16}"/>`).join('');
  const last = num(pieces[pieces.length - 1].end) * k;
  const off = offcut !== null && W - last > 2 ? `<rect class="offcut" x="${f(last + 3)}" y="14" width="${f(W - last - 3)}" height="${H - 28}"/>` : '';
  return `<svg class="drawing board" viewBox="0 0 ${W} ${H}" role="img" aria-label="The board cut into ${pieces.length} pieces">
    <rect class="stock" x="0" y="14" width="${W}" height="${H - 28}"/>${parts}${off}${kerfs}</svg>`;
}

// A flight of stairs from the side, with the stringer's line.
export function stairsSVG({ riser, tread, n, rise, totalRun }) {
  const h = num(riser), t = num(tread) || h, R = num(rise), T = num(totalRun) || 0;
  const land = Math.max(t * 1.6, 16);
  const spanX = T + land, spanY = R;
  const W = 1000, pad = 36, k = Math.min((W - 2 * pad) / spanX, 560 / spanY);
  const H = Math.round(spanY * k + 2 * pad + 10);
  const X = x => f(pad + x * k), Y = y => f(H - pad - y * k);
  let d = `M${X(0)} ${Y(0)}`;
  for (let i = 1; i <= n; i++) {
    d += ` L${X((i - 1) * t)} ${Y(i * h)}`;
    if (i < n) d += ` L${X(i * t)} ${Y(i * h)}`;
  }
  const profile = `${d} L${X(T + land)} ${Y(R)} L${X(T + land)} ${Y(0)} Z`;
  const stringer = n > 1 ? `<line class="stringer" x1="${X(0)}" y1="${Y(0)}" x2="${X(T)}" y2="${Y(R)}"/>` : '';
  return `<svg class="drawing stairs" viewBox="0 0 ${W} ${H}" role="img" aria-label="${n} risers and ${n - 1} treads from the side">
    <line class="floor" x1="0" x2="${W}" y1="${Y(0)}" y2="${Y(0)}"/>
    <path class="flight" d="${profile}"/>
    <path class="nosing" d="${d}"/>
    ${stringer}
  </svg>`;
}

// A frame with equal sides, each piece mitered at the corners.
export function frameSVG(sides) {
  const W = 240, c = W / 2, ro = 108, ri = ro - Math.max(20, 44 - sides * 2);
  const rot = Math.PI / 2 + Math.PI / sides; // a flat side at the bottom
  const pt = (r, i) => [c + r * Math.cos(rot + (2 * Math.PI * i) / sides), c + r * Math.sin(rot + (2 * Math.PI * i) / sides)];
  const out = [];
  for (let i = 0; i < sides; i++) {
    const p = [pt(ro, i), pt(ro, i + 1), pt(ri, i + 1), pt(ri, i)].map(([x, y]) => `${f(x)},${f(y)}`).join(' ');
    out.push(`<polygon class="piece ${i % 2 ? 'b' : 'a'}" points="${p}"/>`);
  }
  return `<svg class="drawing frame" viewBox="0 0 ${W} ${W}" role="img" aria-label="A frame with ${sides} sides">${out.join('')}</svg>`;
}

// A right triangle: run along the bottom, rise up the side, the diagonal between.
export function triangleSVG({ rise, run, labels }) {
  const r = num(rise), u = num(run);
  const W = 640, pad = 50, k = Math.min((W - 2 * pad - 150) / u, 260 / r);
  const H = Math.round(r * k + 2 * pad);
  const x0 = pad + 20, y0 = H - pad, x1 = x0 + u * k, y1 = y0 - r * k;
  const sq = 22;
  return `<svg class="drawing tri" viewBox="0 0 ${W} ${H}" role="img" aria-label="A right triangle">
    <polygon class="face" points="${f(x0)},${f(y0)} ${f(x1)},${f(y0)} ${f(x1)},${f(y1)}"/>
    <polyline class="square" points="${f(x1 - sq)},${f(y0)} ${f(x1 - sq)},${f(y0 - sq)} ${f(x1)},${f(y0 - sq)}"/>
    <text x="${f((x0 + x1) / 2)}" y="${f(y0 + 38)}" text-anchor="middle">${labels.run}</text>
    <text x="${f(x1 + 14)}" y="${f((y0 + y1) / 2 + 10)}">${labels.rise}</text>
    <text x="${f((x0 + x1) / 2 - 14)}" y="${f((y0 + y1) / 2 - 14)}" text-anchor="end">${labels.diag}</text>
    <text class="ang" x="${f(x0 + 58)}" y="${f(y0 - 14)}">${labels.angle}</text>
  </svg>`;
}
