'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const store = require('./db');
const { checkPassword, HttpError } = require('./util');
const { permsFor, ROLES } = require('./permissions');

const TTL_MS = 12 * 60 * 60 * 1000;
let secret = null;

function getSecret() {
  if (secret) return secret;
  if (process.env.ERP_SECRET) return (secret = process.env.ERP_SECRET);
  const f = path.join(store.dataDir(), 'secret.key');
  try { secret = fs.readFileSync(f, 'utf8').trim(); } catch { /* create */ }
  if (!secret) {
    secret = crypto.randomBytes(32).toString('hex');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, secret);
  }
  return secret;
}

const b64 = (s) => Buffer.from(s).toString('base64url');
function sign(payload) {
  const body = b64(JSON.stringify(payload));
  const mac = crypto.createHmac('sha256', getSecret()).update(body).digest('base64url');
  return `${body}.${mac}`;
}
function verify(token) {
  if (!token || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const good = crypto.createHmac('sha256', getSecret()).update(body).digest('base64url');
  if (mac.length !== good.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(good))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!p.exp || p.exp < Date.now()) return null;
    return p;
  } catch { return null; }
}

function publicUser(u) {
  return { id: u.id, name: u.name, username: u.username, role: u.role, roleName: ROLES[u.role]?.name || u.role, email: u.email, phone: u.phone, active: u.active, perms: permsFor(u.role) };
}

function issue(u) { return sign({ sub: u.id, role: u.role, exp: Date.now() + TTL_MS }); }

function login(username, password) {
  const db = store.get();
  const u = db.users.find((x) => x.username.toLowerCase() === String(username || '').trim().toLowerCase());
  if (!u || !checkPassword(password, u.passwordHash)) throw new HttpError(401, 'Wrong username or password');
  if (!u.active) throw new HttpError(403, 'This user is disabled. Contact the admin.');
  return { token: issue(u), user: publicUser(u) };
}

function userFromRequest(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  const p = verify(token);
  if (!p) return null;
  const u = store.get().users.find((x) => x.id === p.sub);
  if (!u || !u.active) return null;
  return u;
}

module.exports = { login, issue, verify, userFromRequest, publicUser };
