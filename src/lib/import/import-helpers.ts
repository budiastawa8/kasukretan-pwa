import { parseIsoDateString } from "../date-iso";
import { cellStr, type SheetCell, type SheetRows } from "../excel-import";
import {
  normalizeAlasanTidakAktif,
  normalizeKramaStatus,
  type AlasanTidakAktifKode,
  type KramaStatusKode,
} from "../krama-status";
import type { ImportIssue, ImportSheetSummary } from "./import-types";

export const MAX_IMPORT_ROWS = 500;

export const OPTIONAL_KRAMA_STATUS_HEADERS = [
  "alasan_tidak_aktif",
  "tanggal_tidak_aktif",
] as const;

export function normalizeImportHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

export function validateImportHeaders(
  sheetName: string,
  rows: SheetRows,
  expected: readonly string[],
  errors: ImportIssue[],
  optionalAtEnd: readonly string[] = OPTIONAL_KRAMA_STATUS_HEADERS
): boolean {
  const header = rows[0];
  if (!header?.length) {
    errors.push({ sheet: sheetName, excelRow: 1, message: "Header sheet tidak ditemukan" });
    return false;
  }
  const actual = header.map((h) => normalizeImportHeader(String(h ?? "")));
  const exp = expected.map(normalizeImportHeader);
  const minCols = exp.length - optionalAtEnd.length;
  if (actual.length < minCols) {
    errors.push({
      sheet: sheetName,
      excelRow: 1,
      message: `Header minimal: ${expected.slice(0, minCols).join(", ")}`,
    });
    return false;
  }
  for (let i = 0; i < exp.length; i++) {
    if (i >= actual.length) break;
    if (actual[i] !== exp[i]) {
      errors.push({
        sheet: sheetName,
        excelRow: 1,
        message: `Header harus: ${expected.join(", ")}`,
      });
      return false;
    }
  }
  return true;
}

export function buildHeaderColumnMap(headerRow: SheetCell[] | undefined): Map<string, number> {
  const map = new Map<string, number>();
  if (!headerRow?.length) return map;
  for (let i = 0; i < headerRow.length; i++) {
    const key = normalizeImportHeader(String(headerRow[i] ?? ""));
    if (key && !map.has(key)) map.set(key, i);
  }
  return map;
}

export function cellAt(
  row: SheetCell[] | undefined,
  colMap: Map<string, number>,
  column: string
): string {
  const idx = colMap.get(normalizeImportHeader(column));
  if (idx === undefined) return "";
  return cellStr(row, idx);
}

export function hasMappedColumn(colMap: Map<string, number>, column: string): boolean {
  return colMap.has(normalizeImportHeader(column));
}

export function bumpSummary(
  summaries: Map<string, ImportSheetSummary>,
  sheet: string,
  field: "creates" | "updates" | "errors" | "warnings"
): void {
  summaries.get(sheet)![field] += 1;
}

export function normalizeJenisKelaminImport(raw: string): string {
  const v = raw.trim().toUpperCase();
  if (v === "L" || v === "LAKI-LAKI" || v === "LAKI LAKI") return "L";
  if (v === "P" || v === "PEREMPUAN") return "P";
  return raw.trim();
}

export function parseImportDateField(
  raw: string,
  sheet: string,
  excelRow: number,
  column: string,
  errors: ImportIssue[],
  required = false
): string | undefined {
  if (!raw) {
    if (required) {
      errors.push({ sheet, excelRow, column, message: `${column} wajib diisi` });
    }
    return undefined;
  }
  const iso = parseIsoDateString(raw);
  if (!iso) {
    errors.push({ sheet, excelRow, column, message: `${column} tidak valid (gunakan dd/mm/yyyy)` });
    return undefined;
  }
  return iso;
}

export function parseImportKramaStatus(
  statusRaw: string,
  alasanRaw: string | undefined,
  tanggalRaw: string | undefined,
  sheet: string,
  excelRow: number,
  errors: ImportIssue[],
  hasAlasanColumn: boolean
): {
  statusKrama: KramaStatusKode;
  alasanTidakAktif?: AlasanTidakAktifKode;
  tanggalTidakAktif?: string;
} | null {
  const statusCell = statusRaw.trim().toLowerCase();
  let statusKrama = normalizeKramaStatus(statusRaw);
  let alasanTidakAktif = normalizeAlasanTidakAktif(alasanRaw);

  if (
    statusCell === "meninggal" ||
    statusCell === "pindah" ||
    statusCell === "pawanengan_3_bulan" ||
    statusCell.includes("pawanengan")
  ) {
    statusKrama = "nonaktif";
    alasanTidakAktif =
      statusCell === "meninggal" || statusCell === "pindah"
        ? statusCell
        : normalizeAlasanTidakAktif(statusCell) ?? "pawanengan_3_bulan";
  } else if (statusKrama === "aktif" && alasanTidakAktif) {
    statusKrama = "nonaktif";
  }

  if (statusKrama !== "nonaktif") {
    return { statusKrama };
  }

  if (!alasanTidakAktif) {
    errors.push({
      sheet,
      excelRow,
      column: "alasan_tidak_aktif",
      message: hasAlasanColumn
        ? "Wajib diisi (meninggal, pindah, atau pawanengan_3_bulan) bila status_krama nonaktif"
        : "Wajib diisi (meninggal, pindah, atau pawanengan_3_bulan) bila status_krama nonaktif. Unduh ulang template impor.",
    });
    return null;
  }

  const tanggalTidakAktif = tanggalRaw?.trim();
  if (!tanggalTidakAktif) {
    errors.push({
      sheet,
      excelRow,
      column: "tanggal_tidak_aktif",
      message: "Wajib diisi bila status_krama nonaktif",
    });
    return null;
  }

  return { statusKrama, alasanTidakAktif, tanggalTidakAktif };
}

export function tempekLookupKey(banjarKode: string, nama: string): string {
  return `${banjarKode}|${nama.trim().toLowerCase()}`;
}

export function kartuLinkKey(kartuRef: string, nomorKartu: string): string {
  return (nomorKartu.trim() || kartuRef.trim()).toLowerCase();
}

export function kartuLinkLabel(kartuRef: string, nomorKartu: string): string {
  if (nomorKartu.trim() && kartuRef.trim()) {
    return `nomor_kartu "${nomorKartu.trim()}" (kartu_ref "${kartuRef.trim()}")`;
  }
  if (nomorKartu.trim()) return `nomor_kartu "${nomorKartu.trim()}"`;
  return `kartu_ref "${kartuRef.trim()}"`;
}
