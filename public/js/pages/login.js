// Demo sign-in: three glass role buttons over a living, warm scene with a real-texture 3D plywood stack.
import { api } from '../api.js';
import { html, raw, ic, toast } from '../ui.js';
import { startSession, rerender } from '../app.js';
import { sfx, soundOn, setSound } from '../sound.js';
import { woodSplit } from '../woodsplit.js';

const ROLES = [
  { role: 'owner', tone: 'md', icon: 'sparkle', title: 'Managing Director', sub: 'Whole company view', turn: -16 },
  { role: 'accounts', tone: 'acc', icon: 'receipt', title: 'Accounts', sub: 'Sales, GST & Tally', turn: 0 },
  { role: 'production', tone: 'prod', icon: 'factory', title: 'Production', sub: 'Logs to sheets', turn: 16 },
];
// Face veneers (real wood photographs), top sheet first
const FACES = ['teak', 'okoume', 'birch', 'pine', 'mahogany'];
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const sheet = (i, face) => `<div class="ply" style="--i:${i};--n:${FACES.length - 1 - i};--face:url(/img/woods/wood-${face}.jpg)"><i class="f top"></i><i class="f bottom"></i><i class="f front"></i><i class="f back"></i><i class="f right"></i><i class="f left"></i></div>`;
const dust = () => Array.from({ length: 16 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--d:${10 + (i % 5) * 2.6}s;--del:${-(i * 1.9)}s;--s:${1.5 + (i % 3) * 1.2}px;--z:${0.4 + (i % 4) * 0.35}"></i>`).join('');

export async function render(root) {
  root.innerHTML = String(html`
  <div class="lg2" data-state="idle">
    <div class="lg2-bg" aria-hidden="true">
      <img class="lg2-photo" src="/img/photos/1634672652995-ee7525bce595-900.jpg" alt="">
      <div class="lg2-grade"></div>
      <div class="lg2-aurora"><i class="a1"></i><i class="a2"></i><i class="a3"></i></div>
      <div class="lg2-rays"></div>
      <div class="lg2-scene"><div class="lg2-stage" id="stage"><div class="lg2-spin">
        <div class="lg2-floor"></div>
        ${raw(FACES.map((f, i) => sheet(i, f)).join(''))}
      </div></div></div>
      <div class="lg2-spot"></div>
      <div class="lg2-dust">${raw(dust())}</div>
      <div class="lg2-grain"></div>
      <div class="lg2-vig"></div>
    </div>
    <main class="lg2-fg">
      <header class="lg2-head">
        <div class="lg2-brand"><img src="/img/logo-mark.svg" alt="" width="30" height="30"><span>Raajply</span></div>
        <span class="lg2-chip"><i></i>Demo · no password</span>
      </header>
      <section class="lg2-panel">
        <div class="lg2-kicker">Plywood ERP · Magadi</div>
        <h1 class="lg2-h">Choose your desk</h1>
        <div class="lg2-roles" id="roles">
          ${ROLES.map((r, i) => html`
          <button type="button" class="lg2-btn tone-${r.tone}" data-role="${r.role}" data-tone="${r.tone}" data-turn="${r.turn}" style="--i:${i}">
            <span class="lb-sheen"></span>
            <span class="lb-ic">${ic(r.icon)}</span>
            <span class="lb-t"><b>${r.title}</b><small>${r.sub}</small></span>
            <span class="lb-go">${ic('arrowRight', 'sm')}<span class="lb-spin"></span></span>
          </button>`)}
        </div>
      </section>
      <footer class="lg2-foot">
        <a href="/">${ic('chevronLeft', 'sm')}Website</a>
        <button type="button" id="lpSound" aria-pressed="${soundOn()}" aria-label="Toggle sounds">${ic('bell', 'sm')}<span>${soundOn() ? 'Sound on' : 'Sound off'}</span></button>
      </footer>
    </main>
  </div>`);

  const lg = root.querySelector('.lg2');
  const stage = root.querySelector('#stage');
  const roles = root.querySelector('#roles');
  let busy = false;

  // Scene parallax + cursor spotlight (one rAF loop, eased)
  let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
  const loop = () => {
    cx += (tx - cx) * 0.07; cy += (ty - cy) * 0.07;
    stage.style.setProperty('--rx', `${(-cy * 6).toFixed(2)}deg`);
    stage.style.setProperty('--ry', `${(cx * 9).toFixed(2)}deg`);
    lg.style.setProperty('--px', cx.toFixed(3));
    lg.style.setProperty('--py', cy.toFixed(3));
    raf = Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001 ? requestAnimationFrame(loop) : 0;
  };
  const aim = (x, y) => { tx = Math.max(-1, Math.min(1, x)); ty = Math.max(-1, Math.min(1, y)); if (!raf && !reduce()) raf = requestAnimationFrame(loop); };
  const onMove = (e) => {
    lg.style.setProperty('--mx', `${e.clientX}px`);
    lg.style.setProperty('--my', `${e.clientY}px`);
    aim((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
  };
  const onTilt = (e) => { if (e.gamma != null) aim(e.gamma / 30, (e.beta - 45) / 30); };
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('deviceorientation', onTilt, { passive: true });
  const cleanup = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('deviceorientation', onTilt); cancelAnimationFrame(raf); };
  window.addEventListener('hashchange', cleanup, { once: true });

  // Glass buttons: pointer tilt, following specular sheen, magnetic arrow
  const focusRole = (b) => {
    if (busy) return;
    if (!b) { delete lg.dataset.tone; stage.style.setProperty('--turn', '0deg'); return; }
    if (lg.dataset.tone !== b.dataset.tone) sfx('hover');
    lg.dataset.tone = b.dataset.tone;
    stage.style.setProperty('--turn', `${b.dataset.turn}deg`);
  };
  roles.querySelectorAll('.lg2-btn').forEach((b) => {
    const move = (e) => {
      const r = b.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      b.style.setProperty('--sx', `${(x * 100).toFixed(1)}%`);
      b.style.setProperty('--sy', `${(y * 100).toFixed(1)}%`);
      if (!reduce()) {
        b.style.setProperty('--tiltX', `${((0.5 - y) * 9).toFixed(2)}deg`);
        b.style.setProperty('--tiltY', `${((x - 0.5) * 9).toFixed(2)}deg`);
        b.style.setProperty('--magX', `${((x - 0.5) * 10).toFixed(1)}px`);
        b.style.setProperty('--magY', `${((y - 0.5) * 8).toFixed(1)}px`);
      }
    };
    const reset = () => { ['--tiltX', '--tiltY', '--magX', '--magY'].forEach((k) => b.style.removeProperty(k)); b.classList.remove('hot'); };
    b.addEventListener('pointerenter', (e) => { b.classList.add('hot'); move(e); focusRole(b); });
    b.addEventListener('pointermove', move);
    b.addEventListener('pointerleave', reset);
    b.addEventListener('pointercancel', reset);
    b.addEventListener('focus', () => focusRole(b));
    b.addEventListener('pointerdown', (e) => {
      const r = b.getBoundingClientRect();
      const s = document.createElement('span');
      s.className = 'lb-ripple';
      s.style.left = `${e.clientX - r.left}px`; s.style.top = `${e.clientY - r.top}px`;
      b.appendChild(s); setTimeout(() => s.remove(), 700);
    });
  });
  roles.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') focusRole(null); });

  roles.addEventListener('click', async (e) => {
    const b = e.target.closest('.lg2-btn');
    if (!b || busy) return;
    focusRole(b);
    busy = true;
    sfx('select');
    b.classList.add('loading');
    roles.classList.add('busy');
    try {
      const [r] = await Promise.all([
        api('/api/auth/demo-login', { method: 'POST', body: { role: b.dataset.role } }),
        new Promise((ok) => setTimeout(ok, 320)),
      ]);
      lg.dataset.state = 'press';
      const br = b.getBoundingClientRect();
      const split = woodSplit({ x: br.left + br.width / 2, y: br.top + br.height / 2 });
      await Promise.all([split.covered, startSession(r.token)]);
      cleanup();
      location.hash = '#/dashboard';
      await rerender();                 // the dashboard is drawn underneath the wooden panel
      sfx('login');
      await split.burst();              // …and the panel shatters to reveal it
      toast(`Welcome, ${r.user.name} — you're in as ${r.user.roleName}`);
    } catch (ex) {
      busy = false;
      b.classList.remove('loading'); roles.classList.remove('busy');
      lg.dataset.state = 'idle';
      toast(ex.message, 'bad');
    }
  });

  root.querySelector('#lpSound').addEventListener('click', (e) => {
    const on = !soundOn(); setSound(on);
    e.currentTarget.setAttribute('aria-pressed', String(on));
    e.currentTarget.querySelector('span').textContent = on ? 'Sound on' : 'Sound off';
  });
}
