-- Data awal: 3 unit, tahun ajaran aktif, semester, dan CONTOH jenis pelanggaran.
-- Nama unit dan poin pelanggaran HARUS disesuaikan dengan tata tertib resmi.
insert into public.schools (code, name, level) values
  ('SD',  'SD Mutiara Islam Cileungsi',  'SD'),
  ('SMP', 'SMP Mutiara Islam Cileungsi', 'SMP'),
  ('SMA', 'SMA Mutiara Islam Cileungsi', 'SMA')
on conflict (code) do nothing;

insert into public.academic_years (school_id, year_name, is_active)
select id, '2026/2027', true from public.schools
on conflict (school_id, year_name) do nothing;

insert into public.semesters (school_id, academic_year_id, name, start_date, end_date)
select ay.school_id, ay.id, v.name, v.s::date, v.e::date
from public.academic_years ay
cross join (values ('Ganjil','2026-07-13','2026-12-19'), ('Genap','2027-01-04','2027-06-26')) as v(name, s, e)
where ay.year_name = '2026/2027'
on conflict (academic_year_id, name) do nothing;

insert into public.violation_types (school_id, code, name, category, default_points, description)
select s.id, v.code, v.name, v.category, v.points, 'Contoh awal — sesuaikan dengan tata tertib sekolah'
from public.schools s
cross join (values
  ('DIS-001', 'Terlambat datang',                  'ringan', 5),
  ('DIS-002', 'Tidak memakai atribut lengkap',     'ringan', 3),
  ('DIS-003', 'Tidak mengerjakan tugas',           'ringan', 2),
  ('DIS-004', 'Meninggalkan kelas tanpa izin',     'sedang', 10),
  ('DIS-005', 'Membolos',                          'sedang', 15),
  ('DIS-006', 'Berkelahi',                         'berat',  50)
) as v(code, name, category, points)
on conflict (school_id, code) do nothing;
