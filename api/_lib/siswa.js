'use strict';
const { httpError, parseCookies } = require('./http');
const { verifyToken } = require('./crypto');
const { rpcService } = require('./supabase');

const COOKIE = 'ymic_siswa';
const SESSION_SECONDS = 30 * 60;

function cookieHeader(value, maxAge) {
  const secure = process.env.NODE_ENV === 'development' || process.env.INSECURE_COOKIES === '1' ? '' : '; Secure';
  return `${COOKIE}=${value}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

// Identitas siswa HANYA dari sesi bertanda tangan; tidak pernah dari parameter klien.
async function requireStudent(req) {
  const payload = verifyToken(parseCookies(req)[COOKIE]);
  if (!payload || !payload.sid) throw httpError(401, 'Sesi berakhir. Silakan masuk kembali.');
  const rows = await rpcService('portal_session_valid', { p_student_id: payload.sid, p_pin_version: payload.pv });
  if (!Array.isArray(rows) || !rows.length) throw httpError(401, 'Sesi berakhir. Silakan masuk kembali.');
  return { studentId: payload.sid, pinVersion: payload.pv, mustChange: !!rows[0].must_change };
}

module.exports = { COOKIE, SESSION_SECONDS, cookieHeader, requireStudent };
