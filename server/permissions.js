'use strict';

const PERMISSIONS = {
  dashboard: 'View dashboard',
  'yard.view': 'View log yard & log purchases',
  'yard.edit': 'Record logs arriving at the yard',
  'production.view': 'View production',
  'production.edit': 'Start production & record sheets made',
  'inventory.view': 'View plywood stock',
  'inventory.edit': 'Stock counts, transfers & adjustment requests',
  'inventory.approve': 'Approve stock count differences',
  'stores.view': 'View stores (glue, blades, spares…)',
  'stores.edit': 'Record store purchases & issues',
  'sales.view': 'View orders & distributors',
  'sales.edit': 'Take distributor orders',
  'sales.approve': 'Approve / cancel orders',
  'dispatch.view': 'View dispatch',
  'dispatch.edit': 'Load trucks & mark delivered',
  'finance.view': 'View accounts',
  'finance.edit': 'Record receipts & payments',
  'finance.approve': 'Credit-limit overrides',
  'tally.export': 'Export vouchers to Tally',
  'masters.view': 'View products & parties',
  'masters.edit': 'Edit products, parties, species',
  'admin.users': 'Manage users',
  'audit.view': 'View history of changes',
};

// Raajply uses three logins: the Managing Director, the Accounts office and the Production manager.
const ROLES = {
  owner: { name: 'Managing Director', perms: ['*'], desc: 'Sees everything · approves credit and stock differences' },
  accounts: { name: 'Accounts Office', perms: ['dashboard', 'sales.view', 'sales.edit', 'sales.approve', 'dispatch.view', 'dispatch.edit', 'finance.view', 'finance.edit', 'tally.export', 'yard.view', 'stores.view', 'stores.edit', 'inventory.view', 'masters.view', 'masters.edit'], desc: 'Orders, invoices, payments, purchases · sends vouchers to Tally' },
  production: { name: 'Production Manager', perms: ['dashboard', 'yard.view', 'yard.edit', 'production.view', 'production.edit', 'inventory.view', 'inventory.edit', 'stores.view', 'stores.edit', 'dispatch.view', 'dispatch.edit', 'sales.view', 'masters.view'], desc: 'Logs, peeling & pressing, plywood stock, stores, stock counts' },
};

function permsFor(role) {
  const r = ROLES[role];
  if (!r) return [];
  return r.perms.includes('*') ? Object.keys(PERMISSIONS) : r.perms.slice();
}
function can(user, perm) {
  if (!user) return false;
  const r = ROLES[user.role];
  if (!r) return false;
  if (r.perms.includes('*')) return true;
  if (Array.isArray(perm)) return perm.some((p) => r.perms.includes(p));
  return r.perms.includes(perm);
}

module.exports = { PERMISSIONS, ROLES, permsFor, can };
