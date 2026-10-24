-- =====================================================================
-- Aplikasi Sekolah Terpadu — Yayasan Mutiara Islam Cileungsi
-- Skema inti: master data, kesiswaan, poin pelanggaran, portal siswa,
-- hak akses (RLS) dan audit log.  Fase 1-3 pada blueprint.
-- =====================================================================

-- ---------- Master data -----------------------------------------------
create table public.schools (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  level text not null check (level in ('SD','SMP','SMA')),
  created_at timestamptz not null default now()
);

create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  year_name text not null check (year_name ~ '^[0-9]{4}/[0-9]{4}$'),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  unique (school_id, year_name),
  unique (id, school_id)
);
create unique index academic_years_one_active on public.academic_years (school_id) where is_active;

create table public.semesters (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  academic_year_id uuid not null,
  name text not null check (name in ('Ganjil','Genap')),
  start_date date not null,
  end_date date not null,
  check (end_date >= start_date),
  unique (academic_year_id, name),
  foreign key (academic_year_id, school_id) references public.academic_years(id, school_id) on delete cascade
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  academic_year_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (academic_year_id, name),
  unique (id, school_id),
  unique (id, academic_year_id),
  foreign key (academic_year_id, school_id) references public.academic_years(id, school_id) on delete restrict
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  nis text not null unique check (nis ~ '^[A-Z0-9._-]{3,30}$'),
  full_name text not null check (length(btrim(full_name)) between 2 and 120),
  gender text check (gender in ('L','P')),
  status text not null default 'aktif' check (status in ('aktif','lulus','pindah','nonaktif')),
  guardian_name text,
  guardian_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, school_id)
);
create index students_school_idx on public.students (school_id, status);

create table public.student_enrollments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  student_id uuid not null,
  class_id uuid not null,
  academic_year_id uuid not null,
  created_at timestamptz not null default now(),
  unique (student_id, academic_year_id),
  foreign key (student_id, school_id) references public.students(id, school_id) on delete cascade,
  foreign key (class_id, school_id) references public.classes(id, school_id) on delete restrict,
  foreign key (class_id, academic_year_id) references public.classes(id, academic_year_id) on delete restrict
);
create index enrollments_class_idx on public.student_enrollments (class_id);

-- ---------- Pengguna & peran -----------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  status text not null default 'aktif' check (status in ('aktif','nonaktif')),
  created_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin_yayasan','kepala_sekolah','admin_sekolah','kurikulum','kesiswaan','guru','wali_kelas','bk','auditor')),
  school_id uuid references public.schools(id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((role = 'admin_yayasan' and school_id is null) or (role <> 'admin_yayasan' and school_id is not null))
);
create unique index user_roles_unique on public.user_roles (user_id, role, coalesce(school_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index user_roles_user_idx on public.user_roles (user_id);

create table public.class_teachers (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  class_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('wali_kelas','guru')),
  created_at timestamptz not null default now(),
  unique (class_id, user_id, role),
  foreign key (class_id, school_id) references public.classes(id, school_id) on delete cascade
);
create index class_teachers_user_idx on public.class_teachers (user_id);

-- Akses portal siswa (hanya dapat diakses server dengan service role)
create table public.student_access (
  student_id uuid primary key references public.students(id) on delete cascade,
  pin_hash text not null,
  pin_version integer not null default 1,
  must_change boolean not null default true,
  last_login_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.login_throttle (
  key text primary key,
  attempts integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

-- ---------- Kedisiplinan ---------------------------------------------
create table public.violation_types (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete restrict,
  code text not null check (length(btrim(code)) between 2 and 20),
  name text not null check (length(btrim(name)) between 3 and 150),
  category text not null check (category in ('ringan','sedang','berat')),
  default_points integer not null check (default_points between 0 and 1000),
  status text not null default 'aktif' check (status in ('aktif','nonaktif')),
  valid_from date,
  valid_to date,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_to is null or valid_from is null or valid_to >= valid_from),
  unique (school_id, code),
  unique (id, school_id)
);

create table public.violation_records (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  student_id uuid not null,
  class_id uuid references public.classes(id) on delete set null,
  type_id uuid not null,
  incident_date date not null,
  description text not null check (length(btrim(description)) between 3 and 2000),
  points_snapshot integer not null check (points_snapshot between 0 and 1000),
  status text not null default 'dilaporkan' check (status in ('dilaporkan','disahkan','ditolak','dibatalkan')),
  reported_by uuid not null references auth.users(id) on delete restrict,
  verified_by uuid references auth.users(id) on delete restrict,
  verified_at timestamptz,
  status_reason text,
  request_id uuid not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (student_id, school_id) references public.students(id, school_id) on delete restrict,
  foreign key (type_id, school_id) references public.violation_types(id, school_id) on delete restrict
);
create index violation_records_student_idx on public.violation_records (student_id, status);
create index violation_records_school_idx on public.violation_records (school_id, status, incident_date desc);
create index violation_records_reporter_idx on public.violation_records (reported_by);

create table public.violation_actions (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.violation_records(id) on delete restrict,
  action_type text not null check (action_type in ('pengesahan','penolakan','koreksi','pembatalan')),
  reason text,
  old_points integer,
  new_points integer,
  old_status text,
  new_status text,
  performed_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index violation_actions_record_idx on public.violation_actions (record_id);

create table public.discipline_actions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  student_id uuid not null,
  record_id uuid references public.violation_records(id) on delete set null,
  action text not null check (length(btrim(action)) between 3 and 100),
  notes text,
  follow_up_date date,
  status text not null default 'direncanakan' check (status in ('direncanakan','berjalan','selesai')),
  visible_to_student boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (student_id, school_id) references public.students(id, school_id) on delete restrict
);
create index discipline_actions_student_idx on public.discipline_actions (student_id);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  school_id uuid,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_school_idx on public.audit_logs (school_id, created_at desc);

-- ---------- Fungsi bantu: peran & kewenangan --------------------------
create or replace function public.is_yayasan()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin_yayasan')
$$;

-- Admin yayasan lolos untuk semua unit; peran lain harus cocok dengan unit.
create or replace function public.has_role(p_school uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and (ur.role = 'admin_yayasan' or (ur.role = any(p_roles) and ur.school_id = p_school))
  )
$$;

create or replace function public.is_member(p_school uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and (ur.role = 'admin_yayasan' or ur.school_id = p_school)
  )
$$;

-- Guru/wali kelas yang ditugaskan pada kelas siswa (tahun ajaran aktif)
create or replace function public.teaches_student(p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.student_enrollments e
    join public.academic_years ay on ay.id = e.academic_year_id and ay.is_active
    join public.class_teachers ct on ct.class_id = e.class_id
    where e.student_id = p_student and ct.user_id = auth.uid()
  )
$$;

create or replace function public.is_homeroom_of(p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.student_enrollments e
    join public.academic_years ay on ay.id = e.academic_year_id and ay.is_active
    join public.class_teachers ct on ct.class_id = e.class_id and ct.role = 'wali_kelas'
    where e.student_id = p_student and ct.user_id = auth.uid()
  )
$$;

create or replace function public.can_see_student(p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.students s
    where s.id = p_student
      and (public.has_role(s.school_id, array['kepala_sekolah','admin_sekolah','kurikulum','kesiswaan','bk'])
           or public.teaches_student(s.id))
  )
$$;

create or replace function public.today_wib()
returns date language sql stable as $$ select (now() at time zone 'Asia/Jakarta')::date $$;

-- ---------- Trigger umum ---------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger students_touch before update on public.students for each row execute function public.touch_updated_at();
create trigger violation_types_touch before update on public.violation_types for each row execute function public.touch_updated_at();
create trigger violation_records_touch before update on public.violation_records for each row execute function public.touch_updated_at();
create trigger discipline_actions_touch before update on public.discipline_actions for each row execute function public.touch_updated_at();

-- Audit log: append-only
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_row jsonb; v_detail jsonb;
begin
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old); v_detail := jsonb_build_object('old', to_jsonb(old));
  elsif tg_op = 'UPDATE' then
    v_row := to_jsonb(new); v_detail := jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new));
  else
    v_row := to_jsonb(new); v_detail := jsonb_build_object('new', to_jsonb(new));
  end if;
  insert into public.audit_logs (user_id, action, entity, entity_id, school_id, detail)
  values (auth.uid(), tg_op, tg_table_name, v_row->>'id', nullif(v_row->>'school_id','')::uuid, v_detail);
  return null;
end $$;

create or replace function public.audit_logs_immutable()
returns trigger language plpgsql as $$
begin raise exception 'audit_logs bersifat append-only'; end $$;
create trigger audit_logs_no_change before update or delete on public.audit_logs
  for each row execute function public.audit_logs_immutable();

create trigger audit_schools after insert or update or delete on public.schools for each row execute function public.audit_row();
create trigger audit_academic_years after insert or update or delete on public.academic_years for each row execute function public.audit_row();
create trigger audit_classes after insert or update or delete on public.classes for each row execute function public.audit_row();
create trigger audit_students after insert or update or delete on public.students for each row execute function public.audit_row();
create trigger audit_enrollments after insert or update or delete on public.student_enrollments for each row execute function public.audit_row();
create trigger audit_user_roles after insert or update or delete on public.user_roles for each row execute function public.audit_row();
create trigger audit_class_teachers after insert or update or delete on public.class_teachers for each row execute function public.audit_row();
create trigger audit_violation_types after insert or update or delete on public.violation_types for each row execute function public.audit_row();
create trigger audit_violation_records after insert or update or delete on public.violation_records for each row execute function public.audit_row();
create trigger audit_violation_actions after insert on public.violation_actions for each row execute function public.audit_row();
create trigger audit_discipline_actions after insert or update or delete on public.discipline_actions for each row execute function public.audit_row();

-- ---------- Row Level Security ---------------------------------------
alter table public.schools enable row level security;
alter table public.academic_years enable row level security;
alter table public.semesters enable row level security;
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.student_enrollments enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.class_teachers enable row level security;
alter table public.student_access enable row level security;   -- tanpa policy: hanya service role
alter table public.login_throttle enable row level security;    -- tanpa policy: hanya service role
alter table public.violation_types enable row level security;
alter table public.violation_records enable row level security;
alter table public.violation_actions enable row level security;
alter table public.discipline_actions enable row level security;
alter table public.audit_logs enable row level security;

-- schools
create policy schools_select on public.schools for select to authenticated using (public.is_member(id));
create policy schools_write on public.schools for all to authenticated using (public.is_yayasan()) with check (public.is_yayasan());

-- tahun ajaran, semester, kelas
create policy ay_select on public.academic_years for select to authenticated using (public.is_member(school_id));
create policy ay_write on public.academic_years for all to authenticated
  using (public.has_role(school_id, array['admin_sekolah','kurikulum'])) with check (public.has_role(school_id, array['admin_sekolah','kurikulum']));
create policy sem_select on public.semesters for select to authenticated using (public.is_member(school_id));
create policy sem_write on public.semesters for all to authenticated
  using (public.has_role(school_id, array['admin_sekolah','kurikulum'])) with check (public.has_role(school_id, array['admin_sekolah','kurikulum']));
create policy classes_select on public.classes for select to authenticated using (public.is_member(school_id));
create policy classes_write on public.classes for all to authenticated
  using (public.has_role(school_id, array['admin_sekolah','kurikulum'])) with check (public.has_role(school_id, array['admin_sekolah','kurikulum']));

-- siswa
create policy students_select on public.students for select to authenticated
  using (public.has_role(school_id, array['kepala_sekolah','admin_sekolah','kurikulum','kesiswaan','bk']) or public.teaches_student(id));
create policy students_insert on public.students for insert to authenticated
  with check (public.has_role(school_id, array['admin_sekolah','kesiswaan']));
create policy students_update on public.students for update to authenticated
  using (public.has_role(school_id, array['admin_sekolah','kesiswaan'])) with check (public.has_role(school_id, array['admin_sekolah','kesiswaan']));
create policy students_delete on public.students for delete to authenticated
  using (public.has_role(school_id, array['admin_sekolah']));

create policy enroll_select on public.student_enrollments for select to authenticated using (public.can_see_student(student_id));
create policy enroll_write on public.student_enrollments for all to authenticated
  using (public.has_role(school_id, array['admin_sekolah','kesiswaan','kurikulum']))
  with check (public.has_role(school_id, array['admin_sekolah','kesiswaan','kurikulum']));

-- profil & peran
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy roles_select on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_yayasan() or public.has_role(school_id, array['admin_sekolah']));
create policy class_teachers_select on public.class_teachers for select to authenticated using (public.is_member(school_id));
create policy class_teachers_write on public.class_teachers for all to authenticated
  using (public.has_role(school_id, array['admin_sekolah','kurikulum'])) with check (public.has_role(school_id, array['admin_sekolah','kurikulum']));

-- jenis pelanggaran
create policy vtypes_select on public.violation_types for select to authenticated using (public.is_member(school_id));
create policy vtypes_write on public.violation_types for all to authenticated
  using (public.has_role(school_id, array['kesiswaan','admin_sekolah'])) with check (public.has_role(school_id, array['kesiswaan','admin_sekolah']));

-- catatan pelanggaran: hanya baca langsung; tulis lewat fungsi (RPC)
create policy vrec_select on public.violation_records for select to authenticated
  using (public.has_role(school_id, array['kepala_sekolah','admin_sekolah','kesiswaan','bk'])
         or reported_by = auth.uid()
         or public.is_homeroom_of(student_id));
create policy vact_select on public.violation_actions for select to authenticated
  using (exists (select 1 from public.violation_records r where r.id = record_id));

-- pembinaan
create policy dact_select on public.discipline_actions for select to authenticated
  using (public.has_role(school_id, array['kepala_sekolah','admin_sekolah','kesiswaan','bk']) or public.is_homeroom_of(student_id));
create policy dact_insert on public.discipline_actions for insert to authenticated
  with check (created_by = auth.uid() and (public.has_role(school_id, array['kesiswaan','bk','admin_sekolah']) or public.is_homeroom_of(student_id)));
create policy dact_update on public.discipline_actions for update to authenticated
  using (public.has_role(school_id, array['kesiswaan','bk','admin_sekolah']) or public.is_homeroom_of(student_id))
  with check (public.has_role(school_id, array['kesiswaan','bk','admin_sekolah']) or public.is_homeroom_of(student_id));
create policy dact_delete on public.discipline_actions for delete to authenticated
  using (public.has_role(school_id, array['kesiswaan','admin_sekolah']));

-- audit
create policy audit_select on public.audit_logs for select to authenticated
  using (public.is_yayasan() or public.has_role(school_id, array['auditor','kepala_sekolah']));

-- ---------- Hak akses tingkat tabel ----------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant select on public.schools, public.academic_years, public.semesters, public.classes, public.students,
  public.student_enrollments, public.profiles, public.user_roles, public.class_teachers, public.violation_types,
  public.violation_records, public.violation_actions, public.discipline_actions, public.audit_logs to authenticated;
grant insert, update, delete on public.schools, public.academic_years, public.semesters, public.classes,
  public.students, public.student_enrollments, public.class_teachers, public.violation_types to authenticated;
grant insert, update, delete on public.discipline_actions to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;

-- fungsi bantu yang dipakai policy harus dapat dieksekusi pengguna
grant execute on function public.is_yayasan(), public.has_role(uuid, text[]), public.is_member(uuid),
  public.teaches_student(uuid), public.is_homeroom_of(uuid), public.can_see_student(uuid), public.today_wib() to authenticated;
