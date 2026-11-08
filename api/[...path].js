// Vercel serverless catch-all API backed by Turso.
'use strict';
const { createClient } = require('@libsql/client');
const { makeHandler } = require('../apps/api/lib/handler');

let handler;
module.exports = async (req, res) => {
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    return res.status(500).json({
      error: 'Server configuration missing. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in Vercel.'
    });
  }
  if (!process.env.JWT_SECRET || String(process.env.JWT_SECRET).length < 32) {
    return res.status(500).json({
      error: 'Server configuration missing. Set JWT_SECRET to a random value of at least 32 characters.'
    });
  }
  try {
    if (!handler) {
      const db = createClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN
      });
      handler = makeHandler(db, process.env);
    }
    return await handler(req, res);
  } catch (err) {
    console.error('EasyBill API initialization failed:', err);
    return res.status(500).json({ error: 'API initialization failed. Check server configuration.' });
  }
};
