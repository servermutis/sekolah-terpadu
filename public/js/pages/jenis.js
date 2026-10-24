import { h, mount, icon, skeletons, emptyState, badge, field, withBusy, toast, modal, confirmDialog } from '../ui.js';
import { db, eq } from '../api.js';
import { S, can, MANAGE_KESISWAAN, CATEGORY_LABEL } from '../state.js';

export async function render(root) {
  const manager = can(...MANAGE_KESISWAAN);
  let showAll = false;
  const box = h('div', { class: 'list' });
  async function load() {
    mount(box, skeletons(3));
    try {
      let rows = await db.select('violation_types', { select: '*', school_id: eq(S.schoolId), order: 'code.asc' });
      if (!showAll) rows = rows.filter(r => r.status === 'aktif');
      if (!rows.length) return mount(box, emptyState('Belum ada jenis pelanggaran.'));
      mount(box, rows.map(t => h('div', { class: 'item', style: { cursor: 'default' } },
        h('div', { class: 'top' }, h('div', null, h('div', { class: 'name' }, t.name), h('div', { class: 'small muted' }, `${t.code}${t.valid_from || t.valid_to ? ` • berlaku ${t.valid_from || '…'} s/d ${t.valid_to || '…'}` : ''}`)), h('span', { class: 'pts' }, t.default_points + ' poin')),
        h('div', { class: 'row wrap' }, badge(CATEGORY_LABEL[t.category], t.category), t.status !== 'aktif' ? badge('Nonaktif', 'gray') : null),
        manager ? h('div', { class: 'row wrap' }, h('button', { class: 'btn ghost small', type: 'button', onclick: () => form(t) }, icon('edit', 16), 'Ubah'),
          h('button', { class: 'btn ghost small', type: 'button', onclick: async () => { try { await db.update('violation_types', { id: eq(t.id) }, { status: t.status === 'aktif' ? 'nonaktif' : 'aktif' }); toast('Status diperbarui.'); load(); } catch (e) { toast(e.message, 'err'); } } }, t.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan'),
          h('button', { class: 'btn ghost small', type: 'button', onclick: async () => { if (await confirmDialog({ title: 'Hapus jenis pelanggaran', message: `Hapus "${t.name}" secara permanen? Hanya bisa jika belum pernah dipakai.`, danger: true, confirmText: 'Hapus' })) { try { await db.remove('violation_types', { id: eq(t.id) }); toast('Dihapus.'); load(); } catch (e) { toast(e.code === '23503' ? 'Sudah pernah dipakai pada catatan — nonaktifkan saja.' : e.message, 'err'); } } } }, 'Hapus')) : null)));
    } catch (e) { mount(box, h('div', { class: 'card err' }, e.message)); }
  }
  function form(t) {
    const code = h('input', { class: 'input', value: t?.code || '', maxlength: 20, placeholder: 'DIS-007' }), name = h('input', { class: 'input', value: t?.name || '', maxlength: 150 });
    const cat = h('select', { class: 'input' }, ['ringan', 'sedang', 'berat'].map(c => h('option', { value: c }, CATEGORY_LABEL[c]))); cat.value = t?.category || 'ringan';
    const pts = h('input', { class: 'input', type: 'number', min: 0, max: 1000, step: 1, value: t?.default_points ?? 5 });
    const vf = h('input', { class: 'input', type: 'date', value: t?.valid_from || '' }), vt = h('input', { class: 'input', type: 'date', value: t?.valid_to || '' });
    const err = h('div', { class: 'err', role: 'alert' });
    const save = h('button', { class: 'btn', type: 'button', onclick: () => withBusy(save, async () => {
      err.textContent = '';
      if (code.value.trim().length < 2 || name.value.trim().length < 3) { err.textContent = 'Isi kode dan nama pelanggaran.'; return; }
      const vals = { code: code.value.trim().toUpperCase(), name: name.value.trim(), category: cat.value, default_points: Number(pts.value), valid_from: vf.value || null, valid_to: vt.value || null };
      try { if (t) await db.update('violation_types', { id: eq(t.id) }, vals); else await db.insert('violation_types', { ...vals, school_id: S.schoolId }); toast('Tersimpan.'); m.close(); load(); }
      catch (e) { err.textContent = e.message; }
    }) }, 'Simpan');
    const m = modal({ title: t ? 'Ubah Jenis Pelanggaran' : 'Tambah Jenis Pelanggaran', body: [h('div', { class: 'form-grid two' }, field('Kode', code), field('Kategori', cat)), field('Nama pelanggaran', name), field('Poin default', pts, t ? 'Mengubah poin TIDAK mengubah catatan lama; catatan menyimpan poin saat kejadian.' : null), h('div', { class: 'form-grid two' }, field('Berlaku dari', vf), field('Berlaku sampai', vt)), err], actions: [h('button', { class: 'btn ghost', type: 'button', onclick: () => m.close() }, 'Batal'), save] });
  }
  const chk = h('input', { type: 'checkbox', onchange: (e) => { showAll = e.target.checked; load(); } });
  mount(root, h('div', { class: 'page-head' }, h('h1', null, 'Aturan Poin Pelanggaran'), manager ? h('button', { class: 'btn gold', type: 'button', onclick: () => form(null) }, icon('plus', 20), 'Tambah') : null),
    h('div', { class: 'notice' }, 'Aturan di sini berlaku untuk unit aktif. Contoh awal harus disesuaikan dengan tata tertib resmi sekolah.'),
    h('label', { class: 'check' }, chk, h('span', null, 'Tampilkan yang nonaktif')), box);
  load();
}
