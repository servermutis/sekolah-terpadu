import { h, icon, field, withBusy } from '../ui.js';
import { signIn, loadConfig } from '../api.js';
import { navigate } from '../app.js';

const foot = () => h('div', { class: 'pub-foot' }, '© Yayasan Mutiara Islam Cileungsi — Pusat Dakwah, Pendidikan, dan Sosial');

export function renderLanding() {
  document.title = 'Aplikasi Sekolah Terpadu — Yayasan Mutiara Islam Cileungsi';
  return h('div', { class: 'public' }, h('div', null,
    h('div', { class: 'panel' },
      h('img', { class: 'logo', src: '/img/logo-full.jpg', alt: 'Logo Yayasan Mutiara Islam Cileungsi', width: 150, height: 150 }),
      h('h1', null, 'Aplikasi Sekolah Terpadu'),
      h('p', { class: 'sub' }, 'SD • SMP • SMA Mutiara Islam Cileungsi'),
      h('div', { class: 'hero-actions' },
        h('a', { class: 'btn gold', href: '/cek-poin', 'data-link': '' }, icon('search', 20), 'Cek Poin Siswa'),
        h('a', { class: 'btn', href: '/masuk', 'data-link': '' }, icon('user', 20), 'Masuk Petugas / Guru'))),
    foot()));
}

export function renderLogin() {
  document.title = 'Masuk Petugas — Sekolah Mutiara';
  const email = h('input', { class: 'input', type: 'email', autocomplete: 'username', inputmode: 'email', required: true, autocapitalize: 'none' });
  const pw = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', required: true });
  const eye = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Tampilkan kata sandi', onclick: () => { const show = pw.type === 'password'; pw.type = show ? 'text' : 'password'; eye.replaceChildren(icon(show ? 'eyeoff' : 'eye')); } }, icon('eye'));
  const err = h('div', { class: 'err', role: 'alert' });
  const btn = h('button', { class: 'btn block', type: 'submit' }, 'Masuk');
  const form = h('form', { class: 'stack', novalidate: true, onsubmit: (e) => {
    e.preventDefault(); err.textContent = '';
    if (!email.value.trim() || !pw.value) { err.textContent = 'Isi email dan kata sandi.'; return; }
    withBusy(btn, async () => {
      try { await loadConfig(); await signIn(email.value.trim().toLowerCase(), pw.value); await navigate('/dashboard', { replace: true }); }
      catch (ex) { err.textContent = ex.message; pw.value = ''; pw.focus(); }
    });
  } }, field('Email', email), field('Kata sandi', h('div', { class: 'pwd' }, pw, eye)), err, btn,
    h('a', { class: 'btn ghost block', href: '/', 'data-link': '' }, 'Kembali'));
  return h('div', { class: 'public' }, h('div', null,
    h('div', { class: 'panel' }, h('img', { class: 'logo', src: '/img/logo-full.jpg', alt: 'Logo Yayasan', width: 110, height: 110, style: { width: '110px', height: '110px' } }),
      h('h1', null, 'Masuk Petugas'), h('p', { class: 'sub' }, 'Kepala sekolah, kurikulum, kesiswaan, guru'), form), foot()));
}
