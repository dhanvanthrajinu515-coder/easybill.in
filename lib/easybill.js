'use strict';
const { createClient } = require('@libsql/client');
const { makeHandler } = require('../apps/api/lib/handler');

let cachedHandler;
function getHandler() {
  const env = process.env;
  if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) {
    const error = new Error('Server configuration missing. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Vercel.');
    error.statusCode = 500;
    throw error;
  }
  if (!env.JWT_SECRET || String(env.JWT_SECRET).length < 32) {
    const error = new Error('Server configuration missing. Set JWT_SECRET to a random value of at least 32 characters.');
    error.statusCode = 500;
    throw error;
  }
  if (!cachedHandler) {
    const db = createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
    cachedHandler = makeHandler(db, env);
  }
  return cachedHandler;
}
async function run(req, res) {
  try {
    return await getHandler()(req, res);
  } catch (error) {
    console.error('EasyBill API initialization failed:', error);
    const status = Number(error.statusCode) || 500;
    return res.status(status).json({ error: error.message || 'EasyBill API initialization failed. Check Vercel environment variables.' });
  }
}
module.exports = { run };
