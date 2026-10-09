import { getDb } from "../db/client";
import { downloadExcel } from "../excel-export";
import type { ExcelSheetInput } from "../excel-export";

export type KeuanganImportMode = "paturunan" | "dudukan";

export const KEUANGAN_EXPORT_FILENAMES: Record<KeuanganImportMode, string> = {
  paturunan: "keuangan-paturunan-kasukretan.xlsx",
  dudukan: "keuangan-dudukan-kasukretan.xlsx",
};

export const KEUANGAN_SHEET_NAMES = {
  paturunan: "PaturunanPembayaran",
  dudukan: "DudukanPembayaran",
  petunjuk: "Petunjuk",
} as const;

export const KEUANGAN_HEADERS = {
  paturunan: [
    "pembayaran_id",
    "nomor_kartu",
    "iuran_nama",
    "jenis",
    "jumlah",
    "tanggal",
    "banjar_kode",
    "petugas_nama",
    "keterangan",
  ],
  dudukan: [
    "pembayaran_id",
    "nomor_kartu",
    "tahun",
    "bulan",
    "jumlah",
    "tanggal",
    "banjar_kode",
    "petugas_nama",
    "keterangan",
  ],
} as const;

const EXAMPLES = {
  paturunan: [
    [
      "",
      "NPK01010001",
      "Iuran Paturunan 2024",
      "wajib",
      50000,
      "15/01/2024",
      "01",
      "Petugas Contoh",
      "",
    ],
  ],
  dudukan: [
    ["", "NPKT01010001", 2024, 1, 25000, "10/01/2024", "01", "Petugas Contoh", ""],
  ],
};

function petunjukSheet(mode: KeuanganImportMode): ExcelSheetInput {
  const lines =
    mode === "paturunan"
      ? [
          "PETUNJUK IMPOR PEMBAYARAN PATURUNAN",
          "",
          "1. nomor_kartu: kartu Krama Mipil (NPK) yang sudah ada — termasuk krama nonaktif (riwayat).",
          "2. iuran_nama: harus sama dengan nama iuran di menu Paturunan.",
          "3. jenis: wajib atau punia.",
          "4. Petugas: banjar_kode + petugas_nama harus cocok dengan Tim Kasukretan.",
          "5. pembayaran_id: kosongkan untuk tambah baru; isi untuk update baris existing.",
          "6. tanggal: dd/mm/yyyy atau yyyy-mm-dd.",
          "7. Maksimal ~500 baris.",
        ]
      : [
          "PETUNJUK IMPOR PEMBAYARAN DUDUKAN",
          "",
          "1. nomor_kartu: kartu Pemasih (NPKT/NPT) yang sudah ada — termasuk krama nonaktif (riwayat).",
          "2. tahun & bulan: periode dudukan (bulan 1–12).",
          "3. Petugas: banjar_kode + petugas_nama dari Tim Kasukretan.",
          "4. pembayaran_id: kosongkan untuk tambah; isi untuk update.",
          "5. Maksimal ~500 baris.",
        ];
  return {
    name: KEUANGAN_SHEET_NAMES.petunjuk,
    headers: ["petunjuk"],
    rows: lines.map((l) => [l]),
  };
}

function fmtDate(iso?: string | null): string {
  const raw = iso?.trim().slice(0, 10) ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const [y, m, d] = raw.split("-");
  return `${d}/${m}/${y}`;
}

async function loadPaturunanExport(): Promise<(string | number)[][]> {
  const db = await getDb();
  const rows = await db.select<
    {
      id: string;
      nomor_kartu: string;
      iuran_nama: string;
      jenis: string;
      jumlah: number;
      tanggal: string;
      banjar_kode: string;
      petugas_nama: string | null;
      keterangan: string | null;
    }[]
  >(
    `SELECT p.id, k.nomor_kartu, i.nama as iuran_nama, COALESCE(p.jenis, 'wajib') as jenis,
            p.jumlah, p.tanggal, b.kode as banjar_kode, t.nama as petugas_nama, p.keterangan
     FROM paturunan_pembayaran p
     JOIN krama k ON k.id = p.krama_id
     JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id AND kk.kode = 'MIPIL'
     JOIN iuran_paturunan i ON i.id = p.iuran_id
     JOIN banjar b ON b.id = k.banjar_id
     LEFT JOIN tim_kasukretan t ON t.id = p.petugas_id
     ORDER BY p.tanggal DESC, k.nomor_kartu`
  );
  return rows.map((r) => [
    r.id,
    r.nomor_kartu,
    r.iuran_nama,
    r.jenis,
    r.jumlah,
    fmtDate(r.tanggal),
    r.banjar_kode,
    r.petugas_nama ?? "",
    r.keterangan ?? "",
  ]);
}

async function loadDudukanExport(): Promise<(string | number)[][]> {
  const db = await getDb();
  const rows = await db.select<
    {
      id: string;
      nomor_kartu: string;
      tahun: number;
      bulan: number;
      jumlah: number;
      tanggal: string;
      banjar_kode: string;
      petugas_nama: string | null;
      keterangan: string | null;
    }[]
  >(
    `SELECT p.id, k.nomor_kartu, p.tahun, p.bulan, p.jumlah, p.tanggal,
            b.kode as banjar_kode, t.nama as petugas_nama, p.keterangan
     FROM dudukan_pembayaran p
     JOIN krama k ON k.id = p.krama_id
     JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
       AND kk.kode IN ('KRAMA_TAMIU', 'TAMIU')
     JOIN banjar b ON b.id = k.banjar_id
     LEFT JOIN tim_kasukretan t ON t.id = p.petugas_id
     ORDER BY p.tahun DESC, p.bulan DESC, k.nomor_kartu`
  );
  return rows.map((r) => [
    r.id,
    r.nomor_kartu,
    r.tahun,
    r.bulan,
    r.jumlah,
    fmtDate(r.tanggal),
    r.banjar_kode,
    r.petugas_nama ?? "",
    r.keterangan ?? "",
  ]);
}

function buildSheets(
  mode: KeuanganImportMode,
  data: (string | number)[][],
  includeExamples: boolean
): ExcelSheetInput[] {
  const sheetName = KEUANGAN_SHEET_NAMES[mode];
  const headers = [...KEUANGAN_HEADERS[mode]];
  return [
    {
      name: sheetName,
      headers,
      rows: includeExamples ? [...EXAMPLES[mode], ...data] : data,
    },
    petunjukSheet(mode),
  ];
}

export async function downloadKeuanganTemplate(mode: KeuanganImportMode): Promise<boolean> {
  return downloadExcel(
    KEUANGAN_EXPORT_FILENAMES[mode],
    buildSheets(mode, [], true)
  );
}

export async function downloadKeuanganExport(mode: KeuanganImportMode): Promise<boolean> {
  const data =
    mode === "paturunan" ? await loadPaturunanExport() : await loadDudukanExport();
  return downloadExcel(
    KEUANGAN_EXPORT_FILENAMES[mode],
    buildSheets(mode, data, false)
  );
}
