# Kasukretan Krama — PWA (Vercel + Turso)

Aplikasi web Kasukretan yang bisa dibuka dari mana saja dan **dipasang di HP** seperti aplikasi biasa.
Hasil migrasi dari aplikasi desktop `kasukretan-new`: tampilan dan logika sama, tetapi data
disimpan di cloud (Turso) dan aplikasi di-hosting di Vercel — keduanya paket gratis.

```
HP / laptop staf ──HTTPS──> Vercel (halaman web + /api) ──> Turso (database SQLite di cloud)
```

- **Satu sumber data**: semua staf melihat data yang sama secara langsung.
- **Hak akses (RBAC) diperiksa di server**, bukan hanya menu yang disembunyikan.
- **Backup `kasukretan.db`**: bisa diunduh dari aplikasi dan dibuka/di-restore di aplikasi desktop lama.

## Hak akses peran

| Peran     | Boleh                                                                 |
|-----------|-----------------------------------------------------------------------|
| admin     | Semua, termasuk master data, pengguna, dan backup database            |
| operator  | Tambah/ubah/hapus data krama & pemasih, cetak surat, catat biaya admin pemasih |
| keuangan  | Ubah data krama (tanpa hapus) + paturunan, dudukan, buku kas          |
| prajuru   | Hanya melihat                                                         |

Aturan lengkapnya ada di `server/policy.ts`. Jika suatu aksi yang sah ditolak (muncul pesan
"Peran … tidak berhak …"), aturan tabelnya bisa disesuaikan di file tersebut.

---

## 1. Menjalankan di komputer sendiri (uji coba)

Butuh Node.js 20 atau lebih baru.

```powershell
cd G:\BUDIAST\kasukretan-pwa
npm install
copy .env.example .env.local      # lalu isi JWT_SECRET (lihat di bawah)
npm run jwt:secret                # salin hasilnya ke JWT_SECRET di .env.local
npm run db:init                   # buat database lokal data/kasukretan.db
npm run dev                       # buka http://localhost:1420
```

Login awal: **admin / admin123** — aplikasi langsung meminta ganti password.

Untuk mencoba dengan data asli, impor database desktop ke database lokal:

```powershell
npm run db:import -- "D:\lokasi\kasukretan.db" --force
```

## 2. Membuat database Turso

1. Daftar di <https://app.turso.tech> (bisa login dengan GitHub).
2. **Create Database** → nama `kasukretan`, lokasi terdekat (mis. *AWS ap-northeast-1 Tokyo*
   atau *ap-south-1 Mumbai*).
3. Buka database → salin **URL** (`libsql://kasukretan-xxx.turso.io`).
4. **Create Token** (Read & Write, tanpa kedaluwarsa) → salin token.

Isi database dari komputer Anda. Buat file `.env.turso` (jangan dibagikan):

```
TURSO_DATABASE_URL=libsql://kasukretan-xxx.turso.io
TURSO_AUTH_TOKEN=eyJ...
```

Lalu jalankan salah satu:

```powershell
# a) Pindahkan data asli dari aplikasi desktop (disarankan)
npm run db:import -- "D:\lokasi\kasukretan.db" --env=.env.turso

# b) Atau mulai dari database kosong
npm run db:init -- --env=.env.turso
```

> Tutup aplikasi desktop dulu sebelum mengimpor agar file `kasukretan.db` tidak sedang dipakai.
> `db:import` menolak menimpa database yang sudah berisi data kecuali ditambah `--force`.

## 3. Deploy ke Vercel

1. Unggah folder ini ke repositori GitHub **privat** (file `.env*`, `data/`, dan `*.db` sudah
   diabaikan oleh `.gitignore`).
2. Di <https://vercel.com> → **Add New → Project** → pilih repositori tersebut.
   Framework terdeteksi otomatis (Vite); jangan ubah build command.
3. Di **Environment Variables** isi:
   - `TURSO_DATABASE_URL` — URL dari langkah 2
   - `TURSO_AUTH_TOKEN` — token dari langkah 2
   - `JWT_SECRET` — hasil `npm run jwt:secret` (buat baru, jangan sama dengan lokal)
   - `GEMINI_API_KEY` — (opsional) kunci [Google AI Studio](https://aistudio.google.com/apikey) untuk **scan KK cepat** di HP; tanpa ini aplikasi memakai OCR Tesseract di perangkat
   - `GEMINI_MODEL` — (opsional, default `gemini-2.0-flash`) model Vision
4. **Deploy**. Setelah selesai, buka alamat `https://nama-proyek.vercel.app`.

Setiap `git push` ke GitHub akan otomatis men-deploy versi baru. Pengguna yang sedang membuka
aplikasi akan melihat pemberitahuan **"Versi baru aplikasi tersedia"**.

Server API berjalan di region Singapura (`sin1`, diatur di `vercel.json`).

## 4. Memasang di HP

- **Android (Chrome)**: buka alamat aplikasi → tombol **Pasang aplikasi** di halaman login,
  atau menu ⋮ → *Instal aplikasi*.
- **iPhone (Safari)**: buka alamat aplikasi → tombol **Bagikan** → *Tambah ke Layar Utama*.

Setelah dipasang, aplikasi terbuka layar penuh dengan ikon Kasukretan. Koneksi internet tetap
diperlukan karena data ada di cloud.

## 5. Backup

- **Dari aplikasi** (admin): *Pengaturan → Database → Unduh backup (.db)*. File
  `kasukretan-backup-TANGGAL.db` bisa dibuka atau di-restore di aplikasi desktop lama.
- **Dari komputer**:

  ```powershell
  npm run db:export -- --env=.env.turso                       # → backup/kasukretan-TANGGAL.db
  npm run db:export -- "D:\backup\kas.db" --env=.env.turso
  ```

Lakukan backup rutin (mis. mingguan) dan simpan di tempat aman — file berisi data pribadi krama.

## 6. Restore

**Restore menimpa seluruh data cloud** (krama, keuangan, dan akun pengguna) dengan isi berkas `.db`.

- **Dari aplikasi** (admin): *Pengaturan → Database → Restore database*.
  1. Pilih berkas `.db` (backup aplikasi ini atau `kasukretan.db` dari desktop). Aplikasi memeriksa
     berkas dan menampilkan ringkasannya: nama desa, jumlah krama, dan akun admin di dalamnya.
  2. Isi password admin Anda dan ketik `RESTORE`.
  3. Aplikasi otomatis mengunduh backup data saat ini (`…-sebelum-restore.db`), lalu me-restore.
     Selama proses, staf lain tidak bisa mengubah data. Jangan tutup halaman.
  4. Setelah selesai, masuk ulang dengan akun admin dari berkas backup.

  Bila restore berhenti di tengah (mis. internet putus), database tetap terkunci. Tekan
  **Ulangi restore**, atau restore berkas `…-sebelum-restore.db` untuk kembali ke data semula.
  Kunci yang tertinggal otomatis kedaluwarsa setelah 30 menit.
- **Dari komputer** (lebih cepat untuk database besar):

  ```powershell
  npm run db:import -- "D:\backup\kasukretan-backup.db" --env=.env.turso --force
  ```

## Batas paket gratis (perkiraan untuk satu desa)

- **Vercel Hobby**: 100 GB bandwidth/bulan, untuk penggunaan non-komersial. Cukup untuk puluhan staf.
- **Turso Free**: 5 GB penyimpanan, ratusan juta baris dibaca/bulan. Database desa biasanya < 50 MB.

## Perintah

| Perintah             | Fungsi                                                       |
|----------------------|--------------------------------------------------------------|
| `npm run dev`        | Server API (port 3001) + tampilan (port 1420)                |
| `npm run build`      | Cek tipe + build PWA ke `dist/`                              |
| `npm test`           | Unit test                                                    |
| `npm run db:init`    | Buat skema + migrasi + data awal                             |
| `npm run db:import`  | Salin file `.db` desktop ke database tujuan                  |
| `npm run db:export`  | Salin database ke file `.db`                                 |
| `npm run jwt:secret` | Buat `JWT_SECRET` acak                                       |
| `npx tsx scripts/smoke-api.ts [url] [password-admin]` | Uji API & RBAC terhadap server lokal (jangan ke produksi — membuat/menghapus pengguna uji) |
| `npx tsx scripts/smoke-restore.ts [url] [password-admin]` | Uji alur restore terhadap server lokal (hanya database `file:`) |

## Perbedaan dengan versi desktop

- Fitur OCR KK/KTP dihapus.
- Modul Petugas & Portal krama (berbasis Postgres) tidak disertakan.
- Tanpa lisensi/aktivasi, tanpa mode LAN — server cloud menggantikannya.
- Harus online; tidak ada antrean data saat offline.
- Cetak Bluetooth langsung hanya didukung Chrome Android; selain itu gunakan cetak/unduh PDF.

## Struktur

```
api/index.ts        Fungsi Vercel → server/handler.ts
server/             Auth (JWT), RBAC SQL, koneksi Turso
scripts/            db:init / db:import / db:export, server API lokal, uji smoke
src/                Aplikasi React (service sama dengan desktop, SQL dikirim ke /api/sql)
vercel.json         Rewrite /api, header cache, region
```
