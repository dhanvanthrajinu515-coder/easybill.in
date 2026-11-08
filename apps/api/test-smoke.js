// Offline smoke test using Node's built-in SQLite (needs Node 22+). Run: node test-smoke.js
const { DatabaseSync } = require('node:sqlite');
const { makeHandler } = require('./lib/handler');
const { migrate } = require('./migrate');
const s = new DatabaseSync(':memory:');
const fake = {
  async execute(x) { const sql = typeof x === 'string' ? x : x.sql, a = x.args || []; const st = s.prepare(sql);
    if (/^\s*(select|with)/i.test(sql)) return { rows: st.all(...a).map((r) => ({ ...r })) }; const r = st.run(...a); return { rows: [], rowsAffected: r.changes }; },
  async batch(l) { for (const x of l) await this.execute(x); return []; },
  async executeMultiple(sql) { s.exec(sql); },
};
const env = { JWT_SECRET: 'test-secret', ADMIN_USER: 'boss', ADMIN_PASS: 'pw123' };
const h = makeHandler(fake, env);
const call = async (method, path, body, tok) => { let out; const res = { h: {}, setHeader(k, v) { this.h[k] = v; }, status(c) { out = { status: c }; return this; }, json(o) { out.json = o; return this; }, end() { return this; } };
  await h({ method, url: path, headers: tok ? { authorization: 'Bearer ' + tok } : {}, body }, res); return out; };
let bad = 0; const ok = (c, m) => { if (!c) { bad++; console.log('FAIL', m); } else console.log('ok  ', m); };
(async () => {
  await migrate(fake); await migrate(fake); ok(true, 'migrations apply twice safely');
  ok((await call('POST', '/api/admin/login', { user: 'boss', pass: 'bad' })).status === 401, 'wrong admin rejected');
  const at = (await call('POST', '/api/admin/login', { user: 'boss', pass: 'pw123' })).json.token; ok(!!at, 'admin login');
  ok((await call('GET', '/api/admin/accounts')).status === 401, 'admin API needs token');
  ok((await call('POST', '/api/admin/accounts', { shop: 'A Shop', user: 'a', pass: 'p1', mobile: '9000000001', modes: 'r' }, at)).json.ok, 'create shop A (retail only)');
  ok((await call('POST', '/api/admin/accounts', { shop: 'B Shop', user: 'b', pass: 'p2', mobile: '9000000002' }, at)).json.ok, 'create shop B');
  ok((await call('POST', '/api/admin/accounts', { shop: 'X', user: 'a', pass: 'p', mobile: '9000000003' }, at)).status === 409, 'duplicate username blocked');
  ok((await call('POST', '/api/login', { user: 'a', pass: 'wrong' })).status === 401, 'wrong shop password rejected');
  const la = (await call('POST', '/api/login', { user: 'a', pass: 'p1' })).json; ok(la.token && la.acct.modes === 'r', 'shop A login, modes=r');
  const lb = (await call('POST', '/api/login', { user: 'b', pass: 'p2' })).json;
  const A = la.token, B = lb.token, bill = (cid, mode = 'r') => ({ mode, bill: { cid, ts: Date.now(), date: 'x', cust: 'Ravi', items: [{ name: 'T', price: 10, q: 1, gst: 0 }], total: 10 } });
  ok((await call('PUT', '/api/kv', { k: 'r_prod', v: '[{"code":"T1"}]' }, A)).json.ok, 'shop A saves retail products');
  ok((await call('PUT', '/api/kv', { k: 'w_prod', v: '[]' }, A)).status === 423, 'shop A blocked from wholesale data (423)');
  const b1 = await call('POST', '/api/bills', bill('c1'), A); ok(b1.json.id === 'R0001', 'first bill R0001');
  ok((await call('POST', '/api/bills', bill('c1'), A)).json.id === 'R0001', 'retry same bill is not duplicated');
  ok((await call('POST', '/api/bills', bill('c2'), A)).json.id === 'R0002', 'second bill R0002');
  ok((await call('POST', '/api/bills', bill('c3', 'w'), A)).status === 423, 'wholesale bill blocked for shop A');
  const sa = (await call('GET', '/api/sync', null, A)).json; ok(sa.bills.length === 2 && sa.kv.r_prod, 'sync returns shop A data');
  const sb = (await call('GET', '/api/sync', null, B)).json; ok(sb.bills.length === 0 && !sb.kv.r_prod, 'shop B cannot see shop A data');
  ok((await call('POST', '/api/bills', bill('d1', 'w'), B)).json.id === 'W0001', 'shop B wholesale numbering independent');
  const id = (await call('GET', '/api/admin/accounts', null, at)).json.accounts.find((x) => x.user === 'a').id;
  ok((await call('PATCH', '/api/admin/accounts/' + id, { modes: 'rw' }, at)).json.ok, 'admin opens wholesale for A');
  ok((await call('POST', '/api/bills', bill('c3', 'w'), A)).json.id === 'W0001', 'shop A can now bill wholesale');
  const ls = (await call('GET', '/api/admin/accounts', null, at)).json.accounts.find((x) => x.user === 'a'); ok(ls.r === 2 && ls.w === 1 && ls.active === true && ls.last, 'admin sees bill counts per mode');
  await call('PATCH', '/api/admin/accounts/' + id, {}, at); ok((await call('GET', '/api/sync', null, A)).status === 403, 'disabled shop is blocked at once');
  ok((await call('POST', '/api/login', { user: 'a', pass: 'p1' })).status === 403, 'disabled shop cannot log in');
  await call('PATCH', '/api/admin/accounts/' + id, {}, at); ok((await call('GET', '/api/sync', null, A)).json.bills.length === 3, 'reactivated: all data still there');
  ok((await call('PUT', '/api/admin/cats', { cats: ['Pooja', 'Sweets'] }, at)).json.ok && (await call('GET', '/api/sync', null, B)).json.cats[0] === 'Pooja', 'admin categories reach shops');
  ok((await call('GET', '/api/sync', null, 'bad.token')).status === 401, 'bad token rejected');
  ok((await call('GET', '/api/admin/accounts', null, A)).status === 401, 'shop token cannot use admin API');
  ok((await call('DELETE', '/api/admin/accounts/' + id, null, at)).json.ok && (await call('GET', '/api/sync', null, A)).status === 401, 'delete removes account');
  console.log(bad ? 'FAILURES: ' + bad : 'ALL API TESTS PASSED');
})();
