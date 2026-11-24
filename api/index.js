'use strict';
/**
 * Vercel serverless entry. Every /api/* request is rewritten here (see vercel.json).
 * Serverless disks are read-only except /tmp, so the demo data is generated into /tmp on a cold
 * start (takes ~0.1 s) and kept in memory while the instance stays warm.
 */
const os = require('os');
const path = require('path');

process.env.ERP_DATA_DIR = process.env.ERP_DATA_DIR || path.join(os.tmpdir(), 'raajply-data');
process.env.ERP_NO_BACKUP = '1';
// Tokens must verify on every instance, so the signing key cannot be random per instance.
// Set ERP_SECRET in the Vercel project settings to override this demo default.
process.env.ERP_SECRET = process.env.ERP_SECRET || 'raajply-demo-signing-key-change-me-in-vercel-settings';

const { createHandler } = require('../server/server');
let handler = null;

module.exports = async (req, res) => {
  if (!handler) handler = createHandler();
  // vercel.json rewrites /api/<path> → /api/index?__p=<path>; restore the original URL for the router.
  const u = new URL(req.url, 'http://localhost');
  const p = u.searchParams.get('__p');
  if (p !== null) {
    u.searchParams.delete('__p');
    const qs = u.searchParams.toString();
    req.url = `/api/${p}${qs ? `?${qs}` : ''}`;
  }
  return handler(req, res);
};
