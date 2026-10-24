import { h, mount, icon, debounce, skeletons, emptyState, badge, field, withBusy, toast, modal, confirmDialog, copyText } from '../ui.js';
import { db, eq, serverCall } from '../api.js';
import { S, can, MANAGE_KESISWAAN, VIEW_DISCIPLINE } from '../state.js';
import { openStudentHistory } from './rekap.js';

const PIN_BADGE = { belum: ['Belum ada PIN', 'gray'], sementara: ['PIN awal', 'gold'], aktif: ['PIN aktif', 'ringan'] };

export async function render(root) {
  const manager = can(...MANAGE_KESISWAAN);
  const f = { cls: '', search: '', status: 'aktif' };
  const classes = await db.rpc('list_classes', { p_school: S.schoolId });
  const clsSel = h('select', { class: 'input', 'aria-label': 'Kelas' }, h('option', { value: '' }, 'Semua kelas'), classes.map(c => h('option', { value: c.id }, c.name)));
  const stSel = h('select', { class: 'input', 'aria-label': 'Status' }, [['aktif', 'Aktif'], ['', 'Semua status'], ['lulus', 'Lulus'], ['pindah', 'Pindah'], ['nonaktif', 'Nonaktif']].map(([v, l]) => h('option', { value: v }, l)));
  const q = h('input', { class: 'input', type: 'search', placeholder: 'Cari nama atau NIS…', 'aria-label': 'Cari' });
  const box = h('div', { class: 'list' }), info = h('div', { class: 'small muted' });

  async function load() {
    mount(box, skeletons(4));
    try {
      const rows = await db.rpc('list_students', { p_school: S.schoolId, p_class: clsSel.value || null, p_search: q.value.trim() || null, p_status: stSel.value || '', p_limit: 300 });
      info.textContent = `${rows.length} siswa${rows.length >= 300 ? ' (menampilkan 300 pertama — gunakan pencarian)' : ''}`;
      if (!rows.length) return mount(box, emptyState('Belum ada siswa yang sesuai.', manager ? 'Tambahkan siswa atau impor dari daftar.' : null));
      mount(box, rows.map(s => h('div', { class: 'item', style: { cursor: 'default' } },
        h('div', { class: 'top' }, h('div', null, h('div', { class: 'name' }, s.full_name), h('div', { class: 'small muted' }, `NIS ${s.nis} • ${s.class_name || 'Belum ada kelas'}${s.gender ? ' • ' + s.gender : ''}`)),
          h('div', { class: 'row wrap' }, s.status !== 'aktif' ? badge(s.status, 'gray') : null, s.pin_status ? badge(...PIN_BADGE[s.pin_status]) : null)),
        h('div', { class: 'row wrap' },
          can(...VIEW_DISCIPLINE, 'guru') ? h('button', { class: 'btn ghost small', type: 'button', onclick: () => openStudentHistory(s) }, 'Riwayat poin') : null,
          manager ? [h('button', { class: 'btn ghost small', type: 'button', onclick: () => studentForm(s) }, icon('edit', 16), 'Ubah'), h('button', { class: 'btn ghost small', type: 'button', onclick: () => pinDialog(s) }, icon('key', 16), 'PIN')] : null))));
    } catch (e) { mount(box, h('div', { class: 'card err' }, e.message)); }
  }

  function studentForm(s) {
    const nis = h('input', { class: 'input', value: s ? s.nis : '', maxlength: 30, inputmode: 'numeric', required: true, disabled: s ? true : null });
    const name = h('input', { class: 'input', value: s ? s.full_name : '', maxlength: 120 });
    const gender = h('select', { class: 'input' }, h('option', { value: '' }, '—'), h('option', { value: 'L' }, 'Laki-laki'), h('option', { value: 'P' }, 'Perempuan')); gender.value = s?.gender || '';
    const cls = h('select', { class: 'input' }, h('option', { value: '' }, '— belum ditentukan —'), classes.map(c => h('option', { value: c.id }, c.name))); cls.value = s?.class_id || '';
    const gName = h('input', { class: 'input', value: s?.guardian_name || '', maxlength: 100 }), gPhone = h('input', { class: 'input', type: 'tel', value: s?.guardian_phone || '', maxlength: 20 });
    const status = h('select', { class: 'input' }, ['aktif', 'lulus', 'pindah', 'nonaktif'].map(v => h('option', { value: v }, v))); status.value = s?.status || 'aktif';
    const err = h('div', { class: 'err', role: 'alert' });
    const save = h('button', { class: 'btn', type: 'button', onclick: () => withBusy(save, async () => {
      err.textContent = '';
      const n = nis.value.trim().toUpperCase();
      if (!/^[A-Z0-9._-]{3,30}$/.test(n)) { err.textContent = 'NIS 3–30 karakter (huruf, angka, titik, strip).'; return; }
      if (name.value.trim().length < 2) { err.textContent = 'Isi nama lengkap.'; return; }
      try {
        const vals = { full_name: name.value.trim(), gender: gender.value || null, guardian_name: gName.value.trim() || null, guardian_phone: gPhone.value.trim() || null, status: status.value };
        let id = s?.id;
        if (s) await db.update('students', { id: eq(s.id) }, vals);
        else { const r = await db.insert('students', { ...vals, nis: n, school_id: S.schoolId }); id = r[0].id; }
        if (S.year && cls.value !== (s?.class_id || '')) {
          if (s && s.class_id) await db.remove('student_enrollments', { student_id: eq(id), academic_year_id: eq(S.year.id) });
          if (cls.value) await db.insert('student_enrollments', { school_id: S.schoolId, student_id: id, class_id: cls.value, academic_year_id: S.year.id });
        }
        toast('Data siswa tersimpan.'); m.close(); load();
      } catch (e) { err.textContent = e.message; }
    }) }, 'Simpan');
    const m = modal({ title: s ? 'Ubah Siswa' : 'Tambah Siswa', body: [h('div', { class: 'form-grid two' }, field('NIS', nis), field('Nama lengkap', name), field('Jenis kelamin', gender), field('Kelas (TA aktif)', cls), field('Nama wali', gName), field('No. HP wali', gPhone)), s ? field('Status', status) : null, err], actions: [h('button', { class: 'btn ghost', type: 'button', onclick: () => m.close() }, 'Batal'), save] });
  }

  function importDialog() {
    const ta = h('textarea', { class: 'input', rows: 9, placeholder: '10001;Ahmad Fauzi;1A;L\n10002;Siti Aisyah;1A;P', style: { fontFamily: 'ui-monospace, monospace', fontSize: '.9rem' } });
    const res = h('div', { 'aria-live': 'polite' });
    const go = h('button', { class: 'btn', type: 'button', onclick: () => withBusy(go, async () => {
      const lines = ta.value.split(/\r?\n/).map(l => l.trim()).filter(Boolean); const bad = [], ok = [];
      const byName = new Map(classes.map(c => [c.name.toLowerCase(), c.id]));
      lines.forEach((l, i) => {
        const p = l.split(/[;\t,]/).map(x => x.trim()); const nis = (p[0] || '').toUpperCase();
        if (!/^[A-Z0-9._-]{3,30}$/.test(nis) || (p[1] || '').length < 2) return bad.push(`Baris ${i + 1}: format tidak valid`);
        if (p[2] && !byName.has(p[2].toLowerCase())) return bad.push(`Baris ${i + 1}: kelas "${p[2]}" tidak ditemukan`);
        ok.push({ nis, full_name: p[1], class_id: p[2] ? byName.get(p[2].toLowerCase()) : null, gender: ['L', 'P'].includes((p[3] || '').toUpperCase()) ? p[3].toUpperCase() : null });
      });
      if (!ok.length) { mount(res, h('div', { class: 'err' }, bad.length ? bad.slice(0, 8).join('; ') : 'Tidak ada data untuk diimpor.')); return; }
      try {
        const seen = new Set(); const uniq = ok.filter(r => !seen.has(r.nis) && seen.add(r.nis));
        const ins = await db.insert('students', uniq.map(r => ({ school_id: S.schoolId, nis: r.nis, full_name: r.full_name, gender: r.gender })), { ignoreDuplicates: true, onConflict: 'nis' });
        const idByNis = new Map(ins.map(x => [x.nis, x.id]));
        const enr = uniq.filter(r => r.class_id && idByNis.has(r.nis)).map(r => ({ school_id: S.schoolId, student_id: idByNis.get(r.nis), class_id: r.class_id, academic_year_id: S.year.id }));
        if (enr.length && S.year) await db.insert('student_enrollments', enr);
        const skipped = uniq.length - ins.length;
        mount(res, h('div', { class: 'notice' }, `${ins.length} siswa berhasil diimpor.${skipped ? ` ${skipped} dilewati (NIS sudah terdaftar).` : ''}${bad.length ? ` ${bad.length} baris bermasalah: ${bad.slice(0, 5).join('; ')}` : ''}`));
        load();
      } catch (e) { mount(res, h('div', { class: 'err' }, e.message)); }
    }) }, 'Impor');
    modal({ title: 'Impor Siswa', body: [h('p', { class: 'small muted' }, 'Satu siswa per baris: NIS;Nama;Kelas;JK (kelas dan JK opsional). Kelas harus sudah dibuat di Master Data. Pisahkan dengan titik koma, koma, atau tab.'), ta, res], actions: [go] });
  }

  async function pinDialog(s) {
    const custom = h('input', { class: 'input', maxlength: 12, placeholder: 'Kosongkan untuk PIN acak 6 digit', autocomplete: 'off' });
    const out = h('div', { 'aria-live': 'polite' });
    const go = h('button', { class: 'btn', type: 'button', onclick: () => withBusy(go, async () => {
      if (!(await confirmDialog({ title: 'Buat PIN baru', message: `PIN lama ${s.full_name} tidak akan berlaku lagi dan sesi siswa akan berakhir. Lanjutkan?` }))) return;
      try { const r = await serverCall('/api/admin/pin', { student_id: s.id, pin: custom.value.trim() || undefined }); showPins(out, r.pins); load(); } catch (e) { mount(out, h('div', { class: 'err' }, e.message)); }
    }) }, 'Buat PIN baru');
    modal({ title: `PIN Portal — ${s.full_name}`, body: [h('p', { class: 'small muted' }, `NIS ${s.nis}. Siswa wajib mengganti PIN awal saat pertama masuk. PIN hanya tampil sekali.`), field('PIN manual (opsional)', custom), out], actions: [go] });
  }
  function showPins(out, pins) {
    mount(out, h('div', { class: 'stack' }, h('div', { class: 'notice' }, 'Catat/cetak sekarang — PIN tidak dapat dilihat lagi.'),
      pins.length === 1 ? h('div', { class: 'pin-big' }, pins[0].pin) : null,
      h('div', { class: 'pin-cards' }, pins.map(p => h('div', { class: 'pin-card' }, h('div', { class: 'small muted' }, 'NIS ' + p.nis), h('b', null, p.full_name), h('div', { class: 'p' }, p.pin)))),
      h('div', { class: 'row wrap' }, h('button', { class: 'btn ghost small', type: 'button', onclick: async () => toast(await copyText(pins.map(p => `${p.nis}\t${p.full_name}\t${p.pin}`).join('\n')) ? 'Disalin.' : 'Gagal menyalin.') }, 'Salin'), h('button', { class: 'btn ghost small', type: 'button', onclick: () => window.print() }, icon('print', 16), 'Cetak'))));
  }
  async function bulkPins() {
    if (!clsSel.value) return toast('Pilih kelas terlebih dahulu.', 'err');
    const cname = classes.find(c => c.id === clsSel.value).name;
    if (!(await confirmDialog({ title: 'PIN massal', message: `Buat PIN baru untuk SEMUA siswa aktif kelas ${cname}? PIN lama tidak berlaku lagi.`, confirmText: 'Buat PIN' }))) return;
    const out = h('div'); mount(out, skeletons(2)); const m = modal({ title: `PIN Kelas ${cname}`, body: out, wide: true });
    try { const r = await serverCall('/api/admin/pin', { class_id: clsSel.value }); showPins(out, r.pins); load(); } catch (e) { mount(out, h('div', { class: 'err' }, e.message)); }
  }

  [clsSel, stSel].forEach(e => e.addEventListener('change', load)); q.addEventListener('input', debounce(load, 350));
  mount(root, h('div', { class: 'page-head' }, h('h1', null, 'Data Siswa'), manager ? h('div', { class: 'row wrap' }, h('button', { class: 'btn ghost small', type: 'button', onclick: importDialog }, 'Impor'), h('button', { class: 'btn ghost small', type: 'button', onclick: bulkPins }, icon('key', 16), 'PIN kelas'), h('button', { class: 'btn gold', type: 'button', onclick: () => studentForm(null) }, icon('plus', 20), 'Tambah')) : null),
    h('div', { class: 'card flat' }, h('div', { class: 'form-grid two' }, field('Kelas', clsSel), field('Status', stSel)), field('Cari', q)), info, box);
  load();
}
