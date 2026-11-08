// Build both existing portals into one Vercel deployment.
// The HTML files are copied unchanged; only config.js is generated.
'use strict';
const fs = require('fs');
const path = require('path');

const root = __dirname;
const dist = path.join(root, 'dist');
const env = { ...process.env };

// Optional local .env support for local builds. Never commit .env.
try {
  for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && env[m[1]] === undefined) {
      env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch {}

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, 'admin'), { recursive: true });

fs.copyFileSync(path.join(root, 'apps/user/index.html'), path.join(dist, 'index.html'));
fs.copyFileSync(path.join(root, 'apps/admin/index.html'), path.join(dist, 'admin/index.html'));

// Same-origin API: both portals call this deployment's /api endpoints.
const config = [
  'window.EB_API = window.location.origin;',
  `window.EB_OWNER_PHONE = ${JSON.stringify(env.EB_OWNER_PHONE || '')};`,
  `window.EB_OWNER_WHATSAPP = ${JSON.stringify(env.EB_OWNER_WHATSAPP || '')};`,
  ''
].join('\n');

fs.writeFileSync(path.join(dist, 'config.js'), config);
fs.writeFileSync(path.join(dist, 'admin/config.js'), config);
console.log('Built EasyBill User (/) and Admin (/admin) without modifying either HTML file.');
