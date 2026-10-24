import { h, mount, icon, debounce, skeletons, emptyState, badge, fmtDate, field } from '../ui.js';
import { db } from '../api.js';
import { S, can, nameOf, STATUS_LABEL, CATEGORY_LABEL, MANAGE_KESISWAAN, REPORTERS } from '../state.js';
import { openViolationForm, openViolationDetail } from './common.js';

export async function render(root) {
  const manager = can(...MANAGE_KESISWAAN);
  let tab = manager || can('kepala_sekolah') ? 'dilaporkan' : '';
  let search = '';
  const tabs = [['dilaporkan', 'Menunggu'], ['disahkan', 'Disahkan'], ['ditolak', 'Ditolak'], ['dibatalkan', 'Dibatalkan'], ['', 'Semua']];
  const listBox = h('div', { class: 'list' });
  const tabsEl = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Filter status' });
  const q = h('input', { class: 'input', type: 'search', placeholder: 'Cari nama atau NIS…', 'aria-label': 'Cari nama atau NIS', oninput: debounce((e) => { search = e.target.value.trim(); load(); }, 350) });
  let counts = {};

  function drawTabs() {
    mount(tabsEl, tabs.map(([v, l]) => h('button', { class: 'tab', role: 'tab', type: 'button', 'aria-selected': String(tab === v), onclick: () => { tab = v; drawTabs(); load(); } }, l, v === 'dilaporkan' && counts.dilaporkan ? h('span', { class: 'n' }, counts.dilaporkan) : null)));
  }
  async function load() {
    mount(listBox, skeletons(3));
    try {
      const rows = await db.rpc('list_violations', { p_school: S.schoolId, p_status: tab || null, p_search: search || null, p_limit: 200 });
      if (!rows.length) return mount(listBox, emptyState(tab === 'dilaporkan' ? 'Tidak ada laporan yang menunggu verifikasi.' : 'Belum ada catatan.', can(...REPORTERS) ? 'Tekan “Catat” untuk menambahkan pelanggaran.' : null));
      mount(listBox, rows.map(r => h('button', { class: 'item', type: 'button', onclick: () => openViolationDetail(r, reload) },
        h('div', { class: 'top' }, h('div', null, h('div', { class: 'name' }, r.student_name || 'Siswa'), h('div', { class: 'small muted' }, `NIS ${r.nis || '-'} • ${r.class_name || '-'}`)), h('span', { class: 'pts' }, r.status === 'disahkan' ? '+' + r.points : r.points + ' poin')),
        h('div', { class: 'row wrap' }, h('span', null, r.type_name), badge(CATEGORY_LABEL[r.category] || '', r.category), badge(STATUS_LABEL[r.status], { dilaporkan: 'gold', disahkan: 'ringan', ditolak: 'red', dibatalkan: 'gray' }[r.status])),
        h('div', { class: 'desc small' }, r.description.length > 140 ? r.description.slice(0, 140) + '…' : r.description),
        h('div', { class: 'small muted' }, `${fmtDate(r.incident_date)} • dilaporkan ${nameOf(r.reported_by)}`))));
    } catch (e) { mount(listBox, h('div', { class: 'card err' }, e.message)); }
  }
  async function loadCounts() {
    try { const rows = await db.rpc('list_violations', { p_school: S.schoolId, p_status: 'dilaporkan', p_limit: 500 }); counts.dilaporkan = rows.length; drawTabs(); } catch { /* */ }
  }
  const reload = () => { loadCounts(); load(); };

  mount(root,
    h('div', { class: 'page-head' }, h('h1', null, 'Pelanggaran Siswa'),
      can(...REPORTERS) ? h('button', { class: 'btn gold', type: 'button', onclick: () => openViolationForm({ onSaved: reload }) }, icon('plus', 20), 'Catat') : null),
    h('div', { class: 'card flat stack-s' }, tabsEl, q), listBox);
  drawTabs(); load(); if (manager || can('kepala_sekolah')) loadCounts();
}
