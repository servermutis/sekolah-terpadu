// Server pengembangan tanpa dependensi: menyajikan public/ dan menjalankan fungsi api/ seperti Vercel.
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = +process.env.PORT || 3000;
const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
const headers = vercel.headers[0].headers;
process.env.INSECURE_COOKIES = process.env.INSECURE_COOKIES || '1';

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  for (const h of headers) res.setHeader(h.key, h.key === 'Content-Security-Policy' && process.env.SUPABASE_URL ? h.value.replace('connect-src \'self\'', `connect-src 'self' ${process.env.SUPABASE_URL}`) : h.value);
  if (url.pathname.startsWith('/api/')) {
    const file = path.join(ROOT, url.pathname + '.js');
    if (!file.startsWith(path.join(ROOT, 'api')) || path.basename(file).startsWith('_') || !fs.existsSync(file)) { res.statusCode = 404; return res.end('{"error":"Tidak ditemukan"}'); }
    delete require.cache[require.resolve(file)];
    return require(file)(req, res);
  }
  let f = path.join(ROOT, 'public', decodeURIComponent(url.pathname));
  if (!f.startsWith(path.join(ROOT, 'public')) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(ROOT, 'public', 'index.html');
  res.setHeader('Content-Type', TYPES[path.extname(f)] || 'application/octet-stream');
  fs.createReadStream(f).pipe(res);
}).listen(PORT, () => console.log('Dev server: http://localhost:' + PORT));
