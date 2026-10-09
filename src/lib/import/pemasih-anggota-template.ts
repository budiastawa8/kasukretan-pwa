import { getDb } from "../db/client";
import { downloadExcel, type ExcelSheetInput } from "../excel-export";

export const PEMASIH_ANGGOTA_ONLY_FILENAME = "anggota-pemasih-kasukretan.xlsx";

export const PEMASIH_ANGGOTA_SHEET = "AnggotaPemasih" as const;

export const PEMASIH_ANGGOTA_ONLY_HEADERS = [
  "nomor_kartu",
  "anggota_id",
  "nama_lengkap",
  "jenis_kelamin",
  "status_keluarga",
  "tempat_lahir",
  "tanggal_lahir",
  "status_kawin",
  "pekerjaan",
  "nik_atau_nika",
  "agama",
] as const;

const EXAMPLE: (string | number)[][] = [
  [
    "01.02.03.0002",
    "",
    "I Made Contoh",
    "L",
    "Anak",
    "Tabanan",
    "10/05/2000",
    "Belum Kawin",
    "Pelajar",
    "5101010101010002",
    "",
  ],
];

function fmtDate(iso?: string | null): string {
  const raw = iso?.trim().slice(0, 10) ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const [y, m, d] = raw.split("-");
  return `${d}/${m}/${y}`;
}

function petunjukSheet(singleKartu?: string): ExcelSheetInput {
  const lines = [
    "PETUNJUK IMPOR ANGGOTA TAMIU / KRAMA TAMIU",
    "",
    singleKartu
      ? `Impor untuk kartu ${singleKartu} — kolom nomor_kartu boleh dikosongkan.`
      : "1. Sheet: AnggotaPemasih — jangan ubah nama sheet.",
    "2. Baris baru: kosongkan anggota_id.",
    "3. Update: isi anggota_id atau cocokkan lewat NIK/NIKA.",
    "4. Tidak bisa menambah Pengajeg lewat impor.",
    "5. Anggota selain Pengajeg wajib isi nik_atau_nika.",
    "6. TAMIU Pengajeg: wajib isi agama.",
    "7. Maksimal ~500 baris.",
  ];
  return {
    name: "Petunjuk",
    headers: ["petunjuk"],
    rows: lines.map((l) => [l]),
  };
}

async function loadRows(kramaId?: string): Promise<(string | number)[][]> {
  const db = await getDb();
  const kramaFilter = kramaId ? ` AND k.id = ?` : "";
  const args = kramaId ? [kramaId] : [];
  const rows = await db.select<
    {
      nomor_kartu: string;
      anggota_id: string;
      nama_lengkap: string;
      jenis_kelamin: string;
      status_keluarga: string;
      tempat_lahir: string | null;
      tanggal_lahir: string | null;
      status_kawin: string | null;
      pekerjaan: string | null;
      nik_atau_nika: string | null;
      agama: string | null;
    }[]
  >(
    `SELECT k.nomor_kartu, ak.id as anggota_id, p.nama_lengkap, p.jenis_kelamin,
            CASE WHEN ak.penduduk_id = k.kepala_penduduk_id THEN 'Pengajeg'
                 ELSE ak.status_keluarga END as status_keluarga,
            p.tempat_lahir, p.tanggal_lahir, p.status_kawin, p.pekerjaan,
            p.nik_atau_nika, p.agama
     FROM anggota_keluarga ak
     JOIN krama k ON k.id = ak.krama_id
     JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
       AND kk.kode IN ('KRAMA_TAMIU', 'TAMIU')
     JOIN penduduk p ON p.id = ak.penduduk_id
     WHERE ak.status = 'aktif' AND k.status_krama = 'aktif'${kramaFilter}
     ORDER BY k.nomor_kartu, ak.masuk_pada`,
    args
  );
  return rows.map((r) => [
    r.nomor_kartu,
    r.anggota_id,
    r.nama_lengkap,
    r.jenis_kelamin,
    r.status_keluarga,
    r.tempat_lahir ?? "",
    fmtDate(r.tanggal_lahir),
    r.status_kawin ?? "",
    r.pekerjaan ?? "",
    r.nik_atau_nika ?? "",
    r.agama ?? "",
  ]);
}

function buildSheets(
  rows: (string | number)[][],
  includeExamples: boolean,
  singleKartu?: string
): ExcelSheetInput[] {
  return [
    {
      name: PEMASIH_ANGGOTA_SHEET,
      headers: [...PEMASIH_ANGGOTA_ONLY_HEADERS],
      rows: includeExamples ? [...EXAMPLE, ...rows] : rows,
    },
    petunjukSheet(singleKartu),
  ];
}

export async function downloadPemasihAnggotaTemplate(opts?: {
  kramaId?: string;
  nomorKartu?: string;
}): Promise<boolean> {
  const rows = opts?.kramaId != null ? await loadRows(opts.kramaId) : [];
  const filename = opts?.nomorKartu
    ? `anggota-pemasih-${opts.nomorKartu.replace(/\./g, "-")}.xlsx`
    : PEMASIH_ANGGOTA_ONLY_FILENAME;
  return downloadExcel(filename, buildSheets(rows, !opts?.kramaId, opts?.nomorKartu));
}

export async function downloadPemasihAnggotaExport(opts?: {
  kramaId?: string;
  nomorKartu?: string;
}): Promise<boolean> {
  const rows = await loadRows(opts?.kramaId);
  const filename = opts?.nomorKartu
    ? `anggota-pemasih-${opts.nomorKartu.replace(/\./g, "-")}.xlsx`
    : PEMASIH_ANGGOTA_ONLY_FILENAME;
  return downloadExcel(filename, buildSheets(rows, false, opts?.nomorKartu));
}
