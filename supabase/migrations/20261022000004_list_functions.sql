-- Fungsi daftar untuk antarmuka (security invoker: RLS pemanggil tetap berlaku)
create or replace function public.esc_like(p text)
returns text language sql immutable as $$ select replace(replace(replace(coalesce(p,''), '\', '\\'), '%', '\%'), '_', '\_') $$;

create or replace function public.student_pin_status(p_student uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when not public.can_manage_pin(p_student) then null
    when not exists (select 1 from public.student_access a where a.student_id = p_student) then 'belum'
    when (select a.must_change from public.student_access a where a.student_id = p_student) then 'sementara'
    else 'aktif' end
$$;

create or replace function public.list_students(
  p_school uuid, p_class uuid default null, p_search text default null, p_status text default 'aktif', p_limit integer default 300)
returns table (id uuid, nis text, full_name text, gender text, status text, guardian_name text, guardian_phone text,
               class_id uuid, class_name text, pin_status text)
language sql stable security invoker set search_path = public as $$
  select s.id, s.nis, s.full_name, s.gender, s.status, s.guardian_name, s.guardian_phone, c.id, c.name, public.student_pin_status(s.id)
  from public.students s
  left join public.academic_years ay on ay.school_id = s.school_id and ay.is_active
  left join public.student_enrollments e on e.student_id = s.id and e.academic_year_id = ay.id
  left join public.classes c on c.id = e.class_id
  where s.school_id = p_school
    and (coalesce(p_status,'') = '' or s.status = p_status)
    and (p_class is null or c.id = p_class)
    and (coalesce(p_search,'') = '' or s.nis ilike '%' || public.esc_like(p_search) || '%' or s.full_name ilike '%' || public.esc_like(p_search) || '%')
  order by c.name nulls last, s.full_name
  limit least(greatest(p_limit, 1), 1000)
$$;

create or replace function public.list_classes(p_school uuid, p_year uuid default null)
returns table (id uuid, name text, academic_year_id uuid, student_count bigint, homeroom text)
language sql stable security invoker set search_path = public as $$
  select c.id, c.name, c.academic_year_id,
         (select count(*) from public.student_enrollments e where e.class_id = c.id),
         (select string_agg(p.full_name, ', ' order by p.full_name) from public.class_teachers ct
            join public.profiles p on p.id = ct.user_id where ct.class_id = c.id and ct.role = 'wali_kelas')
  from public.classes c
  where c.school_id = p_school
    and c.academic_year_id = coalesce(p_year, (select ay.id from public.academic_years ay where ay.school_id = p_school and ay.is_active))
  order by c.name
$$;

create or replace function public.list_violations(
  p_school uuid, p_status text default null, p_student uuid default null, p_search text default null,
  p_from date default null, p_to date default null, p_limit integer default 200)
returns table (id uuid, student_id uuid, nis text, student_name text, class_name text, type_id uuid, type_name text, category text,
               incident_date date, description text, points integer, status text, reported_by uuid, verified_by uuid,
               verified_at timestamptz, status_reason text, created_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select r.id, r.student_id, s.nis, s.full_name, c.name, r.type_id, t.name, t.category, r.incident_date, r.description,
         r.points_snapshot, r.status, r.reported_by, r.verified_by, r.verified_at, r.status_reason, r.created_at
  from public.violation_records r
  left join public.students s on s.id = r.student_id
  left join public.classes c on c.id = r.class_id
  left join public.violation_types t on t.id = r.type_id
  where r.school_id = p_school
    and (coalesce(p_status,'') = '' or r.status = p_status)
    and (p_student is null or r.student_id = p_student)
    and (p_from is null or r.incident_date >= p_from)
    and (p_to is null or r.incident_date <= p_to)
    and (coalesce(p_search,'') = '' or s.nis ilike '%' || public.esc_like(p_search) || '%' or s.full_name ilike '%' || public.esc_like(p_search) || '%')
  order by r.incident_date desc, r.created_at desc
  limit least(greatest(p_limit, 1), 1000)
$$;

create or replace function public.list_discipline_actions(p_school uuid, p_status text default null)
returns table (id uuid, student_id uuid, nis text, student_name text, record_id uuid, action text, notes text,
               follow_up_date date, status text, visible_to_student boolean, created_by uuid, created_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select d.id, d.student_id, s.nis, s.full_name, d.record_id, d.action, d.notes, d.follow_up_date, d.status,
         d.visible_to_student, d.created_by, d.created_at
  from public.discipline_actions d left join public.students s on s.id = d.student_id
  where d.school_id = p_school and (coalesce(p_status,'') = '' or d.status = p_status)
  order by (d.status = 'selesai'), d.follow_up_date nulls last, d.created_at desc
  limit 500
$$;

revoke execute on function public.esc_like(text), public.student_pin_status(uuid),
  public.list_students(uuid, uuid, text, text, integer), public.list_classes(uuid, uuid),
  public.list_violations(uuid, text, uuid, text, date, date, integer), public.list_discipline_actions(uuid, text)
  from public, anon;
grant execute on function public.esc_like(text), public.student_pin_status(uuid),
  public.list_students(uuid, uuid, text, text, integer), public.list_classes(uuid, uuid),
  public.list_violations(uuid, text, uuid, text, date, date, integer), public.list_discipline_actions(uuid, text)
  to authenticated, service_role;

-- Pembantu portal: ambil data akses berdasarkan id siswa (hanya service role)
create or replace function public.portal_get_access(p_student_id uuid)
returns table (nis text, pin_hash text, pin_version integer)
language sql stable security definer set search_path = public as $$
  select s.nis, a.pin_hash, a.pin_version from public.students s join public.student_access a on a.student_id = s.id
  where s.id = p_student_id and s.status = 'aktif'
$$;
revoke execute on function public.portal_get_access(uuid) from public, anon, authenticated;
grant execute on function public.portal_get_access(uuid) to service_role;

-- Ganti tahun ajaran aktif secara atomik
create or replace function public.set_active_year(p_year uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_school uuid;
begin
  select school_id into v_school from public.academic_years where id = p_year;
  if v_school is null then raise exception 'Tahun ajaran tidak ditemukan' using errcode = '22023'; end if;
  if not public.has_role(v_school, array['admin_sekolah','kurikulum']) then raise exception 'Tidak berwenang' using errcode = '42501'; end if;
  update public.academic_years set is_active = false where school_id = v_school and is_active and id <> p_year;
  update public.academic_years set is_active = true where id = p_year;
end $$;
revoke execute on function public.set_active_year(uuid) from public, anon;
grant execute on function public.set_active_year(uuid) to authenticated, service_role;

-- Pengerasan: search_path tetap pada fungsi kecil (peringatan advisor Supabase)
alter function public.audit_logs_immutable() set search_path = public;
alter function public.touch_updated_at() set search_path = public;
alter function public.today_wib() set search_path = public, pg_catalog;
alter function public.esc_like(text) set search_path = public, pg_catalog;
