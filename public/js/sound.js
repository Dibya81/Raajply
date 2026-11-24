// Tiny synthesized UI sounds (Web Audio, no files). Soft, short and warm by design.
// Usage: import { sfx, setSound, soundOn } from '/js/sound.js'; sfx('success');
const KEY = 'raajply-sound';
let ctx = null;
let master = null;
let enabled = (() => { try { const v = localStorage.getItem(KEY); return v === null ? null : v === '1'; } catch { return null; } })();
const listeners = new Set();
const last = {};

export function soundOn(defaultOn = true) { return enabled === null ? defaultOn : enabled; }
export function setSound(on) { enabled = !!on; try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* ignore */ } listeners.forEach((f) => f(enabled)); if (on) sfx('toggle', true); }
export function onSoundChange(f) { listeners.add(f); return () => listeners.delete(f); }

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    // gentle master chain: compressor keeps overlapping sounds from clipping on phone speakers
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 4;
    master = ctx.createGain(); master.gain.value = 0.9;
    master.connect(comp).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
// Unlock audio on the first touch (iOS needs a gesture before any sound plays).
['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, () => { if (soundOn()) ac(); }, { once: true, passive: true }));

function tone(c, { f = 600, f2, t = 0, d = 0.08, type = 'sine', v = 0.05, attack = 0.004 }) {
  const o = c.createOscillator(), g = c.createGain();
  const now = c.currentTime + t;
  o.type = type;
  o.frequency.setValueAtTime(f, now);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, now + d);
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(v, now + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, now + d);
  o.connect(g).connect(master);
  o.start(now); o.stop(now + d + 0.02);
}
function noise(c, { t = 0, d = 0.12, v = 0.03, from = 1800, to = 400, q = 0.8 }) {
  const len = Math.floor(c.sampleRate * d);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource(), flt = c.createBiquadFilter(), g = c.createGain();
  const now = c.currentTime + t;
  flt.type = 'bandpass'; flt.Q.value = q;
  flt.frequency.setValueAtTime(from, now); flt.frequency.exponentialRampToValueAtTime(to, now + d);
  g.gain.setValueAtTime(v, now); g.gain.exponentialRampToValueAtTime(0.0001, now + d);
  src.buffer = buf; src.connect(flt).connect(g).connect(master);
  src.start(now);
}
/** Wooden "knock" — a short damped body resonance; fits a plywood company. */
function knock(c, { t = 0, f = 340, v = 0.07 }) {
  tone(c, { f, f2: f * 0.82, t, d: 0.09, type: 'sine', v, attack: 0.002 });
  tone(c, { f: f * 2.7, t, d: 0.035, type: 'triangle', v: v * 0.35, attack: 0.001 });
  noise(c, { t, d: 0.03, v: v * 0.25, from: 2400, to: 900, q: 2 });
}

const SOUNDS = {
  tap: (c) => tone(c, { f: 1250, f2: 900, d: 0.045, type: 'triangle', v: 0.03 }),
  hover: (c) => tone(c, { f: 2100, d: 0.022, type: 'sine', v: 0.008 }),
  nav: (c) => knock(c, { f: 420, v: 0.05 }),
  page: (c) => { noise(c, { d: 0.16, v: 0.012, from: 500, to: 2200 }); tone(c, { f: 660, f2: 880, d: 0.09, v: 0.016, t: 0.02 }); },
  tab: (c) => { tone(c, { f: 980, d: 0.04, type: 'triangle', v: 0.03 }); tone(c, { f: 1470, t: 0.035, d: 0.05, type: 'triangle', v: 0.02 }); },
  chip: (c) => tone(c, { f: 1600, f2: 1300, d: 0.035, type: 'triangle', v: 0.025 }),
  open: (c) => { noise(c, { d: 0.14, v: 0.018, from: 600, to: 2400 }); tone(c, { f: 520, f2: 780, d: 0.12, v: 0.025 }); },
  close: (c) => { noise(c, { d: 0.1, v: 0.014, from: 2200, to: 500 }); },
  drawerOpen: (c) => { noise(c, { d: 0.22, v: 0.02, from: 350, to: 1900 }); knock(c, { t: 0.12, f: 300, v: 0.035 }); },
  drawerClose: (c) => { noise(c, { d: 0.16, v: 0.016, from: 1900, to: 380 }); },
  sheetUp: (c) => { noise(c, { d: 0.2, v: 0.016, from: 300, to: 1600 }); tone(c, { f: 440, f2: 660, d: 0.14, v: 0.018, t: 0.04 }); },
  select: (c) => { knock(c, { f: 392, v: 0.06 }); tone(c, { f: 784, t: 0.06, d: 0.16, v: 0.03 }); },
  login: (c) => { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, { f, t: i * 0.075, d: 0.32, v: 0.035 })); noise(c, { d: 0.5, v: 0.01, from: 400, to: 3000 }); },
  logout: (c) => { [783.99, 659.25, 523.25].forEach((f, i) => tone(c, { f, t: i * 0.07, d: 0.22, v: 0.03 })); },
  success: (c) => { tone(c, { f: 880, d: 0.14, v: 0.05, type: 'sine' }); tone(c, { f: 1318.5, t: 0.09, d: 0.22, v: 0.045, type: 'sine' }); },
  error: (c) => { tone(c, { f: 220, f2: 160, d: 0.22, type: 'triangle', v: 0.06 }); tone(c, { f: 180, f2: 120, t: 0.08, d: 0.22, type: 'triangle', v: 0.05 }); },
  toggle: (c) => { tone(c, { f: 700, d: 0.05, type: 'triangle', v: 0.04 }); tone(c, { f: 1050, t: 0.05, d: 0.07, type: 'triangle', v: 0.035 }); },
  whoosh: (c) => noise(c, { d: 0.35, v: 0.02, from: 300, to: 2600 }),
  notify: (c) => { tone(c, { f: 1046.5, d: 0.12, v: 0.04 }); tone(c, { f: 1568, t: 0.1, d: 0.25, v: 0.035 }); },
  coin: (c) => { tone(c, { f: 1318.5, d: 0.08, v: 0.04, type: 'square' }); tone(c, { f: 1975.5, t: 0.07, d: 0.25, v: 0.03, type: 'square' }); },
  woodCrack: (c) => {
    // dry splintering: sharp high snaps over a low creak
    [0, 0.05, 0.085, 0.14, 0.2, 0.24, 0.31].forEach((t, i) => noise(c, { t, d: 0.018 + (i % 3) * 0.008, v: 0.09 - i * 0.006, from: 4200 - i * 300, to: 1800, q: 3.5 }));
    tone(c, { f: 140, f2: 70, d: 0.42, type: 'sawtooth', v: 0.018, attack: 0.02 });
    knock(c, { t: 0.02, f: 210, v: 0.07 });
  },
  shatter: (c) => {
    // the panel bursts: a low boom, a rush of air, then wooden pieces clattering away
    tone(c, { f: 90, f2: 38, d: 0.55, type: 'sine', v: 0.14, attack: 0.004 });
    noise(c, { d: 0.7, v: 0.06, from: 3200, to: 260, q: 0.6 });
    noise(c, { t: 0.02, d: 0.09, v: 0.1, from: 5000, to: 2000, q: 2 });
    [0.06, 0.11, 0.15, 0.2, 0.26, 0.33, 0.41, 0.5, 0.6].forEach((t, i) => knock(c, { t, f: 260 + ((i * 97) % 380), v: 0.045 - i * 0.003 }));
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) => tone(c, { f, t: 0.18 + i * 0.06, d: 0.5, v: 0.014 }));
  },
  refresh: (c) => { [0, 0.06, 0.12].forEach((t, i) => tone(c, { f: 900 + i * 220, t, d: 0.06, type: 'triangle', v: 0.022 })); },
};

/** Play a named sound if sound is on. force=true ignores the setting (used for the toggle itself). */
export function sfx(name, force = false, defaultOn = true) {
  if (!force && !soundOn(defaultOn)) return;
  if (name === 'hover' && window.matchMedia && (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !window.matchMedia('(hover: hover)').matches)) return;
  // de-duplicate: the same sound twice within 60 ms sounds like a glitch
  const now = performance.now();
  if (last[name] && now - last[name] < 60) return;
  last[name] = now;
  const c = ac();
  if (!c || !SOUNDS[name]) return;
  try { SOUNDS[name](c); } catch { /* ignore */ }
}
