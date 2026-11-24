// Generated wood artwork: grain textures for products and species, log-end rings.
function rng(seed) { let a = 0; for (const c of String(seed)) a = (a * 31 + c.charCodeAt(0)) | 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  return `#${[f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Plank face with flowing grain. */
function plank(color, seed) {
  const r = rng(seed);
  let s = `<rect width="100" height="100" fill="${color}"/>`;
  for (let i = 0; i < 14; i++) {
    const y = i * 7.5 + r() * 4;
    const a = 3 + r() * 6, ph = r() * 6;
    let d = `M-5 ${y}`;
    for (let x = 0; x <= 110; x += 10) d += ` Q${x + 5} ${y + Math.sin(x / 18 + ph) * a} ${x + 10} ${y + Math.sin((x + 10) / 18 + ph) * a * 0.6}`;
    s += `<path d="${d}" fill="none" stroke="${shade(color, -0.12 - r() * 0.1)}" stroke-width="${0.6 + r() * 1.4}" opacity="${0.45 + r() * 0.4}"/>`;
  }
  if (r() > 0.3) { const cx = 20 + r() * 60, cy = 20 + r() * 60; s += `<ellipse cx="${cx}" cy="${cy}" rx="5" ry="3" fill="${shade(color, -0.25)}" opacity=".55"/><ellipse cx="${cx}" cy="${cy}" rx="9" ry="5.5" fill="none" stroke="${shade(color, -0.18)}" opacity=".45"/>`; }
  s += `<rect width="100" height="100" fill="url(#sheen)"/>`;
  return s;
}
/** Plywood edge (veneer layers) over a light face. */
function plywood(color, seed) {
  const r = rng(seed);
  let s = `<rect width="100" height="100" fill="${shade(color, 0.04)}"/>`;
  for (let i = 0; i < 9; i++) { const y = 8 + i * 6; s += `<path d="M-5 ${y} Q50 ${y + (r() - 0.5) * 6} 105 ${y}" fill="none" stroke="${shade(color, -0.12)}" stroke-width=".8" opacity=".5"/>`; }
  const layers = 7, top = 62;
  for (let i = 0; i < layers; i++) s += `<rect x="0" y="${top + i * 5.4}" width="100" height="5.4" fill="${i % 2 ? shade(color, -0.2) : shade(color, -0.05)}"/>`;
  s += `<rect x="0" y="${top - 1}" width="100" height="1.5" fill="${shade(color, -0.35)}" opacity=".5"/>`;
  return s;
}
/** Log end with growth rings. */
export function rings(color, seed, size = 100) {
  const r = rng(seed);
  const c = size / 2;
  let s = `<circle cx="${c}" cy="${c}" r="${c - 1}" fill="${shade(color, -0.32)}"/><circle cx="${c}" cy="${c}" r="${c - 6}" fill="${shade(color, 0.08)}"/>`;
  const n = 9;
  for (let i = 1; i <= n; i++) { const rr = (c - 6) * (i / n) * (0.96 + r() * 0.06); s += `<ellipse cx="${c + (r() - 0.5) * 2}" cy="${c + (r() - 0.5) * 2}" rx="${rr}" ry="${rr * (0.94 + r() * 0.08)}" fill="none" stroke="${shade(color, -0.14 - (i % 3) * 0.04)}" stroke-width="${0.8 + r()}" opacity=".8"/>`; }
  s += `<circle cx="${c}" cy="${c}" r="2.4" fill="${shade(color, -0.3)}"/>`;
  for (let i = 0; i < 3; i++) { const a = r() * Math.PI * 2; s += `<path d="M${c} ${c} L${c + Math.cos(a) * (c - 8)} ${c + Math.sin(a) * (c - 8)}" stroke="${shade(color, -0.25)}" stroke-width=".9" opacity=".6"/>`; }
  return s;
}
function chips(seed) {
  const r = rng(seed);
  let s = '<rect width="100" height="100" fill="#d9c09a"/>';
  for (let i = 0; i < 70; i++) s += `<rect x="${r() * 100}" y="${r() * 100}" width="${2 + r() * 6}" height="${1 + r() * 2}" rx="1" transform="rotate(${r() * 180} 50 50)" fill="${shade('#b98d5c', (r() - 0.5) * 0.3)}" opacity=".8"/>`;
  return s;
}

const DEFS = '<defs><linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".08"/></linearGradient></defs>';

/** Thumbnail SVG for a product. */
export function productArt(p, speciesColor) {
  const color = speciesColor || '#c49a6c';
  let body;
  if (p.unit === 'Sheet' || p.category === 'Plywood & boards') body = plywood(color, p.id);
  else if (p.category === 'By-products') body = chips(p.id);
  else body = plank(color, p.id);
  return `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${DEFS}${body}</svg>`;
}
export function speciesArt(s) { return `<svg viewBox="0 0 100 100" aria-hidden="true">${DEFS}${plank(s.color, s.id)}</svg>`; }
export function logArt(color, seed) { return `<svg viewBox="0 0 100 100" aria-hidden="true">${rings(color, seed)}</svg>`; }
