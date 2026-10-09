import { getDb } from "../db/client";
import { downloadExcel } from "../excel-export";
import type { ExcelSheetInput } from "../excel-export";
import {
  listBanjar,
  listJenisKramaTamiu,
  listJenisMipil,
  listJenisTamiu,
  listTimKasukretan,
} from "../services/master";

export const MASTER_EXPORT_FILENAME = "master-kasukretan.xlsx";

export const MASTER_SHEET_NAMES = {
  banjar: "Banjar",
  tempek: "Tempek",
  arahan: "Arahan",
  jenisMipil: "JenisMipil",
  jenisKramaTamiu: "JenisKramaTamiu",
  jenisTamiu: "JenisTamiu",
  tim: "TimKasukretan",
  petunjuk: "Petunjuk",
} as const;

export type MasterSheetKey = keyof typeof MASTER_SHEET_NAMES;

export const MASTER_SHEET_HEADERS: Record<Exclude<MasterSheetKey, "petunjuk">, string[]> = {
  banjar: ["kode", "nama"],
  tempek: ["banjar_kode", "nama", "kode"],
  arahan: ["tempek_nama", "banjar_kode", "nama", "kode"],
  jenisMipil: ["nama", "paturunan_persen", "masa_berlaku_tahun"],
  jenisKramaTamiu: ["nama", "dudukan_nominal", "masa_berlaku_tahun"],
  jenisTamiu: ["nama", "dudukan_nominal", "masa_berlaku_tahun"],
  tim: ["banjar_kode", "nama", "jabatan"],
};

const EXAMPLE_ROWS: Record<Exclude<MasterSheetKey, "petunjuk">, (string | number)[][]> = {
  banjar: [["01", "Banjar Contoh"]],
  tempek: [["01", "Tempek Contoh", "T01"]],
  arahan: [["Tempek Contoh", "01", "Arahan Contoh", "A01"]],
  jenisMipil: [["Jenis Mipil Contoh", 100, 1]],
  jenisKramaTamiu: [["Jenis KT Contoh", 50000, 1]],
  jenisTamiu: [["Jenis Tamiu Contoh", 25000, 1]],
  tim: [["01", "Petugas Contoh", "Penagih"]],
};

const PETUNJUK_LINES = [
  "PETUNJUK IMPOR MASTER KASUKRETAN",
  "",
  "1. Jangan ubah nama sheet (Banjar, Tempek, Arahan, JenisMipil, JenisKramaTamiu, JenisTamiu, TimKasukretan).",
  "2. Baris pertama setiap sheet adalah header — jangan dihapus.",
  "3. Hapus baris contoh sebelum impor, atau ganti dengan data Anda.",
  "4. Urutan isi: Banjar → Tempek → Arahan → Jenis → Tim Kasukretan.",
  "5. Kode banjar: 2 digit (contoh 01, 02).",
  "6. paturunan_persen: 0–100 (100 = bayar penuh).",
  "7. masa_berlaku_tahun: bilangan bulat minimal 1 (opsional).",
  "8. Maksimal ~500 baris data per sheet.",
  "9. Gunakan Ekspor data untuk format yang sudah terisi dari database.",
];

function petunjukSheet(): ExcelSheetInput {
  return {
    name: MASTER_SHEET_NAMES.petunjuk,
    headers: ["petunjuk"],
    rows: PETUNJUK_LINES.map((line) => [line]),
  };
}

function dataSheets(
  data: Record<Exclude<MasterSheetKey, "petunjuk">, (string | number)[][]>,
  includeExamples: boolean
): ExcelSheetInput[] {
  const keys = Object.keys(MASTER_SHEET_HEADERS) as Exclude<MasterSheetKey, "petunjuk">[];
  return keys.map((key) => ({
    name: MASTER_SHEET_NAMES[key],
    headers: MASTER_SHEET_HEADERS[key],
    rows: includeExamples
      ? [...EXAMPLE_ROWS[key], ...data[key]]
      : data[key],
  }));
}

async function loadExportData(): Promise<
  Record<Exclude<MasterSheetKey, "petunjuk">, (string | number)[][]>
> {
  const banjar = await listBanjar();
  const jenisMipil = await listJenisMipil();
  const jenisKT = await listJenisKramaTamiu();
  const jenisT = await listJenisTamiu();
  const tim = await listTimKasukretan();

  const db = await getDb();
  const tempekRows = await db.select<
    { nama: string; kode: string | null; banjar_kode: string }[]
  >(
    `SELECT t.nama, t.kode, b.kode as banjar_kode
     FROM tempek t
     JOIN banjar b ON b.id = t.banjar_id AND b.aktif = 1
     WHERE t.aktif = 1
     ORDER BY b.kode ASC, t.created_at ASC`
  );

  const arahanRows = await db.select<
    { nama: string; kode: string | null; tempek_nama: string; banjar_kode: string }[]
  >(
    `SELECT a.nama, a.kode, t.nama as tempek_nama, b.kode as banjar_kode
     FROM arahan a
     JOIN tempek t ON t.id = a.tempek_id AND t.aktif = 1
     JOIN banjar b ON b.id = t.banjar_id AND b.aktif = 1
     WHERE a.aktif = 1
     ORDER BY b.kode ASC, t.created_at ASC, a.created_at ASC`
  );

  return {
    banjar: banjar.map((b) => [b.kode, b.nama]),
    tempek: tempekRows.map((t) => [t.banjar_kode, t.nama, t.kode ?? ""]),
    arahan: arahanRows.map((a) => [a.tempek_nama, a.banjar_kode, a.nama, a.kode ?? ""]),
    jenisMipil: jenisMipil.map((j) => [
      j.nama,
      j.paturunan_persen,
      j.masa_berlaku_tahun ?? "",
    ]),
    jenisKramaTamiu: jenisKT.map((j) => [
      j.nama,
      j.dudukan_nominal ?? 0,
      j.masa_berlaku_tahun ?? "",
    ]),
    jenisTamiu: jenisT.map((j) => [
      j.nama,
      j.dudukan_nominal ?? 0,
      j.masa_berlaku_tahun ?? "",
    ]),
    tim: tim.map((t) => [t.banjar_kode, t.nama, t.jabatan]),
  };
}

/** Unduh template kosong (header + baris contoh). */
export async function downloadMasterTemplate(): Promise<boolean> {
  const empty: Record<Exclude<MasterSheetKey, "petunjuk">, (string | number)[][]> = {
    banjar: [],
    tempek: [],
    arahan: [],
    jenisMipil: [],
    jenisKramaTamiu: [],
    jenisTamiu: [],
    tim: [],
  };
  const sheets = [...dataSheets(empty, true), petunjukSheet()];
  return downloadExcel(MASTER_EXPORT_FILENAME, sheets);
}

/** Ekspor data master existing (format identik template, tanpa baris contoh). */
export async function downloadMasterExport(): Promise<boolean> {
  const data = await loadExportData();
  const sheets = [...dataSheets(data, false), petunjukSheet()];
  return downloadExcel(MASTER_EXPORT_FILENAME, sheets);
}

/** Bangun workbook bytes untuk uji round-trip (tanpa dialog simpan). */
export async function buildMasterWorkbookBytes(
  mode: "template" | "export"
): Promise<Uint8Array> {
  const XLSX = await import("xlsx");
  let sheets: ExcelSheetInput[];

  if (mode === "template") {
    const empty: Record<Exclude<MasterSheetKey, "petunjuk">, (string | number)[][]> = {
      banjar: [],
      tempek: [],
      arahan: [],
      jenisMipil: [],
      jenisKramaTamiu: [],
      jenisTamiu: [],
      tim: [],
    };
    sheets = [...dataSheets(empty, true), petunjukSheet()];
  } else {
    const data = await loadExportData();
    sheets = [...dataSheets(data, false), petunjukSheet()];
  }

  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const aoa: (string | number)[][] = [
      sheet.headers,
      ...sheet.rows.map((row) => row.map((c) => (c == null ? "" : c))),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31));
  }
  const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Uint8Array(buffer);
}
