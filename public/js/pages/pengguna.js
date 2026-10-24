import { h, mount, icon, skeletons, emptyState, badge, field, withBusy, toast, modal, confirmDialog, copyText } from '../ui.js';
import { db, eq, serverCall } from '../api.js';
import { S, isYayasan, ROLE_LABEL, school } from '../state.js';

const randomPassword = () => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; const v = crypto.getRandomValues(new Uint32Array(12)); return Array.from(v, x => a[x % a.length]).join(''); };

export async function render(root) {
  const box = h('div', { class: 'list' });
  const roleOptions = (yay) => Object.entries(ROLE_LABEL).filter(([k]) => yay || k !== 'admin_yayasan');
  async function load() {
    mount(box, skeletons(3));
    try {
      const params = { select: 'id,user_id,role,school_id' }; if (!isYayasan()) params.school_id = eq(S.schoolId);
      const roles = await db.select('user_roles', params);
      const by = new Map(); roles.forEach(r => { (by.get(r.user_id) || by.set(r.user_id, []).get(r.user_id)).push(r); });
      if (!by.size) return mount(box, emptyState('Belum ada pengguna.'));
      mount(box, [...by.entries()].sort((a, b) => (S.profiles.get(a[0])?.full_name || '').localeCompare(S.profiles.get(b[0])?.full_name || '')).map(([uid, rs]) => { const p = S.profiles.get(uid) || { full_name: 'Pengguna', email: '' };
        return h('div', { class: 'item', style: { cursor: 'default' } }, h('div', { class: 'name' }, p.full_name), h('div', { class: 'small muted' }, p.email || ''),
          h('div', { class: 'row wrap' }, rs.map(r => h('span', { class: 'badge' }, ROLE_LABEL[r.role] + (r.school_id ? ' • ' + (S.schools.find(s => s.id === r.school_id)?.code || '') : ''), h('button', { class: 'icon-btn', style: { width: '22px', height: '22px', color: 'inherit' }, type: 'button', 'aria-label': 'Cabut peran ' + ROLE_LABEL[r.role], onclick: async () => { if (await confirmDialog({ title: 'Cabut peran', message: `Cabut peran ${ROLE_LABEL[r.role]} dari ${p.full_name}?`, danger: true, confirmText: 'Cabut' })) { try { await serverCall('/api/admin/pengguna', { action: 'remove_role', role_id: r.id }); toast('Peran dicabut.'); load(); } catch (e) { toast(e.message, 'err'); } } } }, icon('x', 14))))),
          h('div', { class: 'row wrap' }, h('button', { class: 'btn ghost small', type: 'button', onclick: () => addRole(uid, p) }, icon('plus', 16), 'Tambah peran'), h('button', { class: 'btn ghost small', type: 'button', onclick: () => resetPw(uid, p) }, icon('key', 16), 'Atur ulang sandi'))); }));
    } catch (e) { mount(box, h('div', { class: 'card err' }, e.message)); }
  }
  function schoolSelect() { const s = h('select', { class: 'input' }, S.schools.map(x => h('option', { value: x.id }, `${x.code} — ${x.name}`))); s.value = S.schoolId; return s; }
  function roleSelect() { return h('select', { class: 'input' }, roleOptions(isYayasan()).map(([k, l]) => h('option', { value: k }, l))); }

  function createUser() {
    const name = h('input', { class: 'input', maxlength: 100, autocomplete: 'off' }), email = h('input', { class: 'input', type: 'email', autocomplete: 'off', autocapitalize: 'none' });
    const pw = h('input', { class: 'input', value: randomPassword(), autocomplete: 'off', style: { fontFamily: 'ui-monospace, monospace' } });
    const role = roleSelect(), sch = schoolSelect(); const err = h('div', { class: 'err', role: 'alert' });
    const schField = field('Unit sekolah', sch); role.addEventListener('change', () => schField.classList.toggle('hidden', role.value === 'admin_yayasan'));
    const save = h('button', { class: 'btn', type: 'button', onclick: () => withBusy(save, async () => {
      err.textContent = '';
      try { await serverCall('/api/admin/pengguna', { action: 'create', full_name: name.value.trim(), email: email.value.trim(), password: pw.value, role: role.value, school_id: role.value === 'admin_yayasan' ? null : sch.value });
        m.close(); toast('Pengguna dibuat. Sampaikan email & kata sandi sementara secara aman.'); await refreshProfiles(); load(); } catch (e) { err.textContent = e.message; } }) }, 'Buat pengguna');
    const m = modal({ title: 'Pengguna Baru', body: [field('Nama lengkap', name), field('Email', email), field('Kata sandi sementara', pw, 'Minimal 8 karakter. Minta pengguna menggantinya setelah masuk.'), h('div', { class: 'form-grid two' }, field('Peran', role), schField), err], actions: [h('button', { class: 'btn ghost', type: 'button', onclick: () => m.close() }, 'Batal'), save] });
  }
  function addRole(uid, p) {
    const role = roleSelect(), sch = schoolSelect(); const err = h('div', { class: 'err', role: 'alert' });
    const schField = field('Unit sekolah', sch); role.addEventListener('change', () => schField.classList.toggle('hidden', role.value === 'admin_yayasan'));
    const save = h('button', { class: 'btn', type: 'button', onclick: () => withBusy(save, async () => { try { await serverCall('/api/admin/pengguna', { action: 'add_role', user_id: uid, role: role.value, school_id: role.value === 'admin_yayasan' ? null : sch.value }); m.close(); toast('Peran ditambahkan.'); load(); } catch (e) { err.textContent = e.message; } }) }, 'Tambah');
    const m = modal({ title: 'Tambah peran — ' + p.full_name, body: [field('Peran', role), schField, err], actions: [save] });
  }
  function resetPw(uid, p) {
    const pw = h('input', { class: 'input', value: randomPassword(), style: { fontFamily: 'ui-monospace, monospace' } }); const err = h('div', { class: 'err', role: 'alert' });
    const save = h('button', { class: 'btn', type: 'button', onclick: () => withBusy(save, async () => { try { await serverCall('/api/admin/pengguna', { action: 'reset_password', user_id: uid, password: pw.value }); m.close(); toast('Kata sandi diatur ulang.'); } catch (e) { err.textContent = e.message; } }) }, 'Atur ulang');
    const m = modal({ title: 'Atur ulang sandi — ' + p.full_name, body: [field('Kata sandi baru', pw, 'Sampaikan secara aman kepada pengguna.'), err], actions: [save] });
  }
  async function refreshProfiles() { const ps = await db.select('profiles', { select: 'id,full_name,email', order: 'full_name.asc', limit: 2000 }); S.profiles = new Map(ps.map(p => [p.id, p])); }

  mount(root, h('div', { class: 'page-head' }, h('h1', null, 'Pengguna & Hak Akses'), h('button', { class: 'btn gold', type: 'button', onclick: createUser }, icon('plus', 20), 'Pengguna')), h('div', { class: 'notice' }, 'Hak akses dibatasi per unit sekolah. Pengguna hanya melihat data sesuai perannya.'), box);
  load();
}
