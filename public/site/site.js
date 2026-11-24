// Raajply company site: smooth scroll, reveals, pinned scroll scenes, hover effects, sound.
import { speciesArt } from '/js/art.js';
import { sfx, setSound, soundOn, onSoundChange } from '/js/sound.js';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const range = (p, a, b) => clamp((p - a) / (b - a));
const ease = (t) => 1 - Math.pow(1 - t, 3);
const SOUND_DEFAULT = false; // site starts muted; visitors opt in

/* ------------------------------------------------------------------ */
/* Smooth (inertial) scrolling — desktop with a mouse only             */
/* ------------------------------------------------------------------ */
const smooth = { on: false, target: 0, current: 0, raf: 0 };
function initSmoothScroll() {
  if (reduce || !finePointer) return;
  smooth.on = true;
  document.documentElement.classList.add('lenis');
  smooth.target = smooth.current = window.scrollY;
  const max = () => document.documentElement.scrollHeight - innerHeight;
  addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.defaultPrevented) return;
    if (document.body.classList.contains('intro')) { e.preventDefault(); if (!RG.ready) RG.fast = true; return; }
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) return; // sideways swipe → native
    if (e.target.closest && e.target.closest('textarea, select, .tl-track.native')) return;
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaMode === 2 ? e.deltaY * innerHeight : e.deltaY;
    smooth.target = clamp(smooth.target + dy, 0, max());
    if (!smooth.raf) smooth.raf = requestAnimationFrame(step);
  }, { passive: false });
  // Keyboard, scrollbar drag, find-in-page: follow the native position.
  addEventListener('scroll', () => { if (!smooth.raf) smooth.target = smooth.current = window.scrollY; }, { passive: true });
  function step() {
    smooth.current = lerp(smooth.current, smooth.target, 0.1);
    if (Math.abs(smooth.target - smooth.current) < 0.4) smooth.current = smooth.target;
    window.scrollTo(0, smooth.current);
    smooth.raf = smooth.current === smooth.target ? 0 : requestAnimationFrame(step);
  }
}
function scrollToY(y) {
  if (smooth.on) {
    smooth.target = clamp(y, 0, document.documentElement.scrollHeight - innerHeight);
    if (!smooth.raf) smooth.raf = requestAnimationFrame(function s() { smooth.current = lerp(smooth.current, smooth.target, 0.08); if (Math.abs(smooth.target - smooth.current) < 0.4) smooth.current = smooth.target; window.scrollTo(0, smooth.current); smooth.raf = smooth.current === smooth.target ? 0 : requestAnimationFrame(s); });
  } else window.scrollTo({ top: y, behavior: reduce ? 'auto' : 'smooth' });
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const id = a.getAttribute('href').slice(1);
  const el = id ? document.getElementById(id) : null;
  if (!el && id !== 'top') return;
  e.preventDefault();
  closeMenu();
  scrollToY(id === 'top' ? 0 : el.getBoundingClientRect().top + window.scrollY - 70);
  history.replaceState(null, '', `#${id}`);
});

/* ------------------------------------------------------------------ */
/* Header: transparent → glass, hides on scroll down, light on paper   */
/* ------------------------------------------------------------------ */
const hdr = $('#hdr');
let lastY = 0;
const darkSections = () => $$('.rh, .marquee, .statement, .timeline, .contact, .ftr');
function updateHeader(y) {
  hdr.classList.toggle('scrolled', y > 30);
  const goingDown = y > lastY + 4, goingUp = y < lastY - 4;
  if (goingDown && y > 500 && !$('#mnav').classList.contains('open')) hdr.classList.add('hide');
  if (goingUp || y < 200) hdr.classList.remove('hide');
  lastY = y;
  const probe = 40;
  const onDark = darkSections().some((s) => { const r = s.getBoundingClientRect(); return r.top <= probe && r.bottom >= probe; });
  hdr.classList.toggle('light', !onDark);
  // active nav link
  let cur = '';
  for (const id of ['process', 'products', 'story', 'responsible', 'contact']) { const el = document.getElementById(id); if (el && el.getBoundingClientRect().top < innerHeight * 0.4) cur = id; }
  $$('.hdr-nav a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === `#${cur}`));
}
const burger = $('#burger'), mnav = $('#mnav');
function closeMenu() { mnav.classList.remove('open'); burger.setAttribute('aria-expanded', 'false'); }
burger.addEventListener('click', () => { const open = !mnav.classList.contains('open'); mnav.classList.toggle('open', open); burger.setAttribute('aria-expanded', String(open)); hdr.classList.remove('hide'); sfx(open ? 'open' : 'close', false, SOUND_DEFAULT); });

/* ------------------------------------------------------------------ */
/* Reveal on scroll + count-up + rings                                 */
/* ------------------------------------------------------------------ */
const fmtLakh = (n) => (n >= 100000 ? `${(n / 100000).toFixed(1)} L` : Math.round(n).toLocaleString('en-IN'));
function countUp(el) {
  const to = Number(el.dataset.count), plain = 'plain' in el.dataset, lakh = el.dataset.format === 'lakh';
  const from = plain ? Math.round(to * 0.96) : 0;
  const dur = 1600, t0 = performance.now();
  const tick = (t) => {
    const k = ease(clamp((t - t0) / dur));
    const v = from + (to - from) * k;
    el.textContent = lakh ? fmtLakh(v) : plain ? String(Math.round(v)) : Math.round(v).toLocaleString('en-IN');
    if (k < 1) requestAnimationFrame(tick);
  };
  if (reduce) { el.textContent = lakh ? fmtLakh(to) : plain ? String(to) : to.toLocaleString('en-IN'); return; }
  requestAnimationFrame(tick);
}
const io = new IntersectionObserver((entries) => {
  for (const en of entries) {
    if (!en.isIntersecting) continue;
    const el = en.target;
    el.classList.add('in');
    $$('[data-count]', el).forEach((c) => { if (!c.dataset.done) { c.dataset.done = 1; countUp(c); } });
    if (el.dataset.count && !el.dataset.done) { el.dataset.done = 1; countUp(el); }
    const ring = $('[data-ring]', el);
    if (ring) { const fg = $('circle.fg', ring); fg.style.strokeDashoffset = String(326.7 * (1 - Number(ring.dataset.ring) / 100)); }
    io.unobserve(el);
  }
}, { threshold: 0.18, rootMargin: '0px 0px -6% 0px' });


/* ------------------------------------------------------------------ */
/* HERO — ring of woods                                                */
/* Loader counts 000→100 while cards spiral in as a tilted ring; then  */
/* the forest fades in and the camera flies through the ring so the    */
/* visitor stands inside it. Drag / tap to turn; scrolling flies out.  */
/* ------------------------------------------------------------------ */
const WOODS = [
  ['teak', 'Teak', 'Tectona grandis', 'India · Myanmar'], ['pine', 'Pine', 'Pinus spp.', 'Canada · USA'], ['oak', 'White Oak', 'Quercus alba', 'USA · Europe'],
  ['walnut', 'Walnut', 'Juglans nigra', 'USA'], ['mahogany', 'Mahogany', 'Swietenia macrophylla', 'Central America'], ['gurjan', 'Gurjan', 'Dipterocarpus spp.', 'South-East Asia'],
  ['rosewood', 'Rosewood', 'Dalbergia latifolia', 'India'], ['maple', 'Maple', 'Acer saccharum', 'Canada'], ['wenge', 'Wenge', 'Millettia laurentii', 'Congo'],
  ['okoume', 'Okoumé', 'Aucoumea klaineana', 'Gabon'], ['bamboo', 'Bamboo', 'Bambusa spp.', 'Asia'], ['cherry', 'Cherry', 'Prunus serotina', 'USA'],
  ['birch', 'Birch', 'Betula pendula', 'Finland · Russia'], ['sal', 'Sal', 'Shorea robusta', 'India'], ['ash', 'Ash', 'Fraxinus excelsior', 'Europe'],
  ['sapele', 'Sapele', 'Entandrophragma cylindricum', 'West Africa'], ['poplar', 'Poplar', 'Populus deltoides', 'India · USA'], ['cedar', 'Cedar', 'Cedrus deodara', 'Himalaya'],
  ['eucalyptus', 'Eucalyptus', 'Eucalyptus spp.', 'India · Australia'], ['beech', 'Beech', 'Fagus sylvatica', 'Europe'], ['charred', 'Charred Cedar', 'Shou sugi ban', 'Japan'],
  ['silveroak', 'Silver Oak', 'Grevillea robusta', 'Karnataka'],
];
const RG = { N: WOODS.length, R: 800, P: 1000, cw: 200, ch: 266, rot: 0, vel: 0, target: null, count: 0, loadFrac: 0, t0: 0, zoomAt: 0, zoomMs: 2300, ready: false, front: -1, drag: null, last: 0, fast: false };
const D2R = Math.PI / 180;
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function ringLayout() {
  const stage = $('#rhStage'); if (!stage) return;
  const m = innerWidth < 700;
  RG.cw = m ? 112 : clamp(Math.min(innerWidth * 0.125, innerHeight * 0.21), 140, 210); RG.ch = Math.round(RG.cw * 4 / 3);
  RG.R = (RG.N * RG.cw * 1.13) / (2 * Math.PI);
  RG.P = RG.R * (m ? 1.05 : 1.2);
  RG.ry = m ? 57 : 64;
  const rh = $('.rh');
  rh.style.setProperty('--rp', `${RG.P}px`); rh.style.setProperty('--ry', `${RG.ry}%`);
  rh.style.setProperty('--cw', `${RG.cw}px`); rh.style.setProperty('--ch', `${RG.ch}px`);
  rh.style.setProperty('--hint', `${(RG.ch * RG.P / RG.R) / 2 + 26}px`);
}
function initRing() {
  const cam = $('#rhCam'); if (!cam) return;
  cam.innerHTML = WOODS.map(([k, n, bot, org], i) => `<div class="rh-card" data-i="${i}"><div class="b"><img src="/img/woods/wood-${k}.jpg" alt=""></div><div class="f"><img src="/img/woods/wood-${k}.jpg" alt="${n} wood"><span class="gl"></span><span class="cap"><b>${n}</b></span></div></div>`).join('');
  RG.cards = $$('.rh-card', cam).map((el, i) => ({ el, a: (i * 360) / RG.N, appear: null }));
  ringLayout();
  addEventListener('resize', ringLayout);
  // real loading progress: card images + background
  const srcs = [...WOODS.map(([k]) => `/img/woods/wood-${k}.jpg`), $('#rhBg img').currentSrc || '/img/woods/forest-bg.jpg'];
  let done = 0;
  srcs.forEach((src) => { const im = new Image(); im.onload = im.onerror = () => { done++; RG.loadFrac = done / srcs.length; }; im.src = src; });
  setTimeout(() => { RG.loadFrac = 1; }, 7000);
  RG.t0 = performance.now(); RG.last = RG.t0;
  // skip the intro: deep link, reduced motion, or a click / key while loading
  if (reduce || (location.hash && location.hash !== '#top')) RG.fast = true;
  const skip = () => { if (!RG.ready) RG.fast = true; };
  addEventListener('keydown', skip, { once: true });
  $('.rh').addEventListener('click', skip);
  // drag to turn, tap a card to bring it to the front
  const stage = $('#rhStage');
  stage.addEventListener('pointerdown', (e) => { if (!RG.ready) return; RG.drag = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false, id: e.pointerId }; });
  addEventListener('pointermove', (e) => {
    const d = RG.drag; if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x, now = performance.now();
    if (!d.moved && Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(e.clientY - d.y)) { d.moved = true; stage.classList.add('drag'); $('.rh').classList.add('dragged'); try { stage.setPointerCapture(d.id); } catch {} }
    if (!d.moved) return;
    const deg = (-dx / RG.P) / D2R;
    RG.rot += deg; RG.vel = deg / Math.max(8, now - d.t); RG.target = null;
    d.x = e.clientX; d.t = now;
  });
  const end = (e) => {
    const d = RG.drag; if (!d) return; RG.drag = null; stage.classList.remove('drag');
    if (!d.moved) { const c = e.target.closest && e.target.closest('.rh-card'); if (c) { focusCard(Number(c.dataset.i)); sfx('tap', false, SOUND_DEFAULT); } }
  };
  addEventListener('pointerup', end); addEventListener('pointercancel', end);
  $$('.rh-card', cam).forEach((c) => c.addEventListener('mouseenter', () => { if (RG.ready) sfx('hover', false, SOUND_DEFAULT); }));
}
function focusCard(i) {
  const a = RG.cards[i].a;
  let t = -a; while (t - RG.rot > 180) t -= 360; while (t - RG.rot < -180) t += 360;
  RG.target = t; RG.vel = 0;
}
function ringFrame(now) {
  const rh = $('.rh'); if (!rh || !RG.cards) return;
  const dt = Math.min(64, now - RG.last); RG.last = now;
  const sY = scrollY / innerHeight;
  if (sY > 1.3 && RG.ready) return; // off screen
  // 1) loading counter
  const LOAD = RG.fast ? 500 : 2600;
  if (!RG.zoomAt) {
    const tp = clamp((now - RG.t0) / LOAD);
    RG.count = Math.max(RG.count, Math.min(easeIO(tp), RG.fast ? 1 : RG.loadFrac));
    $('#rlCount').textContent = String(Math.floor(RG.count * 100)).padStart(3, '0');
    if (RG.count >= 1) { RG.zoomAt = now; RG.zoomMs = RG.fast ? 900 : 2300; rh.classList.add('open'); sfx('whoosh', false, SOUND_DEFAULT); }
  }
  const z = RG.zoomAt ? easeIO(clamp((now - RG.zoomAt) / RG.zoomMs)) : 0;
  if (z > 0.55 && document.body.classList.contains('intro')) document.body.classList.remove('intro');
  if (z >= 1 && !RG.ready) { RG.ready = true; rh.classList.add('ready'); }
  // 2) rotation: fast spin while loading, slow drift after, plus drag inertia
  const spin = lerp(0.032, reduce ? 0 : 0.0045, z);
  if (RG.target !== null && !RG.drag) { RG.rot = lerp(RG.rot, RG.target, 0.09); if (Math.abs(RG.target - RG.rot) < 0.05) RG.target = null; }
  else if (!RG.drag) { RG.rot += (spin + RG.vel) * dt; RG.vel *= Math.pow(0.94, dt / 16); }
  // 3) camera: far, tilted ring → inside the ring; scrolling pulls back out
  const R = RG.R, P = RG.P, m = innerWidth < 700;
  const ex = RG.ready ? ease(clamp(sY)) : 0;
  const D = lerp(R * (m ? 3.9 : 3.3), 0, z) + ex * R * 1.9;
  const tx = lerp(-24, -1.5, z) - ex * 16, tz = lerp(m ? -8 : -13, 0, z) + ex * 4;
  const x = lerp(m ? 0 : innerWidth * 0.14, 0, z), yOff = lerp(m ? -innerHeight * 0.06 : -innerHeight * 0.08, 0, z) + ex * innerHeight * 0.1;
  $('#rhCam').style.transform = `translate3d(${x}px, ${yOff}px, ${P - D}px) rotateX(${tx}deg) rotateZ(${tz}deg) rotateY(${RG.rot}deg)`;
  // 4) cards: fly in one by one as the counter rises; helix flattens into a ring
  const H = RG.ch * 1.7 * (1 - z);
  const ctx = Math.cos(tx * D2R), stx = Math.sin(tx * D2R), ctz = Math.cos(tz * D2R), stz = Math.sin(tz * D2R);
  const near = R * 0.2;
  let best = 1e9, bi = 0;
  RG.cards.forEach((c, i) => {
    if (c.appear === null && RG.count >= i / RG.N) c.appear = now;
    const k = c.appear === null ? 0 : ease(clamp((now - c.appear) / (RG.fast ? 300 : 750)));
    const hy = (i / (RG.N - 1) - 0.5) * H;
    const th = (c.a + RG.rot) * D2R;
    // where the card ends up relative to the viewer (to hide cards behind / beside the camera)
    const px = -R * Math.sin(th), pz = -R * Math.cos(th);
    const y1 = px * stz + hy * ctz;
    const z2 = y1 * stx + pz * ctx;
    const dz = z2 - D;
    const vis = clamp((-dz - near) / (R * 0.18));
    const o = k * vis;
    c.el.style.opacity = o.toFixed(3);
    c.el.style.visibility = o < 0.01 ? 'hidden' : 'visible';
    if (o >= 0.01) c.el.style.transform = `rotateY(${c.a}deg) translateZ(${-R - (1 - k) * 380}px) translateY(${hy - (1 - k) * 140}px) rotateZ(${(1 - k) * 18}deg)`;
    let n = ((c.a + RG.rot) % 360 + 540) % 360 - 180; n = Math.abs(n);
    if (n < best) { best = n; bi = i; }
  });
  if (bi !== RG.front && RG.ready) {
    if (RG.front >= 0) RG.cards[RG.front].el.classList.remove('on');
    RG.cards[bi].el.classList.add('on');
    RG.front = bi;
    const [, n, bot, org] = WOODS[bi]; const lab = $('#rhLabel');
    lab.classList.add('swap');
    setTimeout(() => { $('#rlNum').textContent = `${String(bi + 1).padStart(2, '0')} / ${RG.N}`; $('#rlName').textContent = n; lab.classList.remove('swap'); }, 180);
  }
  // 5) copy drifts up and fades as you scroll out
  if (RG.ready) { const cp = $('#rhCopy'); cp.style.opacity = String(1 - clamp(sY * 1.8)); cp.style.transform = `translate(-50%, ${-sY * 80}px)`; $('#rhBottom').style.opacity = String(1 - clamp(sY * 2.2)); }
}

/* ------------------------------------------------------------------ */
/* Species marquee — speed reacts to scroll velocity                   */
/* ------------------------------------------------------------------ */
const SPECIES = [
  { id: 'MR', name: 'Commercial MR', bot: 'interiors & furniture', color: '#d9b77e' }, { id: 'BWR', name: 'BWR', bot: 'kitchens & wet areas', color: '#c49a6c' },
  { id: 'BWP', name: 'BWP Marine', bot: 'boiling-water-proof', color: '#a87a4c' }, { id: 'TK', name: 'Teak decorative', bot: 'farm-grown teak face', color: '#9a6436' },
  { id: 'SH', name: 'Shuttering', bot: 'film-faced, for concrete', color: '#5b4a3a' }, { id: 'BB', name: 'Block board', bot: 'doors & shelves', color: '#e2cda4' },
  { id: 'PINE', name: 'Pine', bot: 'Canada · Vietnam · USA', color: '#e0c38f' }, { id: 'TEAK', name: 'Teak', bot: 'Karnataka farmers', color: '#8a5a30' },
];
const mq = { x: 0, v: 0, w: 1 };
function initMarquee() {
  const track = $('#mqTrack');
  const items = SPECIES.map((s) => `<span class="mq-item"><span class="sw">${speciesArt(s)}</span>${s.name} <small>${s.bot}</small></span>`).join('');
  track.innerHTML = items + items + items;
  mq.w = track.scrollWidth / 3;
}

/* ------------------------------------------------------------------ */
/* Process story — scenes drawn in SVG                                  */
/* ------------------------------------------------------------------ */
const STEPS = [
  { t: 'Logs from farms & abroad', s: 'Teak and pine', p: 'Teak from local farmers; pine from Canada, Vietnam and the USA.', l: ['Cutting permit for every farm load', 'Bill of entry for every container', 'Fair, posted rates per CFT'], badge: ['3', 'countries we import from'] },
  { t: 'Measured & numbered', s: 'Our Magadi log yard', p: 'Girth × length in CFT — and a number on every log.', l: ['Volume by the Hoppus rule', 'Printed number tag on every log', 'Oldest logs peeled first'], badge: ['12.0', 'CFT · 48″ × 12 ft'] },
  { t: 'Peeled into veneer', s: 'Rotary peeling lathe', p: 'A sharp knife turns each log into thin veneer.', l: ['Recovery measured for every batch', 'Knife checked every shift', 'Peeler cores sold, not burnt'], badge: ['75%', 'of each log becomes veneer'] },
  { t: 'Glued, pressed & finished', s: 'Hot press & finishing line', p: 'Glued cross-grain, hot-pressed, trimmed and sanded.', l: ['Glue used is recorded per batch', 'Sheets counted every day', 'Godown stock checked twice a week'], badge: ['280', 'sheets a day'] },
  { t: 'Delivered in our trucks', s: 'Across Karnataka', p: 'Our own trucks, with GST invoice and e-way bill.', l: ['Mixed loads in one truck', 'GST e-invoice & e-way bill', 'Delivery confirmed on arrival'], badge: ['3', 'own trucks'] },
];
const PH = (id, w) => `/img/photos/${id}${w <= 900 ? '-900' : ''}.jpg`;
const SCENES = ["1571035089306-e40c9289fe78", "1699654042069-10ffbfe12f01", "1700973408133-b45276ec8feb", "1690768162439-7ca7a1813038", "1745209981800-a12d7d352b63"];
function scene(i) {
  const id = SCENES[i];
  return `<img src="${PH(id, 1000)}" srcset="${PH(id, 900)} 900w, ${PH(id, 1800)} 1800w" sizes="(max-width:900px) 90vw, 36vw" alt="${STEPS[i].t}" loading="lazy" decoding="async">`;
}
function initStory() {
  const idx = $('#storyIdx'), card = $('#storyCard'), copy = $('#storyCopy'), stack = $('#storyStack');
  idx.innerHTML = STEPS.map((s, i) => `<li><button type="button" data-i="${i}"><span>0${i + 1}</span>${s.t}</button></li>`).join('');
  card.innerHTML = STEPS.map((s, i) => `<div class="story-scene" data-i="${i}">${scene(i)}<div class="story-badge"><b>${s.badge[0]}</b><span>${s.badge[1]}</span></div></div>`).join('');
  copy.innerHTML = STEPS.map((s, i) => `<article data-i="${i}"><span class="n">0${i + 1} — ${s.s}</span><h3>${s.t}</h3><p>${s.p}</p></article>`).join('');
  stack.innerHTML = STEPS.map((s, i) => `<div class="ss" data-reveal><div class="story-card"><div class="story-scene">${scene(i)}<div class="story-badge"><b>${s.badge[0]}</b><span>${s.badge[1]}</span></div></div></div><div><span class="n">0${i + 1} — ${s.s}</span><h3>${s.t}</h3><p>${s.p}</p></div></div>`).join('');
  idx.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const pin = $('#story-pin'); const top = pin.getBoundingClientRect().top + scrollY; const travel = pin.offsetHeight - innerHeight;
    scrollToY(top + ((Number(b.dataset.i) + 0.5) / STEPS.length) * travel);
    sfx('tap', false, SOUND_DEFAULT);
  });
  $('#story-pin').style.height = `${STEPS.length * 80 + 30}vh`;
  setStep(0);
}
let curStep = -1;
function setStep(n) {
  if (n === curStep) return;
  curStep = n;
  $$('#storyCard .story-scene').forEach((el) => el.classList.toggle('on', Number(el.dataset.i) === n));
  $$('#storyCopy article').forEach((el) => el.classList.toggle('on', Number(el.dataset.i) === n));
  $$('#storyIdx button').forEach((el) => { if (Number(el.dataset.i) !== n) el.removeAttribute('aria-current'); else el.setAttribute('aria-current', 'step'); });
  sfx('hover', false, SOUND_DEFAULT);
}

/* ------------------------------------------------------------------ */
/* Products                                                            */
/* ------------------------------------------------------------------ */
const PIMG = ["1690768162439-7ca7a1813038", "1702195789139-4897ff9b0083", "1681752972950-6229ca099fbc", "1667689815944-9f72c0f59e74", "1704742950992-9815a104820c", "1700973408133-b45276ec8feb"];
// No prices on the website — the rate list is shared with distributors directly.
const PRODUCTS = [
  { f: 'interior', tag: 'Best seller', name: 'Commercial MR plywood', meta: 'IS 303 · pine core · 4–18 mm', spec: [['Thickness', '4, 6, 9, 12, 18 mm'], ['Sizes', '8×4 ft, 7×4 ft'], ['Glue', 'Urea formaldehyde (MR)'], ['Best for', 'Wardrobes, furniture, interiors']] },
  { f: 'water', tag: 'IS 303 BWR', name: 'BWR plywood', meta: 'Boiling-water-resistant · 12 & 18 mm', spec: [['Thickness', '12, 18 mm'], ['Size', '8×4 ft'], ['Glue', 'Phenol-fortified'], ['Best for', 'Kitchens, utility areas']] },
  { f: 'water', tag: 'IS 710', name: 'BWP marine plywood', meta: 'Boiling-water-proof · 12–19 mm', spec: [['Thickness', '12, 18, 19 mm'], ['Glue', 'Phenol formaldehyde'], ['Test', '72-hour boiling water'], ['Best for', 'Bathrooms, kitchens, coastal homes']] },
  { f: 'special', tag: 'Farm-grown teak', name: 'Teak decorative plywood', meta: 'Real teak face · 4 & 6 mm', spec: [['Thickness', '4, 6 mm'], ['Face', 'Sliced teak veneer'], ['Finish', 'Sanded, ready to polish'], ['Best for', 'Doors, panelling, furniture']] },
  { f: 'special', tag: 'For builders', name: 'Shuttering plywood', meta: 'Film-faced · 12 & 18 mm', spec: [['Thickness', '12, 18 mm'], ['Face', 'Phenolic film, both sides'], ['Re-use', 'Many pours with care'], ['Best for', 'Concrete formwork']] },
  { f: 'interior', tag: 'Lightweight', name: 'Block board', meta: 'Solid core · 19 mm', spec: [['Thickness', '19 mm'], ['Core', 'Seasoned softwood battens'], ['Size', '8×4 ft'], ['Best for', 'Doors, shelves, tables']] },
];
function initProducts() {
  const grid = $('#pgrid');
  grid.innerHTML = PRODUCTS.map((p, i) => `<article class="pcard" data-f="${p.f}" data-reveal style="--d:${(i % 3) * 0.08}s" tabindex="0" aria-label="${p.name}">
    <div class="pimg"><span class="tag">${p.tag}</span><img src="${PH(PIMG[i], 900)}" srcset="${PH(PIMG[i], 900)} 900w, ${PH(PIMG[i], 1800)} 1800w" sizes="(max-width:700px) 92vw, 30vw" alt="${p.name}" loading="lazy" decoding="async"></div>
    <div class="pbody"><h3>${p.name}</h3><div class="pmeta">${p.meta}</div>
      <div class="pspec"><div><dl>${p.spec.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}<dt>Rates</dt><dd>On request for distributors</dd></dl></div></div>
      <span class="pmore">Specifications <i>+</i></span></div></article>`).join('');
  $$('.pcard', grid).forEach((c) => {
    c.addEventListener('click', () => { if (!finePointer) { c.classList.toggle('open'); sfx('tap', false, SOUND_DEFAULT); } });
    c.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); c.classList.toggle('open'); } });
    if (finePointer && !reduce) {
      c.addEventListener('mouseenter', () => sfx('hover', false, SOUND_DEFAULT));
      c.addEventListener('mousemove', (e) => {
        const r = c.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        c.style.transform = `perspective(900px) rotateX(${(0.5 - y) * 6}deg) rotateY(${(x - 0.5) * 8}deg) translateY(-6px)`;
        c.style.setProperty('--mx', `${x * 100}%`); c.style.setProperty('--my', `${y * 100}%`);
      });
      c.addEventListener('mouseleave', () => { c.style.transform = ''; });
    }
  });
  $('#filters').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    $$('#filters button').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', String(x === b)); });
    const f = b.dataset.f;
    $$('.pcard', grid).forEach((c) => {
      const show = f === 'all' || c.dataset.f === f;
      if (show && c.classList.contains('hide')) { c.classList.remove('hide'); c.animate([{ opacity: 0, transform: 'translateY(16px) scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 500, easing: 'cubic-bezier(.16,1,.3,1)' }); } else if (!show) c.classList.add('hide');
    });
    sfx('tap', false, SOUND_DEFAULT);
  });
}

/* ------------------------------------------------------------------ */
/* Magnetic buttons                                                    */
/* ------------------------------------------------------------------ */
function initMagnetic() {
  if (!finePointer || reduce) return;
  $$('[data-magnetic]').forEach((b) => {
    b.addEventListener('mousemove', (e) => { const r = b.getBoundingClientRect(); b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.18}px, ${(e.clientY - r.top - r.height / 2) * 0.28}px)`; });
    b.addEventListener('mouseleave', () => { b.style.transform = ''; });
    b.addEventListener('mouseenter', () => sfx('hover', false, SOUND_DEFAULT));
  });
}

/* ------------------------------------------------------------------ */
/* Per-frame scroll scenes                                             */
/* ------------------------------------------------------------------ */
const pinProgress = (el) => { const r = el.getBoundingClientRect(); const travel = el.offsetHeight - innerHeight; return travel > 0 ? clamp(-r.top / travel) : 0; };
let lastScroll = scrollY, lastT = performance.now();
const desktop = () => innerWidth > 820;
function frame(t) {
  const y = scrollY;
  const dt = Math.max(1, t - lastT);
  const vel = (y - lastScroll) / dt; // px per ms
  lastScroll = y; lastT = t;
  updateHeader(y);
  ringFrame(t);
  if (!reduce) {
    // marquee: base speed + scroll velocity boost
    mq.v = lerp(mq.v, 0.05 + Math.min(2.5, Math.abs(vel)) * 0.9, 0.08);
    mq.x = (mq.x - mq.v * dt) % mq.w;
    const track = $('#mqTrack'); if (track) track.style.transform = `translate3d(${mq.x}px,0,0)`;
    // statement: window closes in, old card slides away, lines swap
    const st = $('#statement');
    if (st && desktop()) {
      const p = pinProgress(st);
      const c = ease(range(p, 0.04, 0.42));
      const left = lerp(27, 33, c), right = lerp(0, 33, c);
      $('#stWin').style.clipPath = `inset(0% ${right}% 0% ${left}% round 26px)`;
      $('#stImg').style.transform = `scale(${lerp(1.2, 1, p)})`;
      $('#stLines').style.transform = `translateX(${lerp(13.5, 0, c)}%)`;
      const old = $('#stOld'); old.style.opacity = String(1 - range(p, 0.04, 0.3)); old.style.transform = `translateX(${-70 * range(p, 0.04, 0.3)}px)`;
      const W = [[0, 0, 0.54, 0.6], [0.6, 0.65, 0.77, 0.82], [0.82, 0.87, 1, 1]];
      $$('.st-line').forEach((ln, i) => {
        const [a, b, cc, d] = W[i]; const first = b === 0, last = cc === 1;
        let o, ty;
        if (p < b) { const k = first ? 1 : range(p, a, b); o = k; ty = (1 - k) * 18; } else if (p <= cc) { o = 1; ty = 0; } else { const k = last ? 0 : range(p, cc, d); o = 1 - k; ty = -18 * k; }
        ln.style.opacity = String(o); ln.style.transform = `translateY(${ty}px)`;
      });
    }
    // timeline: vertical scroll → horizontal track
    const tl = $('#story');
    if (tl && desktop()) {
      const p = pinProgress(tl); const track = $('#tlTrack');
      const max = track.scrollWidth - innerWidth;
      track.style.transform = `translate3d(${-max * ease(p)}px,0,0)`;
      $('#tlBar').style.width = `${p * 100}%`;
    }
  }
  // process story step
  const pin = $('#story-pin');
  if (pin && desktop()) {
    const p = pinProgress(pin);
    setStep(Math.min(STEPS.length - 1, Math.floor(p * STEPS.length)));
    $('#storyIdx').style.setProperty('--prog', `${p * 100}%`);
  }
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ */
/* Enquiry form                                                        */
/* ------------------------------------------------------------------ */
function initForm() {
  const f = $('#enqForm'), msg = $('#enqMsg');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.className = 'form-msg'; msg.textContent = '';
    const d = Object.fromEntries(new FormData(f).entries());
    const missing = ['name', 'business', 'city', 'phone'].filter((k) => !String(d[k] || '').trim());
    if (missing.length) { msg.className = 'form-msg err'; msg.textContent = 'Please fill in your name, business, city and phone.'; f.querySelector(`[name=${missing[0]}]`).focus(); sfx('error', false, SOUND_DEFAULT); return; }
    if (!/^[+\d][\d\s-]{8,15}$/.test(d.phone.trim())) { msg.className = 'form-msg err'; msg.textContent = 'Please enter a valid phone number.'; sfx('error', false, SOUND_DEFAULT); return; }
    const btn = f.querySelector('button[type=submit]'); btn.disabled = true; btn.firstChild.textContent = 'Sending… ';
    try {
      const r = await fetch('/api/public/enquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not send right now');
      f.classList.add('sent');
      f.innerHTML = `<div class="sent-ic">✓</div><h3>Thank you, ${d.name.split(' ')[0].replace(/[<>&"']/g, '')}.</h3><p style="color:var(--muted);max-width:34ch;margin:0">Your enquiry reference is <b>${String(j.ref || '').replace(/[<>&"']/g, '')}</b>. Our sales team will call you within one working day.</p>`;
      sfx('success', false, SOUND_DEFAULT);
    } catch (err) { msg.className = 'form-msg err'; msg.textContent = err.message; btn.disabled = false; btn.firstChild.textContent = 'Send enquiry '; sfx('error', false, SOUND_DEFAULT); }
  });
}

/* ------------------------------------------------------------------ */
/* Sound toggle                                                        */
/* ------------------------------------------------------------------ */
function initSound() {
  const b = $('#sndBtn');
  const paint = (on) => { b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', on ? 'Turn sound off' : 'Turn sound on'); };
  paint(soundOn(SOUND_DEFAULT));
  b.addEventListener('click', () => setSound(!soundOn(SOUND_DEFAULT)));
  onSoundChange(paint);
  document.addEventListener('click', (e) => { if (e.target.closest('.hdr-nav a, .mnav a, .btn, .filters button')) sfx('tap', false, SOUND_DEFAULT); });
  $$('.hdr-nav a').forEach((a) => a.addEventListener('mouseenter', () => sfx('hover', false, SOUND_DEFAULT)));
}

/* ------------------------------------------------------------------ */
initMarquee();
initStory();
initProducts();
initMagnetic();
initForm();
initSound();
initRing();
initSmoothScroll();
$$('[data-reveal]').forEach((el) => io.observe(el));
$('#yr').textContent = new Date().getFullYear();
addEventListener('resize', () => { mq.w = $('#mqTrack').scrollWidth / 3; });
requestAnimationFrame(frame);

// Staff login pill: light follows the pointer
(() => {
  const b = document.querySelector('.staff-btn');
  if (!b) return;
  b.addEventListener('pointermove', (e) => { const r = b.getBoundingClientRect(); b.style.setProperty('--x', `${e.clientX - r.left}px`); b.style.setProperty('--y', `${e.clientY - r.top}px`); });
})();
