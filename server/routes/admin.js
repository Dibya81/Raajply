'use strict';
const store = require('../db');
const audit = require('../services/audit');
const stock = require('../services/stock');
const fin = require('../services/finance');
const { HttpError, today, round0, round2, sum, addDays, hashPassword } = require('../util');
const { can, ROLES, PERMISSIONS, permsFor } = require('../permissions');
const { str, find, maps, userName } = require('./helpers');

module.exports = function register(r) {
  // ======================= ADMIN =======================
  r.get('/api/admin/users', 'admin.users', () => store.get().users.map(({ passwordHash, ...u }) => ({ ...u, roleName: ROLES[u.role]?.name })));
  r.post('/api/admin/users', 'admin.users', ({ body, user }) => {
    const db = store.get();
    const username = str(body.username, 'Username', { max: 30 }).toLowerCase();
    if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw new HttpError(400, 'Username: 3–30 letters, numbers, dot, dash or underscore');
    if (db.users.some((u) => u.username === username)) throw new HttpError(409, 'Username already taken');
    if (!ROLES[body.role]) throw new HttpError(400, 'Choose a role');
    if (body.role === 'owner' && user.role !== 'owner') throw new HttpError(403, 'Only the owner can create another owner');
    const password = str(body.password, 'Password', { max: 100 });
    if (password.length < 6) throw new HttpError(400, 'Password must be at least 6 characters');
    const u = { id: store.nextNo('USR', 'u', 3), name: str(body.name, 'Name', { max: 60 }), username, role: body.role, phone: str(body.phone, 'Phone', { required: false, max: 20 }), email: str(body.email, 'Email', { required: false, max: 80 }), active: true, passwordHash: hashPassword(password), createdAt: today() };
    db.users.push(u);
    audit.log(user, 'create', 'User', u.username, `Created user ${u.name} as ${ROLES[u.role].name}`);
    store.save();
    const { passwordHash, ...safe } = u;
    return safe;
  });
  r.put('/api/admin/users/:id', 'admin.users', ({ params, body, user }) => {
    const u = find('users', params.id, 'User');
    const before = { role: u.role, active: u.active, name: u.name };
    if (body.role !== undefined) {
      if (!ROLES[body.role]) throw new HttpError(400, 'Unknown role');
      if ((body.role === 'owner' || u.role === 'owner') && user.role !== 'owner') throw new HttpError(403, 'Only the owner can change owner accounts');
      u.role = body.role;
    }
    if (body.active !== undefined) {
      if (u.id === user.id && !body.active) throw new HttpError(400, "You can't disable your own account");
      u.active = !!body.active;
    }
    if (body.name !== undefined) u.name = str(body.name, 'Name', { max: 60 });
    if (body.password) { if (String(body.password).length < 6) throw new HttpError(400, 'Password must be at least 6 characters'); u.passwordHash = hashPassword(body.password); }
    audit.log(user, 'update', 'User', u.username, `Updated ${u.name}`, { before, after: { role: u.role, active: u.active, name: u.name } });
    store.save();
    const { passwordHash, ...safe } = u;
    return safe;
  });
  r.get('/api/admin/roles', ['admin.users', 'audit.view'], () => ({ permissions: PERMISSIONS, roles: Object.entries(ROLES).map(([id, v]) => ({ id, name: v.name, desc: v.desc, perms: permsFor(id), users: store.get().users.filter((u) => u.role === id).length })) }));
  r.get('/api/admin/audit', 'audit.view', ({ query }) => {
    const db = store.get();
    const { U } = maps();
    let rows = db.audit;
    if (query.entity) rows = rows.filter((a) => a.entity === query.entity);
    if (query.user) rows = rows.filter((a) => a.userId === query.user);
    const limit = Math.min(Number(query.limit) || 1000, 5000);
    return { entities: [...new Set(db.audit.map((a) => a.entity))].sort(), rows: rows.slice(-limit).reverse().map((a) => ({ ...a, user: userName(U, a.userId), role: ROLES[U[a.userId]?.role]?.name || '' })) };
  });
  r.get('/api/admin/settings', 'auth', () => store.get().company);
  r.put('/api/admin/settings', 'admin.users', ({ body, user }) => {
    const c = store.get().company;
    const before = { ...c };
    for (const f of ['name', 'short', 'gstin', 'state', 'address', 'phone', 'email', 'pan', 'bank']) if (body[f] !== undefined) c[f] = str(body[f], f, { required: f === 'name', max: 200 });
    if (body.eInvoice !== undefined) c.eInvoice = !!body.eInvoice;
    audit.log(user, 'update', 'Settings', 'company', 'Company settings updated', { before, after: { ...c } });
    store.save();
    return c;
  });
  r.post('/api/admin/reset-demo', 'auth', ({ user }) => {
    if (user.role !== 'owner' && user.role !== 'admin') throw new HttpError(403, 'Only the owner or admin can reset demo data');
    store.reset();
    return { ok: true };
  });
};
