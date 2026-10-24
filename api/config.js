'use strict';
const { send, handler } = require('./_lib/http');
// Konfigurasi publik klien (URL & kunci publishable/anon). Bukan rahasia.
module.exports = handler(['GET'], async (req, res) => {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_ANON_KEY || '';
  send(res, url && key ? 200 : 503, url && key ? { supabaseUrl: url, anonKey: key } : { error: 'Aplikasi belum dikonfigurasi.' }, { 'Cache-Control': 'public, max-age=60' });
});
