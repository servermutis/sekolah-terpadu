-- Pengujian skema: poin, hak akses antar unit, RLS, audit, portal.
-- Dijalankan sebagai superuser; peran pengguna disimulasikan seperti PostgREST.
\set ON_ERROR_STOP on
set client_min_messages = notice;

create schema t;
grant usage on schema t to authenticated, anon, service_role;

create function t.ok(c boolean, label text) returns void language plpgsql as $$
begin if c then raise notice 'PASS  %', label; else raise exception 'FAIL  %', label; end if; end $$;

-- true jika query menghasilkan error (ditolak)
create function t.fails(q text) returns boolean language plpgsql as $$
begin execute q; return false; exception when others then return true; end $$;
create function t.n(q text) returns bigint language plpgsql as $$
declare r bigint; begin execute q into r; return r; end $$;
grant execute on all functions in schema t to authenticated, anon, service_role;

-- ---------- data uji (superuser) ----------
create temp table ids (k text primary key, v uuid);
grant all on ids to public;
insert into ids select 'u_'||n, gen_random_uuid() from unnest(array['yayasan','kes_sd','kes_smp','guru_a','guru_b','wali_a','kepsek_sd','auditor_sd','admin_sd']) n;
insert into auth.users (id, email) select v, k||'@x.id' from ids;
insert into public.profiles (id, full_name) select v, k from ids;

insert into ids select 'sd', id from public.schools where code='SD';
insert into ids select 'smp', id from public.schools where code='SMP';
insert into public.user_roles (user_id, role, school_id) values
  ((select v from ids where k='u_yayasan'), 'admin_yayasan', null),
  ((select v from ids where k='u_kes_sd'), 'kesiswaan', (select v from ids where k='sd')),
  ((select v from ids where k='u_kes_smp'), 'kesiswaan', (select v from ids where k='smp')),
  ((select v from ids where k='u_guru_a'), 'guru', (select v from ids where k='sd')),
  ((select v from ids where k='u_guru_b'), 'guru', (select v from ids where k='sd')),
  ((select v from ids where k='u_wali_a'), 'wali_kelas', (select v from ids where k='sd')),
  ((select v from ids where k='u_kepsek_sd'), 'kepala_sekolah', (select v from ids where k='sd')),
  ((select v from ids where k='u_auditor_sd'), 'auditor', (select v from ids where k='sd')),
  ((select v from ids where k='u_admin_sd'), 'admin_sekolah', (select v from ids where k='sd'));

insert into public.classes (school_id, academic_year_id, name)
select ay.school_id, ay.id, '1A' from public.academic_years ay where ay.is_active;
insert into ids select 'cls_sd_1a', c.id from public.classes c join public.schools s on s.id=c.school_id where s.code='SD';

insert into public.students (school_id, nis, full_name) values
  ((select v from ids where k='sd'), '10001', 'Siswa A'),
  ((select v from ids where k='sd'), '10002', 'Siswa B'),
  ((select v from ids where k='smp'), '20001', 'Siswa SMP');
insert into ids select 'st_a', id from public.students where nis='10001';
insert into ids select 'st_b', id from public.students where nis='10002';
insert into ids select 'st_smp', id from public.students where nis='20001';

insert into public.student_enrollments (school_id, student_id, class_id, academic_year_id)
select c.school_id, s.id, c.id, c.academic_year_id from public.students s join public.classes c on c.school_id=s.school_id;

insert into public.class_teachers (school_id, class_id, user_id, role) values
  ((select v from ids where k='sd'), (select v from ids where k='cls_sd_1a'), (select v from ids where k='u_guru_a'), 'guru'),
  ((select v from ids where k='sd'), (select v from ids where k='cls_sd_1a'), (select v from ids where k='u_wali_a'), 'wali_kelas');

insert into ids select 't_telat', id from public.violation_types where school_id=(select v from ids where k='sd') and code='DIS-001';
insert into ids select 't_atribut', id from public.violation_types where school_id=(select v from ids where k='sd') and code='DIS-002';
insert into ids select 't_smp', id from public.violation_types where school_id=(select v from ids where k='smp') and code='DIS-001';

-- helper: jadi pengguna / kembali superuser
create function t.as_user(k text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', (select v::text from ids where ids.k = 'u_'||as_user.k), true); end $$;
grant execute on function t.as_user(text) to authenticated;
create function t.v(k text) returns uuid language sql as $$ select v from ids where ids.k = $1 $$;
grant execute on function t.v(text) to authenticated, anon, service_role;

-- ======================= SKENARIO =======================
begin;
set local role authenticated; select t.as_user('kes_sd');

-- 1. catat + sahkan langsung: bertambah tepat satu kali
create temp table r1 (id uuid);
grant all on r1 to public;
insert into r1 select public.report_violation(t.v('st_a'), t.v('t_telat'), public.today_wib(), 'Terlambat 20 menit', gen_random_uuid(), true);
select t.ok((select count(*) from public.violation_records) = 1, '1. catatan baru tersimpan satu kali');
select t.ok((select total_points from public.rekap_poin(t.v('sd')) where nis='10001') = 5, '1. total poin = 5 dari points_snapshot');

-- 2. kirim ulang request_id yang sama tidak membuat catatan ganda
create temp table rq (id uuid);
grant all on rq to public;
insert into rq values (gen_random_uuid());
select public.report_violation(t.v('st_a'), t.v('t_atribut'), public.today_wib(), 'Tanpa dasi', (select id from rq), true);
select public.report_violation(t.v('st_a'), t.v('t_atribut'), public.today_wib(), 'Tanpa dasi', (select id from rq), true);
select t.ok((select count(*) from public.violation_records) = 2, '2. kirim ulang tidak menggandakan catatan');
select t.ok((select total_points from public.rekap_poin(t.v('sd')) where nis='10001') = 8, '2. total = 5 + 3');

-- 12. siswa tanpa pelanggaran tetap tampil dengan 0
select t.ok((select violation_count from public.rekap_poin(t.v('sd')) where nis='10002') = 0, '12. siswa tanpa pelanggaran: jumlah 0');

rollback;

begin;
set local role authenticated; select t.as_user('kes_sd');
create temp table rec (id uuid);
grant all on rec to public;
insert into rec select public.report_violation(t.v('st_a'), t.v('t_atribut'), public.today_wib(), 'Tanpa dasi', gen_random_uuid(), true);
select t.ok(t.fails(format($q$select public.update_violation(%L, %L, public.today_wib(), 'Tanpa dasi', 2, null)$q$, (select id from rec), t.v('t_atribut'))), '7. koreksi poin catatan disahkan tanpa alasan ditolak');
select public.update_violation((select id from rec), t.v('t_atribut'), public.today_wib(), 'Tanpa dasi', 2, 'Salah input poin, sesuai tata tertib');
select t.ok((select total_points from public.rekap_poin(t.v('sd')) where nis='10001') = 2, '7. koreksi 3 -> 2: total mengikuti nilai terbaru');
select t.ok((select count(*) from public.violation_records) = 1, '7. koreksi memperbarui catatan yang sama');
select t.ok((select count(*) from public.violation_actions where record_id=(select id from rec) and action_type='koreksi' and old_points=3 and new_points=2) = 1, '7. riwayat koreksi tercatat (3 -> 2)');

-- 8. ubah poin default jenis: catatan lama tidak berubah
update public.violation_types set default_points = 99 where id = t.v('t_atribut');
select t.ok((select points_snapshot from public.violation_records where id=(select id from rec)) = 2, '8. perubahan poin default tidak mengubah catatan historis');
update public.violation_types set default_points = 3 where id = t.v('t_atribut');

-- 9. pembatalan sah: rekap berkurang, catatan & audit tetap ada
select public.cancel_violation((select id from rec), 'Salah siswa, dibatalkan petugas');
select t.ok((select total_points from public.rekap_poin(t.v('sd')) where nis='10001') = 0, '9. pembatalan mengurangi rekap');
select t.ok((select count(*) from public.violation_records) = 1, '9. catatan tetap tersimpan (status dibatalkan)');
select t.ok(t.fails(format($q$select public.cancel_violation(%L, 'x')$q$, (select id from rec))), '9. pembatalan ulang ditolak');

-- 11. tulis langsung ke tabel ditolak
select t.ok(t.fails($q$insert into public.violation_records(school_id,student_id,type_id,incident_date,description,points_snapshot,reported_by,request_id) values (gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),current_date,'xxx',1,gen_random_uuid(),gen_random_uuid())$q$), '11. insert langsung ke violation_records ditolak');
select t.ok(t.fails($q$update public.violation_records set points_snapshot = 0$q$), '11. update langsung ditolak');
select t.ok(t.fails($q$delete from public.violation_records$q$), '11. delete langsung ditolak');

-- 13. jenis yang sudah dipakai tidak dapat dihapus
select t.ok(t.fails(format($q$delete from public.violation_types where id=%L$q$, t.v('t_atribut'))), '13. jenis pelanggaran terpakai tidak dapat dihapus');

-- tanggal masa depan dan jenis nonaktif
select t.ok(t.fails(format($q$select public.report_violation(%L,%L,public.today_wib()+3,'abc',gen_random_uuid(),false)$q$, t.v('st_a'), t.v('t_telat'))), 'tanggal masa depan ditolak');
update public.violation_types set status='nonaktif' where id = t.v('t_telat');
select t.ok(t.fails(format($q$select public.report_violation(%L,%L,public.today_wib(),'abc',gen_random_uuid(),false)$q$, t.v('st_a'), t.v('t_telat'))), 'jenis nonaktif ditolak');
commit;

-- 3-6, 16. peran guru / wali / verifikasi
begin;
set local role authenticated; select t.as_user('guru_a');
create temp table g (id uuid);
grant all on g to public;
insert into g select public.report_violation(t.v('st_b'), t.v('t_atribut'), public.today_wib(), 'Laporan guru A', gen_random_uuid(), false);
select t.ok((select status from public.violation_records where id=(select id from g)) = 'dilaporkan', '3. laporan guru berstatus dilaporkan');
select t.ok(t.fails(format($q$select public.report_violation(%L,%L,public.today_wib(),'abc',gen_random_uuid(),true)$q$, t.v('st_b'), t.v('t_atribut'))), '3. guru tidak dapat mengesahkan sendiri');
select t.ok(t.fails(format($q$select public.verify_violation(%L,'sahkan',null)$q$, (select id from g))), '3. guru tidak dapat memverifikasi');
select t.ok(t.n('select count(*) from public.students') = 2, '5. guru hanya melihat siswa kelas yang diampu (SD saja)');

select t.as_user('guru_b');  -- tidak ditugaskan
select t.ok(t.n('select count(*) from public.students') = 0, '4. guru di luar penugasan tidak melihat siswa kelas lain');
select t.ok(t.fails(format($q$select public.report_violation(%L,%L,public.today_wib(),'abc',gen_random_uuid(),false)$q$, t.v('st_b'), t.v('t_atribut'))), '4. guru di luar penugasan tidak dapat melapor');
select t.ok(t.n('select count(*) from public.violation_records') = 0, '4. guru lain tidak melihat laporan guru A');

select t.as_user('wali_a');
select t.ok(t.n('select count(*) from public.violation_records') = 2, '16. wali kelas melihat semua catatan siswa kelasnya');
select t.ok((select count(*) from public.rekap_poin(t.v('sd'))) = 2, '16. wali kelas dapat memakai rekap untuk kelasnya');

select t.as_user('kes_sd');
select t.ok((select count(*) from public.rekap_poin(t.v('sd')) where total_points>0) = 0, '6. laporan belum disahkan belum dihitung');
select public.verify_violation((select id from g), 'sahkan', null);
select t.ok((select total_points from public.rekap_poin(t.v('sd')) where nis='10002') = 3, '6. setelah pengesahan masuk rekap');
select t.ok(t.fails(format($q$select public.verify_violation(%L,'tolak','alasan')$q$, (select id from g))), '6. verifikasi ulang ditolak');

-- guru tak boleh mengubah catatan yang sudah disahkan
select t.as_user('guru_a');
select t.ok(t.fails(format($q$select public.update_violation(%L,%L,public.today_wib(),'ubah',1,'alasan panjang')$q$, (select id from g), t.v('t_atribut'))), '3. guru tidak dapat mengubah catatan yang disahkan');
select t.ok(t.fails(format($q$select public.cancel_violation(%L,'alasan panjang')$q$, (select id from g))), '3. guru tidak dapat membatalkan catatan yang disahkan');
commit;

-- 10. isolasi antar unit
begin;
set local role authenticated; select t.as_user('kes_smp');
select t.ok(t.n('select count(*) from public.students') = 1, '10. kesiswaan SMP hanya melihat siswa SMP');
select t.ok(t.n('select count(*) from public.violation_records') = 0, '10. kesiswaan SMP tidak melihat pelanggaran SD');
select t.ok(t.fails(format($q$select public.report_violation(%L,%L,public.today_wib(),'abc',gen_random_uuid(),true)$q$, t.v('st_a'), t.v('t_telat'))), '10. SMP tidak dapat mencatat untuk siswa SD');
select t.ok(t.fails(format($q$select * from public.rekap_poin(%L)$q$, t.v('sd'))), '10. SMP tidak dapat meminta rekap SD');
select t.ok(t.n(format($q$select count(*) from public.lookup_student('10001')$q$)) = 0, '19. lookup NIS di luar kewenangan: tidak ditemukan');
select t.ok(t.n(format($q$select count(*) from public.violation_types where school_id=%L$q$, t.v('sd'))) = 0, '10. jenis pelanggaran SD tidak terlihat');
select t.ok(t.fails(format($q$insert into public.violation_types(school_id,code,name,category,default_points) values (%L,'X-1','Uji','ringan',1)$q$, t.v('sd'))), '10. SMP tidak dapat menambah aturan SD');

select t.as_user('yayasan');
select t.ok(t.n('select count(*) from public.students') = 3, '20. admin yayasan melihat semua unit');
rollback;

-- 14. audit
begin;
select t.ok((select count(*) from public.audit_logs where entity='violation_records') >= 3, '14. audit log mencatat perubahan catatan');
select t.ok((select count(*) from public.audit_logs where entity='violation_actions') >= 3, '14. audit log mencatat tindakan koreksi');
select t.ok(t.fails($q$update public.audit_logs set action='X'$q$), '14. audit log tidak dapat diubah');
select t.ok(t.fails($q$delete from public.audit_logs$q$), '14. audit log tidak dapat dihapus');
set local role authenticated; select t.as_user('auditor_sd');
select t.ok(t.n('select count(*) from public.audit_logs') > 0, '14. auditor melihat audit unitnya');
select t.ok(t.n('select count(*) from public.students') = 0, '14. auditor tidak melihat data siswa');
select t.as_user('guru_a');
select t.ok(t.n('select count(*) from public.audit_logs') = 0, '14. guru tidak dapat membaca audit log');
commit;

-- 15. portal / hak eksekusi
begin;
set local role anon;
select t.ok(t.fails('select count(*) from public.students') , '15. anon tidak dapat membaca tabel');
select t.ok(t.fails($q$select * from public.portal_login_lookup('10001')$q$), '15. anon tidak dapat memanggil fungsi portal');
select t.ok(t.fails($q$select * from public.student_access$q$), '15. anon tidak dapat membaca student_access');
reset role;
set local role authenticated; select t.as_user('kes_sd');
select t.ok(t.fails($q$select * from public.student_access$q$), '15. staf tidak dapat membaca hash PIN');
select t.ok(t.fails(format($q$select public.portal_data(%L)$q$, t.v('st_a'))), '15. staf tidak dapat memanggil portal_data');
select t.ok(t.fails($q$select * from public.login_throttle$q$), '15. staf tidak dapat membaca login_throttle');
reset role;
set local role service_role;
select public.portal_set_pin(t.v('st_a'), 'hash-contoh', true);
select t.ok((select count(*) from public.portal_login_lookup(' 10001 ')) = 1, '15. service role dapat mencari akses portal (NIS dinormalisasi)');
select t.ok((public.portal_data(t.v('st_a'))->'summary'->>'points')::int = 0 and jsonb_array_length(public.portal_data(t.v('st_a'))->'records') = 0, '15. portal_data hanya memuat catatan berstatus disahkan');
rollback;

-- 17. throttle: kunci setelah 5 gagal
begin;
set local role service_role;
select public.portal_register_failure('nis:99999', 5, 15) from generate_series(1,4);
select t.ok(public.portal_check_lock(array['nis:99999']) is null, '17. belum terkunci pada 4 kegagalan');
select public.portal_register_failure('nis:99999', 5, 15);
select t.ok(public.portal_check_lock(array['nis:99999']) > now(), '17. terkunci pada kegagalan ke-5');
select public.portal_reset_throttle('nis:99999');
select t.ok(public.portal_check_lock(array['nis:99999']) is null, '17. sukses login mereset throttle');
rollback;

-- siswa lintas unit & integritas komposit
begin;
select t.ok(t.fails(format($q$insert into public.student_enrollments(school_id,student_id,class_id,academic_year_id) select %L, %L, c.id, c.academic_year_id from public.classes c where c.school_id=%L$q$, t.v('smp'), t.v('st_smp'), t.v('sd'))), 'integritas: siswa SMP tidak dapat didaftarkan ke kelas SD');
rollback;

\echo === SEMUA SKENARIO SELESAI ===
