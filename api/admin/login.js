'use strict';
// Explicit route ensures /api/admin/login is always mapped to the shared auth handler.
const { run } = require('../../lib/easybill');
module.exports = run;
