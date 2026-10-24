'use strict';
// Pembantu HTTP netral (berjalan di Vercel maupun server Node biasa).
function send(res, status, body, headers) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (headers) for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

async function readJson(req, limit = 64 * 1024) {
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body || '{}'); } catch { throw httpError(400, 'Format permintaan tidak valid.'); } }
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > limit) throw httpError(413, 'Permintaan terlalu besar.'); chunks.push(c); }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw httpError(400, 'Format permintaan tidak valid.'); }
}

function httpError(status, message, extra) { const e = new Error(message); e.status = status; e.extra = extra; return e; }

function clientIp(req) {
  const h = req.headers || {};
  const v = h['x-vercel-forwarded-for'] || h['x-real-ip'] || (h['x-forwarded-for'] || '').split(',')[0] || (req.socket && req.socket.remoteAddress) || 'unknown';
  return String(v).trim().slice(0, 64);
}

// Tolak POST lintas-origin (pertahanan tambahan selain SameSite=Strict).
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function handler(methods, fn) {
  return async function (req, res) {
    try {
      if (!methods.includes(req.method)) { res.setHeader('Allow', methods.join(', ')); return send(res, 405, { error: 'Metode tidak diizinkan.' }); }
      if (req.method !== 'GET' && !sameOrigin(req)) return send(res, 403, { error: 'Permintaan ditolak.' });
      await fn(req, res);
    } catch (e) {
      if (e && e.status) return send(res, e.status, { error: e.message, ...(e.extra || {}) });
      console.error('API error:', e && e.stack || e);
      send(res, 500, { error: 'Terjadi gangguan sistem. Coba lagi beberapa saat.' });
    }
  };
}

module.exports = { send, readJson, httpError, clientIp, sameOrigin, parseCookies, handler };
