# Arsitektur Kasukretan Krama

Ringkasan teknis untuk pengembang dan vendor instalasi.

## Gambaran

```
[Desktop Electron + SQLite]  ←—— sinkron (opsional) ——→  [API Node + PostgreSQL]
        │  (+ LAN server/klien WiFi)                     │
   Semua modul                                      Petugas + Portal
   offline-first                                   (pembayaran, tunggakan)
```

| Komponen | Lokasi | Peran |
|----------|--------|-------|
| UI staff | `src/pages/`, `src/components/` | Admin, operator, keuangan, prajuru |
| Logika bisnis | `src/lib/services/` | Akses SQLite, aturan domain |

Modul krama (`services/krama*.ts`):

| File | Isi |
|------|-----|
| `krama.ts` | Barrel re-export (impor publik tetap dari sini) |
| `krama-crud.ts` | Create/update krama |
| `krama-lifecycle.ts` | Reaktivasi, nonaktifkan pindah, hapus |
| `krama-query.ts` | List, detail, rekap, RT/BTN |
| `krama-anggota.ts` | CRUD anggota, gabung Pipil |
| `krama-input.ts` | Tipe input form |
| `krama-ilikita-sync.ts` | Sinkron status Pipil/Pemasih ke DB |
| `krama-pemasih-perpanjangan.ts` | Perpanjang Pemasih manual/otomatis |
| `krama-pemasih-perhatian.ts` | Daftar pemasih perlu tindakan |

| PDF / laporan | `src/lib/*-pdf.ts`, `laporan-*.ts` | Cetak & preview — lihat [`PDF.md`](./PDF.md) |
| Impor Excel | `src/lib/import/` | Template + validasi |
| Desktop shell | `electron/` | SQLite (`better-sqlite3`), lisensi, backup, LAN |
| Bridge UI→main | `src/lib/desktop/` | IPC Electron (`invoke`, dialog, fs, SQL, opener) |
| Cloud API | `api/src/` | JWT, sync, petugas, portal |

## Database

- **Desktop:** 44 tabel (`src/lib/db/schema.sql`), migrasi idempoten di `migrations.ts` — lihat [`MIGRATIONS.md`](./MIGRATIONS.md)
- **Cloud:** subset ~24 tabel (`api/sql/schema.postgres.sql`) — hanya data yang perlu online
- **Prisma:** legacy, tidak dipakai runtime

## Peran pengguna (desktop)

| Peran | Hak |
|-------|-----|
| `admin` | Semua hak (krama, keuangan, master, pengaturan) |
| `operator` | Input/edit/hapus krama + lihat laporan |
| `keuangan` | Input keuangan (paturunan/dudukan/buku kas) + edit krama + laporan |
| `prajuru` | Hanya lihat laporan (peran lama `viewer` dinormalisasi ke sini) |

## Alur keuangan penting

1. Pembayaran paturunan/dudukan → otomatis masuk **Dana Paturunan** / **Dana Dudukan**
2. Biaya admin IPMA/Pemasih (jika tarif > 0) → **Dana Kasukretan Lainnya**
3. Arsip surat IPMA menyimpan referensi `transaksi_pemasukan_id` — hapus transaksi di Keuangan melepas tautan, arsip tetap ada

## Modul PDF

Shared: `pdf-common.ts`, `surat-dinas-pdf-common.ts`. Per-dokumen: `*-pdf.ts` (~35 file).

## Sinkronisasi cloud

Diaktifkan jika lisensi online + `VITE_ENABLE_ONLINE`. UI: Pengaturan → Sinkron Cloud. Kode: `src/lib/sync/`.

## Pengujian

CI: `.github/workflows/ci.yml` (typecheck + build). Skrip manual: `scripts/*-roundtrip.ts`.
