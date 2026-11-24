'use strict';
/**
 * Raajply ERP prototype server — no external dependencies.
 *   node server/server.js          → http://localhost:4000
 *   PORT=5000 node server/server.js
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const store = require('./db');
const auth = require('./auth');
const { Router } = require('./router');
const zlib = require('zlib');
const { HttpError } = require('./util');

// Security headers on every response. Scripts only from this server; fonts from Google Fonts.
const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https://images.unsplash.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};
const COMPRESSIBLE = /json|javascript|css|html|svg/;
function write(req, res, status, headers, body) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  const h = { ...SECURITY, ...headers };
  if (buf.length > 1024 && COMPRESSIBLE.test(h['Content-Type'] || '') && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    h['Content-Encoding'] = 'gzip'; h.Vary = 'Accept-Encoding';
    res.writeHead(status, h); res.end(zlib.gzipSync(buf, { level: 6 }));
  } else { res.writeHead(status, h); res.end(buf); }
}

const PUBLIC = path.join(__dirname, '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };

function buildRouter() {
  const r = new Router();
  require('./routes/core')(r);
  require('./routes/ops')(r);
  require('./routes/sales')(r);
  require('./routes/finance')(r);
  require('./routes/admin')(r);
  require('./routes/dashboard')(r);
  require('./routes/reports')(r);
  require('./routes/plant')(r);
  r.get('/api/health', null, () => ({ ok: true, time: new Date().toISOString() }));
  return r;
}

function send(req, res, status, data, headers = {}) {
  const body = typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data);
  write(req, res, status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }, body);
}

function readBody(req) {
  // On Vercel the platform may already have parsed the body
  if (process.env.VERCEL && req.body !== undefined) {
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
    try { return Promise.resolve(req.body ? JSON.parse(String(req.body)) : {}); } catch { return Promise.reject(new HttpError(400, 'Invalid JSON')); }
  }
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 1e6) { reject(new HttpError(413, 'Request too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new HttpError(400, 'Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  // "/" is the company website; the software lives at /app (any other page path also opens the app).
  if (rel === '/') rel = '/site/index.html';
  else if (!path.extname(rel)) rel = '/app/index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) return send(req, res, 403, { error: 'Forbidden' });
  fs.readFile(file, (err, buf) => {
    if (err) return send(req, res, 404, { error: 'Not found' });
    write(req, res, 200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }, buf);
  });
}

/** The request handler on its own, so it can run as a serverless function (see api/index.js). */
function createHandler() {
  store.load();
  const router = buildRouter();
  return async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const { pathname } = url;
    if (!pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(req, res, 405, { error: 'Method not allowed' });
      return serveStatic(req, res, pathname);
    }
    const started = Date.now();
    try {
      const m = router.match(req.method, pathname);
      if (!m) throw new HttpError(404, 'No such API endpoint');
      const user = auth.userFromRequest(req);
      router.authorize(m.route, user);
      const body = ['POST', 'PUT'].includes(req.method) ? await readBody(req) : {};
      const query = Object.fromEntries(url.searchParams.entries());
      const data = await m.route.handler({ req, user, params: m.params, query, body });
      send(req, res, 200, data === undefined ? { ok: true } : data);
    } catch (e) {
      const status = e.status || 500;
      if (status === 500) console.error('[error]', req.method, pathname, e);
      send(req, res, status, { error: status === 500 ? 'Something went wrong on the server' : e.message, ...(e.extra || {}) });
    } finally {
      if (process.env.ERP_LOG) console.log(`${req.method} ${pathname} ${res.statusCode} ${Date.now() - started}ms`);
    }
  };
}

function createServer() {
  return http.createServer(createHandler());
}

function start(port = Number(process.env.PORT) || 4000) {
  const server = createServer();
  return new Promise((resolve) => {
    server.on('error', (e) => { if (e.code === 'EADDRINUSE') { console.error(`\nPort ${port} is already in use — an older copy is still running.\nClose its Terminal window (or run: kill $(lsof -ti tcp:${port})) and start again.\n`); process.exit(1); } throw e; });
    server.listen(port, () => {
      const p = server.address().port;
      if (require.main === module) {
        console.log('');
        console.log('  Raajply ERP prototype is running');
        console.log(`  → Website:  http://localhost:${p}/`);
        console.log(`  → Software: http://localhost:${p}/app`);
        console.log('  → Demo logins: md, accounts, production — password demo123');
        console.log('');
      }
      resolve(server);
    });
  });
}

if (require.main === module) start();

module.exports = { createServer, createHandler, start };
