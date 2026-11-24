// Lightweight SVG charts. Every mark carries data-tip for the hover tooltip.
import { esc } from './ui.js';

const GRID = '#f0f0f2', TXT = '#a1a1aa', AXIS = '#e4e4e7';
let uid = 0;
const nid = (p) => `${p}${++uid}`;

export const PALETTE = ['#4f46e5', '#f59e0b', '#10b981', '#ec4899', '#0ea5e9', '#8b5cf6', '#64748b', '#ef4444'];
/** Default chart width: narrower viewBox on phones so axis text stays readable. */
export const chartW = (base = 680) => (typeof window !== 'undefined' && window.innerWidth < 640 ? 380 : base);
export const isPhone = () => typeof window !== 'undefined' && window.innerWidth < 640;
export const C = { primary: '#4f46e5', primarySoft: '#a5b4fc', amber: '#f59e0b', green: '#10b981', slate: '#cbd5e1', red: '#ef4444' };

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
function yAxis(s, { padL, width, padR, max, y, format, ticks = 4 }) {
  for (let i = 0; i <= ticks; i++) {
    const v = (max / ticks) * i;
    s.push(`<line x1="${padL}" x2="${width - padR}" y1="${y(v)}" y2="${y(v)}" stroke="${i === 0 ? AXIS : GRID}" ${i === 0 ? '' : 'stroke-dasharray="3 4"'}/>`);
    s.push(`<text x="${padL - 10}" y="${y(v) + 4}" font-size="11" text-anchor="end" fill="${TXT}">${esc(format(v, true))}</text>`);
  }
}

/** Grouped vertical bars. data: [{label, values:[…]}], series: [{name, color}] */
export function barChart({ data, series, height = 260, format = (v) => v, width = chartW() }) {
  const padL = 58, padR = 6, padT = 12, padB = 30;
  const max = niceMax(Math.max(1, ...data.flatMap((d) => d.values)));
  const ih = height - padT - padB, iw = width - padL - padR;
  const gw = iw / data.length, gap = 3, bw = Math.min(22, (gw * 0.66 - gap * (series.length - 1)) / series.length);
  const y = (v) => padT + ih - (v / max) * ih;
  const labelStep = Math.max(1, Math.ceil(data.length / Math.max(3, Math.floor(iw / 52))));
  const s = [`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Bar chart">`];
  yAxis(s, { padL, width, padR, max, y, format });
  data.forEach((d, i) => {
    const gx = padL + gw * i + (gw - (bw * series.length + gap * (series.length - 1))) / 2;
    s.push(`<rect x="${padL + gw * i + 2}" y="${padT}" width="${gw - 4}" height="${ih}" fill="transparent" class="hov"/>`);
    d.values.forEach((v, j) => {
      const x = gx + j * (bw + gap), h = Math.max(1.5, (v / max) * ih), r = Math.min(4, bw / 2, h);
      const yy = y(v);
      s.push(`<path d="M${x} ${yy + h}V${yy + r}q0 -${r} ${r} -${r}h${bw - 2 * r}q${r} 0 ${r} ${r}V${yy + h}z" fill="${series[j].color}" data-tip="${esc(`${d.label} · ${series[j].name}: ${format(v)}`)}"/>`);
    });
    if (i % labelStep === 0 || i === data.length - 1) s.push(`<text x="${padL + gw * i + gw / 2}" y="${height - 9}" font-size="11.5" text-anchor="middle" fill="${TXT}">${esc(d.label)}</text>`);
  });
  return s.join('') + '</svg>';
}

/** Line/area chart. labels: […], series: [{name, color, values, dash?}] */
export function lineChart({ labels, series, height = 240, format = (v) => v, width = chartW(), area = true }) {
  const padL = 56, padR = 10, padT = 14, padB = 28;
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const ih = height - padT - padB, iw = width - padL - padR;
  const x = (i) => padL + (labels.length === 1 ? iw / 2 : (iw * i) / (labels.length - 1));
  const y = (v) => padT + ih - (v / max) * ih;
  const s = [`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Line chart"><defs>`];
  const ids = series.map((ser) => { const id = nid('g'); s.push(`<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${ser.color}" stop-opacity=".22"/><stop offset="1" stop-color="${ser.color}" stop-opacity="0"/></linearGradient>`); return id; });
  s.push('</defs>');
  yAxis(s, { padL, width, padR, max, y, format });
  const step = Math.ceil(labels.length / 7);
  labels.forEach((l, i) => { if (i % step === 0 || i === labels.length - 1) s.push(`<text x="${x(i)}" y="${height - 7}" font-size="11" text-anchor="middle" fill="${TXT}">${esc(l)}</text>`); });
  series.forEach((ser, k) => {
    const pts = ser.values.map((v, i) => [x(i), y(v)]);
    const d = smooth(pts);
    if (area && !ser.dash) s.push(`<path d="${d} L${pts[pts.length - 1][0]} ${y(0)} L${pts[0][0]} ${y(0)} Z" fill="url(#${ids[k]})"/>`);
    s.push(`<path d="${d}" fill="none" stroke="${ser.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" ${ser.dash ? 'stroke-dasharray="5 5"' : ''}/>`);
    pts.forEach(([px, py], i) => s.push(`<circle cx="${px}" cy="${py}" r="9" fill="transparent" data-tip="${esc(`${labels[i]} · ${ser.name}: ${format(ser.values[i])}`)}"/>`));
    const [lx, ly] = pts[pts.length - 1];
    s.push(`<circle cx="${lx}" cy="${ly}" r="3.5" fill="#fff" stroke="${ser.color}" stroke-width="2"/>`);
  });
  return s.join('') + '</svg>';
}
function smooth(pts) {
  if (pts.length < 3) return 'M' + pts.map((p) => p.join(' ')).join(' L');
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i - 1] || pts[i], [x1, y1] = pts[i], [x2, y2] = pts[i + 1], [x3, y3] = pts[i + 2] || pts[i + 1];
    const t = 0.18;
    const lo = Math.min(y1, y2), hi = Math.max(y1, y2), cl = (v) => Math.max(lo, Math.min(hi, v));
    d += ` C${x1 + (x2 - x0) * t} ${cl(y1 + (y2 - y0) * t)} ${x2 - (x3 - x1) * t} ${cl(y2 - (y3 - y1) * t)} ${x2} ${y2}`;
  }
  return d;
}

/** Tiny area sparkline for KPI cards. */
export function sparkline(values, { color = C.primary, width = 300, height = 46 } = {}) {
  if (!values || values.length < 2) return '';
  const max = Math.max(...values), min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(width * i) / (values.length - 1), 6 + (height - 10) * (1 - (v - min) / span)]);
  const id = nid('s');
  const d = smooth(pts);
  return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".18"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><path d="${d} L${width} ${height} L0 ${height} Z" fill="url(#${id})"/><path d="${d}" fill="none" stroke="${color}" stroke-width="1.75" vector-effect="non-scaling-stroke"/></svg>`;
}

/** Horizontal bars with optional target line. items: [{label, value, color}] */
export function hbar({ items, format = (v) => v, max, target, width = chartW(), rowH = 36 }) {
  const padL = width < 500 ? 96 : 118, padR = width < 500 ? 62 : 70;
  const m = max || niceMax(Math.max(1, ...items.map((i) => i.value)));
  const iw = width - padL - padR;
  const height = items.length * rowH + 14;
  const s = [`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Bar chart">`];
  items.forEach((it, i) => {
    const yy = i * rowH + 12, w = Math.max(3, (it.value / m) * iw), bh = 12;
    s.push(`<text x="${padL - 12}" y="${yy + bh / 2 + 4}" font-size="12.5" text-anchor="end" fill="#52525b">${esc(it.label)}</text>`);
    s.push(`<rect x="${padL}" y="${yy}" width="${iw}" height="${bh}" rx="6" fill="#f4f4f5"/>`);
    s.push(`<rect x="${padL}" y="${yy}" width="${w}" height="${bh}" rx="6" fill="${it.color || C.primary}" data-tip="${esc(`${it.label}: ${format(it.value)}`)}"/>`);
    s.push(`<text x="${padL + iw + 10}" y="${yy + bh / 2 + 4}" font-size="12.5" font-weight="600" fill="#18181b">${esc(format(it.value))}</text>`);
  });
  if (target) { const tx = padL + (target / m) * iw; s.push(`<line x1="${tx}" x2="${tx}" y1="4" y2="${height - 2}" stroke="#18181b" stroke-opacity=".35" stroke-dasharray="3 3"/><text x="${tx}" y="0" font-size="10.5" text-anchor="middle" fill="#71717a">target ${esc(format(target))}</text>`); }
  return s.join('') + '</svg>';
}

/** Donut. items: [{label, value, color}] */
export function donut({ items, size = 180, label = '', sub = '', format = (v) => v, thickness = 16 }) {
  const total = items.reduce((a, b) => a + b.value, 0) || 1;
  const r = size / 2 - thickness / 2 - 2, c = size / 2, circ = 2 * Math.PI * r;
  let off = 0;
  const gapLen = items.length > 1 ? 2.5 : 0;
  const s = [`<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Donut chart" style="max-width:100%">`, `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#f4f4f5" stroke-width="${thickness}"/>`];
  items.forEach((it) => {
    const len = Math.max(0, (it.value / total) * circ - gapLen);
    s.push(`<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${it.color}" stroke-width="${thickness}" stroke-dasharray="${len} ${circ - len}" stroke-dashoffset="${-off}" transform="rotate(-90 ${c} ${c})" data-tip="${esc(`${it.label}: ${format(it.value)} (${Math.round((it.value / total) * 100)}%)`)}"/>`);
    off += len + gapLen;
  });
  s.push(`<text x="${c}" y="${c + 2}" text-anchor="middle" font-size="18" font-weight="600" fill="#18181b" letter-spacing="-0.5">${esc(label)}</text><text x="${c}" y="${c + 20}" text-anchor="middle" font-size="11.5" fill="${TXT}">${esc(sub)}</text>`);
  return s.join('') + '</svg>';
}

export function legend(series) { return `<div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>`; }

/** Horizontal stacked bars (e.g. ageing per party). rows: [{label, sub?, parts:[{name, value, color}]}] */
export function stackedHbar({ rows, format = (v) => v, width = chartW(), rowH = 40 }) {
  const narrow = width < 500;
  const padL = narrow ? 112 : 170, padR = narrow ? 58 : 80;
  const iw = width - padL - padR;
  const max = niceMax(Math.max(1, ...rows.map((r) => r.parts.reduce((a, p) => a + p.value, 0))));
  const height = rows.length * rowH + 8;
  const s = [`<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Stacked bar chart">`];
  rows.forEach((r, i) => {
    const yy = i * rowH + 10, bh = 14;
    const lab = narrow && r.label.length > 16 ? r.label.slice(0, 15) + '…' : r.label;
    s.push(`<text x="${padL - 10}" y="${yy + bh / 2 + 4}" font-size="12" text-anchor="end" fill="#52525b">${esc(lab)}</text>`);
    s.push(`<rect x="${padL}" y="${yy}" width="${iw}" height="${bh}" rx="7" fill="#f4f4f5"/>`);
    let x = padL;
    const tot = r.parts.reduce((a, p) => a + p.value, 0);
    r.parts.forEach((p) => {
      if (p.value <= 0) return;
      const w = Math.max(2, (p.value / max) * iw);
      s.push(`<rect x="${x}" y="${yy}" width="${w}" height="${bh}" fill="${p.color}" data-tip="${esc(`${r.label} · ${p.name}: ${format(p.value)}`)}" class="sh-seg"/>`);
      x += w;
    });
    s.push(`<text x="${padL + iw + 8}" y="${yy + bh / 2 + 4}" font-size="12" font-weight="600" fill="#18181b">${esc(format(tot))}</text>`);
  });
  return s.join('') + '</svg>';
}

/** Solid pie (for cost structure). items: [{label, value, color}] */
export function pie({ items, size = 180, format = (v) => v }) {
  const total = items.reduce((a, b) => a + b.value, 0) || 1;
  const c = size / 2, r = size / 2 - 2;
  let a0 = -Math.PI / 2;
  const s = [`<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Pie chart" style="max-width:100%">`];
  items.forEach((it) => {
    const frac = it.value / total;
    if (frac <= 0) return;
    const a1 = a0 + frac * Math.PI * 2;
    const tip = esc(`${it.label}: ${format(it.value)} (${Math.round(frac * 100)}%)`);
    if (frac >= 0.9999) { s.push(`<circle cx="${c}" cy="${c}" r="${r}" fill="${it.color}" data-tip="${tip}"/>`); return; }
    const x0 = c + r * Math.cos(a0), y0 = c + r * Math.sin(a0), x1 = c + r * Math.cos(a1), y1 = c + r * Math.sin(a1);
    s.push(`<path d="M${c} ${c} L${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${frac > 0.5 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z" fill="${it.color}" stroke="#fff" stroke-width="1.5" data-tip="${tip}" class="pie-seg"/>`);
    a0 = a1;
  });
  return s.join('') + '</svg>';
}
