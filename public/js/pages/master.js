import { h, mount, icon, skeletons, emptyState, badge, field, withBusy, toast, modal, confirmDialog, fmtDate } from '../ui.js';
import { db, eq } from '../api.js';
import { S, can, isYayasan, loadSchoolData, nameOf } from '../state.js';
import { refreshView } from '../app.js';

export async function render(root) {
  const manage = can('admin_sekolah', 'kurikulum');
  let tab = 'kelas';
  const tabsEl = h('div', { class: 'tabs', role: 'tablist' }), body = h('div', { class: 'stack' });
  const tabs = [['kelas', 'Kelas'], ['tahun', 'Tahun Ajaran'], ...(isYayasan() ? [['unit', 'Unit Sekolah']] : [])];
  const draw = () => { mount(tabsEl, tabs.map(([v, l]) => h('button', { class: 'tab', role: 'tab', type: 'button', 'aria-selected': String(tab === v), onclick: () => { tab = v; draw(); show(); } }, l))); };
  const show = () => ({ kelas: kelas, tahun: tahun, unit: unit })[tab]();

  async function kelas() {
    mount(body, skeletons(3));
    if (!S.year) return mount(body, h('div', { class: 'notice' }, 'Belum ada tahun ajaran aktif. Buat dan aktifkan pada tab Tahun Ajaran.'));
    try {
      const rows = await db.rpc('list_classes', { p_school: S.schoolId });
      mount(body, manage ? h('div', { class: 'row between' }, h('span', { class: 'muted' }, `Tahun ajaran ${S.year.year_name}`), h('button', { class: 'btn gold small', type: 'button', onclick: addClass }, icon('plus', 16), 'Kelas baru')) : null,
        rows.length ? h('div', { class: 'list' }, rows.map(c => h('div', { class: 'item', style: { cursor: 'default' } },
          h('div', { class: 'top' }, h('div', { class: 'name' }, 'Kelas ' + c.name), badge(`${c.student_count} siswa`)), h('div', { class: 'small muted' }, 'Wali kelas: ' + (c.homeroom || '—')),
          manage ? h('div', { class: 'row wrap' }, h('button', { class: 'btn ghost small', type: 'button', onclick: () => teachers(c) }, 'Guru & wali kelas'),
            h('button', { class: 'btn ghost small', type: 'button', onclick: async () => { if (await confirmDialog({ title: 'Hapus kelas', message: `Hapus kelas ${c.name}? Hanya bisa bila tidak ada siswa.`, danger: true, confirmText: 'Hapus' })) { try { await db.remove('classes', { id: eq(c.id) }); toast('Kelas dihapus.'); kelas(); } catch (e) { toast(e.code === '23503' ? 'Kelas masih berisi siswa.' : e.message, 'err'); } } } }, 'Hapus')) : null))) : emptyState('Belum ada kelas.')); 
    } catch (e) { mount(body, h('div', { class: 'card err' }, e.message)); }
  }
  function addClass() {
    const name = h('input', { class: 'input', maxlength: 40, placeholder: 'Contoh: 7A atau X-IPA-1' }); const err = h('div', { class: 'err', role: 'alert' });
    const save = h('button', { class: 'btn', type: 'button', onclick: () => withBusy(save, async () => { if (!name.value.trim()) { err.textContent = 'Isi nama kelas.'; return; } try { await db.insert('classes', { school_id: S.schoolId, academic_year_id: S.year.id, name: name.value.trim() }); toast('Kelas ditambahkan.'); m.close(); kelas(); } catch (e) { err.textContent = e.message; } }) }, 'Simpan');
    const m = modal({ title: 'Kelas Baru', body: [field('Nama kelas', name), err], actions: [save] });
  }
  async function teachers(c) {
    const box = h('div', { class: 'stack' }); const m = modal({ title: 'Kelas ' + c.name, body: box });
    const user = h('select', { class: 'input' }, h('option', { value: '' }, '— pilih pengguna —'), [...S.profiles.values()].map(p => h('option', { value: p.id }, p.full_name)));
    const role = h('select', { class: 'input' }, h('option', { value: 'wali_kelas' }, 'Wali kelas'), h('option', { value: 'guru' }, 'Guru pengampu'));
    const err = h('div', { class: 'err', role: 'alert' });
    async function load() {
      const rows = await db.select('class_teachers', { select: 'id,user_id,role', class_id: eq(c.id) });
      const add = h('button', { class: 'btn small', type: 'button', onclick: () => withBusy(add, async () => { err.textContent = ''; if (!user.value) { err.textContent = 'Pilih pengguna.'; return; } try { await db.insert('class_teachers', { school_id: S.schoolId, class_id: c.id, user_id: user.value, role: role.value }); load(); } catch (e) { err.textContent = e.message; } }) }, 'Tambah');
      mount(box, rows.length ? h('ul', { class: 'timeline' }, rows.map(r => h('li', null, h('div', { class: 'row between' }, h('span', null, h('b', null, nameOf(r.user_id)), ' — ', r.role === 'wali_kelas' ? 'wali kelas' : 'guru'),
        h('button', { class: 'btn ghost small', type: 'button', onclick: async () => { try { await db.remove('class_teachers', { id: eq(r.id) }); load(); } catch (e) { toast(e.message, 'err'); } } }, 'Lepas'))))) : h('p', { class: 'muted' }, 'Belum ada penugasan.'),
        h('div', { class: 'form-grid two' }, field('Pengguna', user), field('Sebagai', role)), err, add, h('p', { class: 'hint' }, 'Guru hanya dapat melihat dan melapor untuk siswa pada kelas yang ditugaskan. Pengguna harus sudah memiliki peran Guru/Wali Kelas di menu Pengguna.'));
    }
    load().catch(e => mount(box, h('div', { class: 'err' }, e.message))); 
    m.el.addEventListener('close', () => kelas());
  }

  async function tahun() {
    mount(body, skeletons(2));
    try {
      const years = await db.select('academic_years', { select: 'id,year_name,is_active', school_id: eq(S.schoolId), order: 'year_name.desc' });
      const sems = await db.select('semesters', { select: 'id,academic_year_id,name,start_date,end_date', school_id: eq(S.schoolId), order: 'start_date.asc' });
      mount(body, manage ? h('div', { class: 'row', style: { justifyContent: 'flex-end' } }, h('button', { class: 'btn gold small', type: 'button', onclick: addYear }, icon('plus', 16), 'Tahun ajaran baru')) : null,
        years.length ? h('div', { class: 'list' }, years.map(y => h('div', { class: 'item', style: { cursor: 'default' } }, h('div', { class: 'top' }, h('div', { class: 'name' }, y.year_name), y.is_active ? badge('Aktif', 'ringan') : badge('Tidak aktif', 'gray')),
          sems.filter(s => s.academic_year_id === y.id).map(s => h('div', { class: 'small muted' }, `Semester ${s.name}: ${fmtDate(s.start_date)} – ${fmtDate(s.end_date)}`)),
          manage && !y.is_active ? h('div', null, h('button', { class: 'btn ghost small', type: 'button', onclick: async () => { if (await confirmDialog({ title: 'Aktifkan tahun ajaran', message: `Jadikan ${y.year_name} tahun ajaran aktif? Kelas aktif siswa mengikuti tahun ajaran ini; riwayat lama tetap tersimpan.`, confirmText: 'Aktifkan' })) { try { await db.rpc('set_active_year', { p_year: y.id }); await loadSchoolData(); toast('Tahun ajaran diaktifkan.'); refreshView(); } catch (e) { toast(e.message, 'err'); } } } }, 'Jadikan aktif')) : null))) : emptyState('Belum ada tahun ajaran.'),
        h('p', { class: 'hint' }, 'Fitur kenaikan kelas massal akan ditambahkan pada fase modul akademik.'));
    } catch (e) { mount(body, h('div', { class: 'card err' }, e.message)); }
  }
  function addYear() {
    const nm = h('input', { class: 'input', placeholder: '2027/2028', maxlength: 9 }); const err = h('div', { class: 'err', role: 'alert' });
    const save = h('button', { class: 'btn', type: 'button', onclick: () => withBusy(save, async () => {
      const mt = /^(\d{4})\/(\d{4})$/.exec(nm.value.trim()); if (!mt || +mt[2] !== +mt[1] + 1) { err.textContent = 'Format: 2027/2028.'; return; }
      try { const r = await db.insert('academic_years', { school_id: S.schoolId, year_name: nm.value.trim(), is_active: false }); const y = +mt[1];
        await db.insert('semesters', [{ school_id: S.schoolId, academic_year_id: r[0].id, name: 'Ganjil', start_date: `${y}-07-13`, end_date: `${y}-12-19` }, { school_id: S.schoolId, academic_year_id: r[0].id, name: 'Genap', start_date: `${y + 1}-01-04`, end_date: `${y + 1}-06-26` }]);
        toast('Tahun ajaran dibuat. Sesuaikan tanggal semester bila perlu.'); m.close(); tahun(); } catch (e) { err.textContent = e.message; } }) }, 'Simpan');
    const m = modal({ title: 'Tahun Ajaran Baru', body: [field('Tahun ajaran', nm, 'Semester Ganjil/Genap dibuat otomatis dengan tanggal standar.'), err], actions: [save] });
  }

  async function unit() {
    mount(body, skeletons(2));
    const rows = await db.select('schools', { select: '*', order: 'code.asc' });
    mount(body, h('div', { class: 'list' }, rows.map(s => { const nm = h('input', { class: 'input', value: s.name, maxlength: 120, 'aria-label': 'Nama ' + s.code });
      const b = h('button', { class: 'btn small', type: 'button', onclick: () => withBusy(b, async () => { try { await db.update('schools', { id: eq(s.id) }, { name: nm.value.trim() }); toast('Nama unit disimpan.'); } catch (e) { toast(e.message, 'err'); } }) }, 'Simpan');
      return h('div', { class: 'item', style: { cursor: 'default' } }, h('div', { class: 'name' }, s.code), h('div', { class: 'row' }, nm, b)); })));
  }

  mount(root, h('h1', null, 'Master Data'), tabsEl, body); draw(); show();
}
