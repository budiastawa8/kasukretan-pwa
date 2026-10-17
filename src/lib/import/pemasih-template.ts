import { getDb } from "../db/client";
import { downloadExcel, type ExcelSheetInput } from "../excel-export";
import {
  JENIS_KRAMA_TAMIU_NAMA,
  JENIS_TAMIU_NAMA,
  klasifikasiPemasihExportValue,
} from "../pemasih-jenis";

export const PEMASIH_EXPORT_FILENAME = "krama-pemasih-kasukretan.xlsx";

export const PEMASIH_SHEET_NAMES = {
  krama: "KramaPemasih",
  anggota: "AnggotaPemasih",
  petunjuk: "Petunjuk",
} as const;

export const PEMASIH_KRAMA_HEADERS = [
  "nomor_kartu",
  "kartu_ref",
  "klasifikasi",
  "pengajeg",
  "banjar_kode",
  "banjar",
  "tempek_nama",
  "jenis_nama",
  "alamat",
  "rt_btn",
  "asal_desa_adat",
  "asal_kecamatan",
  "asal_kabupaten",
  "asal_provinsi",
  "tanggal_terdaftar",
  "nomor_kontak",
  "status_krama",
  "alasan_tidak_aktif",
  "tanggal_tidak_aktif",
] as const;

export const PEMASIH_ANGGOTA_HEADERS = [
  "kartu_ref",
  "nomor_kartu",
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

const KRAMA_EXAMPLE: (string | number)[][] = [
  [
    "",
    "KARTU-CONTOH-PEMASIH",
    "Krama Tamiu",
    "I Made Contoh",
    "01",
    "Banjar Contoh",
    "Tempek Contoh",
    "Krama Tamiu Rajeg",
    "Jl. Contoh No. 1",
    "001/002",
    "Desa Asal",
    "Kecamatan Asal",
    "Kabupaten Asal",
    "",
    "01/01/2024",
    "",
    "aktif",
    "",
    "",
  ],
];

const ANGGOTA_EXAMPLE: (string | number)[][] = [
  [
    "KARTU-CONTOH-PEMASIH",
    "",
    "I Made Contoh",
    "L",
    "Pengajeg",
    "Tabanan",
    "10/05/1975",
    "Kawin",
    "Pedagang",
    "5101010101010001",
    "",
  ],
];

function fmtDate(iso?: string | null): string {
  const raw = iso?.trim().slice(0, 10) ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const [y, m, d] = raw.split("-");
  return `${d}/${m}/${y}`;
}

function petunjukSheet(): ExcelSheetInput {
  const kt = JENIS_KRAMA_TAMIU_NAMA.join(", ");
  const t = JENIS_TAMIU_NAMA.join(", ");
  const lines = [
    "PETUNJUK IMPOR KRAMA TAMIU / TAMIU",
    "",
    "1. Sheet: KramaPemasih, AnggotaPemasih — jangan ubah nama sheet.",
    "2. Baris baru: kosongkan nomor_kartu, isi kartu_ref unik; Anggota pakai kartu_ref yang sama.",
    "3. Update: isi nomor_kartu yang sudah ada di aplikasi.",
    "4. klasifikasi: Krama Tamiu atau Tamiu (bukan kode KRAMA_TAMIU).",
    "4b. Kolom pengajeg dan banjar (nama) hanya referensi — diisi otomatis saat ekspor.",
    "4c. banjar_kode wajib untuk impor.",
    "5. jenis_nama harus cocok klasifikasi kartu — lihat Master Data.",
    `6. Jenis Krama Tamiu: ${kt}.`,
    `7. Jenis Tamiu: ${t}.`,
    "8. Harus tepat satu Pengajeg per kartu di sheet AnggotaPemasih.",
    "9. TAMIU: isi asal_provinsi (kartu) dan agama (anggota Pengajeg).",
    "10. Anggota selain Pengajeg wajib isi nik_atau_nika.",
    "11. status_krama nonaktif: isi alasan_tidak_aktif (meninggal/pindah/pawanengan_3_bulan) dan tanggal_tidak_aktif.",
    "12. Maksimal ~500 baris per sheet.",
  ];
  return {
    name: PEMASIH_SHEET_NAMES.petunjuk,
    headers: ["petunjuk"],
    rows: lines.map((l) => [l]),
  };
}

export type PemasihExportOptions = {
  /** Batasi ke kartu tertentu (mis. hasil filter di daftar). */
  kramaIds?: string[];
  /** Default: aktif (kompatibel ekspor Impor/Ekspor). */
  statusKrama?: "aktif" | "nonaktif";
};

function pemasihExportFilename(statusKrama: "aktif" | "nonaktif"): string {
  if (statusKrama === "nonaktif") {
    return "krama-pemasih-nonaktif-kasukretan.xlsx";
  }
  return PEMASIH_EXPORT_FILENAME;
}

async function loadExportData(
  opts: PemasihExportOptions = {}
): Promise<{
  krama: (string | number)[][];
  anggota: (string | number)[][];
}> {
  const statusKrama = opts.statusKrama ?? "aktif";
  const db = await getDb();

  let kramaSql = `
    SELECT k.id, k.nomor_kartu, kk.kode as klasifikasi, p.nama_lengkap as pengajeg_nama,
            b.kode as banjar_kode, b.nama as banjar_nama, t.nama as tempek_nama,
            COALESCE(jkt.nama, jt.nama) as jenis_nama, k.alamat, k.rt_btn,
            k.asal_desa_adat, k.asal_kecamatan, k.asal_kabupaten, k.asal_provinsi,
            k.tanggal_terdaftar, k.nomor_kontak, k.status_krama,
            k.alasan_tidak_aktif, k.tanggal_tidak_aktif
     FROM krama k
     JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
       AND kk.kode IN ('KRAMA_TAMIU', 'TAMIU')
     JOIN penduduk p ON p.id = k.kepala_penduduk_id
     JOIN banjar b ON b.id = k.banjar_id
     LEFT JOIN tempek t ON t.id = k.tempek_id
     LEFT JOIN jenis_krama_tamiu jkt ON jkt.id = k.jenis_krama_tamiu_id
     LEFT JOIN jenis_tamiu jt ON jt.id = k.jenis_tamiu_id
     WHERE k.status_krama = $1`;
  const kramaArgs: unknown[] = [statusKrama];
  let n = 2;

  if (opts.kramaIds?.length) {
    const placeholders = opts.kramaIds.map((_, i) => `$${n + i}`).join(", ");
    kramaSql += ` AND k.id IN (${placeholders})`;
    kramaArgs.push(...opts.kramaIds);
    n += opts.kramaIds.length;
  }

  kramaSql += ` ORDER BY k.nomor_kartu`;

  const kramaRows = await db.select<
    {
      id: string;
      nomor_kartu: string;
      klasifikasi: string;
      pengajeg_nama: string;
      banjar_kode: string;
      banjar_nama: string;
      tempek_nama: string;
      jenis_nama: string;
      alamat: string | null;
      rt_btn: string | null;
      asal_desa_adat: string | null;
      asal_kecamatan: string | null;
      asal_kabupaten: string | null;
      asal_provinsi: string | null;
      tanggal_terdaftar: string;
      nomor_kontak: string | null;
      status_krama: string;
      alasan_tidak_aktif: string | null;
      tanggal_tidak_aktif: string | null;
    }[]
  >(kramaSql, kramaArgs);

  const krama = kramaRows.map((r) => [
    r.nomor_kartu,
    r.nomor_kartu,
    klasifikasiPemasihExportValue(r.klasifikasi),
    r.pengajeg_nama?.trim() ?? "",
    r.banjar_kode?.trim()
      ? r.banjar_kode.trim().padStart(2, "0").slice(-2)
      : "",
    r.banjar_nama?.trim() ?? "",
    r.tempek_nama ?? "",
    r.jenis_nama ?? "",
    r.alamat ?? "",
    r.rt_btn ?? "",
    r.asal_desa_adat ?? "",
    r.asal_kecamatan ?? "",
    r.asal_kabupaten ?? "",
    r.asal_provinsi ?? "",
    fmtDate(r.tanggal_terdaftar),
    r.nomor_kontak ?? "",
    r.status_krama,
    r.alasan_tidak_aktif ?? "",
    fmtDate(r.tanggal_tidak_aktif),
  ]);

  const kramaIdList = kramaRows.map((r) => r.id);
  if (!kramaIdList.length) {
    return { krama, anggota: [] };
  }

  const anggotaPlaceholders = kramaIdList.map((_, i) => `$${i + 1}`).join(", ");
  const anggotaRows = await db.select<
    {
      nomor_kartu: string;
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
    `SELECT k.nomor_kartu, p.nama_lengkap, p.jenis_kelamin,
            CASE WHEN ak.penduduk_id = k.kepala_penduduk_id THEN 'Pengajeg'
                 ELSE ak.status_keluarga END as status_keluarga,
            p.tempat_lahir, p.tanggal_lahir, p.status_kawin, p.pekerjaan,
            p.nik_atau_nika, p.agama
     FROM anggota_keluarga ak
     JOIN krama k ON k.id = ak.krama_id
     JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
       AND kk.kode IN ('KRAMA_TAMIU', 'TAMIU')
     JOIN penduduk p ON p.id = ak.penduduk_id
     WHERE ak.status = 'aktif' AND k.id IN (${anggotaPlaceholders})
     ORDER BY k.nomor_kartu, ak.masuk_pada`,
    kramaIdList
  );

  const anggota = anggotaRows.map((r) => [
    r.nomor_kartu,
    r.nomor_kartu,
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

  return { krama, anggota };
}

function buildSheets(
  data: { krama: (string | number)[][]; anggota: (string | number)[][] },
  includeExamples: boolean
): ExcelSheetInput[] {
  return [
    {
      name: PEMASIH_SHEET_NAMES.krama,
      headers: [...PEMASIH_KRAMA_HEADERS],
      rows: includeExamples ? [...KRAMA_EXAMPLE, ...data.krama] : data.krama,
    },
    {
      name: PEMASIH_SHEET_NAMES.anggota,
      headers: [...PEMASIH_ANGGOTA_HEADERS],
      rows: includeExamples ? [...ANGGOTA_EXAMPLE, ...data.anggota] : data.anggota,
    },
    petunjukSheet(),
  ];
}

export async function downloadPemasihTemplate(): Promise<boolean> {
  return downloadExcel(PEMASIH_EXPORT_FILENAME, buildSheets({ krama: [], anggota: [] }, true));
}

export async function downloadPemasihExport(opts?: PemasihExportOptions): Promise<boolean> {
  const statusKrama = opts?.statusKrama ?? "aktif";
  const data = await loadExportData(opts);
  return downloadExcel(pemasihExportFilename(statusKrama), buildSheets(data, false));
}
