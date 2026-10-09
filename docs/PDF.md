# Lapisan PDF

Dokumen PDF di aplikasi desktop dibangun dengan [pdf-lib](https://pdf-lib.js.org/). Struktur modul sengaja berlapis agar kartu ILIKITA, surat dinas, dan laporan tidak menduplikasi primitif dasar.

## Lapisan 1 — `pdf-common.ts`

Primitif bersama untuk semua PDF:

- Konstanta ukuran halaman landscape kartu (`MM`, `PAGE_LANDSCAPE_*`, margin)
- Warna teks/header/tabel
- Font Helvetica (`createPdfFonts`)
- `pdfSafeText`, `ilikitaUpper`, `truncatePdf`
- Embed gambar dari data URL (`embedDataUrlImage`)
- Helper menggambar teks dan garis tabel generik

**Gunakan** untuk modul PDF baru yang butuh layout landscape atau utilitas teks/gambar dasar.

## Lapisan 2 — spesialis layout

| Modul | Peruntukan |
|-------|------------|
| `ilikita-pdf-layout.ts` | Header kartu Pipil/Tamiu, body field, tabel anggota, QR — dipakai `pipil-pdf`, `pemasih-pdf`, `kartu-*-pdf` |
| `surat-dinas-pdf-common.ts` | Halaman A4 portrait, kop surat, tanggal Indonesia, blok tanda tangan — dipakai surat keterangan & penagihan |
| `pdf-table-fonts.ts` | Font/ukuran khusus tabel laporan lebar |
| `pdf-kartu-pembayaran-table.ts` | Tabel riwayat pembayaran kartu Paturunan & Dudukan (F4 portrait) — dipakai `kartu-paturunan-pdf`, `jadwal-dudukan-pdf` |
| `pdf-setoran-table.ts` | Tabel bukti setoran Paturunan/Dudukan (A4 portrait, header abu-abu) — dipakai `bukti-setoran-*-pdf` |
| `pdf-grid-table.ts` | Tabel grid laporan dengan wrap/shrink per kolom — dipakai `tunggakan-dudukan-pdf` |
| `pdf-laporan-table.ts` | Engine tabel laporan generik (wrap, merge sel, pita grup, pewarnaan status) — dipakai `laporan-pdf.ts` |
| `pdf-laporan-layout.ts` | Kop desa adat, judul/periode, meta, header lanjutan, tanda tangan — dipakai `laporan-pdf.ts` |
| `surat-dinas-pdf-fonts.ts` | Font opsional surat dinas (jika berbeda dari Helvetica) |

Modul **generasi** (mis. `surat-keterangan-mautsaha-adat-pdf.ts`, `laporan-paturunan-pdf.ts`) hanya berisi logika konten + pemanggilan helper dari lapisan 2.

## Lapisan 3 — jobs & pratinjau

- `kartu-pdf-jobs.ts`, `ilikita-pdf-jobs.ts` — antrian generate batch
- `laporan-pdf-preview.ts` — pratinjau HTML sebelum export

## Konvensi menambah PDF baru

1. Tentukan orientasi: landscape kartu → `pdf-common` + `ilikita-pdf-layout`; surat A4 → `surat-dinas-pdf-common`.
2. Jangan copy-paste konstanta `MM` atau `pdfSafeText` — import dari lapisan 1.
3. Nama file: `{jenis-dokumen}-pdf.ts` di `src/lib/`.
4. Format surat per jenis dokumen **tidak** diseragamkan (keputusan domain) — hanya primitif layout yang dibagi.

## Belum dikonsolidasi (sengaja)

Laporan tabel generik memakai `laporan-pdf.ts` (orkestrasi) + `pdf-laporan-layout.ts` + `pdf-laporan-table.ts`. Kartu Paturunan/Dudukan → `pdf-kartu-pembayaran-table.ts`; bukti setoran → `pdf-setoran-table.ts`; tunggakan dudukan → `pdf-grid-table.ts`.
