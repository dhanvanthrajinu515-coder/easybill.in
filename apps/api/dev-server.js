// Run EasyBill locally: API + shop site + admin site on http://localhost:3000
//   shop:  http://localhost:3000/        admin: http://localhost:3000/admin
// Uses your Turso database from .env, or a local file (local.db) if none is set.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { makeHandler } = require('./lib/handler');

function createServer(db, env) {
  const h = makeHandler(db, env), root = path.join(__dirname, '..');
  const page = (d) => fs.readFileSync(path.join(root, d, 'index.html'), 'utf8');
  return http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url, 'http://x');
      if (u.pathname.startsWith('/api/')) {
        let raw = ''; for await (const c of req) raw += c;
        try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = {}; }
        res.status = (c) => { res.statusCode = c; return res; };
        res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); return res; };
        return await h(req, res);
      }
      if (u.pathname === '/config.js') {
        res.setHeader('Content-Type', 'application/javascript');
        return res.end(`window.EB_API=location.origin;window.EB_OWNER_PHONE=${JSON.stringify(env.EB_OWNER_PHONE || '')};window.EB_OWNER_WHATSAPP=${JSON.stringify(env.EB_OWNER_WHATSAPP || '')};`);
      }
      const html = u.pathname === '/' ? page('user') : /^\/admin\/?$/.test(u.pathname) ? page('admin') : null;
      if (!html) { res.statusCode = 404; return res.end('Not found'); }
      res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html);
    } catch (e) { console.error(e); res.statusCode = 500; res.end('Server error'); }
  });
}
module.exports = { createServer };

if (require.main === module) {
  try { for (const l of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) { const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/); if (m && !l.trim().startsWith('#') && !(m[1] in process.env)) process.env[m[1]] = m[2]; } } catch {}
  const { createClient } = require('@libsql/client');
  const { migrate } = require('./migrate');
  const url = process.env.TURSO_DATABASE_URL && !/your-db-name/.test(process.env.TURSO_DATABASE_URL) ? process.env.TURSO_DATABASE_URL : 'file:local.db';
  const env = { ...process.env, JWT_SECRET: process.env.JWT_SECRET || 'dev-only-secret', ADMIN_USER: process.env.ADMIN_USER || 'admin', ADMIN_PASS: process.env.ADMIN_PASS || 'admin123' };
  (async () => {
    const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
    await migrate(db);
    createServer(db, env).listen(3000, () => console.log(`\nEasyBill running (${url.startsWith('file') ? 'local file database' : 'Turso'})\n  Shop:  http://localhost:3000/\n  Admin: http://localhost:3000/admin   (login: ${env.ADMIN_USER} / ${env.ADMIN_PASS})\n`));
  })().catch((e) => { console.error(e); process.exit(1); });
}
