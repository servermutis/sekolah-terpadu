// Server tiruan Supabase (PostgREST + GoTrue minimal) di atas Postgres lokal — HANYA untuk pengujian.
// RLS, fungsi, dan trigger yang diuji adalah milik database sungguhan (migrasi proyek).
const http = require('http'), crypto = require('crypto'), { spawn } = require('child_process');
const PORT = +process.env.MOCK_PORT || 54400;
const PG = { host: process.env.PGHOST || '/tmp/pgtest', port: process.env.PGPORT || '54329', db: process.env.PGDATABASE || 't' };
const ANON = 'sb_publishable_test_anon', SERVICE = 'sb_secret_test_service', SECRET = 'mock-jwt-secret';
const refreshTokens = new Map();

const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function makeJwt(sub, ttl = 3600) { const body = b64({ iss: 'mock', sub, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + ttl }); const head = b64({ alg: 'HS256', typ: 'JWT' }); return `${head}.${body}.${crypto.createHmac('sha256', SECRET).update(head + '.' + body).digest('base64url')}`; }
function readJwt(t) { try { const [h, b, s] = t.split('.'); if (crypto.createHmac('sha256', SECRET).update(h + '.' + b).digest('base64url') !== s) return null; const p = JSON.parse(Buffer.from(b, 'base64url')); return p.exp > Date.now() / 1000 ? p : null; } catch { return null; } }

const lit = (v) => v === null || v === undefined ? 'NULL' : Array.isArray(v) ? `ARRAY[${v.map(lit).join(',')}]::text[]` : typeof v === 'number' || typeof v === 'boolean' ? String(v) : typeof v === 'object' ? `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb` : `'${String(v).replace(/'/g, "''")}'`;
const ident = (s) => { if (!/^[a-z_][a-z0-9_]*$/i.test(s)) throw Object.assign(new Error('bad identifier ' + s), { status: 400 }); return '"' + s + '"'; };

function psql(script) {
  return new Promise((resolve) => {
    const p = spawn('psql', ['-h', PG.host, '-p', PG.port, '-U', 'postgres', '-d', PG.db, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = ''; p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d);
    p.on('close', (code) => resolve({ code, out, err })); p.stdin.end(script);
  });
}
async function runAs(role, sub, query, { raw } = {}) {
  const script = `begin;\nset local role ${role};\nselect set_config('request.jwt.claim.sub', ${lit(sub || '')}, true) \\g /dev/null\n${raw ? '' : "select '@@' || (" }${query}${raw ? '' : ')'};\ncommit;\n`;
  const r = await psql(script);
  if (r.code !== 0) { if (process.env.MOCK_DEBUG) console.error(script, r.err); const m = /ERROR:\s+([0-9A-Z]{5}):\s+(.*)/.exec(r.err) || []; return { error: { code: m[1] || 'XX000', message: (m[2] || r.err.trim()).split('\n')[0] } }; }
  const line = r.out.split('\n').find(l => l.startsWith('@@'));
  return { data: line ? line.slice(2) : null };
}
const statusFor = (code, anon) => code === '42501' ? (anon ? 401 : 403) : /^23/.test(code) ? 409 : code === '42883' || code === '42P01' ? 404 : 400;

const fnCache = new Map();
async function fnInfo(name) {
  if (fnCache.has(name)) return fnCache.get(name);
  const r = await psql(`select p.proretset::text || ',' || t.typtype::text || ',' || t.typname from pg_proc p join pg_type t on t.oid = p.prorettype join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = ${lit(name)} limit 1;`);
  const [set, typtype, typname] = (r.out.trim() || ',,').split(','); const info = { set: set === 'true', void: typname === 'void' }; fnCache.set(name, info); return info;
}

function filtersSql(params) {
  const parts = [];
  for (const [k, v] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict'].includes(k)) continue;
    const m = /^(not\.)?(eq|neq|gt|gte|lt|lte|like|ilike|in|is)\.(.*)$/.exec(v); if (!m) throw Object.assign(new Error('filter tidak didukung: ' + v), { status: 400 });
    const [, neg, op, val] = m; const col = ident(k); let c;
    if (op === 'in') c = `${col} in (${val.replace(/^\(|\)$/g, '').split(',').map(x => lit(x.replace(/^"|"$/g, ''))).join(',')})`;
    else if (op === 'is') c = `${col} is ${val === 'null' ? 'null' : val}`;
    else if (op === 'like' || op === 'ilike') c = `${col} ${op} ${lit(val.replace(/\*/g, '%'))}`;
    else c = `${col} ${{ eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }[op]} ${lit(val)}`;
    parts.push(neg ? `not (${c})` : c);
  }
  return parts.length ? ' where ' + parts.join(' and ') : '';
}

async function rest(req, url, body, ctx) {
  const rel = url.pathname.replace('/rest/v1/', ''); const { role, sub } = ctx;
  if (rel.startsWith('rpc/')) {
    const fn = ident(rel.slice(4)); const info = await fnInfo(rel.slice(4));
    const args = Object.entries(body || {}).map(([k, v]) => `${ident(k)} => ${lit(v)}`).join(', ');
    const call = `public.${fn}(${args})`;
    let q;
    if (info.void) q = `(select null::text from (select ${call}) _x)`;
    else if (info.set) q = `(select coalesce(jsonb_agg(t), '[]'::jsonb)::text from (select * from ${call}) t)`;
    else q = `coalesce(to_json(${call})::text, 'null')`;
    return runAs(role, sub, q).then(r => r.error ? r : { data: r.data === '' || r.data === null ? 'null' : r.data });
  }
  const table = 'public.' + ident(rel); const p = url.searchParams;
  if (req.method === 'GET') {
    const cols = (p.get('select') || '*').split(',').map(c => c.trim() === '*' ? '*' : ident(c.trim())).join(', ');
    const order = p.get('order') ? ' order by ' + p.get('order').split(',').map(o => { const [c, d] = o.split('.'); return ident(c) + (d === 'desc' ? ' desc' : ' asc'); }).join(', ') : '';
    const lim = p.get('limit') ? ' limit ' + parseInt(p.get('limit')) : '';
    return runAs(role, sub, `coalesce((select jsonb_agg(t) from (select ${cols} from ${table}${filtersSql(p)}${order}${lim}) t), '[]'::jsonb)::text`);
  }
  if (req.method === 'POST') {
    const rows = Array.isArray(body) ? body : [body]; const keys = [...new Set(rows.flatMap(r => Object.keys(r)))];
    const conflict = p.get('on_conflict') && /ignore-duplicates/.test(req.headers.prefer || '') ? ` on conflict (${ident(p.get('on_conflict'))}) do nothing` : '';
    const ins = `insert into ${table} (${keys.map(ident).join(', ')}) select ${keys.map(ident).join(', ')} from json_populate_recordset(null::${table}, ${lit(JSON.stringify(rows))})${conflict} returning *`;
    return runWrite(role, sub, ins);
  }
  if (req.method === 'PATCH') {
    const keys = Object.keys(body); const sets = keys.map(k => `${ident(k)} = x.${ident(k)}`).join(', ');
    return runWrite(role, sub, `update ${table} set ${sets} from (select * from json_populate_record(null::${table}, ${lit(JSON.stringify(body))})) x${filtersSql(p)} returning ${table}.*`);
  }
  if (req.method === 'DELETE') return runWrite(role, sub, `delete from ${table}${filtersSql(p)} returning *`);
  throw Object.assign(new Error('metode tidak didukung'), { status: 405 });
}
// CTE data-modifying harus berada pada tingkat atas statement
async function runWrite(role, sub, dml) {
  const script = `begin;\nset local role ${role};\nselect set_config('request.jwt.claim.sub', ${lit(sub || '')}, true) \\g /dev/null\nwith r as (${dml}) select '@@' || coalesce(jsonb_agg(r), '[]'::jsonb)::text from r;\ncommit;\n`;
  const r = await psql(script);
  if (r.code !== 0) { if (process.env.MOCK_DEBUG) console.error(script, r.err); const m = /ERROR:\s+([0-9A-Z]{5}):\s+(.*)/.exec(r.err) || []; return { error: { code: m[1] || 'XX000', message: (m[2] || r.err.trim()).split('\n')[0] } }; }
  const line = r.out.split('\n').find(l => l.startsWith('@@')); return { data: line ? line.slice(2) : '[]' };
}

async function auth(req, url, body, ctx) {
  const p = url.pathname.replace('/auth/v1/', '');
  const sql = async (q) => { const r = await psql(`select '@@' || coalesce((select jsonb_agg(t) from (${q}) t), '[]'::jsonb)::text;`); const l = r.out.split('\n').find(x => x.startsWith('@@')); return l ? JSON.parse(l.slice(2)) : []; };
  if (p === 'token') {
    const grant = url.searchParams.get('grant_type'); let u;
    if (grant === 'password') { [u] = await sql(`select id, email from auth.users where email = ${lit(body.email)} and password = ${lit(body.password)}`); if (!u) return { status: 400, body: { error: 'invalid_grant', error_description: 'Invalid login credentials' } }; }
    else if (grant === 'refresh_token') { const id = refreshTokens.get(body.refresh_token); if (!id) return { status: 400, body: { error: 'invalid_grant' } }; [u] = await sql(`select id, email from auth.users where id = ${lit(id)}`); }
    else return { status: 400, body: { error: 'unsupported' } };
    const rt = crypto.randomBytes(16).toString('hex'); refreshTokens.set(rt, u.id);
    return { status: 200, body: { access_token: makeJwt(u.id, +process.env.MOCK_TTL || 3600), refresh_token: rt, expires_in: +process.env.MOCK_TTL || 3600, token_type: 'bearer', user: u } };
  }
  if (p === 'user' && req.method === 'GET') { if (!ctx.sub) return { status: 401, body: { message: 'invalid JWT' } }; const [u] = await sql(`select id, email from auth.users where id = ${lit(ctx.sub)}`); return u ? { status: 200, body: u } : { status: 401, body: { message: 'user not found' } }; }
  if (p === 'user' && req.method === 'PUT') { if (!ctx.sub) return { status: 401, body: {} }; await psql(`update auth.users set password = ${lit(body.password)} where id = ${lit(ctx.sub)};`); return { status: 200, body: { id: ctx.sub } }; }
  if (p === 'logout') return { status: 204, body: null };
  if (p === 'admin/users' && req.method === 'POST') {
    if (ctx.role !== 'service_role') return { status: 403, body: { message: 'not admin' } };
    const [ex] = await sql(`select id from auth.users where email = ${lit(body.email)}`); if (ex) return { status: 422, body: { message: 'A user with this email address has already been registered', code: 'email_exists' } };
    const [u] = await sql(`insert into auth.users (email, password) values (${lit(body.email)}, ${lit(body.password)}) returning id, email`); return { status: 200, body: u };
  }
  if (p.startsWith('admin/users/') && req.method === 'PUT') { if (ctx.role !== 'service_role') return { status: 403, body: {} }; await psql(`update auth.users set password = ${lit(body.password)} where id = ${lit(decodeURIComponent(p.slice(12)))};`); return { status: 200, body: {} }; }
  return { status: 404, body: { message: 'not found' } };
}

http.createServer(async (req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'Access-Control-Expose-Headers': '*' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', ...cors }); res.end(body === null || body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body)); };
  try {
    const url = new URL(req.url, 'http://x'); const chunks = []; for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString(); const body = raw ? JSON.parse(raw) : undefined;
    const apikey = req.headers.apikey; const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    let role = 'anon', sub = null;
    if (apikey === SERVICE) role = 'service_role';
    else if (apikey !== ANON) return send(401, { message: 'Invalid API key' });
    if (bearer && bearer !== apikey) { const jwt = readJwt(bearer); if (!jwt) { if (url.pathname.startsWith('/auth/')) return send(401, { message: 'invalid JWT' }); return send(401, { code: 'PGRST301', message: 'JWT expired or invalid' }); } role = 'authenticated'; sub = jwt.sub; }
    const ctx = { role, sub };
    if (url.pathname.startsWith('/auth/v1/')) { const r = await auth(req, url, body, ctx); return send(r.status, r.body); }
    if (url.pathname.startsWith('/rest/v1/')) {
      const r = await rest(req, url, body, ctx);
      if (r.error) return send(statusFor(r.error.code, role === 'anon'), r.error);
      return send(req.method === 'POST' && !url.pathname.includes('/rpc/') ? 201 : 200, r.data);
    }
    send(404, { message: 'not found' });
  } catch (e) { send(e.status || 500, { message: e.message }); }
}).listen(PORT, () => console.log('Mock Supabase on :' + PORT));
module.exports = { ANON, SERVICE };
