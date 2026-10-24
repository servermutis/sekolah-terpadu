import { h, mount, icon, skeletons, num, fmtDate, badge } from '../ui.js';
import { db } from '../api.js';
import { S, can, school, rolesHere, ROLE_LABEL, nameOf, REPORTERS, VIEW_DISCIPLINE, POINT_ATTENTION, pointLevel } from '../state.js';
import { openViolationForm, openViolationDetail } from './common.js';
import { navigate } from '../app.js';

export async function render(root) {
  const sch = school();
  const stats = h('div', { class: 'stat-grid' }, Array.from({ length: 4 }, () => h('div', { class: 'skeleton' })));
  const extra = h('div', { class: 'stack' });
  mount(root,
    h('div', null, h('h1', null, `Assalamu’alaikum, ${S.me.full_name.split(' ')[0]}`), h('p', { class: 'muted', style: { margin: '4px 0 0' } }, `${sch ? sch.name : ''} • ${rolesHere().map(r => ROLE_LABEL[r]).join(', ')}${S.year ? ' • TA ' + S.year.year_name : ''}`)),
    !S.year ? h('div', { class: 'notice' }, 'Belum ada tahun ajaran aktif untuk unit ini. Atur di menu Master Data.') : null,
    can(...VIEW_DISCIPLINE) ? stats : null,
    h('div', { class: 'row wrap' },
      can(...REPORTERS) ? h('button', { class: 'btn gold', type: 'button', onclick: () => openViolationForm({ onSaved: () => navigate('/pelanggaran') }) }, icon('plus', 20), 'Catat Pelanggaran') : null,
      can(...VIEW_DISCIPLINE) ? h('a', { class: 'btn', href: '/rekap', 'data-link': '' }, icon('chart', 20), 'Rekap Poin') : null,
      h('a', { class: 'btn ghost', href: '/siswa', 'data-link': '' }, icon('users', 20), 'Data Siswa')), extra);
  if (!can('kepala_sekolah', 'admin_sekolah', 'kesiswaan', 'bk')) { if (!can(...VIEW_DISCIPLINE)) return; mount(stats); stats.remove(); return; }
  try {
    const [st, top, pending] = await Promise.all([
      db.rpc('dashboard_stats', { p_school: S.schoolId, p_threshold: POINT_ATTENTION }),
      db.rpc('rekap_poin', { p_school: S.schoolId }),
      db.rpc('list_violations', { p_school: S.schoolId, p_status: 'dilaporkan', p_limit: 5 }),
    ]);
    mount(stats,
      h('div', { class: 'stat' }, h('div', { class: 'v' }, num(st.students_active)), h('div', { class: 'l' }, 'Siswa aktif')),
      h('div', { class: 'stat gold' }, h('div', { class: 'v' }, num(st.pending)), h('div', { class: 'l' }, 'Menunggu verifikasi')),
      h('div', { class: 'stat' }, h('div', { class: 'v' }, num(st.approved_month)), h('div', { class: 'l' }, 'Pelanggaran bulan ini')),
      h('div', { class: 'stat red' }, h('div', { class: 'v' }, num(st.high_points)), h('div', { class: 'l' }, `Poin ≥ ${POINT_ATTENTION}`)));
    const hi = top.filter(r => r.total_points > 0).slice(0, 5);
    mount(extra,
      h('div', { class: 'card' }, h('div', { class: 'row between' }, h('h2', null, 'Perlu diverifikasi'), h('a', { href: '/pelanggaran', 'data-link': '', class: 'small' }, 'Lihat semua')),
        pending.length ? h('div', { class: 'list' }, pending.map(r => h('button', { class: 'item', type: 'button', onclick: () => openViolationDetail(r, () => navigate('/dashboard')) },
          h('div', { class: 'top' }, h('div', { class: 'name' }, r.student_name), h('span', { class: 'pts' }, r.points + ' poin')), h('div', { class: 'small muted' }, `${r.type_name} • ${fmtDate(r.incident_date)} • ${nameOf(r.reported_by)}`)))) : h('p', { class: 'muted' }, 'Tidak ada laporan yang menunggu.')),
      h('div', { class: 'card' }, h('h2', null, 'Poin tertinggi'),
        hi.length ? h('div', { class: 'list' }, hi.map(r => h('div', { class: 'row between', style: { padding: '6px 0', borderBottom: '1px solid var(--line)' } }, h('div', null, h('div', { class: 'name', style: { fontWeight: 700 } }, r.full_name), h('div', { class: 'small muted' }, `${r.class_name || '-'} • ${r.violation_count} pelanggaran`)), badge(r.total_points + ' poin', pointLevel(r.total_points))))) : h('p', { class: 'muted' }, 'Belum ada poin pelanggaran yang disahkan.')));
  } catch (e) { mount(stats, h('div', { class: 'card err', style: { gridColumn: '1/-1' } }, e.message)); }
}
