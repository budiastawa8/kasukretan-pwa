import { agamaForPenduduk } from "../agama-tamiu";
import { getDb } from "../db/client";
import { getSheet, isEmptyRow, parseWorkbook } from "../excel-import";
import { nomorKartuLookupKey } from "../penomoran";
import {
  buildJenisLookupMap,
  inferKlasifikasiFromJenisNama,
  jenisPemasihImportErrorMessage,
  klasifikasiPemasihLabel,
  lookupJenisId,
  parsePemasihKlasifikasiImport,
  resolveJenisForKlasifikasi,
} from "../pemasih-jenis";
import { getDesaAdat, isDesaConfigured } from "../services/desa";
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
import { listBanjar } from "../services/master";
import {
  formatStatusKeluargaAnggota,
  gelarKepalaStatus,
  isGelarKepalaStatus,
  isValidStatusKeluarga,
  statusKeluargaOptions,
} from "../status-keluarga";
import type { AnggotaDraft, KlasifikasiKode } from "../types";
import { uuid } from "../utils";
import type { ImportIssue, ImportPreviewResult, ImportSheetSummary } from "./import-types";
import {
  MAX_IMPORT_ROWS,
  bumpSummary,
  buildHeaderColumnMap,
  cellAt,
  hasMappedColumn,
  kartuLinkKey,
  kartuLinkLabel,
  normalizeJenisKelaminImport,
  parseImportDateField,
  parseImportKramaStatus,
  tempekLookupKey,
  validateImportHeaders,
} from "./import-helpers";
import {
  PEMASIH_ANGGOTA_HEADERS,
  PEMASIH_KRAMA_HEADERS,
  PEMASIH_SHEET_NAMES,
} from "./pemasih-template";

type ParsedAnggotaRow = {
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
  nik_atau_nika?: string;
  agama?: string;
};

export type PemasihImportOp =
  | { kind: "create"; kartuRef: string; input: CreateKramaInput }
  | { kind: "updateKrama"; kramaId: string; input: UpdateKramaInput }
  | { kind: "addAnggota"; kramaId: string; input: AddAnggotaInput }
  | {
      kind: "updateAnggota";
      kramaId: string;
      anggotaId: string;
      input: UpdateAnggotaInput;
    };

export type PemasihImportPreview = ImportPreviewResult<PemasihImportOp>;

type MasterMaps = {
  banjarIdByKode: Map<string, string>;
  tempekIdByKey: Map<string, string>;
  jenisKtMap: Map<string, string>;
  jenisTMap: Map<string, string>;
  kramaByNomor: Map<string, { id: string; klasifikasi: KlasifikasiKode }>;
};

async function loadMasterMaps(): Promise<MasterMaps> {
  const banjar = await listBanjar();
  const banjarIdByKode = new Map(banjar.map((b) => [b.kode, b.id]));
  const db = await getDb();

  const tempekRows = await db.select<{ id: string; nama: string; banjar_kode: string }[]>(
    `SELECT t.id, t.nama, b.kode as banjar_kode
     FROM tempek t JOIN banjar b ON b.id = t.banjar_id AND b.aktif = 1
     WHERE t.aktif = 1`
  );
  const tempekIdByKey = new Map(
    tempekRows.map((t) => [tempekLookupKey(t.banjar_kode, t.nama), t.id])
  );

  const jkt = await db.select<{ id: string; nama: string }[]>(
    `SELECT id, nama FROM jenis_krama_tamiu WHERE aktif = 1`
  );
  const jt = await db.select<{ id: string; nama: string }[]>(
    `SELECT id, nama FROM jenis_tamiu WHERE aktif = 1`
  );

  const kramaRows = await db.select<{ id: string; nomor_kartu: string; klasifikasi: string }[]>(
    `SELECT k.id, k.nomor_kartu, kk.kode as klasifikasi
     FROM krama k
     JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
       AND kk.kode IN ('KRAMA_TAMIU', 'TAMIU')`
  );

  return {
    banjarIdByKode,
    tempekIdByKey,
    jenisKtMap: buildJenisLookupMap(jkt, "krama tamiu"),
    jenisTMap: buildJenisLookupMap(jt, "tamiu"),
    kramaByNomor: new Map(
      kramaRows.map((r) => [
        nomorKartuLookupKey(r.nomor_kartu),
        { id: r.id, klasifikasi: r.klasifikasi as KlasifikasiKode },
      ])
    ),
  };
}

function toPendudukFields(a: ParsedAnggotaRow, kode: KlasifikasiKode) {
  return {
    nama_lengkap: a.nama_lengkap,
    jenis_kelamin: a.jenis_kelamin,
    tempat_lahir: a.tempat_lahir,
    tanggal_lahir: a.tanggal_lahir,
    status_kawin: a.status_kawin,
    pekerjaan: a.pekerjaan,
    nik_atau_nika: a.nik_atau_nika,
    agama: agamaForPenduduk(kode, a.agama) ?? undefined,
  };
}

function toAnggotaDraft(a: ParsedAnggotaRow, kode: KlasifikasiKode): AnggotaDraft {
  return {
    clientId: a.clientId,
    nama_lengkap: a.nama_lengkap,
    jenis_kelamin: a.jenis_kelamin,
    status_keluarga: formatStatusKeluargaAnggota(a.status_keluarga, kode),
    tempat_lahir: a.tempat_lahir,
    tanggal_lahir: a.tanggal_lahir,
    status_kawin: a.status_kawin,
    pekerjaan: a.pekerjaan,
    nik_atau_nika: a.nik_atau_nika,
    agama: agamaForPenduduk(kode, a.agama) ?? undefined,
  };
}

function resolveKlasifikasiForRow(
  klasRaw: string,
  jenisNama: string,
  existing: { klasifikasi: KlasifikasiKode } | undefined,
  isCreate: boolean,
  sheet: string,
  excelRow: number,
  errors: ImportIssue[],
  warnings: ImportIssue[],
  summaries: Map<string, ImportSheetSummary>
): KlasifikasiKode | null {
  if (!isCreate && existing) {
    const fromExcel = klasRaw ? parsePemasihKlasifikasiImport(klasRaw) : null;
    if (fromExcel && fromExcel !== existing.klasifikasi) {
      warnings.push({
        sheet,
        excelRow,
        column: "klasifikasi",
        message: `Kolom klasifikasi "${klasifikasiPemasihLabel(fromExcel)}" diabaikan; memakai ${klasifikasiPemasihLabel(existing.klasifikasi)} dari database`,
      });
      bumpSummary(summaries, sheet, "warnings");
    }
    return existing.klasifikasi;
  }

  const fromKlas = parsePemasihKlasifikasiImport(klasRaw);
  const fromJenis = inferKlasifikasiFromJenisNama(jenisNama);

  if (fromKlas && fromJenis && fromKlas !== fromJenis) {
    errors.push({
      sheet,
      excelRow,
      column: "klasifikasi",
      message: `klasifikasi "${klasifikasiPemasihLabel(fromKlas)}" tidak cocok dengan jenis_nama (menunjukkan ${klasifikasiPemasihLabel(fromJenis)})`,
    });
    return null;
  }

  if (fromKlas) return fromKlas;
  if (fromJenis) {
    warnings.push({
      sheet,
      excelRow,
      column: "jenis_nama",
      message: `klasifikasi kosong — disimpulkan ${klasifikasiPemasihLabel(fromJenis)} dari jenis_nama`,
    });
    bumpSummary(summaries, sheet, "warnings");
    return fromJenis;
  }

  errors.push({
    sheet,
    excelRow,
    column: "klasifikasi",
    message: 'klasifikasi wajib diisi: "Krama Tamiu" atau "Tamiu"',
  });
  return null;
}

export async function validatePemasihImport(
  bytes: Uint8Array,
  filename: string
): Promise<PemasihImportPreview> {
  const sheets = parseWorkbook(bytes);
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const operations: PemasihImportOp[] = [];

  const kramaSheetName = PEMASIH_SHEET_NAMES.krama;
  const anggotaSheetName = PEMASIH_SHEET_NAMES.anggota;
  const summaries = new Map<string, ImportSheetSummary>([
    [kramaSheetName, { sheet: kramaSheetName, creates: 0, updates: 0, errors: 0, warnings: 0 }],
    [anggotaSheetName, { sheet: anggotaSheetName, creates: 0, updates: 0, errors: 0, warnings: 0 }],
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
  const anggotaColMap = buildHeaderColumnMap(anggotaSheet[0]);

  if (!validateImportHeaders(kramaSheetName, kramaSheet, PEMASIH_KRAMA_HEADERS, errors)) {
    return { filename, canCommit: false, summaries: [...summaries.values()], errors, warnings, operations };
  }
  if (!validateImportHeaders(anggotaSheetName, anggotaSheet, PEMASIH_ANGGOTA_HEADERS, errors, [])) {
    return { filename, canCommit: false, summaries: [...summaries.values()], errors, warnings, operations };
  }

  type KramaParsed = {
    excelRow: number;
    nomorKartu: string;
    kartuRef: string;
    linkKey: string;
    isCreate: boolean;
    kramaId?: string;
    klasifikasi: KlasifikasiKode;
    banjarId: string;
    banjarKode: string;
    tempekId: string;
    jenisKtId?: string;
    jenisTId?: string;
    tanggalTerdaftar: string;
    nomorKontak?: string;
    statusKrama: import("../krama-status").KramaStatusKode;
    alasanTidakAktif?: import("../krama-status").AlasanTidakAktifKode;
    tanggalTidakAktif?: string;
    alamat?: string;
    rtBtn?: string;
    asalDesa?: string;
    asalKec?: string;
    asalKab?: string;
    asalProv?: string;
  };

  const kramaByLink = new Map<string, KramaParsed>();
  const seenLink = new Set<string>();

  for (let i = 0; i < Math.min(kramaSheet.length - 1, MAX_IMPORT_ROWS); i++) {
    const row = kramaSheet[i + 1];
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
      bumpSummary(summaries, kramaSheetName, "errors");
      continue;
    }

    const linkKey = kartuLinkKey(kartuRef || nomorKartu, nomorKartu);
    if (seenLink.has(linkKey)) {
      errors.push({ sheet: kramaSheetName, excelRow, message: `Kartu duplikat: ${linkKey}` });
      bumpSummary(summaries, kramaSheetName, "errors");
      continue;
    }
    seenLink.add(linkKey);

    const existing = nomorKartu
      ? maps.kramaByNomor.get(nomorKartuLookupKey(nomorKartu))
      : undefined;
    const isCreate = !existing;

    const jenisNama = cellAt(row, kramaColMap, "jenis_nama");
    const klasifikasi = resolveKlasifikasiForRow(
      cellAt(row, kramaColMap, "klasifikasi"),
      jenisNama,
      existing,
      isCreate,
      kramaSheetName,
      excelRow,
      errors,
      warnings,
      summaries
    );
    if (!klasifikasi) {
      bumpSummary(summaries, kramaSheetName, "errors");
      continue;
    }

    const resolved = resolveJenisForKlasifikasi(
      jenisNama,
      klasifikasi,
      maps.jenisKtMap,
      maps.jenisTMap
    );
    if (!resolved) {
      errors.push({
        sheet: kramaSheetName,
        excelRow,
        column: "jenis_nama",
        message: jenisPemasihImportErrorMessage(klasifikasi, jenisNama, {
          isCreate,
          ktId: lookupJenisId(maps.jenisKtMap, jenisNama),
          tId: lookupJenisId(maps.jenisTMap, jenisNama),
        }),
      });
      bumpSummary(summaries, kramaSheetName, "errors");
      continue;
    }

    const banjarKode = cellAt(row, kramaColMap, "banjar_kode");
    const banjarKodeNorm = banjarKode.padStart(2, "0").slice(-2);
    const banjarId = maps.banjarIdByKode.get(banjarKodeNorm);
    if (!banjarId) {
      errors.push({
        sheet: kramaSheetName,
        excelRow,
        column: "banjar_kode",
        message: `Banjar ${banjarKode} tidak ditemukan`,
      });
      bumpSummary(summaries, kramaSheetName, "errors");
      continue;
    }

    const tempekNama = cellAt(row, kramaColMap, "tempek_nama");
    const tempekId = maps.tempekIdByKey.get(tempekLookupKey(banjarKodeNorm, tempekNama));
    if (!tempekId) {
      errors.push({
        sheet: kramaSheetName,
        excelRow,
        column: "tempek_nama",
        message: `Tempek "${tempekNama}" tidak ditemukan di banjar ${banjarKodeNorm}`,
      });
      bumpSummary(summaries, kramaSheetName, "errors");
      continue;
    }

    const tanggalTerdaftar =
      parseImportDateField(
        cellAt(row, kramaColMap, "tanggal_terdaftar"),
        kramaSheetName,
        excelRow,
        "tanggal_terdaftar",
        errors,
        true
      ) ?? "";
    if (!tanggalTerdaftar) {
      bumpSummary(summaries, kramaSheetName, "errors");
      continue;
    }

    const statusParsed = parseImportKramaStatus(
      cellAt(row, kramaColMap, "status_krama") || "aktif",
      hasMappedColumn(kramaColMap, "alasan_tidak_aktif")
        ? cellAt(row, kramaColMap, "alasan_tidak_aktif") || undefined
        : undefined,
      hasMappedColumn(kramaColMap, "tanggal_tidak_aktif")
        ? parseImportDateField(
            cellAt(row, kramaColMap, "tanggal_tidak_aktif"),
            kramaSheetName,
            excelRow,
            "tanggal_tidak_aktif",
            errors,
            false
          ) ?? undefined
        : undefined,
      kramaSheetName,
      excelRow,
      errors,
      hasMappedColumn(kramaColMap, "alasan_tidak_aktif")
    );
    if (!statusParsed) {
      bumpSummary(summaries, kramaSheetName, "errors");
      continue;
    }

    kramaByLink.set(linkKey, {
      excelRow,
      nomorKartu,
      kartuRef: kartuRef || nomorKartu,
      linkKey,
      isCreate,
      kramaId: existing?.id,
      klasifikasi,
      banjarId,
      banjarKode: banjarKodeNorm,
      tempekId,
      jenisKtId: resolved.jenisKtId,
      jenisTId: resolved.jenisTId,
      tanggalTerdaftar,
      nomorKontak: cellAt(row, kramaColMap, "nomor_kontak") || undefined,
      statusKrama: statusParsed.statusKrama,
      alasanTidakAktif: statusParsed.alasanTidakAktif,
      tanggalTidakAktif: statusParsed.tanggalTidakAktif,
      alamat: cellAt(row, kramaColMap, "alamat") || undefined,
      rtBtn: cellAt(row, kramaColMap, "rt_btn") || undefined,
      asalDesa: cellAt(row, kramaColMap, "asal_desa_adat") || undefined,
      asalKec: cellAt(row, kramaColMap, "asal_kecamatan") || undefined,
      asalKab: cellAt(row, kramaColMap, "asal_kabupaten") || undefined,
      asalProv: cellAt(row, kramaColMap, "asal_provinsi") || undefined,
    });
    bumpSummary(summaries, kramaSheetName, isCreate ? "creates" : "updates");
  }

  const anggotaByLink = new Map<string, ParsedAnggotaRow[]>();
  for (let i = 0; i < Math.min(anggotaSheet.length - 1, MAX_IMPORT_ROWS); i++) {
    const row = anggotaSheet[i + 1];
    const excelRow = i + 2;
    if (isEmptyRow(row)) continue;

    const kartuRef = cellAt(row, anggotaColMap, "kartu_ref");
    const nomorKartu = cellAt(row, anggotaColMap, "nomor_kartu");
    const linkKey = kartuLinkKey(kartuRef, nomorKartu);
    if (!linkKey) {
      errors.push({ sheet: anggotaSheetName, excelRow, message: "Isi kartu_ref atau nomor_kartu" });
      bumpSummary(summaries, anggotaSheetName, "errors");
      continue;
    }
    if (!kramaByLink.has(linkKey)) {
      errors.push({
        sheet: anggotaSheetName,
        excelRow,
        message: `Tidak ada baris Krama untuk ${linkKey}`,
      });
      bumpSummary(summaries, anggotaSheetName, "errors");
      continue;
    }

    const krama = kramaByLink.get(linkKey)!;
    const nama = cellAt(row, anggotaColMap, "nama_lengkap");
    const jk = normalizeJenisKelaminImport(cellAt(row, anggotaColMap, "jenis_kelamin"));
    const status = cellAt(row, anggotaColMap, "status_keluarga");

    if (!nama) {
      errors.push({ sheet: anggotaSheetName, excelRow, column: "nama_lengkap", message: "Wajib diisi" });
      bumpSummary(summaries, anggotaSheetName, "errors");
      continue;
    }
    if (jk !== "L" && jk !== "P") {
      errors.push({
        sheet: anggotaSheetName,
        excelRow,
        column: "jenis_kelamin",
        message: "Gunakan L atau P",
      });
      bumpSummary(summaries, anggotaSheetName, "errors");
      continue;
    }

    const statusFmt = formatStatusKeluargaAnggota(status, krama.klasifikasi);
    const opts = statusKeluargaOptions(krama.klasifikasi);
    if (!opts.some((o) => o.toLowerCase() === statusFmt.toLowerCase())) {
      errors.push({
        sheet: anggotaSheetName,
        excelRow,
        column: "status_keluarga",
        message: `Status tidak valid: ${status}`,
      });
      bumpSummary(summaries, anggotaSheetName, "errors");
      continue;
    }

    const parsed: ParsedAnggotaRow = {
      excelRow,
      kartuRef: kartuRef || nomorKartu,
      nomorKartu,
      clientId: uuid(),
      nama_lengkap: nama,
      jenis_kelamin: jk,
      status_keluarga: statusFmt,
      tempat_lahir: cellAt(row, anggotaColMap, "tempat_lahir") || undefined,
      tanggal_lahir: parseImportDateField(
        cellAt(row, anggotaColMap, "tanggal_lahir"),
        anggotaSheetName,
        excelRow,
        "tanggal_lahir",
        errors
      ),
      status_kawin: cellAt(row, anggotaColMap, "status_kawin") || undefined,
      pekerjaan: cellAt(row, anggotaColMap, "pekerjaan") || undefined,
      nik_atau_nika: cellAt(row, anggotaColMap, "nik_atau_nika") || undefined,
      agama: cellAt(row, anggotaColMap, "agama") || undefined,
    };

    if (
      !isGelarKepalaStatus(statusFmt, krama.klasifikasi) &&
      !parsed.nik_atau_nika?.trim()
    ) {
      errors.push({
        sheet: anggotaSheetName,
        excelRow,
        column: "nik_atau_nika",
        message: "NIK/NIKA wajib untuk anggota selain Pengajeg",
      });
      bumpSummary(summaries, anggotaSheetName, "errors");
      continue;
    }
    if (krama.klasifikasi === "TAMIU" && isGelarKepalaStatus(statusFmt, krama.klasifikasi)) {
      if (!parsed.agama?.trim()) {
        errors.push({
          sheet: anggotaSheetName,
          excelRow,
          column: "agama",
          message: "Agama wajib untuk Pengajeg Tamiu",
        });
        bumpSummary(summaries, anggotaSheetName, "errors");
        continue;
      }
    }

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
      bumpSummary(summaries, kramaSheetName, "errors");
      continue;
    }

    const gelar = gelarKepalaStatus(krama.klasifikasi);

    if (!krama.isCreate && krama.kramaId && !anggota.some((a) => isGelarKepalaStatus(a.status_keluarga, krama.klasifikasi))) {
      const detail = await getKramaDetail(krama.kramaId);
      if (detail) {
        for (const a of anggota) {
          const matched = detail.anggota_aktif.find((ex) => {
            if (ex.penduduk_id !== detail.kepala.id) return false;
            if (a.nik_atau_nika?.trim() && ex.nik_atau_nika?.trim()) {
              return ex.nik_atau_nika.trim() === a.nik_atau_nika.trim();
            }
            return (
              ex.nama_lengkap.trim().toLowerCase() === a.nama_lengkap.trim().toLowerCase() &&
              (ex.tanggal_lahir?.slice(0, 10) ?? "") === (a.tanggal_lahir ?? "")
            );
          });
          if (matched) a.status_keluarga = gelar;
        }
      }
    }

    const kepalaRows = anggota.filter((a) => isGelarKepalaStatus(a.status_keluarga, krama.klasifikasi));
    if (kepalaRows.length !== 1) {
      const kartu = kartuLinkLabel(krama.kartuRef, krama.nomorKartu);
      errors.push({
        sheet: kramaSheetName,
        excelRow: krama.excelRow,
        message:
          kepalaRows.length === 0
            ? `Harus tepat satu ${gelar} per kartu. Kartu ${kartu} — baris KramaPemasih ${krama.excelRow}.`
            : `Harus tepat satu ${gelar} per kartu (ditemukan ${kepalaRows.length}). Kartu ${kartu}.`,
      });
      bumpSummary(summaries, kramaSheetName, "errors");
      continue;
    }

    const kepala = kepalaRows[0]!;
    const drafts = anggota.map((a) => toAnggotaDraft(a, krama.klasifikasi));
    for (const d of drafts) {
      if (
        !isGelarKepalaStatus(d.status_keluarga, krama.klasifikasi) &&
        !isValidStatusKeluarga(d.status_keluarga, krama.klasifikasi)
      ) {
        errors.push({
          sheet: anggotaSheetName,
          excelRow: krama.excelRow,
          message: `Status tidak valid: ${d.status_keluarga}`,
        });
      }
    }

    const baseInput: CreateKramaInput = {
      klasifikasiKode: krama.klasifikasi,
      banjarId: krama.banjarId,
      banjarKode: krama.banjarKode,
      tempekId: krama.tempekId,
      jenisKramaTamiuId: krama.jenisKtId,
      jenisTamiuId: krama.jenisTId,
      alamat: krama.alamat,
      rtBtn: krama.rtBtn,
      asalDesaAdat: krama.asalDesa,
      asalKecamatan: krama.asalKec,
      asalKabupaten: krama.asalKab,
      asalProvinsi: krama.asalProv,
      nomorKontak: krama.nomorKontak,
      statusKrama: krama.statusKrama,
      alasanTidakAktif: krama.alasanTidakAktif,
      tanggalTidakAktif: krama.tanggalTidakAktif,
      tanggalTerdaftar: krama.tanggalTerdaftar,
      anggota: drafts,
      kepalaAnggotaClientId: kepala.clientId,
      kepala: toPendudukFields(kepala, krama.klasifikasi),
    };

    if (krama.isCreate) {
      operations.push({ kind: "create", kartuRef: krama.kartuRef, input: baseInput });
    } else if (krama.kramaId) {
      operations.push({
        kind: "updateKrama",
        kramaId: krama.kramaId,
        input: { ...baseInput, kramaId: krama.kramaId },
      });

      const detail = await getKramaDetail(krama.kramaId);
      if (detail) {
        for (const a of anggota) {
          if (isGelarKepalaStatus(a.status_keluarga, krama.klasifikasi)) continue;
          const matched = detail.anggota_aktif.find((ex) => {
            if (a.nik_atau_nika?.trim()) {
              return ex.nik_atau_nika?.trim() === a.nik_atau_nika.trim();
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
                penduduk: toPendudukFields(a, krama.klasifikasi),
              },
            });
            bumpSummary(summaries, anggotaSheetName, "updates");
          } else {
            operations.push({
              kind: "addAnggota",
              kramaId: krama.kramaId,
              input: {
                kramaId: krama.kramaId,
                statusKeluarga: a.status_keluarga,
                penduduk: toPendudukFields(a, krama.klasifikasi),
                tanggalPencatatan: krama.tanggalTerdaftar,
              },
            });
            bumpSummary(summaries, anggotaSheetName, "creates");
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

export async function commitPemasihImport(preview: PemasihImportPreview): Promise<void> {
  if (!preview.canCommit) {
    throw new Error("Impor tidak dapat disimpan: masih ada error validasi");
  }
  for (const op of preview.operations) {
    if (op.kind === "create") await createKrama(op.input);
  }
  for (const op of preview.operations) {
    if (op.kind === "updateKrama") await updateKrama(op.input);
  }
  for (const op of preview.operations) {
    if (op.kind === "addAnggota") await addAnggota(op.input);
    else if (op.kind === "updateAnggota") await updateAnggota(op.input);
  }
}
