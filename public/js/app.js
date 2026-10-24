import { h, mount, icon, modal, field, toast, withBusy } from './ui.js';
import { loadConfig, restoreSession, getSession, signOut, ApiError, changePassword } from './api.js';
import { S, loadContext, setSchool, school, can, rolesHere, ROLE_LABEL, isYayasan } from './state.js';

const root = document.getElementById('app');
const VIEW_ROLES = ['kepala_sekolah', 'admin_sekolah', 'kesiswaan', 'bk', 'wali_kelas'];
export const NAV = [
  { path: '/dashboard', label: 'Beranda', icon: 'home', roles: null },
  { path: '/pelanggaran', label: 'Pelanggaran', icon: 'alert', roles: [...VIEW_ROLES, 'guru'] },
  { path: '/rekap', label: 'Rekap Poin', icon: 'chart', roles: VIEW_ROLES },
  { path: '/siswa', label: 'Siswa', icon: 'users', roles: ['kepala_sekolah', 'admin_sekolah', 'kurikulum', 'kesiswaan', 'bk', 'guru', 'wali_kelas'] },
  { path: '/pembinaan', label: 'Pembinaan', icon: 'heart', roles: VIEW_ROLES },
  { path: '/jenis', label: 'Aturan Poin', icon: 'book', roles: ['kepala_sekolah', 'admin_sekolah', 'kesiswaan', 'bk'] },
  { path: '/master', label: 'Master Data', icon: 'cog', roles: ['admin_sekolah', 'kurikulum', 'kepala_sekolah', 'kesiswaan'] },
  { path: '/pengguna', label: 'Pengguna', icon: 'user', roles: ['admin_sekolah'] },
  { path: '/audit', label: 'Audit Log', icon: 'shield', roles: ['auditor', 'kepala_sekolah'] },
];
const PAGES = {
  '/dashboard': () => import('./pages/dashboard.js'),
  '/pelanggaran': () => import('./pages/pelanggaran.js'),
  '/rekap': () => import('./pages/rekap.js'),
  '/siswa': () => import('./pages/siswa.js'),
  '/pembinaan': () => import('./pages/pembinaan.js'),
  '/jenis': () => import('./pages/jenis.js'),
  '/master': () => import('./pages/master.js'),
  '/pengguna': () => import('./pages/pengguna.js'),
  '/audit': () => import('./pages/audit.js'),
};
const allowed = (item) => !item.roles || can(...item.roles);

let shell = null, viewEl = null, navToken = 0;

export function navigate(path, { replace = false } = {}) {
  if (replace) history.replaceState({}, '', path); else history.pushState({}, '', path);
  return route();
}
export const refreshView = () => route();

document.addEventListener('click', (e) => {
  const a = e.target.closest && e.target.closest('a[data-link]');
  if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault(); navigate(a.getAttribute('href'));
});
window.addEventListener('popstate', () => route());
window.addEventListener('online', () => document.getElementById('offline')?.remove());
window.addEventListener('offline', () => { if (!document.getElementById('offline')) document.body.prepend(h('div', { id: 'offline', class: 'offline', role: 'status' }, 'Anda sedang offline. Data tidak dapat dimuat/disimpan.')); });

function publicShell(child) { mount(root, child); shell = null; }

async function route() {
  const token = ++navToken;
  const path = location.pathname.replace(/\/+$/, '') || '/';
  window.scrollTo(0, 0);

  if (path === '/cek-poin') { const m = await import('./pages/cekpoin.js'); if (token !== navToken) return; return publicShell(m.render()); }
  if (path === '/masuk') { if (restoreSession()) return navigate('/dashboard', { replace: true }); const m = await import('./pages/public.js'); return publicShell(m.renderLogin()); }
  if (path === '/') { if (!restoreSession()) { const m = await import('./pages/public.js'); return publicShell(m.renderLanding()); } return navigate('/dashboard', { replace: true }); }

  // halaman staf
  if (!restoreSession()) return navigate('/masuk', { replace: true });
  if (!S.me) {
    mount(root, h('div', { class: 'public' }, h('div', { class: 'panel', style: { textAlign: 'center' } }, 'Memuat data…')));
    try { await loadConfig(); await loadContext(); }
    catch (e) {
      if (e instanceof ApiError && e.status === 401) { await signOut(); S.me = null; return navigate('/masuk', { replace: true }); }
      return mount(root, h('div', { class: 'public' }, h('div', { class: 'panel' }, h('h1', null, 'Gagal memuat'), h('p', { class: 'sub' }, e.message), h('button', { class: 'btn block', onclick: () => location.reload() }, 'Coba lagi'))));
    }
  }
  if (token !== navToken) return;
  if (!S.roles.length) return mount(root, h('div', { class: 'public' }, h('div', { class: 'panel' }, h('h1', null, 'Belum ada hak akses'), h('p', { class: 'sub' }, 'Akun Anda belum diberi peran. Hubungi administrator sekolah.'), h('button', { class: 'btn block', onclick: async () => { await signOut(); S.me = null; navigate('/masuk', { replace: true }); } }, 'Keluar'))));

  const page = PAGES[path];
  const item = NAV.find(n => n.path === path);
  if (!page || (item && !allowed(item))) return navigate('/dashboard', { replace: true });
  buildShell(path);
  mount(viewEl, h('div', { class: 'skeleton', style: { minHeight: '120px' } }));
  try {
    const mod = await page();
    if (token !== navToken) return;
    const el = h('div', { class: 'stack' }); mount(viewEl, el);
    document.title = `${item.label} — Sekolah Mutiara`;
    await mod.render(el);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) { await signOut(); S.me = null; return navigate('/masuk', { replace: true }); }
    mount(viewEl, h('div', { class: 'card' }, h('h2', null, 'Terjadi kesalahan'), h('p', { class: 'muted' }, e.message || 'Halaman tidak dapat dimuat.'), h('button', { class: 'btn', onclick: () => route() }, 'Muat ulang')));
  }
}

function buildShell(path) {
  const items = NAV.filter(allowed);
  const sch = school();
  const linkEls = (cls) => items.map(n => h('a', { href: n.path, 'data-link': '', 'aria-current': n.path === path ? 'page' : null }, icon(n.icon), h('span', { class: cls }, n.label)));
  const selector = S.schools.length > 1 ? h('select', { 'aria-label': 'Pilih unit sekolah', onchange: async (e) => { await setSchool(e.target.value); buildShell(location.pathname); route(); } },
    S.schools.map(s => h('option', { value: s.id, selected: s.id === S.schoolId ? true : null }, s.code))) : null;
  if (selector) selector.value = S.schoolId;
  const topbar = h('header', { class: 'topbar' },
    h('div', { class: 'brand' }, h('img', { class: 'emblem', src: '/img/emblem.png', alt: 'Logo Yayasan' }),
      h('div', { style: { minWidth: 0 } }, h('div', { class: 't1' }, sch ? sch.name : 'Sekolah Mutiara'), h('div', { class: 't2' }, S.year ? 'TA ' + S.year.year_name : 'Yayasan Mutiara Islam Cileungsi'))),
    selector, h('button', { class: 'icon-btn', 'aria-label': 'Akun saya', onclick: accountDialog }, icon('user')));
  const sidebar = h('aside', { class: 'sidebar' },
    h('div', { class: 'sb-brand' }, h('img', { class: 'emblem', src: '/img/emblem.png', alt: 'Logo Yayasan' }),
      h('div', null, h('div', { style: { fontWeight: 800 } }, 'Sekolah Terpadu'), h('div', { class: 'small', style: { opacity: .85 } }, 'Yayasan Mutiara Islam Cileungsi'))),
    h('nav', { 'aria-label': 'Menu utama' }, linkEls('')));
  const main = items.slice(0, 4), rest = items.slice(4);
  const bottom = h('nav', { class: 'bottomnav', 'aria-label': 'Menu utama' },
    main.map(n => h('a', { href: n.path, 'data-link': '', 'aria-current': n.path === path ? 'page' : null }, icon(n.icon), h('span', { class: 'lb' }, n.label))),
    rest.length ? h('button', { type: 'button', onclick: () => moreMenu(rest), 'aria-label': 'Menu lainnya' }, icon('grid'), h('span', { class: 'lb' }, 'Lainnya')) : null);
  viewEl = h('main', { class: 'content', id: 'view' });
  shell = h('div', { class: 'shell' }, sidebar, h('div', { class: 'main' }, topbar, viewEl), bottom);
  mount(root, shell);
}

function moreMenu(items) {
  const m = modal({ title: 'Menu', body: h('div', { class: 'menu-grid' }, items.map(n => h('a', { href: n.path, 'data-link': '', onclick: () => m.close() }, icon(n.icon, 26), n.label))) });
}

function accountDialog() {
  const roleList = rolesHere().map(r => ROLE_LABEL[r]).join(', ');
  const m = modal({ title: 'Akun saya', body: [
    h('dl', { class: 'kv' }, h('dt', null, 'Nama'), h('dd', null, S.me.full_name), h('dt', null, 'Email'), h('dd', null, S.me.email || getSession()?.user?.email || '-'), h('dt', null, 'Peran'), h('dd', null, roleList || '-')),
    h('button', { class: 'btn ghost', type: 'button', onclick: () => { m.close(); passwordDialog(); } }, icon('key', 18), 'Ganti kata sandi'),
  ], actions: [h('button', { class: 'btn danger', type: 'button', onclick: async () => { m.close(); await signOut(); S.me = null; navigate('/masuk', { replace: true }); } }, icon('logout', 18), 'Keluar')] });
}

function passwordDialog() {
  const p1 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', minlength: 8 }), p2 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password' });
  const err = h('div', { class: 'err', role: 'alert' });
  const save = h('button', { class: 'btn', type: 'button', onclick: () => withBusy(save, async () => {
    err.textContent = '';
    if (p1.value.length < 8) { err.textContent = 'Kata sandi minimal 8 karakter.'; return; }
    if (p1.value !== p2.value) { err.textContent = 'Konfirmasi kata sandi tidak sama.'; return; }
    try { await changePassword(p1.value); toast('Kata sandi diperbarui.'); m.close(); } catch (e) { err.textContent = e.message; }
  }) }, 'Simpan');
  const m = modal({ title: 'Ganti kata sandi', body: [field('Kata sandi baru', p1, 'Minimal 8 karakter.'), field('Ulangi kata sandi baru', p2), err], actions: [h('button', { class: 'btn ghost', type: 'button', onclick: () => m.close() }, 'Batal'), save] });
}

if ('serviceWorker' in navigator && location.protocol.startsWith('http') && location.hostname !== 'localhost-nosw') {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
route();
