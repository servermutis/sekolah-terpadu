'use strict';
const crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);

const N = 16384, R = 8, P = 1, KEYLEN = 32;

async function hashPin(pin) {
  const salt = crypto.randomBytes(16);
  const dk = await scrypt(String(pin), salt, KEYLEN, { N, r: R, p: P });
  return ['scrypt', N, R, P, salt.toString('base64'), dk.toString('base64')].join('$');
}

async function verifyPin(pin, stored) {
  try {
    const [alg, n, r, p, saltB64, hashB64] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const expected = Buffer.from(hashB64, 'base64');
    const dk = await scrypt(String(pin), Buffer.from(saltB64, 'base64'), expected.length, { N: +n, r: +r, p: +p });
    return dk.length === expected.length && crypto.timingSafeEqual(dk, expected);
  } catch { return false; }
}

// Hash tiruan untuk menyamakan waktu respons ketika NIS tidak ditemukan.
let dummy;
async function dummyVerify(pin) { dummy = dummy || await hashPin('dummy-pin-value'); await verifyPin(pin, dummy); return false; }

function secret() {
  const s = process.env.SESSION_SECRET || '';
  if (s.length < 32) { const e = new Error('SESSION_SECRET belum diatur (minimal 32 karakter).'); e.status = 503; throw e; }
  return s;
}

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return body + '.' + sig;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || token.length > 2048) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', secret()).update(body).digest();
  let given; try { given = Buffer.from(sig, 'base64url'); } catch { return null; }
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

const randomPin = (len = 6) => Array.from({ length: len }, () => crypto.randomInt(0, 10)).join('');

module.exports = { hashPin, verifyPin, dummyVerify, signToken, verifyToken, randomPin };
