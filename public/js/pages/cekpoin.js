import { h, mount, icon, field, withBusy, fmtDate, num, emptyState, badge, modal } from '../ui.js';
import { siswaCall, ApiError } from '../api.js';

const IDLE_MS = 30 * 60 * 1000;

export function render() {
  document.title = 'Cek Poin Pelanggaran Siswa — Sekolah Mutiara';
  const box = h('div', { class: 'public' });
  const view = h('div', { style: { width: '100%', display: 'grid', justifyItems: 'center' } });
  box.append(view);
  let idle;
  const resetIdle = () => { clearTimeout(idle); idle = setTimeout(() => logout('Sesi berakhir karena tidak ada aktivitas.'), IDLE_MS); };
  async function logout(msg) { clearTimeout(idle); try { await siswaCall('/api/siswa/logout', { method: 'POST', body: {} }); } catch { /* */ } showLogin(msg); }

  function frame(...kids) { return h('div', { style: { width: '100%', maxWidth: '720px' } }, ...kids, h('div', { class: 'pub-foot' }, '© Yayasan Mutiara Islam Cileungsi')); }

  function showLogin(info) {
    const nis = h('input', { class: 'input', inputmode: 'numeric', autocomplete: 'username', autocapitalize: 'characters', maxlength: 30, required: true, placeholder: 'Contoh: 10001' });
    const pin = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', maxlength: 64, required: true, placeholder: 'PIN dari sekolah' });
    const eye = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Tampilkan PIN', onclick: () => { const s = pin.type === 'password'; pin.type = s ? 'text' : 'password'; eye.replaceChildren(icon(s ? 'eyeoff' : 'eye')); } }, icon('eye'));
    const err = h('div', { class: 'err', role: 'alert', 'aria-live': 'assertive' });
    const btn = h('button', { class: 'btn block', type: 'submit' }, 'Lihat Poin Saya');
    const form = h('form', { class: 'stack', novalidate: true, onsubmit: (e) => {
      e.preventDefault(); err.textContent = '';
      if (!nis.value.trim() || !pin.value) { err.textContent = 'Masukkan NIS dan PIN.'; return; }
      withBusy(btn, async () => {
        try {
          const r = await siswaCall('/api/siswa/login', { method: 'POST', body: { nis: nis.value.trim(), pin: pin.value } });
          pin.value = ''; await showResult(r.must_change);
        } catch (ex) { pin.value = ''; err.textContent = ex.status === 0 || ex.status >= 500 ? 'Terjadi gangguan sistem. Coba lagi beberapa saat.' : ex.message; }
      });
    } }, field('NIS (Nomor Induk Siswa)', nis), field('PIN', h('div', { class: 'pwd' }, pin, eye)), err, btn,
      h('p', { class: 'hint', style: { textAlign: 'center' } }, 'Lupa PIN? Hubungi petugas kesiswaan sekolah Anda untuk pemulihan akses.'),
      h('a', { class: 'btn ghost block', href: '/', 'data-link': '' }, 'Kembali'));
    mount(view, frame(h('div', { class: 'panel', style: { margin: '0 auto' } },
      h('img', { class: 'logo', src: '/img/logo-full.jpg', alt: 'Logo Yayasan', style: { width: '110px', height: '110px' } }),
      h('h1', null, 'Cek Poin Pelanggaran Siswa'), h('p', { class: 'sub' }, 'Masuk dengan NIS dan PIN pribadi Anda'),
      info ? h('div', { class: 'notice', role: 'status', style: { marginBottom: '12px' } }, info) : null, form)));
  }

  async function showResult(mustChange) {
    let data;
    try { data = await siswaCall('/api/siswa/me'); }
    catch (e) { if (e.status === 401) return showLogin('Sesi berakhir. Silakan masuk kembali.'); return mount(view, frame(h('div', { class: 'panel' }, h('h1', null, 'Gangguan sistem'), h('p', { class: 'sub' }, 'Data tidak dapat dimuat. Coba lagi beberapa saat.'), h('button', { class: 'btn block', onclick: () => showResult(mustChange) }, 'Coba lagi')))); }
    resetIdle();
    if (data.must_change) return showChangePin(true, () => showResult(false));
    const st = data.student, sum = data.summary;
    const tone = sum.points >= 50 ? 'bad' : sum.points >= 25 ? 'warn' : '';
    const recs = data.records.length
      ? h('div', { class: 'list' }, data.records.map(r => h('div', { class: 'item', style: { cursor: 'default' } },
          h('div', { class: 'top' }, h('div', { class: 'name' }, r.type), h('span', { class: 'pts' }, '+' + r.points)),
          h('div', { class: 'row wrap' }, badge(r.category, r.category), h('span', { class: 'small muted' }, fmtDate(r.date))),
          r.description ? h('div', { class: 'desc small' }, r.description) : null)))
      : h('div', { class: 'card', style: { textAlign: 'center' } }, h('div', { class: 'big', 'aria-hidden': 'true' }, '🌟'), h('p', { style: { fontWeight: 700 } }, 'Tidak ada catatan pelanggaran yang tercatat.'), h('p', { class: 'small muted' }, 'Pertahankan sikap disiplinmu!'));
    const acts = data.actions.length ? h('div', { class: 'stack-s' }, h('h2', null, 'Pembinaan'), h('div', { class: 'list' }, data.actions.map(a => h('div', { class: 'item', style: { cursor: 'default' } },
      h('div', { class: 'top' }, h('div', { class: 'name' }, a.action), badge(a.status, a.status === 'selesai' ? 'ringan' : 'gold')),
      a.follow_up_date ? h('div', { class: 'small muted' }, 'Tindak lanjut: ' + fmtDate(a.follow_up_date)) : null, a.notes ? h('div', { class: 'small' }, a.notes) : null)))) : null;
    mount(view, frame(h('div', { class: 'panel wide', style: { margin: '0 auto', maxWidth: '720px', background: 'var(--bg)' } },
      h('div', { class: 'sis-head' }, h('div', { class: 'nm' }, st.full_name), h('div', { class: 'small' }, `NIS ${st.nis} • Kelas ${st.class_name || '-'}`), h('div', { class: 'small' }, st.school)),
      h('div', { class: 'sis-stats' }, h('div', { class: 'sis-stat' }, h('div', { class: 'v' }, num(sum.count)), h('div', { class: 'l' }, 'Jumlah pelanggaran')), h('div', { class: 'sis-stat ' + tone }, h('div', { class: 'v' }, num(sum.points)), h('div', { class: 'l' }, 'Total poin'))),
      h('div', { class: 'stack', style: { marginTop: '14px' } }, h('h2', null, 'Riwayat pelanggaran'), recs, acts,
        h('p', { class: 'hint' }, 'Jika ada catatan yang tidak sesuai, ajukan permohonan koreksi kepada petugas kesiswaan.'),
        h('div', { class: 'row wrap' }, h('button', { class: 'btn ghost grow', type: 'button', onclick: () => showChangePin(false, () => showResult(false)) }, icon('key', 18), 'Ganti PIN'), h('button', { class: 'btn danger grow', type: 'button', onclick: () => logout('Anda telah keluar.') }, icon('logout', 18), 'Keluar'))))));
  }

  function showChangePin(forced, done) {
    const o = h('input', { class: 'input', type: 'password', autocomplete: 'current-password' });
    const n1 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', maxlength: 12 });
    const n2 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', maxlength: 12 });
    const err = h('div', { class: 'err', role: 'alert' });
    const btn = h('button', { class: 'btn block', type: 'submit' }, 'Simpan PIN Baru');
    const form = h('form', { class: 'stack', onsubmit: (e) => {
      e.preventDefault(); err.textContent = '';
      if (n1.value !== n2.value) { err.textContent = 'Konfirmasi PIN baru tidak sama.'; return; }
      withBusy(btn, async () => { try { await siswaCall('/api/siswa/ganti-pin', { method: 'POST', body: { old_pin: o.value, new_pin: n1.value } }); done(); } catch (ex) { if (ex.status === 401) return showLogin(ex.message); err.textContent = ex.message; } });
    } }, field(forced ? 'PIN dari sekolah' : 'PIN lama', o), field('PIN baru', n1, '6–12 karakter, tidak mudah ditebak, tidak sama dengan NIS.'), field('Ulangi PIN baru', n2), err, btn,
      forced ? null : h('button', { class: 'btn ghost block', type: 'button', onclick: done }, 'Batal'));
    mount(view, frame(h('div', { class: 'panel', style: { margin: '0 auto' } }, h('h1', null, forced ? 'Buat PIN Baru' : 'Ganti PIN'),
      h('p', { class: 'sub' }, forced ? 'Demi keamanan, ganti PIN awal dari sekolah dengan PIN pribadimu.' : 'Gunakan PIN yang hanya kamu yang tahu.'), form)));
  }

  // jika sesi cookie masih berlaku, langsung tampilkan hasil
  siswaCall('/api/siswa/me').then(() => showResult(false)).catch(() => showLogin());
  mount(view, h('div', { class: 'panel', style: { textAlign: 'center' } }, 'Memuat…'));
  return box;
}
