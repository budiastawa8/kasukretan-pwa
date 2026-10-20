# Panduan Pengguna — Kasukretan Krama

Panduan ini menjelaskan cara menggunakan aplikasi **Kasukretan Krama** untuk operasional harian di kantor desa adat, petugas lapangan, dan (opsional) portal krama.

> **Tutorial langkah demi langkah** ada di [TUTORIAL-PENGGUNA.md](./TUTORIAL-PENGGUNA.md).  
> **Instalasi & setup teknis** ada di [LEMBAR-KERJA-INSTALASI.md](./LEMBAR-KERJA-INSTALASI.md).  
> **Go-live modul online (dari nol):** [GO-LIVE-ONLINE.md](./GO-LIVE-ONLINE.md) — Supabase → Hugging Face → Cloudflare Pages.

---

## 1. Tentang Aplikasi

Kasukretan Krama membantu pengelolaan:

- **Krama** (Mipil, Krama Tamiu, Tamiu)
- **Paturunan** — iuran krama mipil
- **Dudukan** — iuran krama tamiu & tamiu
- **Keuangan** — buku kas, pemasukan, pengeluaran
- **Laporan** — rekap, tunggakan, audit

Aplikasi terdiri dari tiga bagian:

| Bagian | Dipakai di | Keterangan |
|--------|------------|------------|
| **Desktop kantor** | PC kantor desa | Operasional utama, data disimpan lokal (SQLite) |
| **Modul Petugas** | Browser HP petugas | Input pembayaran di lapangan (opsional, butuh internet) |
| **Portal Krama** | Browser krama | Cek tunggakan sendiri (opsional) |

---

## 2. Memulai

### 2.1 Aktivasi (pertama kali)

1. Buka aplikasi desktop setelah instalasi.
2. PC baru mendapat **trial gratis 30 hari** — aplikasi bisa dipakai langsung.
3. Tempel **kode lisensi** `KSK2...` dari vendor kapan saja (banner trial atau Pengaturan → Tentang).
4. Satu kode untuk desa (maks. 2 mesin). Setelah berhasil, lisensi permanen aktif.

### 2.2 Login

1. Masukkan **username** dan **password**.
2. Jika diminta ganti password, ikuti layar **Ganti password** terlebih dahulu.
3. Setelah login, menu sisi kiri menampilkan modul yang bisa diakses.

### 2.3 Peran pengguna

| Peran | Hak akses |
|-------|-----------|
| **Administrator** | Semua fitur, termasuk pengaturan, pengguna, database, modul online |
| **Operator** | Input & ubah data operasional (krama, pembayaran, keuangan) |
| **Viewer** | Hanya melihat; tidak bisa ubah master data atau tambah krama baru |

---

## 3. Navigasi Menu

Menu utama di aplikasi desktop:

| Menu | Fungsi |
|------|--------|
| **Dashboard** | Ringkasan krama, keuangan, dan peringatan |
| **Krama Mipil** | Daftar & kelola krama mipil (pipil) |
| **Paturunan** | Iuran & pembayaran krama mipil |
| **Krama Tamiu & Tamiu** | Daftar pemasih |
| **Dudukan** | Iuran & pembayaran pemasih |
| **Keuangan** | Buku kas, transfer, pemasukan, pengeluaran |
| **Laporan** | Berbagai laporan cetak/PDF |
| **Master Data** | Struktur desa, jenis krama, tim, akun |
| **Pengaturan** | Tab Umum, Database, Pengguna, Modul Online (jika lisensi cloud) |

---

## 4. Alur Setup Pertama Kali

Urutan yang disarankan sebelum operasional:

```
1. Pengaturan → Setup Wilayah & Desa
2. Master Data → Profil Desa, Wilayah, Jenis, Tim, Keuangan
3. Krama Mipil / Krama Tamiu & Tamiu → input atau impor data
4. Paturunan → atur iuran
5. Dudukan → pastikan jadwal & tarif sesuai
6. (Opsional) Pengaturan → tab **Modul Online** → sinkronisasi cloud
```

### 4.1 Setup Wilayah & Desa

**Menu:** Pengaturan → tab **Umum** → **Setup Wilayah & Desa**

1. Isi kode kabupaten (2 digit), kecamatan (2 digit), dan desa adat (4 digit).
2. Isi nama wilayah.
3. Klik **Simpan**.
4. Pastikan status **"Siap terbit nomor kartu"**.

> **Penting:** Kode wilayah **tidak bisa diubah** setelah ada krama terdaftar. Isi dengan benar sejak awal.

Logo desa, prajuru, dan ketentuan nyada/luput diatur di **Master Data → Profil Desa**.

### 4.2 Master Data

**Menu:** Master Data

| Tab | Isi |
|-----|-----|
| **Wilayah** | Banjar → Tempek → Arahan |
| **Jenis** | Jenis Krama Mipil, Krama Tamiu, Tamiu |
| **Masa berlaku** | Ketentuan masa berlaku pemasih |
| **Profil Desa** | Logo, prajuru, ketentuan desa |
| **Tim Kasukretan** | Nama petugas lapangan per banjar |
| **Keuangan** | Akun kas, pos pemasukan & biaya |
| **Impor/Ekspor** | Unduh template Excel, impor massal |

**Urutan wilayah:** Banjar dulu, lalu Tempek di dalam banjar, lalu Arahan di dalam tempek.

---

## 5. Krama Mipil

**Menu:** Krama Mipil

### Daftar krama

- Tab **Aktif** / **Nonaktif** — filter status krama.
- Gunakan kolom **cari** dan filter banjar/tempek/jenis untuk menemukan krama.
- Klik baris untuk **detail**, ikon **mata** untuk lihat, **pensil** untuk edit.

### Menambah krama baru

1. Klik **Tambah Krama Mipil**.
2. Isi data kepala krama, lokasi (banjar/tempek/arahan), dan anggota keluarga.
   - Opsional: **Foto KK** — unggah foto Kartu Keluarga; OCR lokal mengisi NIK/nama/TTL/anggota (periksa hasil sebelum terapkan). Field adat tetap manual.
   - Opsional per anggota: **Foto KTP** di dialog anggota — OCR lokal mengisi NIK, nama, TTL, jenis kelamin, agama, status kawin, pekerjaan (periksa sebelum terapkan). Status keluarga tetap manual.
3. Simpan — nomor kartu diterbitkan otomatis sesuai kode wilayah.

### Fitur lain

- **Cetak kartu** — dari detail krama
- **Impor/Ekspor** — tab Impor di halaman daftar
- **WhatsApp** — kirim pesan ke krama (template di Pengaturan)
- **Nonaktifkan / reaktivasi** — untuk krama yang tidak aktif lagi

---

## 6. Paturunan

**Menu:** Paturunan

Modul ini mengelola iuran krama mipil.

### Tab Daftar

- Menampilkan krama mipil beserta status iuran per periode.
- Filter: banjar, tempek, jenis mipil, iuran.
- Klik **Bayar** pada baris krama untuk mencatat pembayaran.

### Mengelola iuran

1. Di bagian **Iuran paturunan**, tambah atau edit nama iuran.
2. Set **tanggal target** jika perlu peringatan jatuh tempo.
3. Simpan perubahan.

### Mencatat pembayaran

1. Klik **Bayar** pada krama yang bersangkutan.
2. Isi jumlah, tanggal, akun keuangan, dan keterangan.
3. Konfirmasi simpan.

Pembayaran bisa berupa **wajib**, **punia**, atau kombinasi sesuai kebutuhan desa.

### Tab Riwayat

- Lihat semua transaksi paturunan.
- **Edit** atau **Hapus** (dengan konfirmasi) jika ada koreksi.

### Tab Impor

- Impor pembayaran massal dari Excel (untuk migrasi data lama).

### WhatsApp

- Tombol WhatsApp di daftar krama mengirim pesan penagihan menggunakan template di Pengaturan.

---

## 7. Krama Tamiu & Tamiu

**Menu:** Krama Tamiu & Tamiu

### Daftar pemasih

- Krama Tamiu dan Tamiu dalam satu daftar dengan filter jenis.
- Tambah pemasih baru lewat **Tambah** (pilih jenis).

### Halaman Perhatian

**Menu:** Krama Tamiu & Tamiu → **Perhatian**

Menampilkan pemasih yang:

- Masa berlakunya akan habis
- Sudah tidak aktif
- Perlu tindak lanjut dari pengurus

---

## 8. Dudukan

**Menu:** Dudukan

Modul ini mengelola iuran krama tamiu dan tamiu (pemasih).

### Tab Daftar

- Daftar pemasih per bulan berjalan.
- Filter banjar, klasifikasi, jenis, tunggakan.
- Klik **Bayar** untuk mencatat pembayaran bulan ini.

### Tab Tunggakan

- Pemasih yang masih punya sisa tagihan lintas bulan.
- Berguna untuk penagihan.

### Tab Riwayat

- Semua transaksi dudukan.
- Edit/hapus dengan konfirmasi.

### Keringanan

- Dari dialog pembayaran atau modul terkait, pengurus dapat mencatat **keringanan** (pengurangan tagihan) dengan alasan.

### Tab Impor

- Impor pembayaran dudukan massal dari Excel.

---

## 9. Keuangan

**Menu:** Keuangan

### Tab Buku Kas

- Saldo per akun keuangan.
- Klik akun untuk melihat mutasi (pemasukan & pengeluaran).

### Tab Transfer

- Pindahkan saldo antar akun kas.

### Tab Pemasukan

- Catat pemasukan non-paturunan/dudukan (donasi, bantuan, dll.).

### Tab Pengeluaran

- Catat pengeluaran kas desa.
- Pilih pos biaya dan akun sumber.

### Plafon dana dudukan

- Panel khusus untuk mengatur alokasi dana dudukan per periode.

> Pembayaran paturunan dan dudukan otomatis tercatat di buku kas saat transaksi disimpan.

---

## 10. Laporan

**Menu:** Laporan

Pintu masuk ke semua laporan. Pilih sesuai kebutuhan:

### Ringkasan & demografi

| Laporan | Kegunaan |
|---------|----------|
| **Ringkasan Eksekutif** | Gambaran gabungan untuk pengurus |
| **Rekap Krama** | Matriks krama per klasifikasi & banjar |
| **Laporan Krama Mipil** | Demografi pipil |
| **Laporan Pemasih** | Status masa berlaku pemasih |
| **Laporan Paturunan** | Tagihan & realisasi per iuran |
| **Laporan Dudukan** | Tagihan & realisasi per periode |

### Keuangan

| Laporan | Kegunaan |
|---------|----------|
| **Laporan Buku Kas** | Mutasi per akun |
| **Rekap Penerimaan Paturunan** | Per banjar/tempek/arahan |
| **Rekap Penerimaan Dudukan** | Per banjar & jenis |

### Audit & penagihan

| Laporan | Kegunaan |
|---------|----------|
| **Tunggakan Paturunan** | Daftar belum lunas |
| **Tunggakan Dudukan** | Sisa tagihan pemasih |
| **Pertimbangan Keringanan** | Review sebelum keputusan |
| **Audit Keringanan** | Riwayat keringanan yang sudah diputuskan |

Kebanyakan laporan bisa **dieksport PDF** atau dicetak dari pratinjau.

---

## 11. Pengaturan

**Menu:** Pengaturan

Halaman Pengaturan dibagi tab:

| Tab | Isi | Siapa |
|-----|-----|-------|
| **Umum** | Setup Wilayah & Desa, template WhatsApp | Admin & operator |
| **Database** | Backup, restore, kosongkan database | Admin |
| **Pengguna** | Akun staf kantor (admin/operator/viewer) | Admin |
| **Modul Online** | Langganan cloud, akun petugas, sinkronisasi | Admin (setelah aktivasi desktop) |

Tab **Modul Online** muncul setelah lisensi desktop aktif. Fitur sinkronisasi dan petugas baru tersedia setelah **langganan cloud** diaktifkan dengan kode `KSKC1...` dari vendor.

### Modul Online (opsional)

Hanya di tab **Modul Online** — bukan menu sidebar terpisah.

1. **Langganan cloud** — tempel kode `KSKC1...` dari vendor (berlangganan bulanan).
2. Setelah aktif, bagian berikut tersedia:

| Fitur | Fungsi |
|-------|--------|
| **Akun petugas lapangan** | Buat username petugas HP, hubungkan ke tim kasukretan |
| **Sinkronisasi cloud** | Kirim/tarik data ke server API |

### Database (tab Database)

- **Backup** — simpan salinan database ke file `.db`
- **Restore** — pulihkan dari backup
- **Kosongkan** — hapus semua data (hati-hati, butuh konfirmasi khusus)

Lakukan backup berkala, terutama sebelum update aplikasi atau operasi besar.

### Pengguna (tab Pengguna)

- Tambah, ubah, nonaktifkan akun staf kantor.
- Atur peran: admin, operator, atau viewer.

### Setup Wilayah & Desa

- Lihat bagian 4.1 di atas.

### Template WhatsApp

- Sesuaikan teks pesan penagihan paturunan/dudukan.
- Placeholder seperti nama krama dan jumlah tunggakan diisi otomatis.

---

## 12. Modul Online — Petugas Lapangan

> Modul ini diakses lewat **browser HP**, bukan aplikasi desktop. URL diberikan vendor, misalnya:  
> `https://nama-desa.pages.dev/petugas/login`

### Login petugas

1. Buka URL petugas di browser HP.
2. Login dengan akun petugas yang dibuat di desktop (**Pengaturan → tab Modul Online → Akun petugas lapangan**).
3. Akun harus sudah **dikirim ke cloud** dari desktop kantor.

### Beranda petugas

Periksa **Kesiapan cloud** — semua item harus hijau:

- Banjar
- Tim petugas
- Krama
- Akun keuangan

Jika merah, kantor belum selesai kirim master/krama ke cloud.

### Paturunan (petugas)

1. Pilih **Paturunan** dari beranda.
2. Filter banjar & iuran.
3. Cari krama by nama/nomor kartu, atau tap **Scan** untuk baca QR kartu.
4. Tap krama → isi jumlah bayar, tanggal, akun kas.
5. Simpan — data masuk ke cloud.

### Dudukan (petugas)

1. Pilih **Dudukan** dari beranda.
2. Pilih bulan, banjar, petugas (otomatis terisi jika akun terhubung ke tim).
3. Cari pemasih atau scan QR kartu.
4. Catat pembayaran.

### Setelah petugas selesai

Di **desktop kantor** → **Pengaturan → tab Modul Online → Sinkronisasi cloud**:

1. Klik **Tarik dari cloud** (atau sinkron dua arah).
2. Pembayaran petugas masuk ke database desktop.
3. Cek di tab **Riwayat** Paturunan/Dudukan.

---

## 13. Modul Online — Portal Krama

> Opsional. Krama membuka browser untuk cek tunggakan sendiri.  
> URL: `https://nama-desa.pages.dev/portal/login`

1. Krama login dengan akun portal (dibuat & dikirim dari desktop).
2. Semua krama dapat melihat **kartu Pipil/Pemasih** digital (anggota aktif).
3. **Krama Mipil** melihat tunggakan paturunan.
4. **Pemasih** melihat tunggakan dudukan.

Portal bersifat **baca saja** — pembayaran tetap dicatat oleh kantor atau petugas.

---

## 14. Sinkronisasi Cloud (Desktop)

**Menu:** Pengaturan → tab **Modul Online** → **Sinkronisasi cloud**

### Persiapan

1. Isi **URL API cloud** (contoh: `https://kasukretan-api.onrender.com/api`).
   - Bukan URI Postgres / Supabase.
2. **Simpan** URL.
3. **Login ke API** dengan akun admin cloud.

### Urutan pertama kali

```
1. Kirim master ke cloud
2. Kirim krama ke cloud
3. Cek isi cloud (banjar, krama, tim harus > 0)
4. Kirim akun petugas (dari panel Akun petugas lapangan)
```

### Operasional harian

| Aksi | Kapan |
|------|-------|
| **Kirim master** | Ada perubahan banjar, iuran, tim, akun |
| **Kirim krama** | Ada krama baru atau perubahan data krama |
| **Tarik dari cloud** | Setelah petugas input di lapangan |
| **Kirim ke cloud** | Jika kantor input pembayaran yang perlu tampil di petugas |

> API gratis Render bisa **lambat ±1 menit** saat pertama kali diakses setelah idle (cold start). Tunggu sebentar lalu coba lagi.

---

## 15. Alur Kerja Harian

### Kantor saja (tanpa petugas HP)

```
Input krama / pembayaran di desktop
    → Cek laporan & buku kas
    → Backup database berkala
```

### Kantor + petugas lapangan

```
Pagi: pastikan cloud siap (kesiapan hijau di HP petugas)
    ↓
Petugas: input pembayaran di lapangan
    ↓
Sore: kantor tarik dari cloud
    ↓
Kantor: cek riwayat, laporan, buku kas
```

---

## 16. Tips & Kebiasaan Baik

1. **Backup rutin** — minimal mingguan, atau sebelum update aplikasi.
2. **Jangan ubah kode wilayah** setelah ada krama — buat desa baru dengan instalasi terpisah jika salah.
3. **Viewer** cocok untuk pengurus yang hanya perlu melihat laporan.
4. **Operator** untuk staf yang input harian; **admin** untuk pengaturan sistem.
5. **Tutup aplikasi** sebelum menjalankan installer update.
6. **Ganti password default** akun API cloud sebelum operasional.

---

## 17. Pertanyaan Umum (FAQ)

### Login gagal

- Periksa username/password.
- Pastikan akun masih aktif (admin bisa cek di Pengaturan → tab Pengguna).

### Nomor kartu tidak muncul

- Wilayah belum lengkap di Pengaturan.
- Status harus "Siap terbit nomor kartu".

### Petugas HP: cloud merah

- Desktop belum kirim master dan krama ke cloud.
- URL API salah atau server sedang cold start.

### Tarik dari cloud kosong

- Petugas belum input, atau belum login akun petugas yang benar.
- Coba sinkron ulang setelah beberapa menit.

### Viewer tidak bisa tambah krama

- Memang dibatasi. Minta admin mengubah peran ke operator.

### Data hilang setelah update aplikasi

- Data tersimpan terpisah dari folder program. Restore dari backup jika perlu.

### WhatsApp tidak terbuka

- Pastikan nomor kontak krama sudah diisi.
- Periksa template di Pengaturan → tab Umum → Template WhatsApp.

---

## 18. Dokumen Terkait

| Dokumen | Isi |
|---------|-----|
| [LEMBAR-KERJA-INSTALASI.md](./LEMBAR-KERJA-INSTALASI.md) | Checklist instalasi per desa |
| [GO-LIVE-ONLINE.md](./GO-LIVE-ONLINE.md) | Go-live lengkap: Supabase → Hugging Face → Cloudflare |
| [DEPLOY-PETUGAS.md](./DEPLOY-PETUGAS.md) | Referensi modul Petugas & alternatif hosting API |
| [DEPLOY-HUGGINGFACE-API.md](./DEPLOY-HUGGINGFACE-API.md) | Detail teknis API Hugging Face |
| [LICENSE.md](./LICENSE.md) | Aktivasi lisensi & kode mesin |

---

*Kasukretan Krama — Panduan Pengguna. Sesuaikan kebijakan operasional dengan adat dan keputusan pengurus desa adat Anda.*
