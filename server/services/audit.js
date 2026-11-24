'use strict';
const crypto = require('crypto');
const store = require('../db');
const { nowTs } = require('../util');

/** Record who did what. before/after are optional snapshots for edits. */
function log(user, action, entity, entityId, summary, extra = {}) {
  const db = store.get();
  const row = { id: crypto.randomUUID(), ts: nowTs(), userId: user ? user.id : 'system', action, entity, entityId, summary, ...extra };
  db.audit.push(row);
  return row;
}

module.exports = { log };
