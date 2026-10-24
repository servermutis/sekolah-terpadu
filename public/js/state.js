import { db, eq, getSession } from './api.js';

export const ROLE_LABEL = {
  admin_yayasan: 'Admin Yayasan', kepala_sekolah: 'Kepala Sekolah', admin_sekolah: 'Admin Sekolah', kurikulum: 'Bagian Kurikulum',
  kesiswaan: 'Bagian Kesiswaan', guru: 'Guru', wali_kelas: 'Wali Kelas', bk: 'BK / Pembina', auditor: 'Auditor',
};
export const STATUS_LABEL = { dilaporkan: 'Menunggu verifikasi', disahkan: 'Disahkan', ditolak: 'Ditolak', dibatalkan: 'Dibatalkan' };
export const CATEGORY_LABEL = { ringan: 'Ringan', sedang: 'Sedang', berat: 'Berat' };
export const POINT_ATTENTION = 50, POINT_WARN = 25;

export const S = { me: null, roles: [], schools: [], schoolId: null, profiles: new Map(), year: null, semesters: [] };

const SCHOOL_KEY = 'ymic.school';

export async function loadContext() {
  const sess = getSession();
  const uid = sess.user.id;
  const [roles, schools, profiles] = await Promise.all([
    db.select('user_roles', { select: 'id,user_id,role,school_id', user_id: eq(uid) }),
    db.select('schools', { select: 'id,code,name,level', order: 'code.asc' }),
    db.select('profiles', { select: 'id,full_name,email', order: 'full_name.asc', limit: 2000 }),
  ]);
  S.roles = roles; S.profiles = new Map(profiles.map(p => [p.id, p])); S.me = S.profiles.get(uid) || { id: uid, full_name: sess.user.email, email: sess.user.email };
  const yay = roles.some(r => r.role === 'admin_yayasan');
  const ids = new Set(roles.filter(r => r.school_id).map(r => r.school_id));
  S.schools = schools.filter(s => yay || ids.has(s.id));
  let pick = null; try { pick = localStorage.getItem(SCHOOL_KEY); } catch { /* */ }
  S.schoolId = S.schools.find(s => s.id === pick)?.id || S.schools[0]?.id || null;
  await loadSchoolData();
}

export async function loadSchoolData() {
  if (!S.schoolId) { S.year = null; S.semesters = []; return; }
  const years = await db.select('academic_years', { select: 'id,year_name,is_active', school_id: eq(S.schoolId), order: 'year_name.desc' });
  S.years = years; S.year = years.find(y => y.is_active) || null;
  S.semesters = S.year ? await db.select('semesters', { select: 'id,name,start_date,end_date', academic_year_id: eq(S.year.id), order: 'start_date.asc' }) : [];
}

export async function setSchool(id) {
  S.schoolId = id; try { localStorage.setItem(SCHOOL_KEY, id); } catch { /* */ }
  await loadSchoolData();
}

export const school = () => S.schools.find(s => s.id === S.schoolId) || null;
export const isYayasan = () => S.roles.some(r => r.role === 'admin_yayasan');
// Apakah pengguna memiliki salah satu peran ini pada unit aktif (admin yayasan selalu lolos)
export const can = (...roles) => isYayasan() || S.roles.some(r => r.school_id === S.schoolId && roles.includes(r.role));
export const rolesHere = () => [...new Set(S.roles.filter(r => r.role === 'admin_yayasan' || r.school_id === S.schoolId).map(r => r.role))];
export const nameOf = (uid) => (uid && S.profiles.get(uid)?.full_name) || (uid ? 'Pengguna' : 'Sistem');

export const MANAGE_KESISWAAN = ['kesiswaan', 'admin_sekolah'];
export const VIEW_DISCIPLINE = ['kepala_sekolah', 'admin_sekolah', 'kesiswaan', 'bk', 'wali_kelas'];
export const REPORTERS = ['kesiswaan', 'admin_sekolah', 'kepala_sekolah', 'guru', 'wali_kelas'];

export function pointLevel(p) { return p >= POINT_ATTENTION ? 'red' : p >= POINT_WARN ? 'gold' : p > 0 ? 'ringan' : ''; }
