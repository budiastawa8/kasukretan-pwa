import { getDb } from "../db/client";
import { downloadExcel, type ExcelSheetInput } from "../excel-export";

export const KRAMA_EXPORT_FILENAME = "krama-mipil-kasukretan.xlsx";

export const KRAMA_SHEET_NAMES = {
  krama: "KramaMipil",
  anggota: "AnggotaMipil",
  petunjuk: "Petunjuk",
} as const;

export const KRAMA_HEADERS = {
  krama: [
    "nomor_kartu",
    "kartu_ref",
    "banjar_kode",
    "tempek_nama",
    "arahan_nama",
    "jenis_mipil_nama",
    "tanggal_terdaftar",
    "keterangan",
    "nomor_kontak",
    "status_krama",
    "alasan_tidak_aktif",
    "tanggal_tidak_aktif",
  ],
  anggota: [
    "kartu_ref",
    "nomor_kartu",
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

const MIPIL_EXAMPLE = {
  krama: [
    [
      "",
      "KARTU-CONTOH-01",
      "01",
      "Tempek Contoh",
      "Arahan Contoh",
      "Jenis Mipil Contoh",
      "01/01/2024",
      "",
      "",
      "aktif",
      "",
      "",
    ],
  ],
  anggota: [
    [
      "KARTU-CONTOH-01",
      "",
      "I Wayan Contoh",
      "L",
      "Pengarep",
      "Denpasar",
      "01/01/1980",
      "Kawin",
      "Petani",
      "Ibu Contoh",
      "Ayah Contoh",
      "",
    ],
    [
      "KARTU-CONTOH-01",
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
  ],
};

function petunjukSheet(): ExcelSheetInput {
  const lines = [
    "PETUNJUK IMPOR KRAMA MIPIL",
    "",
    "1. Sheet: KramaMipil, AnggotaMipil — jangan ubah nama sheet.",
    "2. Baris baru: kosongkan nomor_kartu, isi kartu_ref unik; Anggota pakai kartu_ref yang sama.",
    "3. Update: isi nomor_kartu yang sudah ada di aplikasi.",
    "4. Harus ada tepat satu anggota Pengarep per kartu.",
    "5. Master (banjar, tempek, arahan, jenis) harus sudah ada — impor lewat Master dulu.",
    "6. tanggal_terdaftar / tanggal_lahir: dd/mm/yyyy atau yyyy-mm-dd.",
    "7. status_krama nonaktif: isi alasan_tidak_aktif (meninggal/pindah/pawanengan_3_bulan) dan tanggal_tidak_aktif.",
    "8. Maksimal ~500 baris per sheet.",
  ];
  return {
    name: KRAMA_SHEET_NAMES.petunjuk,
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

export type MipilExportOptions = {
  kramaIds?: string[];
  statusKrama?: "aktif" | "nonaktif";
};

async function loadMipilExport(opts: MipilExportOptions = {}): Promise<{
  krama: (string | number)[][];
  anggota: (string | number)[][];
}> {
  const db = await getDb();
  const statusKrama = opts.statusKrama ?? "aktif";
  let kramaSql = `
    SELECT k.id, k.nomor_kartu, b.kode as banjar_kode, t.nama as tempek_nama,
           a.nama as arahan_nama, jm.nama as jenis_nama, k.tanggal_terdaftar,
           k.keterangan, k.nomor_kontak, k.status_krama,
           k.alasan_tidak_aktif, k.tanggal_tidak_aktif
    FROM krama k
    JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id AND kk.kode = 'MIPIL'
    JOIN banjar b ON b.id = k.banjar_id
    LEFT JOIN tempek t ON t.id = k.tempek_id
    LEFT JOIN arahan a ON a.id = k.arahan_id
    LEFT JOIN jenis_krama_mipil jm ON jm.id = k.jenis_krama_mipil_id
    WHERE k.status_krama = $1
  `;
  const kramaArgs: unknown[] = [statusKrama];
  let n = 2;
  if (opts.kramaIds?.length) {
    const ph = opts.kramaIds.map(() => `$${n++}`).join(", ");
    kramaSql += ` AND k.id IN (${ph})`;
    kramaArgs.push(...opts.kramaIds);
  }
  kramaSql += ` ORDER BY k.nomor_kartu`;

  const kramaRows = await db.select<
    {
      id: string;
      nomor_kartu: string;
      banjar_kode: string;
      tempek_nama: string;
      arahan_nama: string | null;
      jenis_nama: string;
      tanggal_terdaftar: string;
      keterangan: string | null;
      nomor_kontak: string | null;
      status_krama: string;
      alasan_tidak_aktif: string | null;
      tanggal_tidak_aktif: string | null;
    }[]
  >(kramaSql, kramaArgs);

  const krama = kramaRows.map((r) => [
    r.nomor_kartu,
    r.nomor_kartu,
    r.banjar_kode,
    r.tempek_nama ?? "",
    r.arahan_nama ?? "",
    r.jenis_nama ?? "",
    fmtDate(r.tanggal_terdaftar),
    r.keterangan ?? "",
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
      nama_ibu: string | null;
      nama_ayah: string | null;
      nika: string | null;
    }[]
  >(
    `SELECT k.nomor_kartu, p.nama_lengkap, p.jenis_kelamin,
            CASE WHEN ak.penduduk_id = k.kepala_penduduk_id THEN 'Pengarep'
                 ELSE ak.status_keluarga END as status_keluarga,
            p.tempat_lahir, p.tanggal_lahir, p.status_kawin, p.pekerjaan,
            p.nama_ibu, p.nama_ayah, ak.nika
     FROM anggota_keluarga ak
     JOIN krama k ON k.id = ak.krama_id
     JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id AND kk.kode = 'MIPIL'
     JOIN penduduk p ON p.id = ak.penduduk_id
     WHERE ak.status = 'aktif' AND k.id IN (${anggotaPlaceholders})
     ORDER BY k.nomor_kartu, ak.urut_dalam_keluarga`,
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
    r.nama_ibu ?? "",
    r.nama_ayah ?? "",
    r.nika ?? "",
  ]);

  return { krama, anggota };
}

function buildSheets(
  data: { krama: (string | number)[][]; anggota: (string | number)[][] },
  includeExamples: boolean
): ExcelSheetInput[] {
  return [
    {
      name: KRAMA_SHEET_NAMES.krama,
      headers: [...KRAMA_HEADERS.krama],
      rows: includeExamples ? [...MIPIL_EXAMPLE.krama, ...data.krama] : data.krama,
    },
    {
      name: KRAMA_SHEET_NAMES.anggota,
      headers: [...KRAMA_HEADERS.anggota],
      rows: includeExamples ? [...MIPIL_EXAMPLE.anggota, ...data.anggota] : data.anggota,
    },
    petunjukSheet(),
  ];
}

export async function downloadKramaTemplate(): Promise<boolean> {
  const empty = { krama: [], anggota: [] };
  return downloadExcel(KRAMA_EXPORT_FILENAME, buildSheets(empty, true));
}

export async function downloadKramaExport(opts?: MipilExportOptions): Promise<boolean> {
  const data = await loadMipilExport(opts);
  return downloadExcel(KRAMA_EXPORT_FILENAME, buildSheets(data, false));
}
