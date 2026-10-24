'use strict';
const { send, readJson, httpError, handler } = require('../_lib/http');
const { hashPin, randomPin } = require('../_lib/crypto');
const { rpcService, rpcUser, restUser, requireStaff } = require('../_lib/supabase');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Atur / reset PIN portal siswa (satu siswa atau satu kelas). PIN hanya ditampilkan sekali.
module.exports = handler(['POST'], async (req, res) => {
  const { user, jwt } = await requireStaff(req);
  const body = await readJson(req);
  let targets = [];

  if (body.student_id) {
    if (!UUID.test(body.student_id)) throw httpError(400, 'ID siswa tidak valid.');
    if (!(await rpcUser('can_manage_pin', { p_student: body.student_id }, jwt))) throw httpError(403, 'Anda tidak berwenang mengatur PIN siswa ini.');
    const rows = await restUser(`students?id=eq.${body.student_id}&select=id,nis,full_name,school_id,status`, jwt);
    if (!rows || !rows[0]) throw httpError(404, 'Data siswa tidak ditemukan.');
    targets = rows;
  } else if (body.class_id) {
    if (!UUID.test(body.class_id)) throw httpError(400, 'ID kelas tidak valid.');
    if (!(await rpcUser('can_manage_pin_class', { p_class: body.class_id }, jwt))) throw httpError(403, 'Anda tidak berwenang mengatur PIN kelas ini.');
    const cls = await restUser(`classes?id=eq.${body.class_id}&select=school_id`, jwt);
    if (!cls || !cls[0]) throw httpError(404, 'Kelas tidak ditemukan.');
    const list = await rpcUser('list_students', { p_school: cls[0].school_id, p_class: body.class_id, p_status: 'aktif', p_limit: 300 }, jwt);
    targets = (list || []).map(s => ({ id: s.id, nis: s.nis, full_name: s.full_name, school_id: cls[0].school_id, status: s.status }));
    if (!targets.length) throw httpError(404, 'Tidak ada siswa aktif pada kelas ini.');
  } else throw httpError(400, 'Pilih siswa atau kelas.');

  let custom = null;
  if (body.pin !== undefined && body.pin !== null && body.pin !== '') {
    custom = String(body.pin);
    if (!body.student_id) throw httpError(400, 'PIN manual hanya untuk satu siswa.');
    if (custom.length < 4 || custom.length > 12 || /\s/.test(custom)) throw httpError(400, 'PIN manual harus 4-12 karakter tanpa spasi.');
  }

  const out = [];
  for (const t of targets) {
    if (t.status !== 'aktif') continue;
    const pin = custom || randomPin(6);
    await rpcService('portal_set_pin', { p_student_id: t.id, p_hash: await hashPin(pin), p_must_change: true });
    await rpcService('log_event', { p_user: user.id, p_action: 'PIN_RESET', p_entity: 'student_access', p_entity_id: t.id, p_school: t.school_id, p_detail: { by: 'staff' } });
    out.push({ student_id: t.id, nis: t.nis, full_name: t.full_name, pin });
  }
  send(res, 200, { pins: out });
});
