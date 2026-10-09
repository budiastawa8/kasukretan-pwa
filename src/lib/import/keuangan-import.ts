import { parseIsoDateString } from "../date-iso";
import { getDb } from "../db/client";
import { nomorKartuLookupKey } from "../penomoran";
import { cellStr, getSheet, isEmptyRow, parseWorkbook, type SheetRows } from "../excel-import";
import { parseBulan, parseTahun } from "../dudukan-hitung";
import { parseJumlahPembayaran, parsePembayaranJenis } from "../paturunan-hitung";
import type { PaturunanPembayaranJenis } from "../types";
import {
  createPembayaranDudukan,
  updatePembayaranDudukan,
} from "../services/dudukan-pembayaran";
import {
  createPembayaranPaturunan,
  updatePembayaranPaturunan,
} from "../services/paturunan-pembayaran";
import type { ImportIssue, ImportPreviewResult, ImportSheetSummary } from "./import-types";
import {
  KEUANGAN_HEADERS,
  KEUANGAN_SHEET_NAMES,
  type KeuanganImportMode,
} from "./keuangan-template";

const MAX_ROWS = 500;

export type KeuanganImportOp =
  | {
      kind: "createPaturunan";
      nomorKartu: string;
      kramaId: string;
      iuranId: string;
      jenis: PaturunanPembayaranJenis;
      jumlah: number;
      tanggal: string;
      petugasId: string;
      keterangan?: string;
    }
  | {
      kind: "updatePaturunan";
      id: string;
      kramaId: string;
      jenis: PaturunanPembayaranJenis;
      jumlah: number;
      tanggal: string;
      petugasId: string;
      keterangan?: string;
    }
  | {
      kind: "createDudukan";
      nomorKartu: string;
      kramaId: string;
      tahun: number;
      bulan: number;
      jumlah: number;
      tanggal: string;
      petugasId: string;
      keterangan?: string;
    }
  | {
      kind: "updateDudukan";
      id: string;
      kramaId: string;
      tahun: number;
      bulan: number;
      jumlah: number;
      tanggal: string;
      petugasId: string;
      keterangan?: string;
    };

export type KeuanganImportPreview = ImportPreviewResult<KeuanganImportOp>;

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

function bump(
  summaries: Map<string, ImportSheetSummary>,
  sheet: string,
  field: "creates" | "updates" | "errors" | "warnings"
): void {
  const s = summaries.get(sheet)!;
  s[field] += 1;
}

function validateHeaders(
  sheetName: string,
  rows: SheetRows,
  expected: readonly string[],
  errors: ImportIssue[]
): boolean {
  const header = rows[0];
  if (!header?.length) {
    errors.push({ sheet: sheetName, excelRow: 1, message: "Header sheet tidak ditemukan" });
    return false;
  }
  const actual = header.map((h) => normalizeHeader(String(h ?? "")));
  const exp = expected.map(normalizeHeader);
  if (!exp.every((col, i) => actual[i] === col)) {
    errors.push({
      sheet: sheetName,
      excelRow: 1,
      message: `Header harus: ${expected.join(", ")}`,
    });
    return false;
  }
  return true;
}

function parseDateField(
  raw: string,
  sheet: string,
  excelRow: number,
  errors: ImportIssue[]
): string | null {
  if (!raw) {
    errors.push({ sheet, excelRow, column: "tanggal", message: "tanggal wajib diisi" });
    return null;
  }
  const iso = parseIsoDateString(raw);
  if (!iso) {
    errors.push({ sheet, excelRow, column: "tanggal", message: "tanggal tidak valid" });
    return null;
  }
  return iso;
}

type LookupMaps = {
  kramaMipilByNomor: Map<string, string>;
  kramaPemasihByNomor: Map<string, string>;
  iuranByNama: Map<string, string>;
  timByKey: Map<string, string>;
  paturunanById: Map<string, { kramaId: string; iuranId: string }>;
  paturunanByComposite: Map<string, string>;
  dudukanById: Map<string, { kramaId: string }>;
  dudukanByComposite: Map<string, string>;
};

async function loadLookups(mode: KeuanganImportMode): Promise<LookupMaps> {
  const db = await getDb();

  const kramaMipil = await db.select<{ id: string; nomor_kartu: string }[]>(
    `SELECT k.id, k.nomor_kartu FROM krama k
     JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id AND kk.kode = 'MIPIL'`
  );
  const kramaPemasih = await db.select<{ id: string; nomor_kartu: string }[]>(
    `SELECT k.id, k.nomor_kartu FROM krama k
     JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
       AND kk.kode IN ('KRAMA_TAMIU', 'TAMIU')`
  );

  const iuran = await db.select<{ id: string; nama: string }[]>(
    `SELECT id, nama FROM iuran_paturunan WHERE aktif = 1`
  );

  const tim = await db.select<{ id: string; nama: string; banjar_kode: string }[]>(
    `SELECT t.id, t.nama, b.kode as banjar_kode
     FROM tim_kasukretan t JOIN banjar b ON b.id = t.banjar_id AND b.aktif = 1`
  );

  const paturunanById = new Map<string, { kramaId: string; iuranId: string }>();
  const paturunanByComposite = new Map<string, string>();
  if (mode === "paturunan") {
    const pp = await db.select<
      { id: string; krama_id: string; iuran_id: string; nomor_kartu: string; iuran_nama: string; jenis: string; tanggal: string; jumlah: number }[]
    >(
      `SELECT p.id, p.krama_id, p.iuran_id, k.nomor_kartu, i.nama as iuran_nama,
              COALESCE(p.jenis, 'wajib') as jenis, p.tanggal, p.jumlah
       FROM paturunan_pembayaran p
       JOIN krama k ON k.id = p.krama_id
       JOIN iuran_paturunan i ON i.id = p.iuran_id`
    );
    for (const r of pp) {
      paturunanById.set(r.id, { kramaId: r.krama_id, iuranId: r.iuran_id });
      const key = `${nomorKartuLookupKey(r.nomor_kartu)}|${r.iuran_nama.toLowerCase()}|${r.tanggal}|${r.jenis}|${Math.round(r.jumlah)}`;
      paturunanByComposite.set(key, r.id);
    }
  }

  const dudukanById = new Map<string, { kramaId: string }>();
  const dudukanByComposite = new Map<string, string>();
  if (mode === "dudukan") {
    const dp = await db.select<
      { id: string; krama_id: string; nomor_kartu: string; tahun: number; bulan: number; tanggal: string; jumlah: number }[]
    >(
      `SELECT p.id, p.krama_id, k.nomor_kartu, p.tahun, p.bulan, p.tanggal, p.jumlah
       FROM dudukan_pembayaran p JOIN krama k ON k.id = p.krama_id`
    );
    for (const r of dp) {
      dudukanById.set(r.id, { kramaId: r.krama_id });
      const key = `${nomorKartuLookupKey(r.nomor_kartu)}|${r.tahun}|${r.bulan}|${r.tanggal}|${Math.round(r.jumlah)}`;
      dudukanByComposite.set(key, r.id);
    }
  }

  return {
    kramaMipilByNomor: new Map(kramaMipil.map((k) => [nomorKartuLookupKey(k.nomor_kartu), k.id])),
    kramaPemasihByNomor: new Map(
      kramaPemasih.map((k) => [nomorKartuLookupKey(k.nomor_kartu), k.id])
    ),
    iuranByNama: new Map(iuran.map((i) => [i.nama.trim().toLowerCase(), i.id])),
    timByKey: new Map(
      tim.map((t) => [`${t.banjar_kode}|${t.nama.trim().toLowerCase()}`, t.id])
    ),
    paturunanById,
    paturunanByComposite,
    dudukanById,
    dudukanByComposite,
  };
}

/** Cegah duplikat dalam file: id unik per pembayaran_id; baris baru paturunan per composite. */
function registerInFileRow(
  pembayaranId: string,
  composite: string,
  mode: KeuanganImportMode,
  sheetName: string,
  excelRow: number,
  seenPembayaranIds: Set<string>,
  seenNewComposites: Set<string>,
  errors: ImportIssue[],
  summaries: Map<string, ImportSheetSummary>
): boolean {
  if (pembayaranId) {
    if (seenPembayaranIds.has(pembayaranId)) {
      errors.push({
        sheet: sheetName,
        excelRow,
        column: "pembayaran_id",
        message: "pembayaran_id duplikat dalam file",
      });
      bump(summaries, sheetName, "errors");
      return false;
    }
    seenPembayaranIds.add(pembayaranId);
    return true;
  }
  // Dudukan: beberapa pembayaran per periode (cicilan) — composite boleh sama antar baris.
  if (mode === "dudukan") return true;
  if (seenNewComposites.has(composite)) {
    errors.push({ sheet: sheetName, excelRow, message: "Baris duplikat dalam file" });
    bump(summaries, sheetName, "errors");
    return false;
  }
  seenNewComposites.add(composite);
  return true;
}

function resolvePetugas(
  banjarKode: string,
  petugasNama: string,
  maps: LookupMaps,
  sheet: string,
  excelRow: number,
  errors: ImportIssue[]
): string | null {
  const kode = banjarKode.padStart(2, "0").slice(-2);
  const key = `${kode}|${petugasNama.trim().toLowerCase()}`;
  const id = maps.timByKey.get(key);
  if (!id) {
    errors.push({
      sheet,
      excelRow,
      column: "petugas_nama",
      message: `Petugas "${petugasNama}" di banjar ${kode} tidak ditemukan`,
    });
    return null;
  }
  return id;
}

export async function validateKeuanganImport(
  bytes: Uint8Array,
  filename: string,
  mode: KeuanganImportMode
): Promise<KeuanganImportPreview> {
  const sheets = parseWorkbook(bytes);
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const operations: KeuanganImportOp[] = [];

  const sheetName = KEUANGAN_SHEET_NAMES[mode];
  const headers = KEUANGAN_HEADERS[mode];
  const summaries = new Map<string, ImportSheetSummary>([
    [sheetName, { sheet: sheetName, creates: 0, updates: 0, errors: 0, warnings: 0 }],
  ]);

  const rows = getSheet(sheets, sheetName) ?? [];
  if (!validateHeaders(sheetName, rows, headers, errors)) {
    return {
      filename,
      canCommit: false,
      summaries: [...summaries.values()],
      errors,
      warnings,
      operations,
    };
  }

  const maps = await loadLookups(mode);
  const seenPembayaranIds = new Set<string>();
  const seenNewComposites = new Set<string>();
  const dataRows = rows.slice(1);

  for (let i = 0; i < Math.min(dataRows.length, MAX_ROWS); i++) {
    const row = dataRows[i];
    const excelRow = i + 2;
    if (isEmptyRow(row)) continue;

    const pembayaranId = cellStr(row, 0);
    const nomorKartu = cellStr(row, 1);
    if (!nomorKartu) {
      errors.push({ sheet: sheetName, excelRow, column: "nomor_kartu", message: "Wajib diisi" });
      bump(summaries, sheetName, "errors");
      continue;
    }

    const kramaId =
      mode === "paturunan"
        ? maps.kramaMipilByNomor.get(nomorKartuLookupKey(nomorKartu))
        : maps.kramaPemasihByNomor.get(nomorKartuLookupKey(nomorKartu));
    if (!kramaId) {
      errors.push({
        sheet: sheetName,
        excelRow,
        column: "nomor_kartu",
        message: `Kartu ${nomorKartu} tidak ditemukan`,
      });
      bump(summaries, sheetName, "errors");
      continue;
    }

    const tanggal = parseDateField(cellStr(row, mode === "paturunan" ? 5 : 5), sheetName, excelRow, errors);
    if (!tanggal) {
      bump(summaries, sheetName, "errors");
      continue;
    }

    const banjarKode = cellStr(row, mode === "paturunan" ? 6 : 6);
    const petugasNama = cellStr(row, mode === "paturunan" ? 7 : 7);
    const petugasId = resolvePetugas(banjarKode, petugasNama, maps, sheetName, excelRow, errors);
    if (!petugasId) {
      bump(summaries, sheetName, "errors");
      continue;
    }

    const keterangan = cellStr(row, mode === "paturunan" ? 8 : 8) || undefined;

    if (mode === "paturunan") {
      const iuranNama = cellStr(row, 2);
      const iuranId = maps.iuranByNama.get(iuranNama.toLowerCase());
      if (!iuranId) {
        errors.push({
          sheet: sheetName,
          excelRow,
          column: "iuran_nama",
          message: `Iuran "${iuranNama}" tidak ditemukan`,
        });
        bump(summaries, sheetName, "errors");
        continue;
      }

      let jenis: PaturunanPembayaranJenis;
      try {
        jenis = parsePembayaranJenis(cellStr(row, 3));
      } catch (e) {
        errors.push({ sheet: sheetName, excelRow, column: "jenis", message: String(e) });
        bump(summaries, sheetName, "errors");
        continue;
      }

      let jumlah: number;
      try {
        jumlah = parseJumlahPembayaran(Number(cellStr(row, 4).replace(/[^\d.-]/g, "")));
      } catch (e) {
        errors.push({ sheet: sheetName, excelRow, column: "jumlah", message: String(e) });
        bump(summaries, sheetName, "errors");
        continue;
      }

      const composite = `${nomorKartuLookupKey(nomorKartu)}|${iuranNama.toLowerCase()}|${tanggal}|${jenis}|${Math.round(jumlah)}`;
      if (
        !registerInFileRow(
          pembayaranId,
          composite,
          mode,
          sheetName,
          excelRow,
          seenPembayaranIds,
          seenNewComposites,
          errors,
          summaries
        )
      ) {
        continue;
      }

      if (pembayaranId && maps.paturunanById.has(pembayaranId)) {
        operations.push({
          kind: "updatePaturunan",
          id: pembayaranId,
          kramaId,
          jenis,
          jumlah,
          tanggal,
          petugasId,
          keterangan,
        });
        bump(summaries, sheetName, "updates");
      } else if (maps.paturunanByComposite.has(composite)) {
        warnings.push({
          sheet: sheetName,
          excelRow,
          message: "Pembayaran sudah ada — dilewati (round-trip idempoten)",
        });
        bump(summaries, sheetName, "warnings");
      } else {
        operations.push({
          kind: "createPaturunan",
          nomorKartu,
          kramaId,
          iuranId,
          jenis,
          jumlah,
          tanggal,
          petugasId,
          keterangan,
        });
        bump(summaries, sheetName, "creates");
      }
    } else {
      let tahun: number;
      let bulan: number;
      try {
        tahun = parseTahun(Number(cellStr(row, 2)));
        bulan = parseBulan(Number(cellStr(row, 3)));
      } catch (e) {
        errors.push({ sheet: sheetName, excelRow, message: String(e) });
        bump(summaries, sheetName, "errors");
        continue;
      }

      let jumlah: number;
      try {
        jumlah = parseJumlahPembayaran(Number(cellStr(row, 4).replace(/[^\d.-]/g, "")));
      } catch (e) {
        errors.push({ sheet: sheetName, excelRow, column: "jumlah", message: String(e) });
        bump(summaries, sheetName, "errors");
        continue;
      }

      const composite = `${nomorKartuLookupKey(nomorKartu)}|${tahun}|${bulan}|${tanggal}|${Math.round(jumlah)}`;
      if (
        !registerInFileRow(
          pembayaranId,
          composite,
          mode,
          sheetName,
          excelRow,
          seenPembayaranIds,
          seenNewComposites,
          errors,
          summaries
        )
      ) {
        continue;
      }

      if (pembayaranId && maps.dudukanById.has(pembayaranId)) {
        operations.push({
          kind: "updateDudukan",
          id: pembayaranId,
          kramaId,
          tahun,
          bulan,
          jumlah,
          tanggal,
          petugasId,
          keterangan,
        });
        bump(summaries, sheetName, "updates");
      } else if (maps.dudukanByComposite.has(composite)) {
        warnings.push({
          sheet: sheetName,
          excelRow,
          message: "Pembayaran sudah ada — dilewati (round-trip idempoten)",
        });
        bump(summaries, sheetName, "warnings");
      } else {
        operations.push({
          kind: "createDudukan",
          nomorKartu,
          kramaId,
          tahun,
          bulan,
          jumlah,
          tanggal,
          petugasId,
          keterangan,
        });
        bump(summaries, sheetName, "creates");
      }
    }
  }

  return {
    filename,
    canCommit: errors.length === 0 && operations.length > 0,
    summaries: [...summaries.values()],
    errors,
    warnings,
    operations,
  };
}

export async function commitKeuanganImport(preview: KeuanganImportPreview): Promise<void> {
  if (!preview.canCommit) {
    throw new Error("Impor tidak dapat disimpan: masih ada error validasi");
  }

  for (const op of preview.operations) {
    if (op.kind === "createPaturunan") {
      await createPembayaranPaturunan(
        {
          kramaId: op.kramaId,
          iuranId: op.iuranId,
          jenis: op.jenis,
          jumlah: op.jumlah,
          tanggal: op.tanggal,
          petugasId: op.petugasId,
          keterangan: op.keterangan,
        },
        { riwayatImport: true }
      );
    } else if (op.kind === "updatePaturunan") {
      await updatePembayaranPaturunan(op.id, {
        kramaId: op.kramaId,
        jenis: op.jenis,
        jumlah: op.jumlah,
        tanggal: op.tanggal,
        petugasId: op.petugasId,
        keterangan: op.keterangan,
      });
    } else if (op.kind === "createDudukan") {
      await createPembayaranDudukan(
        {
          kramaId: op.kramaId,
          tahun: op.tahun,
          bulan: op.bulan,
          jumlah: op.jumlah,
          tanggal: op.tanggal,
          petugasId: op.petugasId,
          keterangan: op.keterangan,
        },
        { riwayatImport: true }
      );
    } else if (op.kind === "updateDudukan") {
      await updatePembayaranDudukan(
        op.id,
        {
          kramaId: op.kramaId,
          tahun: op.tahun,
          bulan: op.bulan,
          jumlah: op.jumlah,
          tanggal: op.tanggal,
          petugasId: op.petugasId,
          keterangan: op.keterangan,
        },
        { riwayatImport: true }
      );
    }
  }
}

export function assertKeuanganWorkbookStructure(
  sheets: Map<string, SheetRows>,
  mode: KeuanganImportMode
): string[] {
  const problems: string[] = [];
  const name = KEUANGAN_SHEET_NAMES[mode];
  const headers = KEUANGAN_HEADERS[mode];
  const rows = getSheet(sheets, name);
  if (!rows?.length) {
    problems.push(`Sheet ${name} tidak ditemukan`);
    return problems;
  }
  const header = rows[0]?.map((h) => normalizeHeader(String(h ?? ""))) ?? [];
  const exp = headers.map(normalizeHeader);
  if (!exp.every((col, i) => header[i] === col)) {
    problems.push(`Header sheet ${name} tidak sesuai`);
  }
  return problems;
}
