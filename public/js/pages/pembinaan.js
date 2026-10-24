import { h, mount, icon, skeletons, emptyState, badge, fmtDate, field, withBusy, toast, modal, confirmDialog, todayWIB } from '../ui.js';
import { db, eq } from '../api.js';
import { S, can, nameOf, MANAGE_KESISWAAN, VIEW_DISCIPLINE } from '../state.js';
import { studentPicker } from './common.js';

const ACTIONS = ['Teguran lisan', 'Teguran tertulis', 'Konseling', 'Panggilan orang tua', 'Pembinaan wali kelas', 'Surat peringatan'];
const STATUS = { direncanakan: 'Direncanakan', berjalan: 'Berjalan', selesai: 'Selesai' };

export function openActionForm({ nis, onSaved } = {}) {
  const picker = studentPicker({ initial: nis });
  const action = h('input', { class: 'input', list: 'act-list', maxlength: 100, placeholder: 'Pilih atau ketik tindakan' });
  const dl = h('datalist', { id: 'act-list' }, ACTIONS.map(a => h('option', { value: a })));
  const notes = h('textarea', { class: 'input', rows: 3, maxlength: 1000 });
  const date = h('input', { class: 'input', type: 'date', min: todayWIB() });
  const vis = h('input', { type: 'checkbox' });
  const err = h('div', { class: 'err', role: 'alert' });
  const save = h('button', { class: 'btn', type: 'button', onclick: () => withBusy(save, async () => {
    err.textContent = ''; const st = picker.get();
    if (!st) { err.textContent = 'Pilih siswa terlebih dahulu.'; return; }
    if (action.value.trim().length < 3) { err.textContent = 'Isi jenis tindakan pembinaan.'; return; }
    try {
      await db.insert('discipline_actions', { school_id: S.schoolId, student_id: st.id, action: action.value.trim(), notes: notes.value.trim() || null, follow_up_date: date.value || null, visible_to_student: vis.checked, created_by: S.me.id });
      toast('Pembinaan dicatat.'); m.close(); if (onSaved) onSaved();
    } catch (e) { err.textContent = e.message; }
  }) }, 'Simpan');
  const m = modal({ title: 'Tambah Pembinaan', body: [picker.el, field('Tindakan', action), dl, field('Catatan', notes), field('Tanggal tindak lanjut', date),
    h('label', { class: 'check' }, vis, h('span', null, 'Tampilkan pada portal siswa (jangan dicentang untuk konseling yang bersifat rahasia)')), err], actions: [h('button', { class: 'btn ghost', type: 'button', onclick: () => m.close() }, 'Batal'), save] });
}

export async function render(root) {
  const manager = can(...MANAGE_KESISWAAN, 'bk');
  let tab = '';
  const tabsEl = h('div', { class: 'tabs', role: 'tablist' }), box = h('div', { class: 'list' });
  const tabs = [['', 'Semua'], ['direncanakan', 'Direncanakan'], ['berjalan', 'Berjalan'], ['selesai', 'Selesai']];
  const drawTabs = () => mount(tabsEl, tabs.map(([v, l]) => h('button', { class: 'tab', role: 'tab', type: 'button', 'aria-selected': String(tab === v), onclick: () => { tab = v; drawTabs(); load(); } }, l)));
  async function setStatus(r, status) { try { await db.update('discipline_actions', { id: eq(r.id) }, { status }); toast('Status diperbarui.'); load(); } catch (e) { toast(e.message, 'err'); } }
  async function load() {
    mount(box, skeletons(3));
    try {
      const rows = await db.rpc('list_discipline_actions', { p_school: S.schoolId, p_status: tab || null });
      if (!rows.length) return mount(box, emptyState('Belum ada catatan pembinaan.'));
      mount(box, rows.map(r => h('div', { class: 'item', style: { cursor: 'default' } },
        h('div', { class: 'top' }, h('div', null, h('div', { class: 'name' }, r.student_name), h('div', { class: 'small muted' }, `NIS ${r.nis}`)), badge(STATUS[r.status], r.status === 'selesai' ? 'ringan' : 'gold')),
        h('div', null, h('b', null, r.action)), r.notes ? h('div', { class: 'small' }, r.notes) : null,
        h('div', { class: 'small muted' }, `${r.follow_up_date ? 'Tindak lanjut ' + fmtDate(r.follow_up_date) + ' • ' : ''}${nameOf(r.created_by)}${r.visible_to_student ? ' • tampil di portal siswa' : ' • tidak tampil di portal'}`),
        manager ? h('div', { class: 'row wrap' }, r.status !== 'berjalan' && r.status !== 'selesai' ? h('button', { class: 'btn ghost small', type: 'button', onclick: () => setStatus(r, 'berjalan') }, 'Mulai') : null,
          r.status !== 'selesai' ? h('button', { class: 'btn small', type: 'button', onclick: () => setStatus(r, 'selesai') }, icon('check', 16), 'Selesai') : null,
          can(...MANAGE_KESISWAAN) ? h('button', { class: 'btn ghost small', type: 'button', onclick: async () => { if (await confirmDialog({ title: 'Hapus pembinaan', message: 'Hapus catatan pembinaan ini?', danger: true, confirmText: 'Hapus' })) { try { await db.remove('discipline_actions', { id: eq(r.id) }); toast('Dihapus.'); load(); } catch (e) { toast(e.message, 'err'); } } } }, 'Hapus') : null) : null)));
    } catch (e) { mount(box, h('div', { class: 'card err' }, e.message)); }
  }
  mount(root, h('div', { class: 'page-head' }, h('h1', null, 'Pembinaan Siswa'), manager ? h('button', { class: 'btn gold', type: 'button', onclick: () => openActionForm({ onSaved: load }) }, icon('plus', 20), 'Tambah') : null), tabsEl, box);
  drawTabs(); load();
}
