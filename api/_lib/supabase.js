'use strict';
const { httpError } = require('./http');

function env() {
  const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const anon = process.env.SUPABASE_ANON_KEY || '';
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !anon || !service) throw httpError(503, 'Layanan belum dikonfigurasi. Hubungi administrator.');
  return { url, anon, service };
}

function headers(apikey, bearer) {
  const h = { apikey, 'Content-Type': 'application/json' };
  // Kunci gaya baru (sb_secret_/sb_publishable_) hanya dikirim sebagai apikey; JWT lama juga sebagai Bearer.
  const auth = bearer || (apikey.startsWith('eyJ') ? apikey : null);
  if (auth) h.Authorization = 'Bearer ' + auth;
  return h;
}

async function call(path, { method = 'GET', body, apikey, bearer }) {
  const { url } = env();
  let r;
  try {
    r = await fetch(url + path, { method, headers: headers(apikey, bearer), body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (e) { throw httpError(503, 'Tidak dapat menghubungi server data.'); }
  const text = await r.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) {
    const err = httpError(r.status >= 500 ? 503 : r.status, (data && (data.message || data.msg || data.error_description)) || 'Permintaan data gagal.');
    err.pg = data; throw err;
  }
  return data;
}

const service = () => env().service;
const anon = () => env().anon;

// RPC dengan service role (hanya dari server)
const rpcService = (fn, args) => call('/rest/v1/rpc/' + fn, { method: 'POST', body: args || {}, apikey: service() });
// RPC / REST atas nama pengguna (RLS berlaku)
const rpcUser = (fn, args, jwt) => call('/rest/v1/rpc/' + fn, { method: 'POST', body: args || {}, apikey: anon(), bearer: jwt });
const restUser = (path, jwt, opts = {}) => call('/rest/v1/' + path, { ...opts, apikey: anon(), bearer: jwt });
const restService = (path, opts = {}) => call('/rest/v1/' + path, { ...opts, apikey: service() });

async function getUser(jwt) {
  if (!jwt) return null;
  try { return await call('/auth/v1/user', { apikey: anon(), bearer: jwt }); } catch (e) { if (e.status === 401 || e.status === 403) return null; throw e; }
}
const adminCreateUser = (body) => call('/auth/v1/admin/users', { method: 'POST', body, apikey: service() });
const adminUpdateUser = (id, body) => call('/auth/v1/admin/users/' + encodeURIComponent(id), { method: 'PUT', body, apikey: service() });

// Ambil & validasi pengguna staf dari header Authorization
async function requireStaff(req) {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  const jwt = m && m[1];
  const user = await getUser(jwt);
  if (!user || !user.id) throw httpError(401, 'Sesi berakhir. Silakan masuk kembali.');
  return { user, jwt };
}

module.exports = { env, call, rpcService, rpcUser, restUser, restService, getUser, adminCreateUser, adminUpdateUser, requireStaff };
