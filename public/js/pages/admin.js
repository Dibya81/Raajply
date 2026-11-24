import { get, post, put } from '../api.js';
import { html, raw, ic, ts, pill, tabs, mountTable, openModal, toast, options, initials, avatarColor, confirmBox, date } from '../ui.js';
import { can, session, rerender } from '../app.js';

export async function render(el, { route }) {
  const list = [];
  if (can('admin.users')) list.push({ id: 'users', label: 'Users', icon: 'users' });
  list.push({ id: 'roles', label: 'Roles & permissions', icon: 'shield' });
  if (can('audit.view')) list.push({ id: 'audit', label: 'Audit log', icon: 'history' });
  if (can('admin.users')) list.push({ id: 'settings', label: 'Company settings', icon: 'settings' });
  const tab = route.query.get('tab') || list[0].id;
  el.innerHTML = String(html`
    <div class="page-head"><div><h1>Users & Audit</h1><div class="sub">Who can use the system, what each role can do, and a record of every change</div></div>
      <div class="actions">${tab === 'users' && can('admin.users') ? html`<button class="btn primary" id="addUser">${ic('plus', 'sm')} Add user</button>` : ''}</div></div>
    ${tabs(list, tab, '#/admin')}<div id="body"></div>`);
  const body = el.querySelector('#body');
  if (tab === 'users') return users(body, el);
  if (tab === 'roles') return roles(body);
  if (tab === 'audit') return audit(body);
  if (tab === 'settings') return settings(body);
}

async function users(body, el) {
  const [rows, r] = await Promise.all([get('/api/admin/users'), get('/api/admin/roles')]);
  body.innerHTML = '<div class="card" id="t"></div>';
  mountTable(body.querySelector('#t'), {
    rows, exportName: 'users', onRow: (u) => userModal(r.roles, u), columns: [
      { key: 'name', label: 'User', render: (u) => html`<span class="cell-main"><span class="avatar" style="background:${avatarColor(u.name)}">${initials(u.name)}</span><span><div class="n">${u.name}</div><div class="s">@${u.username}</div></span></span>` },
      { key: 'roleName', label: 'Role', render: (u) => html`<span class="tag">${u.roleName}</span>` }, { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' },
      { key: 'createdAt', label: 'Since', render: (u) => date(u.createdAt) }, { key: 'active', label: 'Status', render: (u) => pill(u.active ? 'Active' : 'Disabled') },
    ],
  });
  el.querySelector('#addUser').onclick = () => userModal(r.roles);
}
function userModal(roles, u) {
  openModal({
    title: u ? `Edit ${u.name}` : 'Add user', submit: u ? 'Save changes' : 'Create user', body: html`<div class="form">
      <div class="f2"><div class="field"><label>Full name</label><input class="input" name="name" value="${u?.name || ''}" required></div>
        <div class="field"><label>Username</label><input class="input" name="username" value="${u?.username || ''}" ${u ? raw('disabled') : ''} required></div></div>
      <div class="field"><label>Role</label><select class="input" name="role">${options(roles, u?.role || 'accountant', { label: (r) => `${r.name} — ${r.desc}` })}</select></div>
      ${u ? '' : html`<div class="f2"><div class="field"><label>Email</label><input class="input" name="email" type="email"></div><div class="field"><label>Phone</label><input class="input" name="phone"></div></div>`}
      <div class="field"><label>${u ? 'New password (leave blank to keep)' : 'Password'}</label><input class="input" name="password" type="password" minlength="6" ${u ? '' : raw('required')}><span class="hint">At least 6 characters</span></div>
      ${u ? html`<label class="check"><input type="checkbox" name="active" ${u.active ? raw('checked') : ''}> Active (unticked users cannot sign in)</label>` : ''}</div>`,
    onSubmit: async (f) => {
      if (u) await put(`/api/admin/users/${u.id}`, { name: f.name.value, role: f.role.value, active: f.active.checked, password: f.password.value || undefined });
      else await post('/api/admin/users', { name: f.name.value, username: f.username.value, role: f.role.value, email: f.email.value, phone: f.phone.value, password: f.password.value });
      toast(u ? 'User updated' : 'User created'); rerender();
    },
  });
}
async function roles(body) {
  const r = await get('/api/admin/roles');
  const perms = Object.entries(r.permissions);
  body.innerHTML = String(html`<div class="notice info" style="margin-bottom:14px">${ic('shield', 'sm')}<span>Every screen and every action checks the user's role on the server. This matrix is the current configuration; roles can be tuned after the client confirms who does what.</span></div>
    <div class="card"><div class="table-wrap"><table class="t"><thead><tr><th style="min-width:220px">Permission</th>${r.roles.map((x) => html`<th style="text-align:center;font-size:11px;white-space:normal;min-width:84px">${x.name}<div class="muted" style="font-weight:400">${x.users} user${x.users === 1 ? '' : 's'}</div></th>`)}</tr></thead><tbody>
    ${perms.map(([k, label]) => html`<tr><td><b style="font-weight:600">${label}</b><div class="small muted mono">${k}</div></td>${r.roles.map((x) => html`<td style="text-align:center">${x.perms.includes(k) ? html`<span style="color:var(--good)">${ic('check', 'sm')}</span>` : html`<span style="color:#d5d0c5">—</span>`}</td>`)}</tr>`)}
    </tbody></table></div></div>`);
}
async function audit(body) {
  const a = await get('/api/admin/audit?limit=2000');
  body.innerHTML = String(html`<div class="notice good" style="margin-bottom:14px">${ic('lock', 'sm')}<span>The audit log records who did what and when — logins, entries, approvals, edits with before/after values. Nobody can edit or delete it, including the admin.</span></div><div class="card" id="t"></div>`);
  mountTable(body.querySelector('#t'), {
    rows: a.rows, exportName: 'audit-log', pageSize: 25, placeholder: 'Search user, action, record…',
    filters: a.entities.slice(0, 10).map((e) => ({ id: e, label: e, test: (r) => r.entity === e })),
    columns: [
      { key: 'ts', label: 'When', render: (r) => ts(r.ts) },
      { key: 'user', label: 'User', render: (r) => html`<span class="cell-main"><span class="avatar" style="width:26px;height:26px;font-size:10px;border-radius:7px;background:${avatarColor(r.user)}">${initials(r.user)}</span><span><div style="font-weight:600">${r.user}</div><div class="s">${r.role}</div></span></span>` },
      { key: 'action', label: 'Action', render: (r) => html`<span class="tag">${r.action}</span>` },
      { key: 'entity', label: 'Record', render: (r) => html`${r.entity} <span class="mono small">${r.entityId}</span>` },
      { key: 'summary', label: 'Details', render: (r) => html`${r.summary}${r.before ? html`<div class="small muted mono">before ${JSON.stringify(r.before).slice(0, 120)}</div>` : ''}` },
    ],
  });
}
async function settings(body) {
  const c = await get('/api/admin/settings');
  body.innerHTML = String(html`<div class="grid g-main"><form class="card" id="f"><div class="card-h"><h3>Company details</h3><div class="sub">Printed on invoices, slips and reports</div></div><div class="card-b form">
    <div class="f2"><div class="field"><label>Legal name</label><input class="input" name="name" value="${c.name}"></div><div class="field"><label>Short name</label><input class="input" name="short" value="${c.short}"></div></div>
    <div class="field"><label>Address</label><input class="input" name="address" value="${c.address}"></div>
    <div class="f3"><div class="field"><label>GSTIN</label><input class="input" name="gstin" value="${c.gstin}"></div><div class="field"><label>PAN</label><input class="input" name="pan" value="${c.pan}"></div><div class="field"><label>State</label><input class="input" name="state" value="${c.state}"></div></div>
    <div class="f2"><div class="field"><label>Phone</label><input class="input" name="phone" value="${c.phone}"></div><div class="field"><label>Email</label><input class="input" name="email" value="${c.email}"></div></div>
    <div class="field"><label>Bank details (on invoice)</label><input class="input" name="bank" value="${c.bank}"></div>
    <label class="check"><input type="checkbox" name="eInvoice" ${c.eInvoice ? raw('checked') : ''}> E-invoicing applies (turnover above ₹5 crore)</label>
    <div><button class="btn primary" type="submit">${ic('check', 'sm')} Save settings</button></div></div></form>
    <div class="card"><div class="card-h"><h3>Demo data</h3></div><div class="card-b">
      <p style="margin-top:0">The prototype runs on 6 months of generated demo data (${date(session.meta?.dataFrom)} → ${date(session.meta?.dataTo)}). Reset to start fresh — dates move to end today.</p>
      ${['owner', 'admin'].includes(session.user.role) ? html`<button class="btn danger" id="reset">${ic('refresh', 'sm')} Reset demo data</button>` : html`<div class="small muted">Only the owner or admin can reset.</div>`}
    </div></div></div>`);
  body.querySelector('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try { await put('/api/admin/settings', { name: f.name.value, short: f.short.value, address: f.address.value, gstin: f.gstin.value, pan: f.pan.value, state: f.state.value, phone: f.phone.value, email: f.email.value, bank: f.bank.value, eInvoice: f.eInvoice.checked }); toast('Settings saved'); session.company = await get('/api/admin/settings'); } catch (ex) { toast(ex.message, 'bad'); }
  });
  const rs = body.querySelector('#reset');
  if (rs) rs.onclick = async () => { if (!(await confirmBox('Reset all demo data?', 'Every entry made during the demo will be replaced with freshly generated data. You will be signed out.', { submit: 'Reset', danger: true }))) return; await post('/api/admin/reset-demo'); toast('Demo data reset'); setTimeout(() => { localStorage.clear(); location.href = '/'; }, 600); };
}
