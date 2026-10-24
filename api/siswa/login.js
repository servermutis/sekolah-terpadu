'use strict';
const { send, readJson, httpError, clientIp, handler } = require('../_lib/http');
const { verifyPin, dummyVerify, signToken } = require('../_lib/crypto');
const { rpcService } = require('../_lib/supabase');
const { SESSION_SECONDS, cookieHeader } = require('../_lib/siswa');

const MAX_PER_NIS = 5, MAX_PER_IP = 30, LOCK_MINUTES = 15;
const LOCK_MSG = 'Akses dibatasi sementara karena terlalu banyak percobaan. Coba lagi nanti atau hubungi petugas kesiswaan untuk pemulihan akses.';
const FAIL_MSG = 'NIS atau PIN tidak sesuai.';

module.exports = handler(['POST'], async (req, res) => {
  const body = await readJson(req);
  const nis = String(body.nis || '').trim().toUpperCase();
  const pin = String(body.pin || '');
  if (!nis || !pin) throw httpError(400, 'Masukkan NIS dan PIN.');

  const keys = ['nis:' + nis.slice(0, 40), 'ip:' + clientIp(req)];
  const locked = await rpcService('portal_check_lock', { p_keys: keys });
  if (locked) throw httpError(429, LOCK_MSG, { retry_at: locked });

  const validShape = /^[A-Z0-9._-]{3,30}$/.test(nis) && pin.length >= 4 && pin.length <= 64;
  let row = null;
  if (validShape) { const rows = await rpcService('portal_login_lookup', { p_nis: nis }); row = Array.isArray(rows) ? rows[0] : null; }
  const ok = row ? await verifyPin(pin, row.pin_hash) : await dummyVerify(pin);

  if (!ok) {
    const l1 = await rpcService('portal_register_failure', { p_key: keys[0], p_max: MAX_PER_NIS, p_lock_minutes: LOCK_MINUTES });
    const l2 = await rpcService('portal_register_failure', { p_key: keys[1], p_max: MAX_PER_IP, p_lock_minutes: LOCK_MINUTES });
    if (l1 || l2) throw httpError(429, LOCK_MSG, { retry_at: l1 || l2 });
    throw httpError(401, FAIL_MSG);   // pesan sama untuk NIS tidak terdaftar / PIN salah
  }

  await rpcService('portal_reset_throttle', { p_key: keys[0] });
  await rpcService('portal_touch_login', { p_student_id: row.student_id });
  const token = signToken({ sid: row.student_id, pv: row.pin_version, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS });
  send(res, 200, { ok: true, must_change: !!row.must_change }, { 'Set-Cookie': cookieHeader(token, SESSION_SECONDS) });
});
