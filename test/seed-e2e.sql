-- Data uji e2e (setelah migrasi). Kata sandi semua pengguna: Passw0rd!
alter table auth.users add column if not exists password text;
insert into auth.users (id, email, password) values
  ('00000000-0000-0000-0000-0000000000a1', 'yayasan@test.id', 'Passw0rd!'),
  ('00000000-0000-0000-0000-0000000000a2', 'kesiswaan@test.id', 'Passw0rd!'),
  ('00000000-0000-0000-0000-0000000000a3', 'guru@test.id', 'Passw0rd!'),
  ('00000000-0000-0000-0000-0000000000a4', 'adminsd@test.id', 'Passw0rd!'),
  ('00000000-0000-0000-0000-0000000000a5', 'guru2@test.id', 'Passw0rd!');
insert into public.profiles (id, full_name, email) select id, initcap(split_part(email, '@', 1)) || ' Uji', email from auth.users;
insert into public.user_roles (user_id, role, school_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin_yayasan', null),
  ('00000000-0000-0000-0000-0000000000a2', 'kesiswaan', (select id from public.schools where code = 'SD')),
  ('00000000-0000-0000-0000-0000000000a3', 'guru', (select id from public.schools where code = 'SD')),
  ('00000000-0000-0000-0000-0000000000a4', 'admin_sekolah', (select id from public.schools where code = 'SD')),
  ('00000000-0000-0000-0000-0000000000a5', 'guru', (select id from public.schools where code = 'SD'));
insert into public.classes (school_id, academic_year_id, name)
select ay.school_id, ay.id, n from public.academic_years ay, unnest(array['1A','1B']) n where ay.is_active and ay.school_id = (select id from public.schools where code = 'SD');
insert into public.students (school_id, nis, full_name, gender, guardian_name) select (select id from public.schools where code = 'SD'), v.nis, v.nm, v.g, 'Wali ' || v.nm from (values ('10001','Ahmad Fauzi','L'),('10002','Siti Aisyah','P'),('10003','Budi Santoso','L')) v(nis, nm, g);
insert into public.student_enrollments (school_id, student_id, class_id, academic_year_id)
select c.school_id, s.id, c.id, c.academic_year_id from public.students s join public.classes c on c.school_id = s.school_id and c.name = case when s.nis = '10003' then '1B' else '1A' end;
insert into public.class_teachers (school_id, class_id, user_id, role)
select c.school_id, c.id, '00000000-0000-0000-0000-0000000000a3', 'guru' from public.classes c where c.name = '1A' and c.school_id = (select id from public.schools where code = 'SD');
