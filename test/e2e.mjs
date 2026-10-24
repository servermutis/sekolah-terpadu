import { chromium } from '/home/claude/.npm-global/lib/node_modules/playwright/index.mjs';
const BASE = process.env.BASE || 'http://localhost:3100';
const SHOT = '/tmp/shots';
const log = (...a) => console.log(...a);
let failures = 0;
const ok = (c, msg) => { if (c) log('PASS ', msg); else { failures++; log('FAIL ', msg); } };

const browser = await chromium.launch();
const problems = [];
async function newCtx(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'id-ID', timezoneId: 'Asia/Jakarta', ...opts });
  ctx.on('page', (p) => { p.on('console', (m) => { if (['error', 'warning'].includes(m.type()) && !/Failed to load resource.*(40[0-9])/.test(m.text())) problems.push(`[${m.type()}] ${m.text()}`); }); p.on('pageerror', (e) => problems.push('[pageerror] ' + e.message)); });
  return ctx;
}
async function staffLogin(page, email) {
  await page.goto(BASE + '/masuk');
  await page.fill('input[type=email]', email); await page.fill('input[type=password]', 'Passw0rd!');
  await page.click('button[type=submit]'); await page.waitForURL('**/dashboard');
  await page.waitForSelector('.topbar');
}

// 1. Landing + cek poin (publik)
let ctx = await newCtx(); let page = await ctx.newPage();
await page.goto(BASE + '/'); await page.waitForSelector('text=Cek Poin Siswa');
await page.screenshot({ path: `${SHOT}/01-landing.png` });
ok(await page.locator('img[alt^="Logo"]').first().isVisible(), 'landing menampilkan logo yayasan');

// 2. kesiswaan: login salah, lalu benar
await page.goto(BASE + '/masuk'); await page.fill('input[type=email]', 'kesiswaan@test.id'); await page.fill('input[type=password]', 'salah');
await page.click('button[type=submit]'); await page.waitForSelector('.err:has-text("tidak sesuai")');
ok(true, 'login salah menampilkan pesan');
await page.screenshot({ path: `${SHOT}/02-login-error.png` });
await staffLogin(page, 'kesiswaan@test.id');
await page.waitForSelector('.stat .v'); await page.screenshot({ path: `${SHOT}/03-dashboard.png` });
ok((await page.locator('.stat .v').first().innerText()) === '3', 'dashboard: 3 siswa aktif');
ok(await page.locator('.bottomnav').isVisible(), 'navigasi bawah tampil di HP');

// 3. catat pelanggaran langsung disahkan
await page.goto(BASE + '/pelanggaran'); await page.waitForSelector('h1:has-text("Pelanggaran Siswa")');
await page.click('button:has-text("Catat")'); await page.waitForSelector('.dialog');
await page.fill('.dialog input[placeholder^="Ketik NIS"]', '99999'); await page.click('.dialog button:has-text("Cari")');
await page.waitForSelector('.dialog .err:has-text("Data siswa tidak ditemukan.")'); ok(true, 'NIS tak ditemukan -> pesan blueprint');
await page.fill('.dialog input[placeholder^="Ketik NIS"]', '10002'); await page.click('.dialog button:has-text("Cari")');
await page.waitForSelector('.dialog .notice:has-text("Siti Aisyah")'); ok(true, 'nama & kelas diambil dari database');
await page.selectOption('.dialog select', { label: 'Terlambat datang (5 poin)' });
ok((await page.inputValue('.dialog input[readonly]')).startsWith('5 poin'), 'poin otomatis dari aturan');
await page.fill('.dialog textarea', 'Terlambat 20 menit'); await page.check('.dialog input[type=checkbox]');
await page.screenshot({ path: `${SHOT}/04-form-pelanggaran.png` });
await page.click('.dialog button:has-text("Simpan")'); await page.waitForSelector('.toast:has-text("disahkan")'); ok(true, 'pelanggaran tersimpan & disahkan');

// 4. rekap
await page.goto(BASE + '/rekap'); await page.waitForSelector('tr.click');
const row = page.locator('tr.click', { hasText: 'Siti Aisyah' });
ok((await row.innerText()).replace(/\s+/g, ' ').includes('1 5'), 'rekap: Siti 1 pelanggaran, 5 poin');
await page.screenshot({ path: `${SHOT}/05-rekap.png` });
await row.click(); await page.waitForSelector('.dialog .item'); await page.screenshot({ path: `${SHOT}/06-riwayat.png` });
ok(await page.locator('.dialog .item:has-text("Terlambat datang")').isVisible(), 'drill-down ke catatan penyusun');
await page.keyboard.press('Escape');

// 5. guru melapor (belum dihitung), kesiswaan memverifikasi
const gctx = await newCtx(); const gp = await gctx.newPage(); await staffLogin(gp, 'guru@test.id');
ok(!(await gp.locator('.bottomnav a:has-text("Rekap Poin")').count()), 'guru tidak melihat menu Rekap Poin');
await gp.goto(BASE + '/pelanggaran'); await gp.click('button:has-text("Catat")'); await gp.waitForSelector('.dialog');
await gp.fill('.dialog input[placeholder^="Ketik NIS"]', '10001'); await gp.click('.dialog button:has-text("Cari")'); await gp.waitForSelector('.dialog .notice:has-text("Ahmad Fauzi")');
ok(!(await gp.locator('.dialog input[type=checkbox]').count()), 'guru tidak punya opsi "langsung sahkan"');
await gp.selectOption('.dialog select', { label: 'Tidak memakai atribut lengkap (3 poin)' }); await gp.fill('.dialog textarea', 'Tidak memakai dasi');
await gp.click('.dialog button:has-text("Simpan")'); await gp.waitForSelector('.toast:has-text("Laporan pelanggaran tersimpan")'); ok(true, 'guru melapor');
await gp.fill('.dialog input[placeholder^="Ketik NIS"]', '').catch(() => {});
// guru di luar penugasan tidak menemukan siswa 1B
await gp.goto(BASE + '/pelanggaran'); await gp.click('button:has-text("Catat")'); await gp.fill('.dialog input[placeholder^="Ketik NIS"]', '10003'); await gp.click('.dialog button:has-text("Cari")');
await gp.waitForSelector('.dialog .err:has-text("Data siswa tidak ditemukan.")'); ok(true, 'guru tidak dapat mencari siswa di luar kelas tugasnya');
await gp.screenshot({ path: `${SHOT}/07-guru.png` });

await page.goto(BASE + '/pelanggaran'); await page.waitForSelector('.tab[aria-selected=true]:has-text("Menunggu")');
await page.waitForSelector('.item:has-text("Ahmad Fauzi")'); await page.screenshot({ path: `${SHOT}/08-menunggu.png` });
await page.click('.item:has-text("Ahmad Fauzi")'); await page.waitForSelector('.dialog button:has-text("Sahkan")');
await page.screenshot({ path: `${SHOT}/09-detail.png` });
await page.click('.dialog button:has-text("Sahkan")'); await page.waitForSelector('.toast:has-text("disahkan")'); ok(true, 'verifikasi: laporan guru disahkan');
await page.goto(BASE + '/rekap'); await page.waitForSelector('tr.click:has-text("Ahmad Fauzi")');
ok((await page.locator('tr.click', { hasText: 'Ahmad Fauzi' }).innerText()).replace(/\s+/g, ' ').includes('1 3'), 'rekap setelah verifikasi: Ahmad 3 poin');

// 6. koreksi tanpa alasan ditolak, dengan alasan berhasil
await page.click('tr.click:has-text("Siti Aisyah")'); await page.waitForSelector('.dialog .item'); await page.click('.dialog .item');
await page.waitForSelector('.dialog:has-text("Detail Pelanggaran")'); await page.click('.dialog button:has-text("Koreksi")');
await page.waitForSelector('.dialog:has-text("Koreksi catatan")'); await page.fill('.dialog input[type=number]', '3');
await page.click('.dialog button:has-text("Simpan perubahan")'); await page.waitForSelector('.dialog .err:has-text("Alasan koreksi wajib")'); ok(true, 'koreksi poin tanpa alasan ditolak');
await page.fill('.dialog textarea[placeholder^="Wajib"]', 'Sesuai tata tertib terbaru'); await page.click('.dialog button:has-text("Simpan perubahan")');
await page.waitForSelector('.toast:has-text("Perubahan tersimpan")'); ok(true, 'koreksi dengan alasan tersimpan');

// 7. PIN siswa dari UI
await page.goto(BASE + '/siswa'); await page.waitForSelector('.item:has-text("Siti Aisyah")');
await page.screenshot({ path: `${SHOT}/10-siswa.png` });
await page.click('.item:has-text("Siti Aisyah") button:has-text("PIN")'); await page.waitForSelector('.dialog');
await page.click('.dialog button:has-text("Buat PIN baru")'); await page.waitForSelector('.dialog:has-text("Buat PIN baru") .btn >> nth=-1');
await page.click('.dialog:has-text("PIN lama") button:has-text("Ya, lanjutkan")'); await page.waitForSelector('.pin-big');
const pin = (await page.locator('.pin-big').innerText()).trim(); ok(/^\d{6}$/.test(pin), 'PIN acak 6 digit dibuat: ' + pin.replace(/./g, '*'));
await page.screenshot({ path: `${SHOT}/11-pin.png` });

// 8. portal siswa
const sctx = await newCtx(); const sp = await sctx.newPage();
await sp.goto(BASE + '/cek-poin'); await sp.waitForSelector('input[placeholder^="Contoh"]');
await sp.screenshot({ path: `${SHOT}/12-cekpoin-login.png` });
await sp.fill('input[placeholder^="Contoh"]', '10002'); await sp.fill('input[type=password]', '111111'); await sp.click('button[type=submit]');
await sp.waitForSelector('.err:has-text("NIS atau PIN tidak sesuai.")'); ok(true, 'PIN salah -> pesan umum');
await sp.fill('input[placeholder^="Contoh"]', '10002'); await sp.fill('input[type=password]', pin); await sp.click('button[type=submit]');
await sp.waitForSelector('h1:has-text("Buat PIN Baru")'); ok(true, 'PIN awal wajib diganti');
const inputs = sp.locator('input[type=password]'); await inputs.nth(0).fill(pin); await inputs.nth(1).fill('111111'); await inputs.nth(2).fill('111111');
await sp.click('button:has-text("Simpan PIN Baru")'); await sp.waitForSelector('.err:has-text("terlalu mudah")'); ok(true, 'PIN lemah ditolak');
await inputs.nth(1).fill('Mutiara26'); await inputs.nth(2).fill('Mutiara26'); await sp.click('button:has-text("Simpan PIN Baru")');
await sp.waitForSelector('.sis-head'); await sp.screenshot({ path: `${SHOT}/13-cekpoin-hasil.png`, fullPage: true });
ok((await sp.locator('.sis-head').innerText()).includes('Siti Aisyah'), 'portal menampilkan identitas siswa dari sesi');
ok((await sp.locator('.sis-stat .v').nth(1).innerText()) === '3', 'portal: total poin sesuai koreksi (3)');
ok(!(await sp.locator('text=Ahmad Fauzi').count()), 'portal tidak memuat data siswa lain');
await sp.click('button:has-text("Keluar")'); await sp.waitForSelector('input[placeholder^="Contoh"]'); ok(true, 'logout mengakhiri sesi');
const me = await sp.evaluate(async () => (await fetch('/api/siswa/me')).status); ok(me === 401, 'setelah logout /me = 401');

// 9. kunci setelah 5 kali salah
for (let i = 0; i < 5; i++) { await sp.fill('input[placeholder^="Contoh"]', '10003'); await sp.fill('input[type=password]', 'x' + i + 'xxxx'); await sp.click('button[type=submit]'); await sp.waitForSelector('.err:not(:empty)'); await sp.waitForTimeout(150); }
const lockTxt = await sp.locator('.err').innerText(); ok(/dibatasi sementara/.test(lockTxt), 'terkunci sementara setelah 5 percobaan: ' + lockTxt.slice(0, 40));

// 10. desktop
const dctx = await newCtx({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 }); const dp = await dctx.newPage();
await staffLogin(dp, 'yayasan@test.id'); await dp.waitForSelector('.stat .v'); await dp.screenshot({ path: `${SHOT}/14-desktop-dashboard.png` });
await dp.goto(BASE + '/rekap'); await dp.waitForSelector('tr.click'); await dp.screenshot({ path: `${SHOT}/15-desktop-rekap.png` });
await dp.goto(BASE + '/audit'); await dp.waitForSelector('tbody tr'); ok(true, 'audit log tampil untuk yayasan'); await dp.screenshot({ path: `${SHOT}/16-desktop-audit.png` });
await dp.goto(BASE + '/pengguna'); await dp.waitForSelector('.item'); await dp.screenshot({ path: `${SHOT}/17-desktop-pengguna.png` });

// 11. kesiswaan tidak boleh membuka halaman pengguna/audit (dialihkan)
await page.goto(BASE + '/pengguna'); await page.waitForURL('**/dashboard'); ok(true, 'kesiswaan dialihkan dari /pengguna');

log(problems.length ? '\nMASALAH KONSOL/CSP:\n' + [...new Set(problems)].join('\n') : '\nTidak ada error konsol / pelanggaran CSP');
log(failures ? `\n${failures} GAGAL` : '\nSEMUA E2E LULUS');
await browser.close(); process.exit(failures ? 1 : 0);
