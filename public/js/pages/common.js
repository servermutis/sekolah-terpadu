import { h, field, debounce, toast, modal, withBusy, todayWIB, fmtDate, fmtDateTime, badge, skeletons, mount } from '../ui.js';
import { db, eq } from '../api.js';
import { S, can, nameOf, MANAGE_KESISWAAN, STATUS_LABEL, CATEGORY_LABEL } from '../state.js';

// Pencarian siswa berdasarkan NIS: nama & kelas selalu dari database.
export function studentPicker({ onChange, initial } = {}) {
  let current = null;
  const input = h('input', { class: 'input', inputmode: 'numeric', autocomplete: 'off', autocapitalize: 'characters', maxlength: 30, placeholder: 'Ketik NIS lalu tekan Cari' });
  const out = h('div', { 'aria-live': 'polite' });
  const set = (st) => { current = st; if (onChange) onChange(st); };
  async function lookup() {
    const nis = input.value.trim().toUpperCase();
    set(null); mount(out);
    if (nis.length < 3) return;
    out.textContent = 'Mencari…';
    try {
      const rows = await db.rpc('lookup_student', { p_nis: nis });
      const st = (rows || []).find(r => r.school_id === S.schoolId);
      if (!st) { mount(out, h('div', { class: 'err' }, 'Data siswa tidak ditemukan.')); return; }
      if (st.status !== 'aktif') { mount(out, h('div', { class: 'err' }, `Siswa berstatus ${st.status}.`)); return; }
      set(st);
      mount(out, h('div', { class: 'notice', style: { background: 'var(--ok-100)', borderColor: 'var(--g-200)', color: 'var(--g-900)' } }, h('b', null, st.full_name), h('div', { class: 'small' }, `NIS ${st.nis} • Kelas ${st.class_name || '-'}`)));
    } catch (e) { mount(out, h('div', { class: 'err' }, e.message)); }
  }
  const deb = debounce(lookup, 450);
  input.addEventListener('input', deb);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); lookup(); } });
  const el = field('NIS siswa', h('div', { class: 'row' }, input, h('button', { class: 'btn', type: 'button', onclick: lookup }, 'Cari')));
  const wrap = h('div', { class: 'stack-s' }, el, out);
  if (initial) { input.value = initial; lookup(); }
  return { el: wrap, get: () => current, focus: () => input.focus() };
}

async function activeTypes(dateStr) {
  const rows = await db.select('violation_types', { select: 'id,code,name,category,default_points,valid_from,valid_to,status', school_id: eq(S.schoolId), status: eq('aktif'), order: 'category.asc,default_points.asc,name.asc' });
  return rows.filter(t => (!t.valid_from || t.valid_from <= dateStr) && (!t.valid_to || t.valid_to >= dateStr));
}

export async function openViolationForm({ nis, onSaved } = {}) {
  const manager = can(...MANAGE_KESISWAAN);
  const requestId = crypto.randomUUID();                 // satu ID per pembukaan formulir → anti catatan ganda
  const date = h('input', { class: 'input', type: 'date', value: todayWIB(), max: todayWIB(), required: true });
  const typeSel = h('select', { class: 'input', required: true });
  const pts = h('input', { class: 'input', readonly: true, 'aria-live': 'polite' });
  const desc = h('textarea', { class: 'input', rows: 3, maxlength: 2000, placeholder: 'Kronologi singkat kejadian', required: true });
  const approve = manager ? h('input', { type: 'checkbox' }) : null;
  const err = h('div', { class: 'err', role: 'alert' });
  let types = [];
  const picker = studentPicker({ initial: nis });
  async function loadTypes() {
    types = await activeTypes(date.value || todayWIB());
    const groups = ['ringan', 'sedang', 'berat'];
    mount(typeSel, h('option', { value: '' }, '— pilih jenis pelanggaran —'),
      groups.map(g => { const list = types.filter(t => t.category === g); return list.length ? h('optgroup', { label: CATEGORY_LABEL[g] }, list.map(t => h('option', { value: t.id }, `${t.name} (${t.default_points} poin)`))) : null; }));
    showPts();
  }
  const showPts = () => { const t = types.find(x => x.id === typeSel.value); pts.value = t ? `${t.default_points} poin (otomatis dari aturan aktif)` : ''; };
  typeSel.addEventListener('change', showPts); date.addEventListener('change', loadTypes);
  await loadTypes();
  const save = h('button', { class: 'btn', type: 'button', onclick: () => withBusy(save, async () => {
    err.textContent = '';
    const st = picker.get();
    if (!st) { err.textContent = 'Pilih siswa terlebih dahulu (cari berdasarkan NIS).'; return; }
    if (!typeSel.value) { err.textContent = 'Pilih jenis pelanggaran.'; return; }
    if (desc.value.trim().length < 3) { err.textContent = 'Isi keterangan kejadian.'; return; }
    try {
      await db.rpc('report_violation', { p_student_id: st.id, p_type_id: typeSel.value, p_incident_date: date.value, p_description: desc.value.trim(), p_request_id: requestId, p_approve: !!(approve && approve.checked) });
      toast(approve && approve.checked ? 'Pelanggaran dicatat dan disahkan.' : 'Laporan pelanggaran tersimpan.'); m.close(); if (onSaved) onSaved();
    } catch (e) { err.textContent = e.message; }
  }) }, 'Simpan');
  const m = modal({ title: 'Catat Pelanggaran', body: [picker.el,
    h('div', { class: 'form-grid two' }, field('Tanggal kejadian', date), field('Jenis pelanggaran', typeSel)),
    field('Poin', pts), field('Keterangan kejadian', desc),
    approve ? h('label', { class: 'check' }, approve, h('span', null, 'Langsung sahkan (tanpa menunggu verifikasi)')) : h('p', { class: 'hint' }, 'Laporan akan diverifikasi petugas kesiswaan sebelum dihitung ke total poin.'),
    err], actions: [h('button', { class: 'btn ghost', type: 'button', onclick: () => m.close() }, 'Batal'), save] });
}

// Detail catatan + tindakan sesuai peran & status
export async function openViolationDetail(rec, onChanged) {
  const manager = can(...MANAGE_KESISWAAN);
  const mine = rec.reported_by === S.me.id;
  const body = h('div', { class: 'stack' }); const actionsBox = [];
  const m = modal({ title: 'Detail Pelanggaran', body, wide: true });
  mount(body, skeletons(2));
  let actions = [];
  try { actions = await db.select('violation_actions', { select: '*', record_id: eq(rec.id), order: 'created_at.asc' }); } catch { /* tampil tanpa riwayat */ }
  const stBadge = { dilaporkan: 'gold', disahkan: 'ringan', ditolak: 'red', dibatalkan: 'gray' }[rec.status];
  const kv = h('dl', { class: 'kv' },
    h('dt', null, 'Siswa'), h('dd', null, `${rec.student_name || '-'} (NIS ${rec.nis || '-'})`),
    h('dt', null, 'Kelas'), h('dd', null, rec.class_name || '-'),
    h('dt', null, 'Tanggal'), h('dd', null, fmtDate(rec.incident_date)),
    h('dt', null, 'Jenis'), h('dd', null, h('span', { class: 'row wrap' }, rec.type_name, badge(CATEGORY_LABEL[rec.category] || '', rec.category))),
    h('dt', null, 'Poin'), h('dd', null, h('b', { class: 'pts' }, rec.points)),
    h('dt', null, 'Status'), h('dd', null, badge(STATUS_LABEL[rec.status], stBadge)),
    h('dt', null, 'Keterangan'), h('dd', null, rec.description),
    h('dt', null, 'Pelapor'), h('dd', null, nameOf(rec.reported_by)),
    rec.verified_by ? [h('dt', null, 'Diverifikasi'), h('dd', null, `${nameOf(rec.verified_by)} • ${fmtDateTime(rec.verified_at)}`)] : null,
    rec.status_reason ? [h('dt', null, 'Catatan'), h('dd', null, rec.status_reason)] : null);
  const hist = actions.length ? h('div', null, h('h3', { style: { margin: '6px 0' } }, 'Riwayat tindakan'), h('ul', { class: 'timeline' }, actions.map(a => h('li', null,
    h('b', null, { pengesahan: 'Disahkan', penolakan: 'Ditolak', koreksi: 'Dikoreksi', pembatalan: 'Dibatalkan' }[a.action_type]),
    a.action_type === 'koreksi' ? ` (poin ${a.old_points} → ${a.new_points})` : '', ` oleh ${nameOf(a.performed_by)} • ${fmtDateTime(a.created_at)}`, a.reason ? h('div', { class: 'muted' }, 'Alasan: ' + a.reason) : null)))) : null;
  mount(body, kv, hist);

  const done = () => { m.close(); if (onChanged) onChanged(); };
  const btns = [];
  const run = (btn, fn) => withBusy(btn, async () => { try { await fn(); } catch (e) { toast(e.message, 'err'); } });
  const canVerify = rec.status === 'dilaporkan' && (manager || can('kepala_sekolah'));
  if (canVerify) {
    const ok = h('button', { class: 'btn', type: 'button', onclick: () => run(ok, async () => { await db.rpc('verify_violation', { p_record_id: rec.id, p_decision: 'sahkan', p_note: null }); toast('Catatan disahkan.'); done(); }) }, 'Sahkan');
    const no = h('button', { class: 'btn ghost', type: 'button', onclick: () => rejectDialog() }, 'Tolak…');
    btns.push(no, ok);
  }
  if ((rec.status === 'dilaporkan' && (manager || mine)) || (rec.status === 'disahkan' && manager)) {
    btns.unshift(h('button', { class: 'btn ghost', type: 'button', onclick: () => { m.close(); openEdit(rec, onChanged); } }, rec.status === 'disahkan' ? 'Koreksi…' : 'Ubah…'));
    btns.unshift(h('button', { class: 'btn danger', type: 'button', onclick: () => cancelDialog() }, 'Batalkan…'));
  }
  if (btns.length) m.setFooter(btns);

  function reasonDialog(title, label, onOk, min) {
    const area = h('textarea', { class: 'input', rows: 3 }); const e = h('div', { class: 'err', role: 'alert' });
    const go = h('button', { class: 'btn danger', type: 'button', onclick: () => { if (area.value.trim().length < min) { e.textContent = `${label} minimal ${min} karakter.`; return; } run(go, async () => { await onOk(area.value.trim()); mm.close(); done(); }); } }, 'Konfirmasi');
    const mm = modal({ title, body: [field(label, area), e], actions: [h('button', { class: 'btn ghost', type: 'button', onclick: () => mm.close() }, 'Batal'), go] });
  }
  const rejectDialog = () => reasonDialog('Tolak laporan', 'Alasan penolakan', async (r) => { await db.rpc('verify_violation', { p_record_id: rec.id, p_decision: 'tolak', p_note: r }); toast('Laporan ditolak.'); }, 3);
  const cancelDialog = () => reasonDialog('Batalkan catatan', 'Alasan pembatalan', async (r) => { await db.rpc('cancel_violation', { p_record_id: rec.id, p_reason: r }); toast('Catatan dibatalkan; tidak lagi dihitung.'); }, 5);
}

async function openEdit(rec, onChanged) {
  const manager = can(...MANAGE_KESISWAAN);
  const date = h('input', { class: 'input', type: 'date', value: String(rec.incident_date).slice(0, 10), max: todayWIB() });
  const typeSel = h('select', { class: 'input' });
  const desc = h('textarea', { class: 'input', rows: 3, maxlength: 2000 }, rec.description);
  const pts = manager ? h('input', { class: 'input', type: 'number', min: 0, max: 1000, step: 1, value: rec.points }) : null;
  const reason = h('textarea', { class: 'input', rows: 2, placeholder: rec.status === 'disahkan' ? 'Wajib untuk catatan yang sudah disahkan' : 'Opsional' });
  const err = h('div', { class: 'err', role: 'alert' });
  const types = await db.select('violation_types', { select: 'id,name,category,default_points,status', school_id: eq(S.schoolId), order: 'name.asc' });
  const list = types.filter(t => t.status === 'aktif' || t.id === rec.type_id);
  mount(typeSel, list.map(t => h('option', { value: t.id }, `${t.name} (${t.default_points} poin)${t.status !== 'aktif' ? ' — nonaktif' : ''}`))); typeSel.value = rec.type_id;
  if (pts) typeSel.addEventListener('change', () => { const t = types.find(x => x.id === typeSel.value); if (t && typeSel.value !== rec.type_id) pts.value = t.default_points; else pts.value = rec.points; });
  const save = h('button', { class: 'btn', type: 'button', onclick: () => withBusy(save, async () => {
    err.textContent = '';
    try {
      await db.rpc('update_violation', { p_record_id: rec.id, p_type_id: typeSel.value, p_incident_date: date.value, p_description: desc.value.trim(), p_points: pts && pts.value !== '' ? Number(pts.value) : null, p_reason: reason.value.trim() || null });
      toast('Perubahan tersimpan.'); m.close(); if (onChanged) onChanged();
    } catch (e) { err.textContent = e.message; }
  }) }, 'Simpan perubahan');
  const m = modal({ title: rec.status === 'disahkan' ? 'Koreksi catatan' : 'Ubah catatan', body: [
    h('p', { class: 'small muted' }, `${rec.student_name} • NIS ${rec.nis}`), field('Tanggal kejadian', date), field('Jenis pelanggaran', typeSel),
    pts ? field('Poin', pts, 'Mengganti jenis memakai poin aturan terbaru. Poin manual memerlukan alasan.') : null,
    field('Keterangan', desc), field('Alasan perubahan', reason), err], actions: [h('button', { class: 'btn ghost', type: 'button', onclick: () => m.close() }, 'Batal'), save] });
}
