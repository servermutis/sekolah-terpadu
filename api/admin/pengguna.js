'use strict';
const { send, readJson, httpError, handler } = require('../_lib/http');
const { rpcService, rpcUser, restService, adminCreateUser, adminUpdateUser, requireStaff } = require('../_lib/supabase');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES = ['admin_yayasan', 'kepala_sekolah', 'admin_sekolah', 'kurikulum', 'kesiswaan', 'guru', 'wali_kelas', 'bk', 'auditor'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function mayGrant(jwt, role, schoolId) {
  if (role === 'admin_yayasan') return !!(await rpcUser('is_yayasan', {}, jwt));
  return !!(await rpcUser('can_manage_users', { p_school: schoolId }, jwt));
}

function checkRoleInput(role, schoolId) {
  if (!ROLES.includes(role)) throw httpError(400, 'Peran tidak dikenal.');
  if (role === 'admin_yayasan') { if (schoolId) throw httpError(400, 'Admin yayasan berlaku lintas unit.'); }
  else if (!schoolId || !UUID.test(schoolId)) throw httpError(400, 'Pilih unit sekolah.');
}

function checkPassword(pw) {
  if (typeof pw !== 'string' || pw.length < 8 || pw.length > 72) throw httpError(400, 'Kata sandi harus 8-72 karakter.');
}

module.exports = handler(['POST'], async (req, res) => {
  const { user, jwt } = await requireStaff(req);
  const b = await readJson(req);
  const log = (action, entity_id, school, detail) =>
    rpcService('log_event', { p_user: user.id, p_action: action, p_entity: 'user_roles', p_entity_id: String(entity_id), p_school: school || null, p_detail: detail || {} });

  switch (b.action) {
    case 'create': {
      const email = String(b.email || '').trim().toLowerCase();
      const name = String(b.full_name || '').trim();
      if (!EMAIL.test(email)) throw httpError(400, 'Email tidak valid.');
      if (name.length < 2 || name.length > 100) throw httpError(400, 'Nama lengkap 2-100 karakter.');
      checkPassword(b.password);
      checkRoleInput(b.role, b.school_id || null);
      if (!(await mayGrant(jwt, b.role, b.school_id || null))) throw httpError(403, 'Anda tidak berwenang menambah pengguna dengan peran ini.');
      let created;
      try { created = await adminCreateUser({ email, password: b.password, email_confirm: true, user_metadata: { full_name: name } }); }
      catch (e) { if (e.status === 422 || /already|registered|exists/i.test(e.message)) throw httpError(409, 'Email sudah terdaftar. Gunakan "Tambah peran" untuk pengguna yang ada.'); throw e; }
      const id = created.id || (created.user && created.user.id);
      await restService('profiles', { method: 'POST', body: { id, full_name: name, email } });
      await restService('user_roles', { method: 'POST', body: { user_id: id, role: b.role, school_id: b.school_id || null } });
      await log('USER_CREATE', id, b.school_id, { role: b.role });
      return send(res, 200, { ok: true, user_id: id });
    }
    case 'add_role': {
      if (!UUID.test(b.user_id || '')) throw httpError(400, 'Pengguna tidak valid.');
      checkRoleInput(b.role, b.school_id || null);
      if (!(await mayGrant(jwt, b.role, b.school_id || null))) throw httpError(403, 'Anda tidak berwenang memberi peran ini.');
      try { await restService('user_roles', { method: 'POST', body: { user_id: b.user_id, role: b.role, school_id: b.school_id || null } }); }
      catch (e) { if (e.status === 409) throw httpError(409, 'Pengguna sudah memiliki peran tersebut.'); throw e; }
      await log('ROLE_ADD', b.user_id, b.school_id, { role: b.role });
      return send(res, 200, { ok: true });
    }
    case 'remove_role': {
      if (!UUID.test(b.role_id || '')) throw httpError(400, 'Peran tidak valid.');
      const rows = await restService(`user_roles?id=eq.${b.role_id}&select=id,user_id,role,school_id`);
      const row = rows && rows[0];
      if (!row) throw httpError(404, 'Peran tidak ditemukan.');
      if (!(await mayGrant(jwt, row.role, row.school_id))) throw httpError(403, 'Anda tidak berwenang mencabut peran ini.');
      if (row.role === 'admin_yayasan') {
        const all = await restService('user_roles?role=eq.admin_yayasan&select=id');
        if ((all || []).length <= 1) throw httpError(400, 'Tidak dapat mencabut admin yayasan terakhir.');
      }
      await restService(`user_roles?id=eq.${row.id}`, { method: 'DELETE' });
      await log('ROLE_REMOVE', row.user_id, row.school_id, { role: row.role });
      return send(res, 200, { ok: true });
    }
    case 'reset_password': {
      if (!UUID.test(b.user_id || '')) throw httpError(400, 'Pengguna tidak valid.');
      checkPassword(b.password);
      const roles = await restService(`user_roles?user_id=eq.${b.user_id}&select=role,school_id`);
      if (!roles || !roles.length) { if (!(await mayGrant(jwt, 'admin_yayasan', null))) throw httpError(403, 'Anda tidak berwenang.'); }
      for (const r of roles || []) if (!(await mayGrant(jwt, r.role, r.school_id))) throw httpError(403, 'Anda tidak berwenang mengatur ulang kata sandi pengguna ini.');
      await adminUpdateUser(b.user_id, { password: b.password });
      await log('PASSWORD_RESET', b.user_id, null, {});
      return send(res, 200, { ok: true });
    }
    default:
      throw httpError(400, 'Aksi tidak dikenal.');
  }
});
