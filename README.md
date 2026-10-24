# Aplikasi Sekolah Terpadu — Yayasan Mutiara Islam Cileungsi

Fase 1–3 dari blueprint: data induk, kesiswaan, poin pelanggaran (total otomatis), rekap,
portal siswa "Cek Poin" (NIS + PIN), hak akses per unit (SD/SMP/SMA) dan audit log.

**Teknologi:** SPA tanpa build (HTML/CSS/JS modul) + fungsi serverless Vercel (`api/`) + Supabase (Postgres, Auth, RLS).
Tidak ada dependensi npm, jadi tidak ada langkah `npm install`/build.

## 1. Database (Supabase)
Jalankan berurutan di SQL Editor (atau `supabase db push`) file di `supabase/migrations/`:
`..._init_schema.sql` → `..._functions.sql` → `..._seed.sql` → `..._list_functions.sql`.
> Nama unit di seed ("SD/SMP/SMA Mutiara Islam Cileungsi") dan 6 jenis pelanggaran + poinnya hanyalah **contoh**.
> Sesuaikan dengan tata tertib resmi (menu Aturan Poin / Master Data).

## 2. Pengguna pertama (admin yayasan)
1. Supabase → Authentication → Users → *Add user* (email + password, centang auto-confirm).
2. Di SQL Editor (ganti `<UID>` dengan id pengguna tadi):
```sql
insert into public.profiles (id, full_name, email) values ('<UID>', 'Admin Yayasan', 'email@anda');
insert into public.user_roles (user_id, role, school_id) values ('<UID>', 'admin_yayasan', null);
```
Pengguna lain (kepala sekolah, kesiswaan, guru, BK, wali kelas) dibuat dari menu **Pengguna**.

## 3. Deploy ke Vercel
1. Import folder ini sebagai project (Framework: *Other*; tidak ada build command; output sudah diatur di `vercel.json`).
2. Environment Variables (Production):

| Nama | Isi |
|---|---|
| `SUPABASE_URL` | URL project Supabase |
| `SUPABASE_ANON_KEY` | publishable/anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | secret/service_role key (**rahasia**, jangan dibagikan) |
| `SESSION_SECRET` | string acak ≥ 32 karakter |

3. Deploy, lalu di Supabase → Authentication → URL Configuration isi Site URL dengan domain Vercel.

## 4. Alur pemakaian
- Guru/Kesiswaan: **Catat Pelanggaran** → ketik NIS → sistem menampilkan nama & kelas → pilih jenis (poin otomatis).
- Laporan guru berstatus *menunggu* sampai disahkan Kesiswaan; hanya yang disahkan dihitung.
- Koreksi catatan disahkan wajib beralasan; semua perubahan masuk audit log.
- Siswa: `/cek-poin` dengan NIS + PIN. Kesiswaan membuat/reset PIN dari menu Siswa; PIN awal wajib diganti.

## 5. Uji
`scripts/test-db.sh` (skenario DB/RLS, butuh Postgres lokal) dan `test/e2e.mjs` (browser, memakai mock Supabase).

## Belum termasuk
Kenaikan kelas, presensi/nilai/rapor (Fase 4+), alur persetujuan koreksi mundur.
