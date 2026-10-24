import { h, mount, icon, debounce, skeletons, emptyState, badge, fmtDate, field, csvDownload, num, todayWIB } from '../ui.js';
import { db, eq } from '../api.js';
import { S, can, school, nameOf, CATEGORY_LABEL, pointLevel, POINT_ATTENTION, REPORTERS, VIEW_DISCIPLINE } from '../state.js';
import { openViolationForm, openViolationDetail } from './common.js';
import { openActionForm } from './pembinaan.js';
import { modal } from '../ui.js';

export async function openStudentHistory(st, onChanged) {
  const body = h('div', { class: 'stack' }); mount(body, skeletons(2));
  const m = modal({ title: st.full_name, body, wide: true });
  const load = async () => {
    try {
      const rows = await db.rpc('list_violations', { p_school: S.schoolId, p_student: st.student_id || st.id, p_status: 'disahkan', p_limit: 500 });
      const total = rows.reduce((a, r) => a + r.points, 0);
      mount(body, h('div', { class: 'row wrap' }, badge(`NIS ${st.nis}`), badge(`Kelas ${st.class_name || '-'}`), badge(`${rows.length} pelanggaran`, 'gold'), badge(`${total} poin`, pointLevel(total))),
        rows.length ? h('div', { class: 'list' }, rows.map(r => h('button', { class: 'item', type: 'button', onclick: () => openViolationDetail(r, () => { load(); if (onChanged) onChanged(); }) },
          h('div', { class: 'top' }, h('div', { class: 'name' }, r.type_name), h('span', { class: 'pts' }, '+' + r.points)), h('div', { class: 'row wrap' }, badge(CATEGORY_LABEL[r.category] || '', r.category), h('span', { class: 'small muted' }, fmtDate(r.incident_date))), h('div', { class: 'small' }, r.description))))
          : emptyState('Tidak ada catatan pelanggaran yang tercatat.'),
        h('div', { class: 'row wrap' }, can(...REPORTERS) ? h('button', { class: 'btn gold small', type: 'button', onclick: () => openViolationForm({ nis: st.nis, onSaved: () => { load(); if (onChanged) onChanged(); } }) }, icon('plus', 16), 'Catat pelanggaran') : null,
          can(...VIEW_DISCIPLINE) ? h('button', { class: 'btn ghost small', type: 'button', onclick: () => openActionForm({ nis: st.nis }) }, icon('heart', 16), 'Tambah pembinaan') : null));
    } catch (e) { mount(body, h('div', { class: 'err' }, e.message)); }
  };
  load();
}

export async function render(root) {
  const f = { class: '', search: '', from: '', to: '', min: '' };
  const classes = await db.rpc('list_classes', { p_school: S.schoolId });
  const clsSel = h('select', { class: 'input', 'aria-label': 'Kelas' }, h('option', { value: '' }, 'Semua kelas'), classes.map(c => h('option', { value: c.id }, c.name)));
  const semSel = h('select', { class: 'input', 'aria-label': 'Semester' }, h('option', { value: '' }, 'Semua periode'), S.semesters.map(s => h('option', { value: s.id }, `Semester ${s.name}`)));
  const q = h('input', { class: 'input', type: 'search', placeholder: 'Cari nama atau NIS…', 'aria-label': 'Cari' });
  const from = h('input', { class: 'input', type: 'date', 'aria-label': 'Dari tanggal' }), to = h('input', { class: 'input', type: 'date', 'aria-label': 'Sampai tanggal' });
  const min = h('input', { class: 'input', type: 'number', min: 0, placeholder: 'Poin minimal', 'aria-label': 'Poin minimal' });
  semSel.addEventListener('change', () => { const s = S.semesters.find(x => x.id === semSel.value); from.value = s ? s.start_date : ''; to.value = s ? s.end_date : ''; load(); });
  const out = h('div', null); let rows = [];

  async function load() {
    mount(out, skeletons(4));
    try {
      rows = await db.rpc('rekap_poin', { p_school: S.schoolId, p_from: from.value || null, p_to: to.value || null, p_class: clsSel.value || null, p_search: q.value.trim() || null });
      const mn = Number(min.value || 0); const view = rows.filter(r => r.total_points >= mn);
      if (!view.length) return mount(out, emptyState('Tidak ada data yang sesuai filter.'));
      const total = view.reduce((a, r) => a + Number(r.total_points), 0);
      const tbl = h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, 'NIS'), h('th', null, 'Nama siswa'), h('th', null, 'Kelas'), h('th', { class: 'num' }, 'Jumlah'), h('th', { class: 'num' }, 'Total poin'))),
        h('tbody', null, view.map(r => h('tr', { class: 'click', tabindex: 0, onclick: () => openStudentHistory(r, load), onkeydown: (e) => { if (e.key === 'Enter') openStudentHistory(r, load); } },
          h('td', null, r.nis), h('td', null, h('b', null, r.full_name)), h('td', null, r.class_name || '-'), h('td', { class: 'num' }, num(r.violation_count)), h('td', { class: 'num' }, badge(num(r.total_points), pointLevel(r.total_points))))))));
      mount(out, h('p', { class: 'small muted no-print' }, `${view.length} siswa • total ${num(total)} poin • ketuk baris untuk melihat catatan penyusunnya`), tbl);
    } catch (e) { mount(out, h('div', { class: 'card err' }, e.message)); }
  }
  const dl = () => { const mn = Number(min.value || 0); csvDownload(`rekap-poin-${school().code}-${todayWIB()}.csv`, [['NIS', 'Nama', 'Kelas', 'Jumlah pelanggaran', 'Total poin'], ...rows.filter(r => r.total_points >= mn).map(r => [r.nis, r.full_name, r.class_name || '', r.violation_count, r.total_points])]); };
  const deb = debounce(load, 350);
  [clsSel, from, to].forEach(e => e.addEventListener('change', load)); q.addEventListener('input', deb); min.addEventListener('input', deb);

  mount(root, h('div', { class: 'page-head no-print' }, h('h1', null, 'Rekap Poin Kesiswaan'), h('div', { class: 'row' },
    h('button', { class: 'btn ghost small', type: 'button', onclick: dl }, icon('download', 16), 'CSV'), h('button', { class: 'btn ghost small', type: 'button', onclick: () => window.print() }, icon('print', 16), 'Cetak'))),
    h('div', { class: 'print-only' }, h('h2', null, `Rekap Poin — ${school().name}`), h('p', null, `Tahun ajaran ${S.year ? S.year.year_name : '-'} • dicetak ${fmtDate(todayWIB())}`)),
    h('div', { class: 'card flat no-print' }, h('div', { class: 'form-grid two' }, field('Kelas', clsSel), field('Periode', semSel), field('Dari tanggal', from), field('Sampai tanggal', to), field('Cari', q), field('Poin minimal', min))), out);
  load();
}
