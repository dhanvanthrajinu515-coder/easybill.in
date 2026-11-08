const { createClient } = require('@libsql/client');
const { makeHandler } = require('../lib/handler');
const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
module.exports = makeHandler(db, process.env);
