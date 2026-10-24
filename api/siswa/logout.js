'use strict';
const { send, handler } = require('../_lib/http');
const { cookieHeader } = require('../_lib/siswa');

module.exports = handler(['POST'], async (req, res) => {
  send(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader('', 0) });
});
