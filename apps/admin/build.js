// Generates dist/ (website + config.js) from environment variables or a local .env file.
const fs = require('fs');
const KEYS = ["EB_API"];
const env = { ...process.env };
try {
  for (const line of fs.readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}
fs.mkdirSync('dist', { recursive: true });
fs.copyFileSync('index.html', 'dist/index.html');
fs.writeFileSync('dist/config.js', KEYS.map((k) => `window.${k} = ${JSON.stringify(env[k] || '')};`).join('\n') + '\n');
for (const k of KEYS) if (!env[k]) console.warn(`WARNING: ${k} is empty`);
console.log('Built dist/ with', KEYS.join(', '));
