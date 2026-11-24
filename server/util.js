'use strict';
const crypto = require('crypto');

/** Round-log volume by the Hoppus (quarter-girth) rule. girth in inches, length in feet → cubic feet. */
function hoppusCft(girthIn, lengthFt) {
  const g = Number(girthIn), l = Number(lengthFt);
  if (!(g > 0) || !(l > 0)) return 0;
  return round2(((g / 4) ** 2 * l) / 144);
}

/** Sawn timber volume: length (ft) × width (in) × thickness (in) / 144 → CFT. */
function sawnCft(lengthFt, widthIn, thickIn) {
  return round2((Number(lengthFt) * Number(widthIn) * Number(thickIn)) / 144);
}

/** Volume of one 8 ft × 4 ft sheet of the given thickness (mm) in CFT. */
function sheetCft(thicknessMm, sqft = 32) {
  return round2((Number(sqft) * Number(thicknessMm)) / 304.8);
}

/** Plywood is sold by the square foot: amount = sheets × sq ft per sheet × rate per sq ft. */
function lineSqft(p, qty) { return p && p.sqftPerSheet ? round2(Number(qty) * p.sqftPerSheet) : Number(qty); }
function lineAmount(p, qty, rate) { return Math.round(lineSqft(p, qty) * Number(rate)); }
/** Value of stock on hand at list rate. */
function stockValue(p, qty) { return Math.round(lineSqft(p, qty) * (p.rate || 0)); }

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const round0 = (n) => Math.round(Number(n));

/** Local calendar date YYYY-MM-DD. */
function ymd(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function today() { return process.env.ERP_TODAY || ymd(new Date()); }
function nowTs() {
  const d = new Date();
  return `${ymd(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return ymd(dt);
}
function daysBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}
function dow(dateStr) { const [y, m, d] = dateStr.split('-').map(Number); return new Date(y, m - 1, d).getDay(); }
function monthKey(dateStr) { return dateStr.slice(0, 7); }
/** Indian financial year label for a date, e.g. 2026-11-20 → "26-27". */
function fyLabel(dateStr) {
  const y = Number(dateStr.slice(0, 4)), m = Number(dateStr.slice(5, 7));
  const start = m >= 4 ? y : y - 1;
  return `${String(start).slice(2)}-${String(start + 1).slice(2)}`;
}

function uid(prefix = '') { return prefix + crypto.randomBytes(5).toString('hex'); }

function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  const h = crypto.scryptSync(String(pw), salt, 32).toString('hex');
  return `${salt}:${h}`;
}
function checkPassword(pw, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, h] = stored.split(':');
  const test = crypto.scryptSync(String(pw), salt, 32);
  const real = Buffer.from(h, 'hex');
  return real.length === test.length && crypto.timingSafeEqual(real, test);
}

class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}

const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);
function groupBy(arr, f) { const m = new Map(); for (const x of arr) { const k = f(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; }

module.exports = {
  lineSqft, lineAmount, stockValue,
  hoppusCft, sawnCft, sheetCft, round2, round0, ymd, today, nowTs, addDays, daysBetween, dow, monthKey, fyLabel,
  uid, hashPassword, checkPassword, HttpError, sum, groupBy,
};
