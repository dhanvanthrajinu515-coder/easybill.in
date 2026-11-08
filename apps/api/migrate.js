// Applies new files from ./migrations in order. Safe to run any time: finished files are skipped.
const fs = require('fs');
const path = require('path');
async function migrate(db, dir = path.join(__dirname, 'migrations')) {
  await db.execute('CREATE TABLE IF NOT EXISTS _migrations(name TEXT PRIMARY KEY, at TEXT)');
  const done = new Set((await db.execute('SELECT name FROM _migrations')).rows.map((r) => r.name));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    if (done.has(f)) continue;
    await db.executeMultiple(fs.readFileSync(path.join(dir, f), 'utf8'));
    await db.execute({ sql: 'INSERT INTO _migrations(name, at) VALUES(?, ?)', args: [f, new Date().toISOString()] });
    console.log('applied', f);
  }
  console.log('database is up to date');
}
module.exports = { migrate };
if (require.main === module) {
  const { createClient } = require('@libsql/client');
  if (!process.env.TURSO_DATABASE_URL) { console.error('Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in .env'); process.exit(1); }
  migrate(createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN })).catch((e) => { console.error(e); process.exit(1); });
}
