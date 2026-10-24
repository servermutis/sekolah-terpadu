'use strict';
const { send, readJson, httpError, handler } = require('../_lib/http');
const { hashPin, verifyPin, signToken } = require('../_lib/crypto');
const { rpcService } = require('../_lib/supabase');
const { SESSION_SECONDS, cookieHeader, requireStudent } = require('../_lib/siswa');

function validateNewPin(pin, nis) {
  if (pin.length < 6 || pin.length > 12) return 'PIN baru harus 6-12 karakter.';
  if (/\s/.test(pin)) return 'PIN tidak boleh mengandung spasi.';
  if (/^(.)\1+$/.test(pin)) return 'PIN terlalu mudah ditebak.';
  if ('0123456789012345'.includes(pin) || '9876543210987654'.includes(pin)) return 'PIN terlalu mudah ditebak.';
  if (pin.toUpperCase() === nis) return 'PIN tidak boleh sama dengan NIS.';
  return null;
}

module.exports = handler(['POST'], async (req, res) => {
  const s = await requireStudent(req);
  const { old_pin, new_pin } = await readJson(req);
  const oldPin = String(old_pin || ''), newPin = String(new_pin || '');
  if (!oldPin || !newPin) throw httpError(400, 'Lengkapi PIN lama dan PIN baru.');

  const key = 'chg:' + s.studentId;
  const locked = await rpcService('portal_check_lock', { p_keys: [key] });
  if (locked) throw httpError(429, 'Terlalu banyak percobaan. Coba lagi nanti.', { retry_at: locked });

  const rows = await rpcService('portal_get_access', { p_student_id: s.studentId });
  const acc = Array.isArray(rows) ? rows[0] : null;
  if (!acc) throw httpError(401, 'Sesi berakhir. Silakan masuk kembali.');
  if (!(await verifyPin(oldPin, acc.pin_hash))) {
    await rpcService('portal_register_failure', { p_key: key, p_max: 5, p_lock_minutes: 15 });
    throw httpError(400, 'PIN lama tidak sesuai.');
  }
  const bad = validateNewPin(newPin, acc.nis);
  if (bad) throw httpError(400, bad);
  if (newPin === oldPin) throw httpError(400, 'PIN baru harus berbeda dari PIN lama.');

  const version = await rpcService('portal_set_pin', { p_student_id: s.studentId, p_hash: await hashPin(newPin), p_must_change: false });
  await rpcService('portal_reset_throttle', { p_key: key });
  await rpcService('log_event', { p_user: null, p_action: 'PIN_CHANGE', p_entity: 'student_access', p_entity_id: s.studentId, p_school: null, p_detail: { by: 'student' } });
  const token = signToken({ sid: s.studentId, pv: version, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS });
  send(res, 200, { ok: true }, { 'Set-Cookie': cookieHeader(token, SESSION_SECONDS) });
});
