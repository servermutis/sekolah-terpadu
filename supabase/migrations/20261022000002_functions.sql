-- =====================================================================
-- Fungsi bisnis kedisiplinan, rekap poin, dan portal siswa
-- Semua perubahan catatan pelanggaran HANYA lewat fungsi ini.
-- =====================================================================

-- Pencarian siswa untuk formulir (hanya siswa yang boleh dilihat pemanggil)
create or replace function public.lookup_student(p_nis text)
returns table (id uuid, school_id uuid, nis text, full_name text, status text, class_id uuid, class_name text)
language sql stable security invoker set search_path = public as $$
  select s.id, s.school_id, s.nis, s.full_name, s.status, c.id, c.name
  from public.students s
  left join public.academic_years ay on ay.school_id = s.school_id and ay.is_active
  left join public.student_enrollments e on e.student_id = s.id and e.academic_year_id = ay.id
  left join public.classes c on c.id = e.class_id
  where s.nis = upper(btrim(p_nis))
$$;

-- Catat pelanggaran. Poin diambil dari aturan aktif (points_snapshot), bukan dari klien.
create or replace function public.report_violation(
  p_student_id uuid, p_type_id uuid, p_incident_date date, p_description text,
  p_request_id uuid, p_approve boolean default false)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_student public.students;
  v_type public.violation_types;
  v_id uuid;
  v_status text := 'dilaporkan';
  v_class uuid;
  v_manager boolean;
begin
  if v_uid is null then raise exception 'Tidak terautentikasi' using errcode = '28000'; end if;
  if p_request_id is null then raise exception 'request_id wajib diisi' using errcode = '22023'; end if;

  -- idempotensi: permintaan yang sama tidak membuat catatan ganda
  select id into v_id from public.violation_records where request_id = p_request_id and reported_by = v_uid;
  if found then return v_id; end if;

  select * into v_student from public.students where id = p_student_id;
  if not found then raise exception 'Data siswa tidak ditemukan' using errcode = '42501'; end if;
  v_manager := public.has_role(v_student.school_id, array['kesiswaan','admin_sekolah']);
  if not (v_manager
          or public.has_role(v_student.school_id, array['kepala_sekolah'])
          or (public.has_role(v_student.school_id, array['guru','wali_kelas']) and public.teaches_student(p_student_id)))
  then raise exception 'Anda tidak berwenang mencatat pelanggaran untuk siswa ini' using errcode = '42501'; end if;
  if v_student.status <> 'aktif' then raise exception 'Siswa tidak berstatus aktif' using errcode = '22023'; end if;

  if p_incident_date is null or p_incident_date > public.today_wib() or p_incident_date < public.today_wib() - 366
  then raise exception 'Tanggal kejadian tidak valid' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_description,''))) < 3 or length(p_description) > 2000
  then raise exception 'Keterangan kejadian harus 3-2000 karakter' using errcode = '22023'; end if;

  select * into v_type from public.violation_types
   where id = p_type_id and school_id = v_student.school_id and status = 'aktif'
     and (valid_from is null or valid_from <= p_incident_date)
     and (valid_to is null or valid_to >= p_incident_date);
  if not found then raise exception 'Jenis pelanggaran tidak berlaku untuk unit/tanggal ini' using errcode = '22023'; end if;

  if p_approve then
    if not (v_manager or public.has_role(v_student.school_id, array['kepala_sekolah'])) then
      raise exception 'Anda tidak berwenang mengesahkan catatan' using errcode = '42501';
    end if;
    v_status := 'disahkan';
  end if;

  select e.class_id into v_class
    from public.student_enrollments e
    join public.academic_years ay on ay.id = e.academic_year_id and ay.is_active
   where e.student_id = p_student_id;

  insert into public.violation_records
    (school_id, student_id, class_id, type_id, incident_date, description, points_snapshot, status,
     reported_by, verified_by, verified_at, request_id)
  values
    (v_student.school_id, p_student_id, v_class, p_type_id, p_incident_date, btrim(p_description), v_type.default_points, v_status,
     v_uid, case when v_status = 'disahkan' then v_uid end, case when v_status = 'disahkan' then now() end, p_request_id)
  on conflict (request_id) do nothing
  returning id into v_id;

  if v_id is null then  -- balapan: permintaan serupa baru saja tersimpan
    select id into v_id from public.violation_records where request_id = p_request_id;
    return v_id;
  end if;

  if v_status = 'disahkan' then
    insert into public.violation_actions (record_id, action_type, reason, new_points, old_status, new_status, performed_by)
    values (v_id, 'pengesahan', 'Disahkan saat pencatatan', v_type.default_points, 'dilaporkan', 'disahkan', v_uid);
  end if;
  return v_id;
end $$;

-- Verifikasi: sahkan atau tolak laporan
create or replace function public.verify_violation(p_record_id uuid, p_decision text, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_rec public.violation_records; v_new text;
begin
  if v_uid is null then raise exception 'Tidak terautentikasi' using errcode = '28000'; end if;
  select * into v_rec from public.violation_records where id = p_record_id for update;
  if not found then raise exception 'Catatan tidak ditemukan' using errcode = '42501'; end if;
  if not public.has_role(v_rec.school_id, array['kesiswaan','admin_sekolah','kepala_sekolah'])
  then raise exception 'Anda tidak berwenang memverifikasi' using errcode = '42501'; end if;
  if v_rec.status <> 'dilaporkan' then raise exception 'Hanya catatan berstatus dilaporkan yang dapat diverifikasi' using errcode = '22023'; end if;
  if p_decision not in ('sahkan','tolak') then raise exception 'Keputusan tidak dikenal' using errcode = '22023'; end if;
  if p_decision = 'tolak' and length(btrim(coalesce(p_note,''))) < 3
  then raise exception 'Alasan penolakan wajib diisi' using errcode = '22023'; end if;
  v_new := case p_decision when 'sahkan' then 'disahkan' else 'ditolak' end;

  update public.violation_records
     set status = v_new, verified_by = v_uid, verified_at = now(), status_reason = nullif(btrim(coalesce(p_note,'')), '')
   where id = p_record_id;
  insert into public.violation_actions (record_id, action_type, reason, old_points, new_points, old_status, new_status, performed_by)
  values (p_record_id, case p_decision when 'sahkan' then 'pengesahan' else 'penolakan' end, nullif(btrim(coalesce(p_note,'')), ''),
          v_rec.points_snapshot, v_rec.points_snapshot, 'dilaporkan', v_new, v_uid);
end $$;

-- Koreksi catatan. Catatan yang sudah disahkan wajib beralasan & hanya petugas berwenang.
create or replace function public.update_violation(
  p_record_id uuid, p_type_id uuid, p_incident_date date, p_description text,
  p_points integer default null, p_reason text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_rec public.violation_records; v_type public.violation_types;
  v_manager boolean; v_new_points integer; v_reason text := nullif(btrim(coalesce(p_reason,'')), '');
begin
  if v_uid is null then raise exception 'Tidak terautentikasi' using errcode = '28000'; end if;
  select * into v_rec from public.violation_records where id = p_record_id for update;
  if not found then raise exception 'Catatan tidak ditemukan' using errcode = '42501'; end if;
  v_manager := public.has_role(v_rec.school_id, array['kesiswaan','admin_sekolah']);
  if v_rec.status not in ('dilaporkan','disahkan') then raise exception 'Catatan berstatus % tidak dapat diubah', v_rec.status using errcode = '22023'; end if;
  if v_rec.status = 'disahkan' then
    if not v_manager then raise exception 'Hanya petugas kesiswaan yang dapat mengoreksi catatan yang sudah disahkan' using errcode = '42501'; end if;
    if v_reason is null or length(v_reason) < 5 then raise exception 'Alasan koreksi wajib diisi (min. 5 karakter)' using errcode = '22023'; end if;
  else
    if not (v_manager or v_rec.reported_by = v_uid) then raise exception 'Anda tidak berwenang mengubah catatan ini' using errcode = '42501'; end if;
  end if;
  if p_incident_date is null or p_incident_date > public.today_wib() or p_incident_date < public.today_wib() - 366
  then raise exception 'Tanggal kejadian tidak valid' using errcode = '22023'; end if;
  if length(btrim(coalesce(p_description,''))) < 3 or length(p_description) > 2000
  then raise exception 'Keterangan kejadian harus 3-2000 karakter' using errcode = '22023'; end if;

  v_new_points := v_rec.points_snapshot;
  if p_type_id is distinct from v_rec.type_id then
    select * into v_type from public.violation_types
     where id = p_type_id and school_id = v_rec.school_id and status = 'aktif';
    if not found then raise exception 'Jenis pelanggaran tidak valid atau tidak aktif' using errcode = '22023'; end if;
    v_new_points := v_type.default_points;
  end if;
  if p_points is not null and p_points <> v_new_points then
    if not v_manager then raise exception 'Hanya petugas kesiswaan yang dapat mengubah poin manual' using errcode = '42501'; end if;
    if v_reason is null or length(v_reason) < 5 then raise exception 'Perubahan poin manual wajib beralasan' using errcode = '22023'; end if;
    if p_points < 0 or p_points > 1000 then raise exception 'Poin harus 0-1000' using errcode = '22023'; end if;
    v_new_points := p_points;
  end if;

  update public.violation_records
     set type_id = p_type_id, incident_date = p_incident_date, description = btrim(p_description), points_snapshot = v_new_points
   where id = p_record_id;
  insert into public.violation_actions (record_id, action_type, reason, old_points, new_points, old_status, new_status, performed_by)
  values (p_record_id, 'koreksi', v_reason, v_rec.points_snapshot, v_new_points, v_rec.status, v_rec.status, v_uid);
end $$;

-- Pembatalan: catatan tidak dihapus, hanya tidak lagi dihitung.
create or replace function public.cancel_violation(p_record_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_rec public.violation_records; v_manager boolean; v_reason text := nullif(btrim(coalesce(p_reason,'')), '');
begin
  if v_uid is null then raise exception 'Tidak terautentikasi' using errcode = '28000'; end if;
  select * into v_rec from public.violation_records where id = p_record_id for update;
  if not found then raise exception 'Catatan tidak ditemukan' using errcode = '42501'; end if;
  v_manager := public.has_role(v_rec.school_id, array['kesiswaan','admin_sekolah']);
  if v_rec.status not in ('dilaporkan','disahkan') then raise exception 'Catatan berstatus % tidak dapat dibatalkan', v_rec.status using errcode = '22023'; end if;
  if v_rec.status = 'disahkan' and not v_manager then raise exception 'Hanya petugas kesiswaan yang dapat membatalkan catatan yang sudah disahkan' using errcode = '42501'; end if;
  if v_rec.status = 'dilaporkan' and not (v_manager or v_rec.reported_by = v_uid) then raise exception 'Anda tidak berwenang membatalkan catatan ini' using errcode = '42501'; end if;
  if v_reason is null or length(v_reason) < 5 then raise exception 'Alasan pembatalan wajib diisi (min. 5 karakter)' using errcode = '22023'; end if;

  update public.violation_records set status = 'dibatalkan', status_reason = v_reason where id = p_record_id;
  insert into public.violation_actions (record_id, action_type, reason, old_points, new_points, old_status, new_status, performed_by)
  values (p_record_id, 'pembatalan', v_reason, v_rec.points_snapshot, v_rec.points_snapshot, v_rec.status, 'dibatalkan', v_uid);
end $$;

-- Rekap poin dihitung ulang dari catatan sumber (hanya status 'disahkan').
create or replace function public.rekap_poin(
  p_school uuid, p_from date default null, p_to date default null, p_class uuid default null, p_search text default null)
returns table (student_id uuid, nis text, full_name text, class_id uuid, class_name text, violation_count bigint, total_points bigint)
language plpgsql stable security invoker set search_path = public as $$
begin
  if not (public.has_role(p_school, array['kepala_sekolah','admin_sekolah','kesiswaan','bk','wali_kelas'])) then
    raise exception 'Anda tidak berwenang melihat rekap poin' using errcode = '42501';
  end if;
  return query
  select s.id, s.nis, s.full_name, c.id, c.name,
         count(r.id)::bigint,
         coalesce(sum(r.points_snapshot), 0)::bigint
  from public.students s
  left join public.academic_years ay on ay.school_id = s.school_id and ay.is_active
  left join public.student_enrollments e on e.student_id = s.id and e.academic_year_id = ay.id
  left join public.classes c on c.id = e.class_id
  left join public.violation_records r
         on r.student_id = s.id and r.status = 'disahkan'
        and (p_from is null or r.incident_date >= p_from)
        and (p_to is null or r.incident_date <= p_to)
  where s.school_id = p_school and s.status = 'aktif'
    and (p_class is null or c.id = p_class)
    and (p_search is null or p_search = ''
         or s.nis ilike '%' || replace(replace(replace(p_search, '\', '\\'), '%', '\%'), '_', '\_') || '%'
         or s.full_name ilike '%' || replace(replace(replace(p_search, '\', '\\'), '%', '\%'), '_', '\_') || '%')
    and (public.has_role(p_school, array['kepala_sekolah','admin_sekolah','kesiswaan','bk']) or public.is_homeroom_of(s.id))
  group by s.id, s.nis, s.full_name, c.id, c.name
  order by 7 desc, s.full_name;
end $$;

-- Ringkasan dashboard
create or replace function public.dashboard_stats(p_school uuid, p_threshold integer default 50)
returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare v jsonb;
begin
  if not public.is_member(p_school) then raise exception 'Tidak berwenang' using errcode = '42501'; end if;
  select jsonb_build_object(
    'students_active', (select count(*) from public.students where school_id = p_school and status = 'aktif'),
    'pending', (select count(*) from public.violation_records where school_id = p_school and status = 'dilaporkan'),
    'approved_month', (select count(*) from public.violation_records where school_id = p_school and status = 'disahkan'
                         and incident_date >= date_trunc('month', public.today_wib())::date),
    'approved_total', (select count(*) from public.violation_records where school_id = p_school and status = 'disahkan'),
    'high_points', (select count(*) from (
        select student_id from public.violation_records where school_id = p_school and status = 'disahkan'
        group by student_id having sum(points_snapshot) >= p_threshold) t)
  ) into v;
  return v;
end $$;

-- Pemeriksa kewenangan untuk fungsi serverless (dipanggil dengan JWT pengguna)
create or replace function public.can_manage_pin(p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.students s where s.id = p_student
                 and public.has_role(s.school_id, array['kesiswaan','admin_sekolah']))
$$;
create or replace function public.can_manage_pin_class(p_class uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.classes c where c.id = p_class
                 and public.has_role(c.school_id, array['kesiswaan','admin_sekolah']))
$$;
create or replace function public.can_manage_users(p_school uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(p_school, array['admin_sekolah'])
$$;

-- ---------- Fungsi khusus server (service role) -----------------------
create or replace function public.portal_login_lookup(p_nis text)
returns table (student_id uuid, full_name text, pin_hash text, pin_version integer, must_change boolean)
language sql stable security definer set search_path = public as $$
  select s.id, s.full_name, a.pin_hash, a.pin_version, a.must_change
  from public.students s join public.student_access a on a.student_id = s.id
  where s.nis = upper(btrim(p_nis)) and s.status = 'aktif'
$$;

create or replace function public.portal_check_lock(p_keys text[])
returns timestamptz language sql stable security definer set search_path = public as $$
  select max(locked_until) from public.login_throttle where key = any(p_keys) and locked_until > now()
$$;

create or replace function public.portal_register_failure(p_key text, p_max integer, p_lock_minutes integer)
returns timestamptz
language plpgsql security definer set search_path = public as $$
declare v_attempts integer; v_locked timestamptz;
begin
  insert into public.login_throttle (key, attempts, updated_at) values (p_key, 1, now())
  on conflict (key) do update
    set attempts = case when public.login_throttle.locked_until is not null and public.login_throttle.locked_until <= now()
                        then 1 else public.login_throttle.attempts + 1 end,
        locked_until = case when public.login_throttle.locked_until is not null and public.login_throttle.locked_until <= now()
                            then null else public.login_throttle.locked_until end,
        updated_at = now()
  returning attempts, locked_until into v_attempts, v_locked;
  if v_attempts >= p_max and (v_locked is null or v_locked <= now()) then
    update public.login_throttle set locked_until = now() + make_interval(mins => p_lock_minutes) where key = p_key
    returning locked_until into v_locked;
    insert into public.audit_logs (action, entity, entity_id, detail)
    values ('LOCK', 'portal_login', left(p_key, 40), jsonb_build_object('attempts', v_attempts, 'locked_until', v_locked));
  end if;
  return v_locked;
end $$;

create or replace function public.portal_reset_throttle(p_key text)
returns void language sql security definer set search_path = public as $$
  delete from public.login_throttle where key = p_key
$$;

create or replace function public.portal_data(p_student_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'student', (select jsonb_build_object('nis', s.nis, 'full_name', s.full_name, 'class_name', c.name, 'school', sc.name, 'level', sc.level)
                from public.students s
                join public.schools sc on sc.id = s.school_id
                left join public.academic_years ay on ay.school_id = s.school_id and ay.is_active
                left join public.student_enrollments e on e.student_id = s.id and e.academic_year_id = ay.id
                left join public.classes c on c.id = e.class_id
                where s.id = p_student_id),
    'summary', (select jsonb_build_object('count', count(*), 'points', coalesce(sum(points_snapshot), 0))
                from public.violation_records where student_id = p_student_id and status = 'disahkan'),
    'records', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'date', r.incident_date, 'type', t.name,
                           'category', t.category, 'description', r.description, 'points', r.points_snapshot)
                         order by r.incident_date desc, r.created_at desc)
                         from public.violation_records r join public.violation_types t on t.id = r.type_id
                         where r.student_id = p_student_id and r.status = 'disahkan'), '[]'::jsonb),
    'actions', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'action', d.action, 'notes', d.notes,
                           'follow_up_date', d.follow_up_date, 'status', d.status) order by d.created_at desc)
                         from public.discipline_actions d
                         where d.student_id = p_student_id and d.visible_to_student), '[]'::jsonb)
  )
$$;

create or replace function public.portal_session_valid(p_student_id uuid, p_pin_version integer)
returns table (must_change boolean) language sql stable security definer set search_path = public as $$
  select a.must_change from public.student_access a join public.students s on s.id = a.student_id
  where a.student_id = p_student_id and a.pin_version = p_pin_version and s.status = 'aktif'
$$;

create or replace function public.portal_set_pin(p_student_id uuid, p_hash text, p_must_change boolean)
returns integer language plpgsql security definer set search_path = public as $$
declare v integer;
begin
  insert into public.student_access (student_id, pin_hash, pin_version, must_change)
  values (p_student_id, p_hash, 1, p_must_change)
  on conflict (student_id) do update
    set pin_hash = excluded.pin_hash, pin_version = public.student_access.pin_version + 1,
        must_change = excluded.must_change, updated_at = now()
  returning pin_version into v;
  return v;
end $$;

create or replace function public.portal_touch_login(p_student_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.student_access set last_login_at = now() where student_id = p_student_id
$$;

create or replace function public.log_event(p_user uuid, p_action text, p_entity text, p_entity_id text, p_school uuid, p_detail jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_logs (user_id, action, entity, entity_id, school_id, detail) values (p_user, p_action, p_entity, p_entity_id, p_school, p_detail)
$$;

-- ---------- Hak eksekusi ---------------------------------------------
-- Cabut semua, lalu beri izin eksplisit (fungsi portal_* hanya untuk service_role).
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

grant execute on function
  public.is_yayasan(), public.has_role(uuid, text[]), public.is_member(uuid), public.teaches_student(uuid),
  public.is_homeroom_of(uuid), public.can_see_student(uuid), public.today_wib(),
  public.lookup_student(text), public.report_violation(uuid, uuid, date, text, uuid, boolean),
  public.verify_violation(uuid, text, text), public.update_violation(uuid, uuid, date, text, integer, text),
  public.cancel_violation(uuid, text), public.rekap_poin(uuid, date, date, uuid, text),
  public.dashboard_stats(uuid, integer), public.can_manage_pin(uuid), public.can_manage_pin_class(uuid),
  public.can_manage_users(uuid)
to authenticated;

grant execute on all functions in schema public to service_role;
