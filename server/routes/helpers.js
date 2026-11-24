'use strict';
const store = require('../db');
const { HttpError } = require('../util');

function num(v, label, { min = null, max = null, int = false } = {}) {
  const n = Number(v);
  if (v === '' || v === null || v === undefined || !Number.isFinite(n)) throw new HttpError(400, `${label} must be a number`);
  if (int && !Number.isInteger(n)) throw new HttpError(400, `${label} must be a whole number`);
  if (min !== null && n < min) throw new HttpError(400, `${label} must be at least ${min}`);
  if (max !== null && n > max) throw new HttpError(400, `${label} must be at most ${max}`);
  return n;
}
function str(v, label, { required = true, max = 200 } = {}) {
  const s = v === undefined || v === null ? '' : String(v).trim();
  if (required && !s) throw new HttpError(400, `${label} is required`);
  if (s.length > max) throw new HttpError(400, `${label} is too long`);
  return s;
}
function find(coll, id, label) {
  const x = store.get()[coll].find((r) => r.id === id);
  if (!x) throw new HttpError(404, `${label} not found`);
  return x;
}
function maps() {
  const db = store.get();
  const by = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));
  return { P: by(db.products), D: by(db.distributors), S: by(db.suppliers), SP: by(db.species), U: by(db.users), L: by(db.locations) };
}
const userName = (U, id) => (U[id] ? U[id].name : id === 'system' ? 'System' : id || '—');

module.exports = { num, str, find, maps, userName };
