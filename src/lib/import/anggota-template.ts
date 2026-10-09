import { getDb } from "../db/client";
import { downloadExcel, type ExcelSheetInput } from "../excel-export";

export const ANGGOTA_EXPORT_FILENAME = "anggota-mipil-kasukretan.xlsx";

export const ANGGOTA_SHEET_NAMES = {
  anggota: "AnggotaMipil",
  petunjuk: "Petunjuk",
} as const;

export const ANGGOTA_HEADERS = {
  anggota: [
    "nomor_kartu",
    "anggota_id",
    "nama_lengkap",
    "jenis_kelamin",
    "status_keluarga",
    "tempat_lahir",
    "tanggal_lahir",
    "status_kawin",
    "pekerjaan",
    "nama_ibu",
    "nama_ayah",
    "nika",
  ],
} as const;

const MIPIL_EXAMPLE: (string | number)[][] = [
  [
    "01.02.03.0001",
    "",
    "Ni Made Contoh",
    "P",
    "Istri",
    "Denpasar",
    "15/06/1985",
    "Kawin",
    "Ibu Rumah Tangga",
    "",
    "",
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
    "PETUNJUK IMPOR ANGGOTA MIPIL",
    "",
    singleKartu
      ? `Impor untuk kartu ${singleKartu} — kolom nomor_kartu boleh dikosongkan.`
      : "1. Sheet: AnggotaMipil — jangan ubah nama sheet.",
    "2. Baris baru: kosongkan anggota_id — akan ditambah ke kartu.",
    "3. Update: isi anggota_id dari ekspor, atau cocokkan lewat NIKA / nama+tanggal lahir.",
    "4. Tidak bisa menambah Pengarep lewat impor — tetapkan di aplikasi.",
    "5. Foto anggota tidak ikut file Excel.",
    "6. tanggal_lahir: dd/mm/yyyy atau yyyy-mm-dd.",
    "7. Maksimal ~500 baris.",
  ];
  return {
    name: ANGGOTA_SHEET_NAMES.petunjuk,
    headers: ["petunjuk"],
    rows: lines.map((l) => [l]),
  };
}

async function loadAnggotaRows(kramaId?: string): Promise<(string | number)[][]> {
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
      nama_ibu: string | null;
      nama_ayah: string | null;
      nika: string | null;
    }[]
  >(
    `SELECT k.nomor_kartu, ak.id as anggota_id, p.nama_lengkap, p.jenis_kelamin,
            CASE WHEN ak.penduduk_id = k.kepala_penduduk_id THEN 'Pengarep'
                 ELSE ak.status_keluarga END as status_keluarga,
            p.tempat_lahir, p.tanggal_lahir, p.status_kawin, p.pekerjaan,
            p.nama_ibu, p.nama_ayah, ak.nika
     FROM anggota_keluarga ak
     JOIN krama k ON k.id = ak.krama_id
     JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id AND kk.kode = 'MIPIL'
     JOIN penduduk p ON p.id = ak.penduduk_id
     WHERE ak.status = 'aktif' AND k.status_krama = 'aktif'${kramaFilter}
     ORDER BY k.nomor_kartu, ak.urut_dalam_keluarga`,
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
    r.nama_ibu ?? "",
    r.nama_ayah ?? "",
    r.nika ?? "",
  ]);
}

function buildSheets(
  rows: (string | number)[][],
  includeExamples: boolean,
  singleKartu?: string
): ExcelSheetInput[] {
  return [
    {
      name: ANGGOTA_SHEET_NAMES.anggota,
      headers: [...ANGGOTA_HEADERS.anggota],
      rows: includeExamples ? [...MIPIL_EXAMPLE, ...rows] : rows,
    },
    petunjukSheet(singleKartu),
  ];
}

export async function downloadAnggotaTemplate(opts?: {
  kramaId?: string;
  nomorKartu?: string;
}): Promise<boolean> {
  const rows = opts?.kramaId != null ? await loadAnggotaRows(opts.kramaId) : [];
  const filename = opts?.nomorKartu
    ? `anggota-mipil-${opts.nomorKartu.replace(/\./g, "-")}.xlsx`
    : ANGGOTA_EXPORT_FILENAME;
  return downloadExcel(filename, buildSheets(rows, !opts?.kramaId, opts?.nomorKartu));
}

export async function downloadAnggotaExport(opts?: {
  kramaId?: string;
  nomorKartu?: string;
}): Promise<boolean> {
  const rows = await loadAnggotaRows(opts?.kramaId);
  const filename = opts?.nomorKartu
    ? `anggota-mipil-${opts.nomorKartu.replace(/\./g, "-")}.xlsx`
    : ANGGOTA_EXPORT_FILENAME;
  return downloadExcel(filename, buildSheets(rows, false, opts?.nomorKartu));
}
