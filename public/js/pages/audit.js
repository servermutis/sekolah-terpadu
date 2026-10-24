import { h, mount, skeletons, emptyState, badge, fmtDateTime, field, modal } from '../ui.js';
import { db, eq } from '../api.js';
import { S, nameOf, isYayasan } from '../state.js';

const ENT = { '': 'Semua', violation_records: 'Catatan pelanggaran', violation_actions: 'Tindakan koreksi', violation_types: 'Aturan poin', students: 'Siswa', student_enrollments: 'Penempatan kelas', user_roles: 'Peran pengguna', class_teachers: 'Penugasan guru', discipline_actions: 'Pembinaan', classes: 'Kelas', academic_years: 'Tahun ajaran', student_access: 'Akses portal', portal_login: 'Login portal' };

export async function render(root) {
  let entity = '';
  const sel = h('select', { class: 'input', 'aria-label': 'Jenis data' }, Object.entries(ENT).map(([k, v]) => h('option', { value: k }, v)));
  const out = h('div', null);
  async function load() {
    mount(out, skeletons(4));
    try {
      const p = { select: 'id,user_id,action,entity,entity_id,school_id,detail,created_at', order: 'created_at.desc', limit: 200 };
      if (!isYayasan()) p.school_id = eq(S.schoolId); if (entity) p.entity = eq(entity);
      const rows = await db.select('audit_logs', p);
      if (!rows.length) return mount(out, emptyState('Belum ada aktivitas tercatat.'));
      mount(out, h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, ['Waktu', 'Pengguna', 'Aksi', 'Data', ''].map(t => h('th', null, t)))),
        h('tbody', null, rows.map(r => h('tr', null, h('td', null, fmtDateTime(r.created_at)), h('td', null, nameOf(r.user_id)), h('td', null, badge(r.action, r.action === 'DELETE' ? 'red' : r.action === 'INSERT' ? 'ringan' : 'gold')), h('td', null, ENT[r.entity] || r.entity), h('td', null, h('button', { class: 'btn ghost small', type: 'button', onclick: () => modal({ title: 'Detail aktivitas', wide: true, body: h('pre', { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: '.8rem', margin: 0 } }, JSON.stringify(r.detail, null, 2)) }) }, 'Lihat')))))), h('p', { class: 'hint', style: { padding: '8px' } }, 'Menampilkan 200 aktivitas terbaru. Log bersifat append-only.')));
    } catch (e) { mount(out, h('div', { class: 'card err' }, e.message)); }
  }
  sel.addEventListener('change', () => { entity = sel.value; load(); });
  mount(root, h('h1', null, 'Audit Log'), h('div', { class: 'card flat' }, field('Jenis data', sel)), out); load();
}
