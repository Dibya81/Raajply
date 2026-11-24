// Sign-in transition: a plywood panel flies up to fill the screen, cracks spread along jagged seams,
// then it shatters into wooden shards that fly past the camera, revealing the app underneath.
// Usage: const s = woodSplit({ x, y }); await s.covered; …render app…; await s.burst();
import { sfx } from './sound.js';

const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
const rnd = (a, b) => a + Math.random() * (b - a);

export function woodSplit({ x = innerWidth / 2, y = innerHeight / 2, face = 'teak' } = {}) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const phone = innerWidth < 640;
  const cols = phone ? 3 : 5, rows = phone ? 5 : 4;
  // Shared, jittered vertex grid so neighbouring shards fit together seamlessly
  const V = [];
  for (let r = 0; r <= rows; r++) {
    V[r] = [];
    for (let c = 0; c <= cols; c++) {
      let vx = (c / cols) * 100 + rnd(-0.32, 0.32) * (100 / cols);
      let vy = (r / rows) * 100 + rnd(-0.32, 0.32) * (100 / rows);
      if (c === 0) vx = 0; if (c === cols) vx = 100;
      if (r === 0) vy = 0; if (r === rows) vy = 100;
      V[r][c] = [vx, vy];
    }
  }
  // Jagged midpoint on every edge, shared by the two shards that touch it
  const mids = {};
  const mid = (a, b, key, outer) => {
    if (mids[key]) return mids[key];
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const horiz = Math.abs(a[1] - b[1]) < Math.abs(a[0] - b[0]);
    if (outer) return (mids[key] = [mx, my]);
    const j = rnd(-1, 1) * (horiz ? 100 / rows : 100 / cols) * 0.18;
    return (mids[key] = horiz ? [mx + rnd(-4, 4), my + j] : [mx + j, my + rnd(-4, 4)]);
  };
  const shards = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const tl = V[r][c], tr = V[r][c + 1], br = V[r + 1][c + 1], bl = V[r + 1][c];
    const pts = [tl, mid(tl, tr, `h${r},${c}`, r === 0), tr, mid(tr, br, `v${r},${c + 1}`, c + 1 === cols), br, mid(bl, br, `h${r + 1},${c}`, r + 1 === rows), bl, mid(tl, bl, `v${r},${c}`, c === 0)];
    const cx = (tl[0] + tr[0] + br[0] + bl[0]) / 4, cy = (tl[1] + tr[1] + br[1] + bl[1]) / 4;
    shards.push({ pts, cx, cy });
  }

  const ov = document.createElement('div');
  ov.className = 'ws';
  ov.style.setProperty('--ox', `${x}px`); ov.style.setProperty('--oy', `${y}px`);
  ov.innerHTML = `<div class="ws-flash"></div><div class="ws-panel">
    ${shards.map((s, i) => `<div class="ws-shard" data-i="${i}" style="clip-path:polygon(${s.pts.map((p) => `${p[0].toFixed(2)}% ${p[1].toFixed(2)}%`).join(',')});transform-origin:${s.cx.toFixed(1)}% ${s.cy.toFixed(1)}%;background-image:radial-gradient(ellipse at 50% 45%, rgba(255,220,170,.10), rgba(30,16,6,.0) 45%, rgba(30,16,6,.55)), url(/img/woods/wood-${face}.jpg)"></div>`).join('')}
    <div class="ws-mark"><img src="/img/logo-mark.svg" alt=""><span>Raajply</span></div>
    <svg class="ws-cracks" viewBox="0 0 100 100" preserveAspectRatio="none">${shards.map((s) => `<polygon points="${s.pts.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ')}" pathLength="1"/>`).join('')}</svg>
  </div>`;
  document.body.appendChild(ov);

  const covered = (async () => {
    if (reduce) { ov.classList.add('in', 'crack'); return; }
    sfx('whoosh');
    await wait(30);
    ov.classList.add('in');            // the panel flies up from the plate to fill the screen
    await wait(560);
    ov.classList.add('crack');         // seams glow and spread
    sfx('woodCrack');
    await wait(420);
  })();

  async function burst() {
    await covered;
    if (reduce) { ov.classList.add('gone'); await wait(250); ov.remove(); return; }
    sfx('shatter');
    ov.classList.add('burst');
    const vw = innerWidth, vh = innerHeight;
    ov.querySelectorAll('.ws-shard').forEach((el) => {
      const s = shards[Number(el.dataset.i)];
      let dx = s.cx - 50, dy = s.cy - 50;
      const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
      const dist = rnd(0.55, 1.1);
      el.style.transitionDelay = `${Math.round(Math.min(160, len * 3.2) + rnd(0, 60))}ms`;
      el.style.transform = `translate3d(${dx * vw * dist}px, ${dy * vh * dist + rnd(80, 220)}px, ${rnd(250, 650)}px) rotateX(${rnd(-80, 80)}deg) rotateY(${rnd(-80, 80)}deg) rotateZ(${rnd(-50, 50)}deg)`;
      el.style.opacity = '0';
    });
    await wait(1200);
    ov.remove();
  }
  return { covered, burst, el: ov };
}
