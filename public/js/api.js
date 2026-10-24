// Klien tipis untuk Supabase (Auth + PostgREST) dan API server. Tanpa dependensi.
const KEY = 'ymic.session.v1';
let cfg = null;
let session = null;
let refreshing = null;

export class ApiError extends Error {
  constructor(message, status, code) { super(message); this.status = status; this.code = code; }
}

const FRIENDLY = {
  '23505': 'Data tersebut sudah ada (duplikat).',
  '23503': 'Data masih digunakan oleh catatan lain sehingga tidak dapat dihapus/diubah.',
  '23514': 'Isian tidak memenuhi aturan data.',
  '23502': 'Ada isian wajib yang kosong.',
  '42501': 'Anda tidak berwenang melakukan tindakan ini.',
};
// Kode yang dipakai fungsi database untuk pesan berbahasa Indonesia yang aman ditampilkan
const SHOW_DB_MESSAGE = new Set(['22023', '42501', '28000', 'P0001']);

function humanize(body, status) {
  const code = body && body.code;
  const msg = body && (body.message || body.msg || body.error_description || body.error);
  if (code && SHOW_DB_MESSAGE.has(code) && msg) return msg;
  if (code && FRIENDLY[code]) return FRIENDLY[code];
  if (status === 401) return 'Sesi berakhir. Silakan masuk kembali.';
  if (status === 403) return 'Anda tidak berwenang melakukan tindakan ini.';
  if (status >= 500) return 'Terjadi gangguan pada server. Coba lagi beberapa saat.';
  return msg && /[a-z]/i.test(msg) && msg.length < 160 ? msg : 'Permintaan tidak dapat diproses.';
}

export async function loadConfig() {
  if (cfg) return cfg;
  const r = await fetch('/api/config');
  if (!r.ok) throw new ApiError('Aplikasi belum dikonfigurasi. Hubungi administrator.', r.status);
  cfg = await r.json(); return cfg;
}

function save() { try { session ? localStorage.setItem(KEY, JSON.stringify(session)) : localStorage.removeItem(KEY); } catch { /* mode privat */ } }
export function restoreSession() { try { session = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { session = null; } return session; }
export const getSession = () => session;
export const accessToken = () => session && session.access_token;

function setSession(tok) {
  session = { access_token: tok.access_token, refresh_token: tok.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (tok.expires_in || 3600), user: tok.user || (session && session.user) };
  save(); return session;
}

async function authFetch(path, { method = 'GET', body, token } = {}) {
  const c = await loadConfig();
  let r;
  try {
    r = await fetch(c.supabaseUrl + path, { method, headers: { apikey: c.anonKey, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch { throw new ApiError('Tidak dapat terhubung ke server. Periksa koneksi internet Anda.', 0); }
  const text = await r.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!r.ok) throw new ApiError(humanize(data, r.status), r.status, data && data.code);
  return data;
}

export async function signIn(email, password) {
  try {
    const t = await authFetch('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } });
    return setSession(t);
  } catch (e) {
    if (e.status === 400 || e.status === 401 || e.status === 422) throw new ApiError('Email atau kata sandi tidak sesuai.', 400);
    throw e;
  }
}

export async function signOut() {
  const tok = accessToken(); session = null; save();
  if (tok) { try { await authFetch('/auth/v1/logout', { method: 'POST', token: tok }); } catch { /* abaikan */ } }
}

async function refresh() {
  if (!session || !session.refresh_token) throw new ApiError('Sesi berakhir. Silakan masuk kembali.', 401);
  if (!refreshing) refreshing = authFetch('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token } })
    .then(setSession).catch((e) => { session = null; save(); throw new ApiError('Sesi berakhir. Silakan masuk kembali.', 401); }).finally(() => { refreshing = null; });
  return refreshing;
}

async function validToken() {
  if (!session) throw new ApiError('Sesi berakhir. Silakan masuk kembali.', 401);
  if (session.expires_at - 60 < Date.now() / 1000) await refresh();
  return session.access_token;
}

async function rest(path, { method = 'GET', body, prefer, retry = true } = {}) {
  const c = await loadConfig(); const token = await validToken();
  const headers = { apikey: c.anonKey, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  if (prefer) headers.Prefer = prefer;
  let r;
  try { r = await fetch(c.supabaseUrl + '/rest/v1/' + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch { throw new ApiError('Tidak dapat terhubung ke server. Periksa koneksi internet Anda.', 0); }
  if (r.status === 401 && retry) { await refresh(); return rest(path, { method, body, prefer, retry: false }); }
  const text = await r.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!r.ok) throw new ApiError(humanize(data, r.status), r.status, data && data.code);
  return data;
}

const qs = (o) => Object.entries(o || {}).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

export const db = {
  rpc: (fn, args) => rest('rpc/' + fn, { method: 'POST', body: args || {} }),
  select: (table, params) => rest(table + (params ? '?' + qs(params) : '')),
  insert: (table, rows, { ignoreDuplicates, onConflict } = {}) => rest(table + (onConflict ? '?on_conflict=' + onConflict : ''), { method: 'POST', body: rows, prefer: 'return=representation' + (ignoreDuplicates ? ',resolution=ignore-duplicates' : '') }),
  update: (table, match, values) => rest(table + '?' + qs(match), { method: 'PATCH', body: values, prefer: 'return=representation' }),
  remove: (table, match) => rest(table + '?' + qs(match), { method: 'DELETE', prefer: 'return=representation' }),
};
export const eq = (v) => 'eq.' + v;

export async function changePassword(password) {
  const t = await validToken();
  return authFetch('/auth/v1/user', { method: 'PUT', token: t, body: { password } });
}

// Panggilan ke API server kita (admin: PIN & pengguna) dengan JWT staf
export async function serverCall(path, body) {
  const token = await validToken();
  let r;
  try { r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(body || {}) }); }
  catch { throw new ApiError('Tidak dapat terhubung ke server. Periksa koneksi internet Anda.', 0); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(data.error || 'Permintaan gagal.', r.status);
  return data;
}

// Portal siswa (cookie HttpOnly, tidak memakai JWT staf)
export async function siswaCall(path, { method = 'GET', body } = {}) {
  let r;
  try { r = await fetch(path, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined }); }
  catch { throw new ApiError('Tidak dapat terhubung ke server. Periksa koneksi internet Anda.', 0); }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(data.error || 'Permintaan gagal.', r.status);
  return data;
}
