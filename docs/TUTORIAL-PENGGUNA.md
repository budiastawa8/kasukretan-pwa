# Tutorial Pengguna — Kasukretan Krama

Panduan **langkah demi langkah** untuk mengoperasikan aplikasi **Kasukretan Krama** tanpa tersesat — dari instalasi pertama hingga operasional harian.

> Referensi cepat per modul: [PANDUAN-PENGGUNA.md](./PANDUAN-PENGGUNA.md)  
> Instalasi teknis: [LEMBAR-KERJA-INSTALASI.md](./LEMBAR-KERJA-INSTALASI.md)

---

## Daftar Isi

0. [Peta Aplikasi — baca ini dulu](#0-peta-aplikasi--baca-ini-dulu)
1. [Mengenal Aplikasi & Peran](#1-mengenal-aplikasi--peran)
2. [Membuka, Login & Navigasi](#2-membuka-login--navigasi)
3. [Checklist Setup Pertama Kali](#3-checklist-setup-pertama-kali)
4. [Dashboard — Titik Awal Harian](#4-dashboard--titik-awal-harian)
5. [Pengaturan (4 Tab)](#5-pengaturan-4-tab)
6. [Master Data (7 Tab)](#6-master-data-7-tab)
7. [Krama Mipil](#7-krama-mipil)
8. [Krama Tamiu & Tamiu (Pemasih)](#8-krama-tamiu--tamiu-pemasih)
9. [Paturunan (Iuran Mipil)](#9-paturunan-iuran-mipil)
10. [Dudukan (Iuran Pemasih)](#10-dudukan-iuran-pemasih)
11. [Keuangan](#11-keuangan)
12. [Lembaga/Badan & IPMA](#12-lembagabadan--ipma)
13. [Laporan & Surat Resmi](#13-laporan--surat-resmi)
14. [Modul Online (Opsional)](#14-modul-online-opsional)
15. [Alur Harian & “Saya Ingin…”](#15-alur-harian--saya-ingin)
16. [Jika Tersesat / FAQ](#16-jika-tersesat--faq)

---

## 0. Peta Aplikasi — baca ini dulu

Aplikasi desktop punya **menu sisi kiri**. Setiap menu bisa punya **tab** atau **sub-halaman** di area kanan.

### Menu utama (sidebar)

```
Dashboard          ← ringkasan & peringatan
Krama Mipil        ← daftar keluarga mipil (NPK)
Paturunan          ← iuran & bayar mipil
Krama Tamiu & Tamiu← daftar pemasih (NPKT / NPT)
Dudukan            ← iuran bulanan pemasih
Lembaga/Badan      ← usaha & surat IPMA
Keuangan           ← buku kas
Laporan            ← PDF, tunggakan, arsip surat
Master Data        ← banjar, jenis, akun, profil
Pengaturan         ← wilayah, backup, user, cloud
```

### Tab di dalam setiap menu

| Menu | Tab / bagian dalam halaman |
|------|----------------------------|
| **Krama Mipil** | `Daftar` · `Impor` — plus sub-tab `Aktif` / `Nonaktif` |
| **Krama Tamiu & Tamiu** | `Daftar` · `Impor` — plus `Aktif` / `Nonaktif` · link **Perhatian** |
| **Paturunan** | `Daftar` · `Riwayat` · `Impor` |
| **Dudukan** | `Daftar` · `Tunggakan` · `Riwayat` · `Impor` |
| **Keuangan** | `Buku Kas` · `Transfer` · `Pemasukan` · `Pengeluaran` |
| **Master Data** | `Wilayah` · `Jenis Krama` · `ILIKITA & Masa Berlaku` · `Profil Desa` · `Tim Kasukretan` · `Akun & Pos` · `Impor/Ekspor` |
| **Pengaturan** | `Umum` · `Database` · `Pengguna` · `Modul Online`* |

\* Tab **Modul Online** hanya muncul untuk **admin** jika lisensi cloud aktif.

### Alur data (hubungan antar modul)

```
Pengaturan (kode wilayah)
       ↓
Master Data (banjar, jenis, akun, tarif)
       ↓
Krama Mipil / Pemasih  ←── input keluarga
       ↓
Paturunan / Dudukan    ←── catat iuran & bayar
       ↓
Keuangan (Buku Kas)    ←── otomatis dari bayar + input manual
       ↓
Laporan                ←── cetak PDF & surat
```

### Urutan wajib sebelum operasional

```
① Pengaturan → Umum        (kode wilayah desa)
② Master Data              (banjar → jenis → akun → profil)
③ Krama Mipil / Pemasih    (input atau impor data)
④ Paturunan                (buat iuran, catat bayar)
⑤ Dudukan                  (tagihan bulanan pemasih)
⑥ (Opsional) Modul Online  (petugas HP + cloud)
```

> **Jangan loncat urutan.** Tanpa langkah ①–②, nomor kartu tidak bisa diterbitkan dan pembayaran tidak punya akun kas tujuan.

---

## 1. Mengenal Aplikasi & Peran

### Tiga bagian aplikasi

| Bagian | Perangkat | Fungsi |
|--------|-----------|--------|
| **Desktop kantor** | PC Windows (Tauri) | Operasional utama — data lokal SQLite |
| **Modul Petugas** | Browser HP | Input bayar di lapangan (opsional) |
| **Portal Krama** | Browser krama | Cek tunggakan sendiri — baca saja (opsional) |

### Peran staf desktop

| Peran | Bisa | Tidak bisa |
|-------|------|------------|
| **Administrator** | Semua fitur + backup, user, modul online | — |
| **Operator** | Input & ubah krama, bayar, keuangan, master | Pengaturan Database/Pengguna/Online |
| **Viewer** | Lihat semua modul | Tambah/edit krama, bayar, ubah master |

---

## 2. Membuka, Login & Navigasi

### 2.1 Aktivasi (sekali saja)

1. Buka aplikasi dari shortcut desktop.
2. PC baru mendapat **trial gratis 30 hari** otomatis — bisa dipakai langsung.
3. Tempel kode lisensi `KSK2...` dari vendor (banner trial, Pengaturan → Tentang, atau layar Aktivasi setelah trial habis).
4. Satu kode berlaku untuk desa ini (maks. 2 mesin). Setelah sukses → layar **Login**.

### 2.2 Login

1. Username + password → **Masuk**.
2. Akun baru? Layar **Ganti password wajib** muncul dulu → isi password baru → **Simpan**.
3. Anda masuk ke **Dashboard**.

### 2.3 Anatomi layar

```
┌──────────────────┬─────────────────────────────────────────┐
│ Kasukretan Krama │                                         │
│ Desa Adat [nama] │  [Judul halaman]                        │
│                  │  [Tab tab tab]  ← jika ada              │
│ ▶ Dashboard      │  [Filter / tombol aksi]                 │
│   Krama Mipil    │  [Tabel / form / kartu]                 │
│   ...            │                                         │
│                  │                                         │
│ [Nama · peran]   │                                         │
│ [Keluar]         │                                         │
└──────────────────┴─────────────────────────────────────────┘
```

**Tips navigasi:**
- Klik **nama menu** di kiri untuk pindah modul.
- Di dalam halaman, cari **bar tab** (tombol kecil berdampingan) — itu sub-bagian modul.
- Tombol **Kembali ke daftar** / **←** mengembalikan ke list sebelumnya.
- **Keluar** = logout; data sudah tersimpan otomatis.

### 2.4 Pola umum di setiap daftar

Hampir semua halaman daftar (Krama, Paturunan, Dudukan) punya pola sama:

1. **Kolom cari** — ketik nama atau nomor kartu (NPK/NPKT/NPT).
2. **Filter** — banjar, tempek, jenis (filter tempek muncul setelah banjar dipilih).
3. **Chip statistik** — ringkasan angka di atas tabel.
4. **Pagination** — navigasi halaman bawah tabel.
5. **Ikon aksi per baris:**
   - 👁 **Mata** = lihat detail (baca saja)
   - ✏️ **Pensil** = edit (operator/admin)
   - 💬 **WhatsApp** = kirim pesan penagihan (jika nomor terisi)

---

## 3. Checklist Setup Pertama Kali

Centang berurutan. Jangan lanjut ke langkah berikutnya sebelum langkah sebelumnya selesai.

### ☐ Langkah 1 — Kode wilayah desa

**Menu:** Pengaturan → tab **Umum**

| Field | Format |
|-------|--------|
| Kode kabupaten | 2 digit |
| Kode kecamatan | 2 digit |
| Kode desa adat | 4 digit |
| Nama-nama wilayah | teks bebas |

→ **Simpan** → pastikan status **"Siap terbit nomor kartu"**.

> Kode wilayah **tidak bisa diubah** setelah ada krama terdaftar.

### ☐ Langkah 2 — Profil desa (logo & prajuru)

**Menu:** Master Data → tab **Profil Desa**

- Logo desa + logo MDA (untuk cetak)
- Nama Bandesa, Panyarikan, tanda tangan (untuk surat PDF)
- Alamat desa, call center

### ☐ Langkah 3 — Wilayah banjar

**Menu:** Master Data → tab **Wilayah**

```
Pilih Banjar → + Tambah Tempek → pilih Tempek → + Tambah Arahan
```

Ulangi untuk semua banjar.

### ☐ Langkah 4 — Jenis krama & tarif

**Menu:** Master Data → tab **Jenis Krama**

- Jenis Krama Mipil (+ persen paturunan per jenis)
- Jenis Krama Tamiu (+ nominal dudukan)
- Jenis Tamiu (+ nominal dudukan)

### ☐ Langkah 5 — Akun keuangan

**Menu:** Master Data → tab **Akun & Pos**

Minimal buat:
- 1 akun **Dana Paturunan** (mis. Kas Paturunan)
- 1 akun **Dana Dudukan** (mis. Kas Dudukan)

### ☐ Langkah 6 — Tim kasukretan (jika pakai petugas HP)

**Menu:** Master Data → tab **Tim Kasukretan**

### ☐ Langkah 7 — Input krama

**Menu:** Krama Mipil → **Tambah Krama Mipil** (atau impor Excel)

### ☐ Langkah 8 — Buat iuran paturunan

**Menu:** Paturunan → tab Daftar → panel **Iuran paturunan** → **+ Tambah iuran**

### ☐ Langkah 9 — Backup pertama

**Menu:** Pengaturan → tab **Database** → **Backup**

---

## 4. Dashboard — Titik Awal Harian

**Menu:** Dashboard (halaman pertama setelah login)

### Apa yang ditampilkan

| Bagian | Kegunaan |
|--------|----------|
| **Kartu Krama aktif** | Jumlah Mipil / Krama Tamiu / Tamiu — klik untuk ke daftar |
| **Grafik jenis mipil** | Komposisi krama per jenis |
| **Pemasih per banjar** | Distribusi pemasih |
| **Saldo, Paturunan, Dudukan** | Ringkasan keuangan bulan ini |
| **Panel "Perlu perhatian"** | Peringatan yang perlu tindakan |

### Panel "Perlu perhatian" — klik langsung ke solusi

| Peringatan | Klik menuju |
|------------|-------------|
| Konfigurasi desa belum lengkap | Pengaturan |
| Pemasih akan habis (≤ 30 hari) | Krama Tamiu → Perhatian |
| Pemasih tidak aktif | Krama Tamiu → Perhatian |
| Tunggak paturunan | Laporan → Tunggakan Paturunan |
| Tunggak dudukan | Laporan → Tunggakan Dudukan |

### Tombol cepat di Dashboard

- **+ Krama Mipil** — tambah mipil baru
- **+ Krama Tamiu** / **+ Tamiu** — tambah pemasih
- **Muat ulang** — refresh angka terbaru

**Kebiasaan baik:** mulai hari kerja dari Dashboard → cek panel perhatian → kerjakan item yang merah/kuning dulu.

---

## 5. Pengaturan (4 Tab)

**Menu:** Pengaturan

Bar tab di bagian atas halaman:

### Tab Umum

| Isi | Siapa |
|-----|-------|
| Setup Wilayah & Desa | Admin & operator (viewer hanya lihat) |
| Template WhatsApp | Admin & operator |

**Template WhatsApp** — teks pesan penagihan paturunan/dudukan. Placeholder `{nama}`, `{tunggakan}` diisi otomatis saat kirim.

### Tab Database (admin saja)

| Tombol | Fungsi |
|--------|--------|
| **Backup** | Simpan salinan `.db` ke folder pilihan |
| **Restore** | Pulihkan dari file backup (butuh password admin + ketik `RESTORE`) |
| **Kosongkan database** | Hapus semua data (sangat hati-hati — ketik `KOSONGKAN`) |
| **Hapus riwayat paturunan** | Hapus semua pembayaran paturunan saja |

> Backup **minimal mingguan**, atau sebelum update aplikasi.

### Tab Pengguna (admin saja)

- Tambah / edit / nonaktifkan akun staf
- Atur peran: admin, operator, viewer
- Reset password

### Tab Modul Online (admin + lisensi cloud)

Lihat [Bagian 14](#14-modul-online-opsional) untuk detail lengkap.

URL langsung: `/pengaturan?tab=online`

---

## 6. Master Data (7 Tab)

**Menu:** Master Data

### Tab Wilayah

**Alur UI (penting — jangan terbalik):**

1. Klik banjar di daftar kiri → muncul daftar tempek
2. Klik tempek → muncul daftar arahan
3. Tombol **+** di setiap level untuk tambah

```
Banjar Sukawati
  └── Tempek Puseh
        ├── Arahan Utara
        └── Arahan Selatan
```

Edit/hapus via ikon pensil/tong sampah di setiap baris.

### Tab Jenis Krama

Tiga sub-bagian dalam satu tab:
- **Jenis Krama Mipil** — nama + **% paturunan** (menentukan tagihan di modul Paturunan)
- **Jenis Krama Tamiu** — nama + **nominal dudukan/bulan**
- **Jenis Tamiu** — nama + **nominal dudukan/bulan**

### Tab ILIKITA & Masa Berlaku

Atur sebelum menerbitkan surat atau perpanjang pemasih:
- Masa berlaku Pipil per jenis mipil
- Masa berlaku Pemasih per jenis (Krama Tamiu / Tamiu)
- Kebijakan **perpanjangan otomatis** pemasih (terpisah: Krama Tamiu / Tamiu)
- **Tarif administrasi ILIKITA** (biaya perpanjangan)
- Riwayat perpanjangan pemasih (arsip)

### Tab Profil Desa

Logo, prajuru, ketentuan nyada/luput, batas umur yowana/wredha — lihat [Langkah 2 checklist](#-langkah-2--profil-desa-logo--prajuru).

### Tab Tim Kasukretan

Nama petugas lapangan + banjar penugasan. Wajib jika pakai modul petugas HP.

### Tab Akun & Pos

| Jenis | Contoh | Dipakai di |
|-------|--------|------------|
| Akun — Dana Paturunan | Kas Tunai Paturunan | Bayar paturunan |
| Akun — Dana Dudukan | Kas Tunai Dudukan | Bayar dudukan |
| Akun — Kasukretan Lainnya | Kas Umum | Pemasukan/pengeluaran lain |
| Pos pemasukan | Donasi, Bantuan | Keuangan → Pemasukan |
| Pos biaya | Operasional kantor | Keuangan → Pengeluaran |

### Tab Impor/Ekspor

Unduh template Excel → isi → impor untuk: wilayah, jenis, tim, akun, dll.

---

## 7. Krama Mipil

**Menu:** Krama Mipil

### 7.1 Daftar krama

**Tab Daftar** (default):
- Sub-tab **Aktif** / **Nonaktif**
- Filter: cari, banjar → tempek → arahan, jenis mipil
- Tombol **Tambah Krama Mipil** (kanan atas)
- **Ekspor Excel** — unduh data sesuai filter

**Tab Impor:**
- Impor krama massal dari Excel
- Impor anggota keluarga per krama

### 7.2 Tambah krama mipil baru

**Krama Mipil → Tambah Krama Mipil**

Form **satu halaman** (bukan wizard multi-langkah). Isi berurutan:

**Bagian Identitas & status**
- Jenis Krama Mipil (dropdown)
- Tanggal pencatatan
- % Paturunan (otomatis dari jenis)

**Bagian Wilayah & kontak**
- Banjar → Tempek → Arahan (berurutan, tempek muncul setelah banjar dipilih)
- Alamat / RT-BTN
- Nomor telepon / WhatsApp ← **penting untuk penagihan**

**Bagian Anggota keluarga**
1. Klik **+ Tambah anggota** → isi dialog (nama, tanggal lahir, hubungan, dll.)
2. Ulangi untuk semua anggota
3. Pilih **Pengarep** (kepala krama) dari dropdown anggota

**Simpan:**
- Klik **Simpan kartu** (kanan atas)
- NPK diterbitkan otomatis

> Jika NPK tidak muncul → kembali ke [Setup Wilayah](#-langkah-1--kode-wilayah-desa).

### 7.3 Halaman detail krama

**Krama Mipil → klik baris / ikon mata**

| Area | Isi |
|------|-----|
| Atas | **Kembali ke daftar** · **Edit data krama** |
| Pratinjau Pipil | Lembar data keluarga |
| Tombol cetak | **Surat Keterangan** · **Surat Pindah** · **Buka PDF Pipil** · **Buka PDF Kartu Krama Adat** |
| Panel anggota | Impor/ekspor anggota Excel |
| Portal Krama | Atur PIN portal (jika modul online aktif) |

### 7.4 Cetak Pipil & kartu

1. Detail krama → **Buka PDF Pipil** atau **Buka PDF Kartu Krama Adat**
2. Tab browser baru terbuka (pratinjau cetak)
3. **Ctrl+P** atau tombol cetak browser → pilih printer / Simpan PDF

Kartu fisik: 8,5 × 5 cm per sisi, 4 pasang per lembar A4.

### 7.5 Edit data krama

**Detail → Edit data krama**

- Ubah field → **Simpan perubahan**
- Tambah/hapus anggota lewat tabel anggota → **Simpan perubahan** (wajib — perubahan anggota belum ke database sebelum simpan)

### 7.6 Nonaktifkan krama (meninggal / pindah keluar desa)

**Edit data krama → ubah Status krama → Nonaktif**

- Pilih alasan (meninggal, pindah, dll.)
- Konfirmasi dialog

Krama nonaktif total: tidak muncul di tab Aktif, peringatan pemasih non relevan.

### 7.7 Keluar pipil intra-desa (pindah antar KK dalam desa)

**Edit krama mipil → tombol Keluar Pipil** (jika tersedia)

Alur:
1. Pilih anggota yang keluar
2. Pilih alur: **gabung ke KK lain** atau **dirikan KK baru**
3. Pilih krama tujuan (jika gabung)
4. Konfirmasi — NIKA/anggota dipindahkan otomatis

### 7.8 Reaktivasi krama nonaktif

**Krama Mipil → tab Nonaktif → ikon reaktivasi** pada baris krama.

---

## 8. Krama Tamiu & Tamiu (Pemasih)

**Menu:** Krama Tamiu & Tamiu

Struktur daftar sama dengan Krama Mipil (Aktif/Nonaktif, Daftar/Impor, filter).

### 8.1 Tambah pemasih

**Krama Tamiu & Tamiu → Tambah → pilih Krama Tamiu atau Tamiu**

Form serupa mipil:
- Jenis, tanggal pencatatan (menentukan masa berlaku)
- Wilayah + kontak
- Anggota → pilih **Pengajeg**
- **Simpan kartu** → NPKT (Krama Tamiu) atau NPT (Tamiu)

### 8.2 Masa berlaku & peringatan

| Status | Arti | Tindakan |
|--------|------|----------|
| **Aktif** | Masa berlaku masih jalan | — |
| **Akan habis** (≤ 30 hari) | Peringatan kuning | Siapkan perpanjangan |
| **Tidak aktif** | Masa berlaku lewat | **Perpanjang Pemasih** |

### 8.3 Perpanjang pemasih

**Detail pemasih → Perpanjang Pemasih**

1. Isi tanggal perpanjangan
2. Biaya admin ILIKITA (jika desa mengenakan)
3. Pilih akun keuangan penerima
4. **Simpan** → status kembali aktif

### 8.4 Halaman Perhatian

**Krama Tamiu & Tamiu → Perhatian** (atau dari Dashboard → panel peringatan)

Filter:
- **Semua** — `/krama-pemasih/perhatian`
- **Akan habis** — `?filter=akan-habis`
- **Tidak aktif** — `?filter=tidak-aktif`

Klik baris → detail pemasih → tindak lanjut.

### 8.5 Cetak pemasih & jadwal dudukan

**Detail pemasih → tombol cetak:**

| Tombol | Hasil |
|--------|-------|
| Buka PDF Pemasih | Lembar data pemasih |
| Buka PDF Kartu Krama Tamiu / Tamiu | Kartu + QR |
| Buka PDF Jadwal Dudukan | Jadwal iuran per bulan |

---

## 9. Paturunan (Iuran Mipil)

**Menu:** Paturunan

Tagihan = **nominal iuran × % jenis krama mipil** (atur % di Master → Jenis Krama).

### 9.1 Tab Daftar

**Panel atas — Iuran paturunan:**
1. **+ Tambah iuran** → nama, nominal wajib, tanggal target (opsional)
2. Pilih iuran aktif dari dropdown (menentukan kolom tagihan di tabel)
3. Edit/hapus iuran via ikon pensil/tong sampah

**Tabel krama:**
- Filter: banjar, tempek, jenis, status bayar
- Kolom: tagihan, terbayar wajib, punia, sisa, status badge
- **Bayar** — catat pembayaran
- **WhatsApp** — kirim penagihan

### 9.2 Mencatat pembayaran

1. Cari krama (NPK / nama)
2. Klik **Bayar**
3. Dialog:

   | Field | Keterangan |
   |-------|------------|
   | Iuran | Pilih dari iuran aktif |
   | Wajib | Nominal iuran wajib |
   | Punia | Sukarela (opsional) |
   | Tanggal | Tanggal bayar |
   | Akun keuangan | Kas paturunan |
   | Keterangan | Opsional |

4. **Simpan** → otomatis masuk **Keuangan → Buku Kas**

### 9.3 Tab Riwayat

Semua transaksi paturunan. **Edit** / **Hapus** untuk koreksi (konfirmasi dialog).

### 9.4 Tab Impor

Impor pembayaran massal dari Excel (migrasi data lama).

---

## 10. Dudukan (Iuran Pemasih)

**Menu:** Dudukan

Iuran **bulanan** Krama Tamiu & Tamiu. Tarif dari Master → Jenis Krama.

> Tagihan pemasih **pencatatan sampai Mei 2026**: mulai **bulan kalender berikutnya** setelah pencatatan. **Dari Juni 2026**: mulai **7 hari setelah tanggal pencatatan**. Boleh bayar di muka sampai akhir masa berlaku.

### 10.1 Tab Daftar

1. Pilih **bulan & tahun** (default: bulan berjalan)
2. Filter: banjar, RT/BTN, klasifikasi, jenis, tunggakan
3. Chip ringkasan: total tagihan, terkumpul, sisa
4. **Bayar** per baris pemasih
5. **Cetak kartu dudukan** — massal sesuai filter (ada batas batch)

### 10.2 Mencatat pembayaran

1. **Bayar** pada baris pemasih
2. Isi periode, jumlah, tanggal, akun kas dudukan, petugas (opsional)
3. **Simpan**

### 10.3 Tab Tunggakan

Pemasih dengan sisa tagihan lintas bulan — untuk penagihan intensif.

- Filter banjar/jenis
- **WhatsApp** per baris
- Akses **Keringanan** dari dialog bayar

### 10.4 Keringanan

Dari dialog pembayaran → opsi keringanan → isi nominal, alasan, periode.

Review sebelum keputusan: **Laporan → Pertimbangan Keringanan**  
Arsip keputusan: **Laporan → Audit Keringanan**

### 10.5 Tab Riwayat & Impor

Sama pola dengan Paturunan — riwayat transaksi + impor Excel.

---

## 11. Keuangan

**Menu:** Keuangan

### 11.1 Tab Buku Kas (default)

**Panel saldo atas** — klik akun untuk fokus mutasi akun tersebut.

**Tabel mutasi:**
- Filter tanggal
- Kolom: tanggal, keterangan, pemasukan, pengeluaran, saldo
- Sumber otomatis: paturunan, dudukan, perpanjangan pemasih

> **Tidak perlu** input ulang pembayaran iuran — sudah otomatis.

### 11.2 Tab Transfer

Pindahkan saldo antar akun kas (mis. tunai → rekening BPD).

### 11.3 Tab Pemasukan

Pemasukan **non-iuran**: donasi, bantuan, biaya admin manual, dll.

**+ Tambah pemasukan** → tanggal, jumlah, pos pemasukan, akun tujuan.

### 11.4 Tab Pengeluaran

**+ Tambah pengeluaran** → tanggal, jumlah, pos biaya, akun sumber.

### 11.5 Plafon dana dudukan

Panel di halaman Keuangan — alokasi dana dudukan per periode (jika desa membatasi penggunaan).

---

## 12. Lembaga/Badan & IPMA

**Menu:** Lembaga/Badan

### 12.1 Daftarkan lembaga

**+ Tambah** → isi:
- Nama lembaga/badan
- Sektor utama
- Alamat, kontak
- **Krama penanggung jawab** (cari & pilih NPK mipil)

### 12.2 Terbitkan IPMA (Mautsaha Adat)

Hanya untuk sektor **Swasta Komersial**:

1. Baris lembaga → **Terbit IPMA** / ikon surat
2. Isi tanggal, masa berlaku, detail usaha
3. **Terbitkan** → PDF + arsip otomatis

Cetak ulang: **Laporan → Surat IPMA (Mautsaha Adat)**

### 12.3 Status IPMA

| Badge | Arti |
|-------|------|
| Berlaku | Masih aktif |
| Perlu perpanjang | Akan habis |
| Kedaluwarsa | Sudah lewat |
| Belum terbit | Belum ada IPMA |

---

## 13. Laporan & Surat Resmi

**Menu:** Laporan

Halaman hub dengan kategori kartu. Klik kartu → halaman filter → **Pratinjau PDF** / **Export**.

### 13.1 Kategori laporan

| Kategori | Contoh laporan |
|----------|----------------|
| **Ringkasan** | Ringkasan Eksekutif |
| **Data krama & iuran** | Rekap Krama, Laporan Mipil, Pemasih, Paturunan, Dudukan |
| **Keuangan** | Buku Kas, Rekap Penerimaan Paturunan/Dudukan |
| **Tunggakan & penagihan** | Tunggakan Paturunan/Dudukan, Surat Penagihan Dudukan |
| **Surat resmi (arsip)** | SKK, SKP, IPMA |
| **Keringanan** | Pertimbangan, Audit Keringanan |

### 13.2 Pola umum generate laporan

1. **Laporan** → pilih kartu laporan
2. Atur filter (banjar, periode, iuran, dll.)
3. **Pratinjau** → tab browser baru
4. Cetak / Simpan PDF

### 13.3 Surat Keterangan Krama (SKK)

**Cara terbit baru:**
- Detail krama mipil → **Surat Keterangan** → pilih anggota, tujuan, tanggal → **Terbitkan**

**Cetak ulang:**
- Laporan → Surat Keterangan Krama → cari arsip → cetak

### 13.4 Surat Keterangan Pindah (SKP)

Detail krama mipil → **Surat Pindah** → keluarga penuh atau anggota tertentu → **Terbitkan**

Arsip: Laporan → Surat Keterangan Pindah

### 13.5 Surat Penagihan Dudukan (SP)

Untuk pemasih tunggakan ≥ 3 bulan:

**Laporan → Surat Penagihan Dudukan** → filter → pilih pemasih → **Buat surat**

---

## 14. Modul Online (Opsional)

> Lewati seluruh bagian ini jika desa **hanya pakai desktop** tanpa petugas HP.

### 14.1 Tab Modul Online

**Pengaturan → tab Modul Online** (hanya admin + lisensi cloud)

Dua panel utama:

**A. Akun petugas lapangan**
- Buat username/password petugas
- Hubungkan ke Tim Kasukretan
- **Kirim akun petugas ke cloud**

**B. Sinkronisasi cloud**

| Langkah | Tombol | Kapan |
|---------|--------|-------|
| Setup | Simpan URL API → Login ke API | Sekali |
| 1 | Kirim master ke cloud | Ada perubahan banjar/jenis/akun/tim |
| 2 | Kirim krama ke cloud | Krama baru / edit data |
| 3 | Kirim portal ke cloud | Setelah atur PIN portal krama |
| 4 | Kirim akun petugas ke cloud | Setelah buat/edit akun petugas |
| 5 | **Tarik dari cloud** | Sore hari — ambil bayar petugas HP |
| Opsional | Kirim ke cloud | Bayar dari kantor yang perlu tampil di HP |
| Cek | Cek isi cloud | Verifikasi jumlah data |

### 14.2 Portal krama (PIN per NPK)

**Detail krama → panel Portal Krama (opsional)** (accordion)

1. Atur PIN 4–8 digit → **Simpan PIN**
2. **Aktifkan** portal
3. **Kirim portal ke cloud** (dari tab Modul Online)

Krama login di `/portal/login` dengan NPK + PIN — **baca saja** (lihat tunggakan).

### 14.3 Petugas lapangan (HP)

1. Buka URL petugas di browser HP
2. Login akun petugas
3. Beranda → **Kesiapan cloud** harus hijau
4. **Paturunan** — filter banjar → cari / scan QR → bayar
5. **Dudukan** — pilih bulan & banjar → cari / scan QR → bayar

### 14.4 Siklus harian kantor + petugas

```
Pagi   : Kirim master/krama jika ada perubahan
         Petugas cek HP (kesiapan hijau)
Siang  : Petugas input bayar di lapangan
Sore   : Kantor → Tarik dari cloud
         Cek Paturunan/Dudukan → Riwayat
         Cek Keuangan → Buku Kas
```

---

## 15. Alur Harian & “Saya Ingin…”

### Peta keputusan cepat

| Saya ingin… | Mulai dari… |
|-------------|-------------|
| Lihat apa yang perlu dikerjakan hari ini | **Dashboard** → panel Perlu perhatian |
| Tambah keluarga mipil baru | **Krama Mipil** → Tambah Krama Mipil |
| Tambah pemasih baru | **Krama Tamiu & Tamiu** → Tambah |
| Catat bayar iuran mipil | **Paturunan** → Daftar → Bayar |
| Catat bayar iuran pemasih bulan ini | **Dudukan** → Daftar → Bayar |
| Cek saldo kas desa | **Keuangan** → Buku Kas |
| Cetak kartu krama | Detail krama → Buka PDF Kartu |
| Terbit surat keterangan | Detail mipil → Surat Keterangan |
| Lihat tunggakan | **Laporan** → Tunggakan Paturunan / Dudukan |
| Perpanjang pemasih habis | **Perhatian** → detail → Perpanjang Pemasih |
| Backup data | **Pengaturan** → Database → Backup |
| Ambil data dari petugas HP | **Pengaturan** → Modul Online → Tarik dari cloud |
| Atur staf kantor | **Pengaturan** → Pengguna |
| Ubah tarif dudukan | **Master Data** → Jenis Krama |
| Buat iuran ngaben/paturunan baru | **Paturunan** → + Tambah iuran |

### Skenario A — Kantor saja

```
Pagi  : Dashboard → perhatian → input/bayar
Siang : Surat & perpanjangan pemasih jika diminta
Sore  : Buku kas + backup mingguan
```

### Skenario B — Kantor + petugas HP

```
Pagi  : Pastikan cloud siap (master/krama terkirim)
Siang : Petugas bayar di lapangan
Sore  : Tarik dari cloud → verifikasi riwayat & buku kas
```

### Checklist mingguan admin

- [ ] Backup (**Pengaturan → Database**)
- [ ] Cek **Perhatian** pemasih
- [ ] Review **Tunggakan Paturunan** & **Tunggakan Dudukan**
- [ ] Kirim master/krama ke cloud jika ada perubahan

---

## 16. Jika Tersesat / FAQ

### “Saya tidak tahu harus mulai dari mana”

→ Baca [Bagian 0 — Peta Aplikasi](#0-peta-aplikasi--baca-ini-dulu)  
→ Ikuti [Checklist Setup](#3-checklist-setup-pertama-kali) jika desa baru  
→ Kalau sudah operasional: buka **Dashboard** setiap pagi

### “Nomor kartu tidak muncul / (otomatis)”

1. **Pengaturan → Umum** — status harus **Siap terbit nomor kartu**
2. Pastikan banjar/tempek/arahan sudah ada di **Master Data → Wilayah**
3. Pastikan jenis krama sudah dibuat

### “Tombol Tambah / Edit / Bayar tidak ada”

- Peran **viewer** tidak bisa edit — minta admin ubah ke **operator**
- Beberapa aksi hanya di tab **Aktif** (bukan Nonaktif)

### “Filter tempek/arahan kosong”

- Pilih **banjar** dulu — tempek baru muncul setelah banjar dipilih
- Pilih **tempek** dulu — arahan baru muncul

### “Bayar sudah dicatat tapi saldo tidak berubah”

- Apakah **akun keuangan** dipilih saat bayar?
- Refresh **Keuangan → Buku Kas**
- Cek tab **Riwayat** — apakah transaksi tercatat?

### “Paturunan tagihannya aneh / nominal salah”

- Tagihan = nominal iuran × **% jenis krama**  
- Cek **Master Data → Jenis Krama** → % paturunan per jenis
- Cek iuran yang dipilih di dropdown **Iuran paturunan**

### “Dudukan tagihannya 0 / tidak muncul”

- Pemasih baru? Pencatatan **sampai Mei 2026**: tagihan mulai **bulan berikutnya**; **dari Juni 2026**: **7 hari setelah tanggal pencatatan**
- Cek **Master Data → Jenis Krama** → nominal dudukan per jenis
- Pastikan masa berlaku pemasih masih aktif

### “WhatsApp tidak terbuka”

- Nomor kontak krama kosong → isi di **edit krama**
- Template kosong → **Pengaturan → Umum → Template WhatsApp**

### “Tab Modul Online tidak muncul”

- Hanya **admin** yang melihat tab ini
- Perlu **lisensi cloud** aktif — desa desktop-only tidak menampilkan tab

### “Petugas HP: kesiapan cloud merah”

1. Desktop belum **Kirim master** dan **Kirim krama**
2. URL API salah di tab Modul Online
3. Server cold start (Render gratis) — tunggu ~1 menit, coba lagi

### “Tarik dari cloud kosong”

- Petugas belum input hari ini
- Akun petugas salah / belum dikirim ke cloud
- Coba **Tarik semua** atau tunggu beberapa menit

### “Data hilang setelah update aplikasi”

- Data terpisah dari folder program
- **Pengaturan → Database → Restore** dari backup

### “Form krama — perubahan anggota hilang”

- Perubahan anggota **belum tersimpan** sampai klik **Simpan kartu** / **Simpan perubahan**
- Banner kuning mengingatkan jika ada perubahan pending

---

## Glosarium Singkat

| Istilah | Arti |
|---------|------|
| **NPK** | Nomor kartu Krama Mipil |
| **NPKT / NPT** | Nomor kartu Krama Tamiu / Tamiu |
| **NIKA** | Nomor induk anggota mipil |
| **Pengarep** | Kepala KK mipil |
| **Pengajeg** | Kepala KK pemasih |
| **Pipil** | Lembar/kartu keluarga mipil |
| **Pemasih** | Krama Tamiu atau Tamiu |
| **Paturunan** | Iuran krama mipil |
| **Dudukan** | Iuran bulanan pemasih |
| **ILIKITA** | Instrumen legal internal kasukretan |
| **IPMA** | Surat Mautsaha Adat (usaha komersial) |
| **SKK / SKP** | Surat Keterangan Krama / Pindah |
| **Banjar / Tempek / Arahan** | Tingkatan wilayah desa adat |

Glosarium lengkap: [domain-glossary.md](./domain-glossary.md)

---

## Dokumen Terkait

| Dokumen | Isi |
|---------|-----|
| [PANDUAN-PENGGUNA.md](./PANDUAN-PENGGUNA.md) | Referensi modul ringkas |
| [LEMBAR-KERJA-INSTALASI.md](./LEMBAR-KERJA-INSTALASI.md) | Checklist instalasi per desa |
| [DEPLOY-PETUGAS.md](./DEPLOY-PETUGAS.md) | Setup modul online teknis |
| [domain-glossary.md](./domain-glossary.md) | Istilah domain |

---

*Kasukretan Krama — Tutorial Pengguna. Sesuaikan langkah operasional dengan kebijakan dan adat desa adat Anda.*
