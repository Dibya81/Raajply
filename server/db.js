'use strict';
/** Tiny JSON document store. Whole dataset in memory, persisted with an atomic write after each change. */
const fs = require('fs');
const path = require('path');

let state = { db: null, file: null };
const DATA_VERSION = 2;

function dataDir() { return process.env.ERP_DATA_DIR || path.join(__dirname, '..', 'data'); }

function load() {
  const dir = dataDir();
  const file = path.join(dir, 'db.json');
  if (!fs.existsSync(file)) {
    require('./seed').seed(file);
    console.log('[db] No data found — generated fresh demo data.');
  }
  state.file = file;
  state.db = JSON.parse(fs.readFileSync(file, 'utf8'));
  backup(dir, file);
  // Data from an older version of the prototype (different company / product model): replace with fresh demo data.
  if (!state.db.meta || state.db.meta.version !== DATA_VERSION) {
    require('./seed').seed(file);
    state.db = JSON.parse(fs.readFileSync(file, 'utf8'));
    console.log('[db] Older demo data found — regenerated for this version (old copy kept in data/backups).');
  }
  return state.db;
}

/** Keep a copy of the data file each time the server starts (last 10 kept in data/backups). */
function backup(dir, file) {
  if (process.env.ERP_NO_BACKUP) return;
  try {
    const bdir = path.join(dir, 'backups');
    fs.mkdirSync(bdir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
    fs.copyFileSync(file, path.join(bdir, `db-${stamp}.json`));
    const old = fs.readdirSync(bdir).filter((f) => f.startsWith('db-')).sort();
    while (old.length > 10) fs.unlinkSync(path.join(bdir, old.shift()));
  } catch (e) { console.warn('[db] backup skipped:', e.message); }
}

function get() { return state.db || load(); }

function save() {
  if (!state.db) return;
  const tmp = state.file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state.db));
  fs.renameSync(tmp, state.file);
}

function reset() {
  require('./seed').seed(path.join(dataDir(), 'db.json'));
  return load();
}

/** Next document number in a sequence, e.g. nextNo('GE','GE') → GE-00241 */
function nextNo(key, prefix, pad = 5) {
  const db = get();
  db.counters[key] = (db.counters[key] || 0) + 1;
  return `${prefix}-${String(db.counters[key]).padStart(pad, '0')}`;
}

module.exports = { load, get, save, reset, nextNo, dataDir };
