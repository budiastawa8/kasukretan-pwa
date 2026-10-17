import { parseIsoDateString } from "../date-iso";
import { getDb } from "../db/client";
import { nomorKartuLookupKey, stripPenomoranDash } from "../penomoran";
import {
  cellStr,
  getSheet,
  isEmptyRow,
  parseWorkbook,
  type SheetCell,
  type SheetRows,
} from "../excel-import";
import {
  formatStatusKeluargaAnggota,
  gelarKepalaStatus,
  isGelarKepalaStatus,
  isValidStatusKeluargaMipil,
  statusKeluargaOptions,
} from "../status-keluarga";
import {
  addAnggota,
  createKrama,
  getKramaDetail,
  updateAnggota,
  updateKrama,
  type AddAnggotaInput,
  type CreateKramaInput,
  type UpdateAnggotaInput,
  type UpdateKramaInput,
} from "../services/krama";
import { getDesaAdat, isDesaConfigured } from "../services/desa";
import { listBanjar } from "../services/master";
import type { AnggotaDraft } from "../types";
import { uuid } from "../utils";
import type { ImportIssue, ImportPreviewResult, ImportSheetSummary } from "./import-types";
import {
  normalizeAlasanTidakAktif,
  normalizeKramaStatus,
  type AlasanTidakAktifKode,
  type KramaStatusKode,
} from "../krama-status";
import { KRAMA_HEADERS, KRAMA_SHEET_NAMES } from "./krama-template";

const MAX_ROWS = 500;

/** Kolom opsional di akhir sheet Krama (template lama tanpa kolom ini tetap valid). */
const OPTIONAL_KRAMA_HEADERS = ["alasan_tidak_aktif", "tanggal_tidak_aktif"] as const;

export type ParsedAnggotaRow = {
  excelRow: number;
  kartuRef: string;
  nomorKartu: string;
  clientId: string;
  nama_lengkap: string;
  jenis_kelamin: string;
  status_keluarga: string;
  tempat_lahir?: string;
  tanggal_lahir?: string;
  status_kawin?: string;
  pekerjaan?: string;
  nama_ibu?: string;
  nama_ayah?: string;
  nik_atau_nika?: string;
  agama?: string;
  nika?: string;
};

export type KramaImportOp =
  | { kind: "create"; kartuRef: string; input: CreateKramaInput }
  | { kind: "updateKrama"; kramaId: string; input: UpdateKramaInput }
  | { kind: "addAnggota"; kramaId: string; input: AddAnggotaInput }
  | {
      kind: "updateAnggota";
      kramaId: string;
      anggotaId: string;
      input: UpdateAnggotaInput;
    };

export type KramaImportPreview = ImportPreviewResult<KramaImportOp>;

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

function validateHeaders(
  sheetName: string,
  rows: SheetRows,
  expected: readonly string[],
  errors: ImportIssue[],
  optionalAtEnd: readonly string[] = OPTIONAL_KRAMA_HEADERS
): boolean {
  const header = rows[0];
  if (!header?.length) {
    errors.push({ sheet: sheetName, excelRow: 1, message: "Header sheet tidak ditemukan" });
    return false;
  }
  const actual = header.map((h) => normalizeHeader(String(h ?? "")));
  const exp = expected.map(normalizeHeader);
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

function buildHeaderColumnMap(headerRow: SheetCell[] | undefined): Map<string, number> {
  const map = new Map<string, number>();
  if (!headerRow?.length) return map;
  for (let i = 0; i < headerRow.length; i++) {
    const key = normalizeHeader(String(headerRow[i] ?? ""));
    if (key && !map.has(key)) map.set(key, i);
  }
  return map;
}

function cellAt(
  row: SheetCell[] | undefined,
  colMap: Map<string, number>,
  column: string
): string {
  const idx = colMap.get(normalizeHeader(column));
  if (idx === undefined) return "";
  return cellStr(row, idx);
}

function hasMappedColumn(colMap: Map<string, number>, column: string): boolean {
  return colMap.has(normalizeHeader(column));
}

/** status_krama + alasan/tanggal nonaktif dari Excel. */
function parseImportKramaStatus(
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

  if (statusCell === "meninggal" || statusCell === "pindah") {
    statusKrama = "nonaktif";
    alasanTidakAktif = statusCell;
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
        : "Wajib diisi (meninggal, pindah, atau pawanengan_3_bulan) bila status_krama nonaktif. Unduh ulang template impor — kolom alasan_tidak_aktif belum ada.",
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

function bump(
  summaries: Map<string, ImportSheetSummary>,
  sheet: string,
  field: "creates" | "updates" | "errors" | "warnings"
): void {
  const s = summaries.get(sheet)!;
  s[field] += 1;
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

function tempekKey(banjarKode: string, nama: string): string {
  return `${banjarKode}|${nama.trim().toLowerCase()}`;
}

function kartuLinkKey(kartuRef: string, nomorKartu: string): string {
  return (nomorKartu.trim() || kartuRef.trim()).toLowerCase();
}

function kartuLinkLabel(kartuRef: string, nomorKartu: string): string {
  if (nomorKartu.trim() && kartuRef.trim()) {
    return `nomor_kartu "${nomorKartu.trim()}" (kartu_ref "${kartuRef.trim()}")`;
  }
  if (nomorKartu.trim()) return `nomor_kartu "${nomorKartu.trim()}"`;
  return `kartu_ref "${kartuRef.trim()}"`;
}

type MasterMaps = {
  banjarIdByKode: Map<string, string>;
  banjarKodeById: Map<string, string>;
  tempekIdByKey: Map<string, string>;
  arahanIdByKey: Map<string, string>;
  jenisMipilIdByNama: Map<string, string>;
  kramaIdByNomor: Map<string, { id: string }>;
};

async function loadMasterMaps(): Promise<MasterMaps> {
  const banjar = await listBanjar();
  const banjarIdByKode = new Map(banjar.map((b) => [b.kode, b.id]));
  const banjarKodeById = new Map(banjar.map((b) => [b.id, b.kode]));

  const db = await getDb();
  const tempekRows = await db.select<{ id: string; nama: string; banjar_kode: string }[]>(
    `SELECT t.id, t.nama, b.kode as banjar_kode
     FROM tempek t JOIN banjar b ON b.id = t.banjar_id AND b.aktif = 1
     WHERE t.aktif = 1`
  );
  const tempekIdByKey = new Map(
    tempekRows.map((t) => [tempekKey(t.banjar_kode, t.nama), t.id])
  );

  const arahanRows = await db.select<
    { id: string; nama: string; tempek_nama: string; banjar_kode: string }[]
  >(
    `SELECT a.id, a.nama, t.nama as tempek_nama, b.kode as banjar_kode
     FROM arahan a
     JOIN tempek t ON t.id = a.tempek_id AND t.aktif = 1
     JOIN banjar b ON b.id = t.banjar_id AND b.aktif = 1
     WHERE a.aktif = 1`
  );
  const arahanIdByKey = new Map(
    arahanRows.map((a) => [
      `${a.banjar_kode}|${a.tempek_nama.toLowerCase()}|${a.nama.toLowerCase()}`,
      a.id,
    ])
  );

  const jm = await db.select<{ id: string; nama: string }[]>(
    `SELECT id, nama FROM jenis_krama_mipil WHERE aktif = 1`
  );

  const kramaRows = await db.select<{ id: string; nomor_kartu: string }[]>(
    `SELECT k.id, k.nomor_kartu
     FROM krama k
     JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id AND kk.kode = 'MIPIL'`
  );
  const kramaIdByNomor = new Map(
    kramaRows.map((r) => [nomorKartuLookupKey(r.nomor_kartu), { id: r.id }])
  );

  return {
    banjarIdByKode,
    banjarKodeById,
    tempekIdByKey,
    arahanIdByKey,
    jenisMipilIdByNama: new Map(jm.map((j) => [j.nama.trim().toLowerCase(), j.id])),
    kramaIdByNomor,
  };
}

function toPendudukFields(a: ParsedAnggotaRow) {
  return {
    nama_lengkap: a.nama_lengkap,
    jenis_kelamin: a.jenis_kelamin,
    tempat_lahir: a.tempat_lahir,
    tanggal_lahir: a.tanggal_lahir,
    status_kawin: a.status_kawin,
    pekerjaan: a.pekerjaan,
    nama_ibu: a.nama_ibu,
    nama_ayah: a.nama_ayah,
  };
}

function toAnggotaDraft(a: ParsedAnggotaRow): AnggotaDraft {
  return {
    clientId: a.clientId,
    nama_lengkap: a.nama_lengkap,
    jenis_kelamin: a.jenis_kelamin,
    status_keluarga: formatStatusKeluargaAnggota(a.status_keluarga, "MIPIL"),
    tempat_lahir: a.tempat_lahir,
    tanggal_lahir: a.tanggal_lahir,
    status_kawin: a.status_kawin,
    pekerjaan: a.pekerjaan,
    nama_ibu: a.nama_ibu,
    nama_ayah: a.nama_ayah,
    nik_atau_nika: a.nik_atau_nika ?? a.nika,
  };
}

export async function validateKramaImport(
  bytes: Uint8Array,
  filename: string
): Promise<KramaImportPreview> {
  const sheets = parseWorkbook(bytes);
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const operations: KramaImportOp[] = [];

  const kramaSheetName = KRAMA_SHEET_NAMES.krama;
  const anggotaSheetName = KRAMA_SHEET_NAMES.anggota;
  const kramaHeaders = KRAMA_HEADERS.krama;
  const anggotaHeaders = KRAMA_HEADERS.anggota;

  const summaries = new Map<string, ImportSheetSummary>([
    [kramaSheetName, { sheet: kramaSheetName, creates: 0, updates: 0, errors: 0, warnings: 0 }],
    [
      anggotaSheetName,
      { sheet: anggotaSheetName, creates: 0, updates: 0, errors: 0, warnings: 0 },
    ],
  ]);

  const desa = await getDesaAdat();
  if (!isDesaConfigured(desa)) {
    errors.push({ sheet: "—", excelRow: 0, message: "Konfigurasi desa adat belum lengkap" });
    return { filename, canCommit: false, summaries: [...summaries.values()], errors, warnings, operations };
  }

  const maps = await loadMasterMaps();

  const kramaSheet = getSheet(sheets, kramaSheetName) ?? [];
  const anggotaSheet = getSheet(sheets, anggotaSheetName) ?? [];
  const kramaColMap = buildHeaderColumnMap(kramaSheet[0]);

  if (!validateHeaders(kramaSheetName, kramaSheet, kramaHeaders, errors)) {
    return { filename, canCommit: false, summaries: [...summaries.values()], errors, warnings, operations };
  }
  if (!validateHeaders(anggotaSheetName, anggotaSheet, anggotaHeaders, errors, [])) {
    return { filename, canCommit: false, summaries: [...summaries.values()], errors, warnings, operations };
  }

  type KramaRowParsed = {
    excelRow: number;
    nomorKartu: string;
    kartuRef: string;
    linkKey: string;
    isCreate: boolean;
    kramaId?: string;
    banjarKode: string;
    banjarId: string;
    tempekId: string;
    arahanId?: string;
    jenisMipilId: string;
    tanggalTerdaftar: string;
    keterangan?: string;
    nomorKontak?: string;
    statusKrama: KramaStatusKode;
    alasanTidakAktif?: AlasanTidakAktifKode;
    tanggalTidakAktif?: string;
  };

  const kramaByLink = new Map<string, KramaRowParsed>();
  const seenLink = new Set<string>();

  const kramaDataRows = kramaSheet.slice(1);
  for (let i = 0; i < Math.min(kramaDataRows.length, MAX_ROWS); i++) {
    const row = kramaDataRows[i];
    const excelRow = i + 2;
    if (isEmptyRow(row)) continue;

    const nomorKartu = cellAt(row, kramaColMap, "nomor_kartu");
    const kartuRef = cellAt(row, kramaColMap, "kartu_ref");
    if (!kartuRef && !nomorKartu) {
      errors.push({
        sheet: kramaSheetName,
        excelRow,
        column: "kartu_ref",
        message: "Isi kartu_ref untuk kartu baru atau nomor_kartu untuk update",
      });
      bump(summaries, kramaSheetName, "errors");
      continue;
    }

    const linkKey = kartuLinkKey(kartuRef || nomorKartu, nomorKartu);
    if (seenLink.has(linkKey)) {
      errors.push({ sheet: kramaSheetName, excelRow, message: `Kartu duplikat: ${linkKey}` });
      bump(summaries, kramaSheetName, "errors");
      continue;
    }
    seenLink.add(linkKey);

    const existing = nomorKartu
      ? maps.kramaIdByNomor.get(nomorKartuLookupKey(nomorKartu))
      : undefined;
    const isCreate = !existing;

    const banjarKode = cellAt(row, kramaColMap, "banjar_kode");
    const banjarId = maps.banjarIdByKode.get(banjarKode.padStart(2, "0").slice(-2));
    if (!banjarId) {
      errors.push({
        sheet: kramaSheetName,
        excelRow,
        column: "banjar_kode",
        message: `Banjar ${banjarKode} tidak ditemukan`,
      });
      bump(summaries, kramaSheetName, "errors");
      continue;
    }
    const banjarKodeNorm = banjarKode.padStart(2, "0").slice(-2);

    const tempekNama = cellAt(row, kramaColMap, "tempek_nama");
    const tempekId = maps.tempekIdByKey.get(tempekKey(banjarKodeNorm, tempekNama));
    if (!tempekId) {
      errors.push({
        sheet: kramaSheetName,
        excelRow,
        column: "tempek_nama",
        message: `Tempek "${tempekNama}" tidak ditemukan di banjar ${banjarKodeNorm}`,
      });
      bump(summaries, kramaSheetName, "errors");
      continue;
    }

    let arahanId: string | undefined;
    const arahanNama = cellAt(row, kramaColMap, "arahan_nama");
    if (arahanNama) {
      arahanId = maps.arahanIdByKey.get(
        `${banjarKodeNorm}|${tempekNama.toLowerCase()}|${arahanNama.toLowerCase()}`
      );
      if (!arahanId) {
        errors.push({
          sheet: kramaSheetName,
          excelRow,
          column: "arahan_nama",
          message: `Arahan "${arahanNama}" tidak ditemukan`,
        });
        bump(summaries, kramaSheetName, "errors");
        continue;
      }
    }
    const jenisNama = cellAt(row, kramaColMap, "jenis_mipil_nama");
    const jenisMipilId = maps.jenisMipilIdByNama.get(jenisNama.toLowerCase());
    if (!jenisMipilId) {
      errors.push({
        sheet: kramaSheetName,
        excelRow,
        column: "jenis_mipil_nama",
        message: `Jenis Mipil "${jenisNama}" tidak ditemukan`,
      });
      bump(summaries, kramaSheetName, "errors");
      continue;
    }

    const tanggalTerdaftar =
      parseDateField(
        cellAt(row, kramaColMap, "tanggal_terdaftar"),
        kramaSheetName,
        excelRow,
        "tanggal_terdaftar",
        errors,
        true
      ) ?? "";
    if (!tanggalTerdaftar) {
      bump(summaries, kramaSheetName, "errors");
      continue;
    }

    const keterangan = cellAt(row, kramaColMap, "keterangan") || undefined;
    const nomorKontak = cellAt(row, kramaColMap, "nomor_kontak") || undefined;
    const statusKramaRaw = cellAt(row, kramaColMap, "status_krama") || "aktif";
    const hasAlasanColumn = hasMappedColumn(kramaColMap, "alasan_tidak_aktif");
    const hasTanggalColumn = hasMappedColumn(kramaColMap, "tanggal_tidak_aktif");
    const alasanTidakAktifRaw = hasAlasanColumn
      ? cellAt(row, kramaColMap, "alasan_tidak_aktif") || undefined
      : undefined;
    const tanggalTidakAktifRaw = hasTanggalColumn
      ? parseDateField(
          cellAt(row, kramaColMap, "tanggal_tidak_aktif"),
          kramaSheetName,
          excelRow,
          "tanggal_tidak_aktif",
          errors,
          false
        ) ?? undefined
      : undefined;

    const statusParsed = parseImportKramaStatus(
      statusKramaRaw,
      alasanTidakAktifRaw,
      tanggalTidakAktifRaw,
      kramaSheetName,
      excelRow,
      errors,
      hasAlasanColumn
    );
    if (!statusParsed) {
      bump(summaries, kramaSheetName, "errors");
      continue;
    }

    const parsed: KramaRowParsed = {
      excelRow,
      nomorKartu,
      kartuRef: kartuRef || nomorKartu,
      linkKey,
      isCreate,
      kramaId: existing?.id,
      banjarKode: banjarKodeNorm,
      banjarId,
      tempekId,
      arahanId,
      jenisMipilId,
      tanggalTerdaftar,
      keterangan,
      nomorKontak,
      statusKrama: statusParsed.statusKrama,
      alasanTidakAktif: statusParsed.alasanTidakAktif,
      tanggalTidakAktif: statusParsed.tanggalTidakAktif,
    };
    kramaByLink.set(linkKey, parsed);
    bump(summaries, kramaSheetName, isCreate ? "creates" : "updates");
  }

  const anggotaByLink = new Map<string, ParsedAnggotaRow[]>();
  const anggotaDataRows = anggotaSheet.slice(1);
  for (let i = 0; i < Math.min(anggotaDataRows.length, MAX_ROWS); i++) {
    const row = anggotaDataRows[i];
    const excelRow = i + 2;
    if (isEmptyRow(row)) continue;

    const kartuRef = cellStr(row, 0);
    const nomorKartu = cellStr(row, 1);
    const linkKey = kartuLinkKey(kartuRef, nomorKartu);
    if (!linkKey) {
      errors.push({
        sheet: anggotaSheetName,
        excelRow,
        message: "Isi kartu_ref atau nomor_kartu",
      });
      bump(summaries, anggotaSheetName, "errors");
      continue;
    }
    if (!kramaByLink.has(linkKey)) {
      errors.push({
        sheet: anggotaSheetName,
        excelRow,
        message: `Tidak ada baris Krama untuk ${linkKey}`,
      });
      bump(summaries, anggotaSheetName, "errors");
      continue;
    }

    const nama = cellStr(row, 2);
    const jk = normalizeJenisKelamin(cellStr(row, 3));
    const status = cellStr(row, 4);
    if (!nama) {
      errors.push({ sheet: anggotaSheetName, excelRow, column: "nama_lengkap", message: "Wajib diisi" });
      bump(summaries, anggotaSheetName, "errors");
      continue;
    }
    if (jk !== "L" && jk !== "P") {
      errors.push({
        sheet: anggotaSheetName,
        excelRow,
        column: "jenis_kelamin",
        message: "Gunakan L atau P",
      });
      bump(summaries, anggotaSheetName, "errors");
      continue;
    }
    const statusFmt = formatStatusKeluargaAnggota(status, "MIPIL");
    const opts = statusKeluargaOptions("MIPIL");
    if (!opts.some((o) => o.toLowerCase() === statusFmt.toLowerCase())) {
      errors.push({
        sheet: anggotaSheetName,
        excelRow,
        column: "status_keluarga",
        message: `Status tidak valid: ${status}`,
      });
      bump(summaries, anggotaSheetName, "errors");
      continue;
    }

    let col = 5;
    const parsed: ParsedAnggotaRow = {
      excelRow,
      kartuRef: kartuRef || nomorKartu,
      nomorKartu,
      clientId: uuid(),
      nama_lengkap: nama,
      jenis_kelamin: jk,
      status_keluarga: statusFmt,
      tempat_lahir: cellStr(row, col++) || undefined,
      tanggal_lahir: parseDateField(cellStr(row, col++), anggotaSheetName, excelRow, "tanggal_lahir", errors),
      status_kawin: cellStr(row, col++) || undefined,
      pekerjaan: cellStr(row, col++) || undefined,
    };

    parsed.nama_ibu = cellStr(row, col++) || undefined;
    parsed.nama_ayah = cellStr(row, col++) || undefined;
    parsed.nika = cellStr(row, col++) || undefined;

    const list = anggotaByLink.get(linkKey) ?? [];
    list.push(parsed);
    anggotaByLink.set(linkKey, list);
  }

  for (const [linkKey, krama] of kramaByLink) {
    const anggota = anggotaByLink.get(linkKey) ?? [];
    if (anggota.length === 0) {
      errors.push({
        sheet: kramaSheetName,
        excelRow: krama.excelRow,
        message: "Minimal satu baris anggota diperlukan",
      });
      bump(summaries, kramaSheetName, "errors");
      continue;
    }

    const gelar = gelarKepalaStatus("MIPIL");

    // Ekspor lama menulis status_keluarga asli (Istri/Suami), bukan Pengarep.
    // Kepala di DB ditentukan oleh kepala_penduduk_id — infer dari kartu yang sudah ada.
    if (
      !krama.isCreate &&
      krama.kramaId &&
      !anggota.some((a) => isGelarKepalaStatus(a.status_keluarga, "MIPIL"))
    ) {
      const detail = await getKramaDetail(krama.kramaId);
      if (detail) {
        for (const a of anggota) {
          const matched = detail.anggota_aktif.find((ex) => {
            if (ex.penduduk_id !== detail.kepala.id) return false;
            if (a.nika?.trim() && ex.nika?.trim()) {
              return stripPenomoranDash(ex.nika) === stripPenomoranDash(a.nika);
            }
            return (
              ex.nama_lengkap.trim().toLowerCase() === a.nama_lengkap.trim().toLowerCase() &&
              (ex.tanggal_lahir?.slice(0, 10) ?? "") === (a.tanggal_lahir ?? "")
            );
          });
          if (matched) {
            a.status_keluarga = gelar;
          }
        }
      }
    }

    const kepalaRows = anggota.filter((a) =>
      isGelarKepalaStatus(a.status_keluarga, "MIPIL")
    );
    if (kepalaRows.length !== 1) {
      const kartu = kartuLinkLabel(krama.kartuRef, krama.nomorKartu);
      const linked = anggota.length;
      const message =
        kepalaRows.length === 0
          ? linked === 0
            ? `Tidak ada baris AnggotaMipil yang terhubung ke ${kartu}. Samakan kartu_ref/nomor_kartu dengan sheet KramaMipil baris ${krama.excelRow}.`
            : `Harus tepat satu ${gelar} per kartu (ditemukan 0 dari ${linked} anggota terhubung). Kartu ${kartu} — baris KramaMipil ${krama.excelRow}. Pastikan baris AnggotaMipil memakai kunci yang sama, dan status_keluarga = "${gelar}" (bukan Suami/Istri).`
          : `Harus tepat satu ${gelar} per kartu (ditemukan ${kepalaRows.length}). Kartu ${kartu} — baris KramaMipil ${krama.excelRow}.`;
      errors.push({
        sheet: kramaSheetName,
        excelRow: krama.excelRow,
        message,
      });
      bump(summaries, kramaSheetName, "errors");
      continue;
    }
    const kepala = kepalaRows[0]!;

    const drafts = anggota.map((a) => toAnggotaDraft(a));
    for (const d of drafts) {
      if (!isValidStatusKeluargaMipil(d.status_keluarga)) {
        errors.push({
          sheet: anggotaSheetName,
          excelRow: krama.excelRow,
          message: `Status tidak valid: ${d.status_keluarga}`,
        });
      }
    }

    const baseInput: CreateKramaInput = {
      klasifikasiKode: "MIPIL",
      banjarId: krama.banjarId,
      banjarKode: krama.banjarKode,
      tempekId: krama.tempekId,
      arahanId: krama.arahanId,
      jenisMipilId: krama.jenisMipilId,
      keterangan: krama.keterangan,
      nomorKontak: krama.nomorKontak,
      statusKrama: krama.statusKrama,
      alasanTidakAktif: krama.alasanTidakAktif,
      tanggalTidakAktif: krama.tanggalTidakAktif,
      tanggalTerdaftar: krama.tanggalTerdaftar,
      anggota: drafts,
      kepalaAnggotaClientId: kepala.clientId,
      kepala: toPendudukFields(kepala),
    };

    if (krama.isCreate) {
      operations.push({
        kind: "create",
        kartuRef: krama.kartuRef,
        input: baseInput,
      });
    } else if (krama.kramaId) {
      operations.push({
        kind: "updateKrama",
        kramaId: krama.kramaId,
        input: { ...baseInput, kramaId: krama.kramaId },
      });

      const detail = await getKramaDetail(krama.kramaId);
      if (detail) {
        for (const a of anggota) {
          if (isGelarKepalaStatus(a.status_keluarga, "MIPIL")) continue;

          const matched = detail.anggota_aktif.find((ex) => {
            if (a.nika?.trim()) {
              return stripPenomoranDash(ex.nika ?? "") === stripPenomoranDash(a.nika);
            }
            return (
              ex.nama_lengkap.trim().toLowerCase() === a.nama_lengkap.trim().toLowerCase() &&
              (ex.tanggal_lahir?.slice(0, 10) ?? "") === (a.tanggal_lahir ?? "")
            );
          });

          if (matched) {
            operations.push({
              kind: "updateAnggota",
              kramaId: krama.kramaId,
              anggotaId: matched.anggota_id,
              input: {
                kramaId: krama.kramaId,
                anggotaId: matched.anggota_id,
                statusKeluarga: a.status_keluarga,
                penduduk: toPendudukFields(a),
              },
            });
            bump(summaries, anggotaSheetName, "updates");
          } else {
            operations.push({
              kind: "addAnggota",
              kramaId: krama.kramaId,
              input: {
                kramaId: krama.kramaId,
                statusKeluarga: a.status_keluarga,
                penduduk: toPendudukFields(a),
                tanggalPencatatan: krama.tanggalTerdaftar,
              },
            });
            bump(summaries, anggotaSheetName, "creates");
          }
        }
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

export async function commitKramaImport(preview: KramaImportPreview): Promise<void> {
  if (!preview.canCommit) {
    throw new Error("Impor tidak dapat disimpan: masih ada error validasi");
  }

  for (const op of preview.operations) {
    if (op.kind === "create") {
      await createKrama(op.input);
    }
  }

  for (const op of preview.operations) {
    if (op.kind === "updateKrama") {
      await updateKrama(op.input);
    }
  }

  for (const op of preview.operations) {
    if (op.kind === "addAnggota") {
      await addAnggota(op.input);
    } else if (op.kind === "updateAnggota") {
      await updateAnggota(op.input);
    }
  }
}

export function assertKramaWorkbookStructure(sheets: Map<string, SheetRows>): string[] {
  const problems: string[] = [];

  for (const [name, headers] of [
    [KRAMA_SHEET_NAMES.krama, KRAMA_HEADERS.krama],
    [KRAMA_SHEET_NAMES.anggota, KRAMA_HEADERS.anggota],
  ] as const) {
    const rows = getSheet(sheets, name);
    if (!rows?.length) {
      problems.push(`Sheet ${name} tidak ditemukan`);
      continue;
    }
    const header = rows[0]?.map((h) => normalizeHeader(String(h ?? ""))) ?? [];
    const exp = headers.map(normalizeHeader);
    if (!exp.every((col, i) => header[i] === col)) {
      problems.push(`Header sheet ${name} tidak sesuai`);
    }
  }
  return problems;
}
