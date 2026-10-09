# Migrasi database: Desktop vs API Cloud

Aplikasi Kasukretan punya **dua runtime database** dengan skema yang saling **mirroring sebagian**, bukan identik penuh.

| | Desktop (Tauri) | API Cloud (Node) |
|---|-----------------|------------------|
| Engine | SQLite | PostgreSQL |
| Entry point | `src/lib/db/migrations.ts` → `runMasterDataMigrations` | `api/src/migrations.ts` → `runStartupMigrations` |
| Cakupan | Full (~44 tabel, keuangan, surat, ILIKITA, master) | Subset: petugas, portal krama, sync, akun dasar |

## Prinsip

1. **Migrasi idempoten** — aman dijalankan ulang; desktop memakai `app_sync_meta` untuk penanda versi, API memakai `IF NOT EXISTS` / cek kolom.
2. **API tidak mengejar semua migrasi desktop** — cloud hanya butuh tabel yang dipakai portal/sync.
3. **Label tampilan** (mis. Kas → Dana) di-update di **kedua** side bila mempengaruhi seed akun keuangan.

## Migrasi yang ada di kedua side (setara)

| Topik | Desktop | API |
|-------|---------|-----|
| Akun keuangan + FK pembayaran | `migratePemasukanLain`, seed akun | `migrateAkunKeuangan` |
| Portal krama | `migrateKramaPortal` | `migrateKramaPortal` |
| Snapshot jenis dudukan | `migrateDudukanPembayaranJenisSnapshot` | `migrateDudukanJenisSnapshot` |
| Kelompok/sub akun | `migrateAkunKelompokSub`, `migrateSubAkunNamaPrefix`, `migrateKelompokUrutanTampilan` | sama |
| Wajib ganti password | `migrateUserMustChangePassword` | sama |
| Label Dana Paturunan/Dudukan | `migrateDanaPaturunanDudukanLabels` | sama |
| Strip dash penomoran | `migrateStripPenomoranDash` | inline di `runStartupMigrations` |

## Hanya desktop

Contoh (tidak exhaustive):

- Legacy status keluarga / gelar kepala
- Buku kas, transfer antar akun, alokasi dana dudukan
- Surat penagihan, surat keterangan krama/pindah, IPMA / lembaga badan
- Kebijakan ILIKITA, tarif administrasi, batch sync status
- Petugas akun, rekap laporan internal

Menambah fitur **desktop-only** tidak perlu migrasi API kecuali nanti data tersebut disync ke cloud.

## Hanya API

- `migrateDesaAdatKetentuanMipil` — kolom kebijakan mipil di `desa_adat` untuk portal (desktop punya setara lewat `migrateIlikitaKebijakan` dengan cakupan lebih luas).

## Menambah migrasi baru

1. **Desktop**: tambah fungsi `migrateXxx(db)` di `src/lib/db/migrations.ts`, daftarkan di `runMasterDataMigrations`, gunakan kunci `app_sync_meta` jika one-shot data migration.
2. **API** (jika kolom/tabel dipakai cloud): tambah fungsi paralel di `api/src/migrations.ts`, daftarkan di `runStartupMigrations`.
3. **Dokumentasikan** baris tabel ini bila hanya satu side.
4. Jangan mengasumsikan urutan migrasi API = desktop — cukup pastikan idempoten dan seed tidak bentrok.

## Prisma

Folder `prisma/` adalah legacy schema reference; **bukan** sumber migrasi runtime. Lihat `docs/ARCHITECTURE.md`.
