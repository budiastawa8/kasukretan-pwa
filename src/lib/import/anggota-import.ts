import { parseIsoDateString } from "../date-iso";
import { getDb } from "../db/client";
import { cellStr, getSheet, isEmptyRow, parseWorkbook, type SheetRows } from "../excel-import";
import { nomorKartuLookupKey, stripPenomoranDash } from "../penomoran";
import {
  addAnggota,
  getKramaDetail,
  updateAnggota,
  type AddAnggotaInput,
  type UpdateAnggotaInput,
} from "../services/krama";
import {
  formatStatusKeluargaAnggota,
  gelarKepalaStatus,
  isGelarKepalaStatus,
  isKepalaPenduduk,
  isValidStatusKeluarga,
  isValidStatusKeluargaMipil,
  statusKeluargaOptions,
} from "../status-keluarga";
import { normalizeStatusKawinKode } from "../status-kawin";
import { agamaForPenduduk } from "../agama-tamiu";
import type { AnggotaKeluarga, KlasifikasiKode } from "../types";
import type { ImportIssue, ImportPreviewResult, ImportSheetSummary } from "./import-types";
import {
  ANGGOTA_HEADERS,
  ANGGOTA_SHEET_NAMES,
} from "./anggota-template";
const MAX_ROWS = 500;

export type AnggotaImportOp =
  | { kind: "add"; kramaId: string; input: AddAnggotaInput }
  | {
      kind: "update";
      kramaId: string;
      anggotaId: string;
      input: UpdateAnggotaInput;
    };

export type AnggotaImportPreview = ImportPreviewResult<AnggotaImportOp>;

export type AnggotaImportScope = {
  /** Jika diisi, semua baris hanya untuk kartu ini */
  kramaId?: string;
  nomorKartu?: string;
};

type ParsedRow = {
  excelRow: number;
  nomorKartu: string;
  anggotaId: string;
  nama_lengkap: string;
  jenis_kelamin: string;
  status_keluarga: string;
  tempat_lahir?: string;
  tanggal_lahir?: string;
  status_kawin?: string;
  pekerjaan?: string;
  nama_ibu?: string;
  nama_ayah?: string;
  nika?: string;
  nik_atau_nika?: string;
  agama?: string;
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

function bump(
  summary: ImportSheetSummary,
  field: "creates" | "updates" | "errors" | "warnings"
): void {
  summary[field] += 1;
}

function normalizeJenisKelamin(raw: string): string {
  const v = raw.trim().toUpperCase();
  if (v === "L" || v === "LAKI-LAKI" || v === "LAKI LAKI") return "L";
  if (v === "P" || v === "PEREMPUAN") return "P";
  return raw.trim();
}

function parseDateField(
  raw: string,
  sheet: string,
  excelRow: number,
  column: string,
  errors: ImportIssue[]
): string | undefined {
  if (!raw) return undefined;
  const iso = parseIsoDateString(raw);
  if (!iso) {
    errors.push({ sheet, excelRow, column, message: `${column} tidak valid (gunakan dd/mm/yyyy)` });
    return undefined;
  }
  return iso;
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

function toPendudukFields(row: ParsedRow, kode: KlasifikasiKode) {
  return {
    nama_lengkap: row.nama_lengkap,
    jenis_kelamin: row.jenis_kelamin,
    tempat_lahir: row.tempat_lahir,
    tanggal_lahir: row.tanggal_lahir,
    status_kawin: row.status_kawin
      ? normalizeStatusKawinKode(row.status_kawin) ?? row.status_kawin
      : undefined,
    pekerjaan: row.pekerjaan,
    nama_ibu: kode === "MIPIL" ? row.nama_ibu : undefined,
    nama_ayah: kode === "MIPIL" ? row.nama_ayah : undefined,
    nik_atau_nika: kode !== "MIPIL" ? row.nik_atau_nika : undefined,
    agama: agamaForPenduduk(kode, row.agama) ?? undefined,
  };
}

function matchAnggota(
  detail: { anggota_aktif: AnggotaKeluarga[]; kepala: { id: string } },
  row: ParsedRow,
  kode: KlasifikasiKode
): AnggotaKeluarga | undefined {
  if (row.anggotaId) {
    const byId = detail.anggota_aktif.find((a) => a.anggota_id === row.anggotaId);
    if (byId) return byId;
  }
  return detail.anggota_aktif.find((ex) => {
    if (kode === "MIPIL" && row.nika?.trim() && ex.nika?.trim()) {
      return stripPenomoranDash(ex.nika) === stripPenomoranDash(row.nika);
    }
    if (row.nik_atau_nika?.trim() && ex.nik_atau_nika?.trim()) {
      return ex.nik_atau_nika.trim() === row.nik_atau_nika.trim();
    }
    return (
      ex.nama_lengkap.trim().toLowerCase() === row.nama_lengkap.trim().toLowerCase() &&
      (ex.tanggal_lahir?.slice(0, 10) ?? "") === (row.tanggal_lahir ?? "")
    );
  });
}

async function loadKramaMap(): Promise<
  Map<string, { id: string; nomor_kartu: string; klasifikasi: KlasifikasiKode }>
> {
  const db = await getDb();
  const rows = await db.select<
    { id: string; nomor_kartu: string; klasifikasi: string }[]
  >(
    `SELECT k.id, k.nomor_kartu, kk.kode as klasifikasi
     FROM krama k
     JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id AND kk.kode = 'MIPIL'
     WHERE k.status_krama = 'aktif'`
  );
  return new Map(
    rows.map((r) => [
      nomorKartuLookupKey(r.nomor_kartu),
      { id: r.id, nomor_kartu: r.nomor_kartu, klasifikasi: "MIPIL" as KlasifikasiKode },
    ])
  );
}

export async function validateAnggotaImport(
  bytes: Uint8Array,
  filename: string,
  scope: AnggotaImportScope
): Promise<AnggotaImportPreview> {
  const { kramaId: fixedKramaId, nomorKartu: fixedNomor } = scope;
  const sheetName = ANGGOTA_SHEET_NAMES.anggota;
  const headers = ANGGOTA_HEADERS.anggota;

  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const operations: AnggotaImportOp[] = [];
  const summary: ImportSheetSummary = {
    sheet: sheetName,
    creates: 0,
    updates: 0,
    errors: 0,
    warnings: 0,
  };

  const sheets = parseWorkbook(bytes);
  const anggotaSheet = getSheet(sheets, sheetName) ?? [];

  if (!validateHeaders(sheetName, anggotaSheet, headers, errors)) {
    return {
      filename,
      canCommit: false,
      summaries: [summary],
      errors,
      warnings,
      operations,
    };
  }

  let fixedKrama: { id: string; nomor_kartu: string; klasifikasi: KlasifikasiKode } | null = null;
  if (fixedKramaId) {
    const detail = await getKramaDetail(fixedKramaId);
    if (!detail) {
      errors.push({ sheet: "—", excelRow: 0, message: "Krama tidak ditemukan" });
      return { filename, canCommit: false, summaries: [summary], errors, warnings, operations };
    }
    fixedKrama = {
      id: detail.id,
      nomor_kartu: detail.nomor_kartu,
      klasifikasi: detail.klasifikasi_kode,
    };
  }

  const kramaMap = fixedKrama ? null : await loadKramaMap();
  const detailCache = new Map<string, Awaited<ReturnType<typeof getKramaDetail>>>();

  async function getDetailCached(id: string) {
    let d = detailCache.get(id);
    if (!d) {
      d = await getKramaDetail(id);
      if (d) detailCache.set(id, d);
    }
    return d;
  }

  const dataRows = anggotaSheet.slice(1);
  for (let i = 0; i < Math.min(dataRows.length, MAX_ROWS); i++) {
    const row = dataRows[i];
    const excelRow = i + 2;
    if (isEmptyRow(row)) continue;

    let nomorKartu = cellStr(row, 0);
    const anggotaId = cellStr(row, 1);
    const nama = cellStr(row, 2);
    const jk = normalizeJenisKelamin(cellStr(row, 3));
    const statusRaw = cellStr(row, 4);

    let kramaRef = fixedKrama;
    if (!kramaRef) {
      if (!nomorKartu) {
        errors.push({
          sheet: sheetName,
          excelRow,
          column: "nomor_kartu",
          message: "Wajib diisi (kecuali impor satu kartu)",
        });
        bump(summary, "errors");
        continue;
      }
      kramaRef = kramaMap!.get(nomorKartuLookupKey(nomorKartu)) ?? null;
      if (!kramaRef) {
        errors.push({
          sheet: sheetName,
          excelRow,
          column: "nomor_kartu",
          message: `Kartu ${nomorKartu} tidak ditemukan`,
        });
        bump(summary, "errors");
        continue;
      }
    } else {
      if (nomorKartu && nomorKartuLookupKey(nomorKartu) !== nomorKartuLookupKey(kramaRef.nomor_kartu)) {
        errors.push({
          sheet: sheetName,
          excelRow,
          column: "nomor_kartu",
          message: `Nomor kartu harus ${fixedNomor ?? kramaRef.nomor_kartu}`,
        });
        bump(summary, "errors");
        continue;
      }
      nomorKartu = kramaRef.nomor_kartu;
    }

    const kode = kramaRef.klasifikasi;
    if (!nama) {
      errors.push({ sheet: sheetName, excelRow, column: "nama_lengkap", message: "Wajib diisi" });
      bump(summary, "errors");
      continue;
    }
    if (jk !== "L" && jk !== "P") {
      errors.push({
        sheet: sheetName,
        excelRow,
        column: "jenis_kelamin",
        message: "Gunakan L atau P",
      });
      bump(summary, "errors");
      continue;
    }

    const statusFmt = formatStatusKeluargaAnggota(statusRaw, kode);
    const opts = statusKeluargaOptions(kode);
    if (!opts.some((o) => o.toLowerCase() === statusFmt.toLowerCase())) {
      errors.push({
        sheet: sheetName,
        excelRow,
        column: "status_keluarga",
        message: `Status tidak valid: ${statusRaw}`,
      });
      bump(summary, "errors");
      continue;
    }

    let col = 5;
    const parsed: ParsedRow = {
      excelRow,
      nomorKartu,
      anggotaId,
      nama_lengkap: nama,
      jenis_kelamin: jk,
      status_keluarga: statusFmt,
      tempat_lahir: cellStr(row, col++) || undefined,
      tanggal_lahir: parseDateField(cellStr(row, col++), sheetName, excelRow, "tanggal_lahir", errors),
      status_kawin: cellStr(row, col++) || undefined,
      pekerjaan: cellStr(row, col++) || undefined,
    };

    parsed.nama_ibu = cellStr(row, col++) || undefined;
    parsed.nama_ayah = cellStr(row, col++) || undefined;
    parsed.nika = cellStr(row, col++) || undefined;

    const detail = await getDetailCached(kramaRef.id);
    if (!detail) {
      errors.push({ sheet: sheetName, excelRow, message: "Data krama tidak dapat dimuat" });
      bump(summary, "errors");
      continue;
    }

    const isGelar = isGelarKepalaStatus(statusFmt, kode);
    const matched = matchAnggota(detail, parsed, kode);

    if (isGelar) {
      if (!matched) {
        errors.push({
          sheet: sheetName,
          excelRow,
          message: `Tidak bisa menambah ${gelarKepalaStatus(kode)} lewat impor — tetapkan di aplikasi`,
        });
        bump(summary, "errors");
        continue;
      }
      if (!isKepalaPenduduk(matched.penduduk_id, detail.kepala.id)) {
        errors.push({
          sheet: sheetName,
          excelRow,
          message: `Status ${gelarKepalaStatus(kode)} hanya untuk kepala keluarga yang sudah ada`,
        });
        bump(summary, "errors");
        continue;
      }
      operations.push({
        kind: "update",
        kramaId: kramaRef.id,
        anggotaId: matched.anggota_id,
        input: {
          kramaId: kramaRef.id,
          anggotaId: matched.anggota_id,
          penduduk: toPendudukFields(parsed, kode),
        },
      });
      bump(summary, "updates");
      continue;
    }

    if (kode === "MIPIL" && !isValidStatusKeluargaMipil(statusFmt)) {
      errors.push({
        sheet: sheetName,
        excelRow,
        column: "status_keluarga",
        message: `Status tidak valid: ${statusFmt}`,
      });
      bump(summary, "errors");
      continue;
    }
    if (kode !== "MIPIL" && !isValidStatusKeluarga(statusFmt, kode)) {
      errors.push({
        sheet: sheetName,
        excelRow,
        column: "status_keluarga",
        message: `Status tidak valid: ${statusFmt}`,
      });
      bump(summary, "errors");
      continue;
    }

    if (matched) {
      const isKepala = isKepalaPenduduk(matched.penduduk_id, detail.kepala.id);
      operations.push({
        kind: "update",
        kramaId: kramaRef.id,
        anggotaId: matched.anggota_id,
        input: {
          kramaId: kramaRef.id,
          anggotaId: matched.anggota_id,
          penduduk: toPendudukFields(parsed, kode),
          statusKeluarga: isKepala ? undefined : statusFmt,
        },
      });
      bump(summary, "updates");
    } else {
      operations.push({
        kind: "add",
        kramaId: kramaRef.id,
        input: {
          kramaId: kramaRef.id,
          statusKeluarga: statusFmt,
          penduduk: toPendudukFields(parsed, kode),
          tanggalPencatatan: detail.tanggal_terdaftar,
        },
      });
      bump(summary, "creates");
    }
  }

  return {
    filename,
    canCommit: errors.length === 0 && operations.length > 0,
    summaries: [summary],
    errors,
    warnings,
    operations,
  };
}

export async function commitAnggotaImport(preview: AnggotaImportPreview): Promise<void> {
  if (!preview.canCommit) {
    throw new Error("Impor tidak dapat disimpan: masih ada error validasi");
  }
  for (const op of preview.operations) {
    if (op.kind === "add") {
      await addAnggota(op.input);
    } else {
      await updateAnggota(op.input);
    }
  }
}
