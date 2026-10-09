# Roadmap perbaikan bertahap

Daftar pekerjaan perbaikan aplikasi — dijalankan bertahap agar aman dan bisa di-review.

## Selesai

- [x] Istilah Kas → Dana (Paturunan/Dudukan)
- [x] Hapus transaksi IPMA: lepas FK arsip sebelum hapus pemasukan
- [x] README, ARCHITECTURE, glosarium diperbarui
- [x] Menu Laporan dikelompokkan (hub)
- [x] Master: tarif ILIKITA pindah ke tab kebijakan
- [x] Petunjuk UI Keuangan ↔ IPMA
- [x] CI minimal (typecheck + build + test)
- [x] Komponen pembayaran bersama (tab, stat, hook akun/petugas — Paturunan & Dudukan)
- [x] Shell impor/ekspor generik + panel pratinjau
- [x] `previewStatusIlikita` → `status-ilikita.ts`
- [x] Test unit hitung + penomoran IPMA
- [x] Pecah `krama.ts`: sync ILIKITA, perpanjangan, perhatian, query, anggota, input types
- [x] Dokumentasi PDF + migrasi desktop/API
- [x] Perbaikan TypeScript (Button `size`, `createdBy` opsional pemasukan sistem)
- [x] Pecah `krama.ts` lifecycle/create ke `krama-lifecycle.ts` + `krama-crud.ts` (barrel tipis)
- [x] Konsolidasi helper tabel kartu Paturunan/Dudukan → `pdf-kartu-pembayaran-table.ts`
- [x] Konsolidasi helper tabel bukti setoran → `pdf-setoran-table.ts`
- [x] Ekstrak helper tabel grid tunggakan → `pdf-grid-table.ts`
- [x] Ekstrak engine tabel laporan generik → `pdf-laporan-table.ts`
- [x] Ekstrak layout dokumen laporan (kop, judul, tanda tangan) → `pdf-laporan-layout.ts`
- [x] Rilis 0.2.0: isi data krama dari foto Kartu Keluarga (OCR lokal Tesseract, tanpa cloud)
- [x] Klien HP (LAN/Chrome): UI bertahap — form factor + dock, daftar kartu, form Krama, laporan baris & rekap, Kas/Master/Pengaturan; deteksi HP tahan mode “Situs desktop” Chrome

## Berikutnya (fase berikutnya)

- [ ] Verifikasi lapangan di Chrome HP (matikan Situs desktop jika perlu) setelah build LAN
- [ ] (Tidak ada refactor PDF terencana — fokus fitur/bug jika ada)

## Tidak direncanakan diubah

- Pemisahan Mipil vs Pemasih (domain adat)
- Aturan penomoran NPK/NIKA/NRKT
- Alokasi plafon Dana Dudukan
- Format surat per jenis dokumen
