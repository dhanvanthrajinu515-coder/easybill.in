'use strict';
const crypto = require('crypto');
const DEFC = ['Groceries', 'Vegetables', 'Fruits', 'Dairy', 'Snacks', 'Beverages', 'Household', 'Stationery'];
const same = (a, b) => { a = Buffer.from(String(a)); b = Buffer.from(String(b)); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const hash = (pw, salt) => new Promise((ok, no) => crypto.pbkdf2(String(pw), salt, 100000, 32, 'sha256', (e, k) => (e ? no(e) : ok(k.toString('base64url')))));
const sig = (env, d) => crypto.createHmac('sha256', env.JWT_SECRET).update(d).digest('base64url');
const mint = (env, p, secs) => { const d = Buffer.from(JSON.stringify({ ...p, exp: Date.now() + secs * 1000 })).toString('base64url'); return d + '.' + sig(env, d); };
const check = (env, t) => {
  try {
    const [d, s] = String(t || '').split('.');
    if (!d || !s || !same(s, sig(env, d))) return null;
    const p = JSON.parse(Buffer.from(d, 'base64url').toString());
    return p.exp > Date.now() ? p : null;
  } catch { return null; }
};
const pad = (md, no) => (md === 'r' ? 'R' : 'W') + String(no).padStart(4, '0');

function makeHandler(db, env) {
  const q = (sql, args = []) => db.execute({ sql, args });
  const first = async (sql, args) => (await q(sql, args)).rows[0];
  const all = async (sql, args) => (await q(sql, args)).rows;
  const origin = (req) => {
    const l = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean), o = req.headers.origin;
    return l.length ? (l.includes(o) ? o : l[0]) : '*';
  };
  const getCats = async () => { const c = await first("SELECT v FROM kv WHERE owner='_global' AND k='cats'"); return c ? JSON.parse(c.v) : DEFC; };

  return async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', origin(req));
    res.setHeader('Vary', 'Origin');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    if (req.method === 'OPTIONS') return res.status(204).end();
    const J = (o, s = 200) => res.status(s).json(o);
    if (!env.JWT_SECRET) return J({ error: 'Server not configured (JWT_SECRET missing)' }, 500);
    const p = new URL(req.url, 'http://x').pathname.replace(/\/+$/, ''), m = req.method;
    if (p === '/api/health' && m === 'GET') {
      await first('SELECT 1 AS ok');
      const adminLoginConfigured = Boolean(
        String(env.ADMIN_USER || env.ADMIN_USERNAME || '').trim() &&
        String(env.ADMIN_PASS || env.ADMIN_PASSWORD || '')
      );
      return J({ ok: true, service: 'easybill-api', database: 'connected', adminLoginConfigured });
    }
    let body = req.body; if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } } body = body || {};
    const tok = check(env, String(req.headers.authorization || '').slice(7));
    try {
      // ---- shop login: username + password ----
      if (p === '/api/login' && m === 'POST') {
        const a = await first('SELECT * FROM accounts WHERE user=?', [String(body.user || '')]);
        if (!a || !same(await hash(body.pass || '', a.salt), a.pass)) return J({ error: 'Wrong username or password' }, 401);
        if (!a.active) return J({ error: 'This account is disabled. Contact Administrator' }, 403);
        return J({ token: mint(env, { role: 'user', id: a.id }, 7 * 86400), acct: { id: a.id, shop: a.shop, modes: a.modes || 'rw' } });
      }
      // ---- shop data (always limited to the caller's own shop) ----
      if (p === '/api/sync' || p === '/api/kv' || p === '/api/bills') {
        if (!tok || tok.role !== 'user') return J({ error: 'Please sign in' }, 401);
        const a = await first('SELECT id,shop,active,modes FROM accounts WHERE id=?', [tok.id]);
        if (!a) return J({ error: 'Account not found' }, 401);
        if (!a.active) return J({ error: 'This account is disabled. Contact Administrator' }, 403);
        const modes = a.modes || 'rw';
        if (p === '/api/kv' && m === 'PUT') {
          const k = String(body.k || '');
          if (!/^\w{1,40}$/.test(k)) return J({ error: 'Bad key' }, 400);
          if (/^[rw]_/.test(k) && !modes.includes(k[0])) return J({ error: 'Contact Administrator to open this' }, 423);
          if (String(body.v).length > 4000000) return J({ error: 'Too large' }, 413);
          await q('INSERT OR REPLACE INTO kv(owner,k,v) VALUES(?,?,?)', [a.id, k, String(body.v)]);
          return J({ ok: true });
        }
        if (p === '/api/bills' && m === 'POST') {
          const md = body.mode === 'w' ? 'w' : 'r', b = body.bill || {}, cid = String(b.cid || '').slice(0, 64);
          if (!cid || !Array.isArray(b.items) || !b.items.length || !(+b.total >= 0)) return J({ error: 'Invalid bill' }, 400);
          if (!modes.includes(md)) return J({ error: 'Contact Administrator to open ' + (md === 'w' ? 'Wholesale' : 'Retail') }, 423);
          const find = async () => (await first('SELECT no,mode FROM bills WHERE owner=? AND cid=?', [a.id, cid]));
          let row = await find();
          for (let i = 0; i < 4 && !row; i++) {
            try {
              await q('INSERT INTO bills(owner,mode,no,cid,ts,data) SELECT ?,?,COALESCE(MAX(no),0)+1,?,?,? FROM bills WHERE owner=? AND mode=?', [a.id, md, cid, Date.now(), JSON.stringify(b), a.id, md]);
            } catch (e) { /* number clash or duplicate cid: look again / retry */ }
            row = await find();
          }
          if (!row) return J({ error: 'Could not save the bill, please retry' }, 503);
          return J({ ok: true, id: pad(row.mode, row.no) });
        }
        // GET /api/sync
        const kv = Object.fromEntries((await all('SELECT k,v FROM kv WHERE owner=?', [a.id])).map((r) => [r.k, r.v]));
        const bills = (await all('SELECT mode,no,data FROM bills WHERE owner=? ORDER BY ts DESC LIMIT 3000', [a.id])).map((r) => { let d = {}; try { d = JSON.parse(r.data); } catch {} return { ...d, id: pad(r.mode, r.no) }; });
        return J({ acct: { id: a.id, shop: a.shop, modes }, bills, kv, cats: await getCats() });
      }
      // ---- admin ----
      if (p === '/api/admin/login' && m === 'POST') {
        // Accept both documented names and common legacy aliases. Never expose
        // the configured username/password in an API response.
        const adminUser = String(env.ADMIN_USER || env.ADMIN_USERNAME || '').trim();
        const adminPass = String(env.ADMIN_PASS || env.ADMIN_PASSWORD || '');
        if (!adminUser || !adminPass) {
          return J({
            error: 'Admin login is not configured. In Vercel, set ADMIN_USER and ADMIN_PASS, then redeploy.'
          }, 503);
        }
        const submittedUser = String(body.user ?? body.username ?? '').trim();
        const submittedPass = String(body.pass ?? body.password ?? '');
        if (!same(submittedUser, adminUser) || !same(submittedPass, adminPass)) {
          return J({ error: 'Wrong admin username or password. Check the ADMIN_USER and ADMIN_PASS values in Vercel.' }, 401);
        }
        return J({ token: mint(env, { role: 'admin' }, 12 * 3600) });
      }
      if (p.startsWith('/api/admin/')) {
        if (!tok || tok.role !== 'admin') return J({ error: 'Admin sign-in required' }, 401);
        if (p === '/api/admin/accounts' && m === 'GET') {
          const acc = (await all('SELECT id,shop,user,mobile,active,created,modes FROM accounts ORDER BY rowid DESC')).map((r) => ({ ...r }));
          const bs = await all('SELECT owner,mode,COUNT(*) AS n,MAX(ts) AS t FROM bills GROUP BY owner,mode');
          for (const a of acc) {
            const mine = bs.filter((x) => x.owner === a.id);
            a.r = Number(mine.find((x) => x.mode === 'r')?.n || 0); a.w = Number(mine.find((x) => x.mode === 'w')?.n || 0);
            const t = Math.max(0, ...mine.map((x) => Number(x.t))); a.last = t ? new Date(t).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '';
            a.active = !!Number(a.active);
          }
          return J({ accounts: acc, cats: await getCats() });
        }
        if (p === '/api/admin/accounts' && m === 'POST') {
          const { shop, user, pass, mobile } = body, modes = ['r', 'w', 'rw'].includes(body.modes) ? body.modes : 'rw';
          if (!shop || !user || !pass || !/^\d{10}$/.test(mobile || '')) return J({ error: 'Fill all fields; mobile must be 10 digits' }, 400);
          if (await first('SELECT 1 AS x FROM accounts WHERE user=?', [user])) return J({ error: 'Username already exists' }, 409);
          const id = 'a' + crypto.randomUUID().replace(/-/g, '').slice(0, 12), salt = crypto.randomUUID();
          await q('INSERT INTO accounts(id,shop,user,pass,salt,mobile,active,created,modes) VALUES(?,?,?,?,?,?,1,?,?)', [id, shop, user, await hash(pass, salt), salt, mobile, new Date().toLocaleString('en-IN'), modes]);
          return J({ ok: true });
        }
        const mm = p.match(/^\/api\/admin\/accounts\/(\w+)$/);
        if (mm && m === 'PATCH') {
          if (body.modes !== undefined) {
            if (!['r', 'w', 'rw'].includes(body.modes)) return J({ error: 'Bad modes' }, 400);
            await q('UPDATE accounts SET modes=? WHERE id=?', [body.modes, mm[1]]);
          } else await q('UPDATE accounts SET active=1-active WHERE id=?', [mm[1]]);
          return J({ ok: true });
        }
        if (mm && m === 'DELETE') {
          await db.batch([{ sql: 'DELETE FROM kv WHERE owner=?', args: [mm[1]] }, { sql: 'DELETE FROM bills WHERE owner=?', args: [mm[1]] }, { sql: 'DELETE FROM accounts WHERE id=?', args: [mm[1]] }], 'write');
          return J({ ok: true });
        }
        if (p === '/api/admin/cats' && m === 'PUT') {
          const cats = (Array.isArray(body.cats) ? body.cats : []).map((x) => String(x).slice(0, 40));
          await q("INSERT OR REPLACE INTO kv(owner,k,v) VALUES('_global','cats',?)", [JSON.stringify(cats)]);
          return J({ ok: true });
        }
      }
      return J({ error: 'Not found' }, 404);
    } catch (e) { console.error(e); return J({ error: 'Server error' }, 500); }
  };
}
module.exports = { makeHandler };
