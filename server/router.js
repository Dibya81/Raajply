'use strict';
const { can } = require('./permissions');
const { HttpError } = require('./util');

/**
 * Minimal router. Every route declares who may call it:
 *   perm = null      → public
 *   perm = 'auth'    → any signed-in user
 *   perm = 'x.view'  → users whose role has that permission (array = any of them)
 */
class Router {
  constructor() { this.routes = []; }
  add(method, pattern, perm, handler) {
    const keys = [];
    const rx = new RegExp('^' + pattern.replace(/\/:([a-zA-Z]+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$');
    this.routes.push({ method, rx, keys, perm, handler, pattern });
  }
  get(p, perm, h) { this.add('GET', p, perm, h); }
  post(p, perm, h) { this.add('POST', p, perm, h); }
  put(p, perm, h) { this.add('PUT', p, perm, h); }

  match(method, pathname) {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = r.rx.exec(pathname);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { route: r, params };
    }
    if (pathMatched) throw new HttpError(405, 'Method not allowed');
    return null;
  }

  authorize(route, user) {
    if (route.perm === null) return;
    if (!user) throw new HttpError(401, 'Please sign in');
    if (route.perm === 'auth') return;
    if (!can(user, route.perm)) throw new HttpError(403, 'Your role does not have access to this');
  }
}

module.exports = { Router };
