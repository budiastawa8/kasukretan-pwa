import { agamaForPenduduk } from "../agama-tamiu";
import { getDb } from "../db/client";
import { getSheet, isEmptyRow, parseWorkbook } from "../excel-import";
import { nomorKartuLookupKey } from "../penomoran";
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
  statusKeluargaOptions,
} from "../status-keluarga";
import type { AnggotaKeluarga, KlasifikasiKode } from "../types";
import type { ImportIssue, ImportPreviewResult, ImportSheetSummary } from "./import-types";
import {
  MAX_IMPORT_ROWS,
  buildHeaderColumnMap,
  cellAt,
  normalizeJenisKelaminImport,
  parseImportDateField,
  validateImportHeaders,
} from "./import-helpers";
import {
  PEMASIH_ANGGOTA_ONLY_HEADERS,
  PEMASIH_ANGGOTA_SHEET,
} from "./pemasih-anggota-template";

export type PemasihAnggotaImportOp =
  | { kind: "add"; kramaId: string; input: AddAnggotaInput }
  | { kind: "update"; kramaId: string; anggotaId: string; input: UpdateAnggotaInput };

export type PemasihAnggotaImportPreview = ImportPreviewResult<PemasihAnggotaImportOp>;

export type PemasihAnggotaImportScope = {
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
  nik_atau_nika?: string;
  agama?: string;
};

function bump(summary: ImportSheetSummary, field: "creates" | "updates" | "errors"): void {
  summary[field] += 1;
}

function toPendudukFields(row: ParsedRow, kode: KlasifikasiKode) {
  return {
    nama_lengkap: row.nama_lengkap,
    jenis_kelamin: row.jenis_kelamin,
    tempat_lahir: row.tempat_lahir,
    tanggal_lahir: row.tanggal_lahir,
    status_kawin: row.status_kawin,
    pekerjaan: row.pekerjaan,
    nik_atau_nika: row.nik_atau_nika,
    agama: agamaForPenduduk(kode, row.agama) ?? undefined,
  };
}

function matchAnggota(
  detail: { anggota_aktif: AnggotaKeluarga[] },
  row: ParsedRow
): AnggotaKeluarga | undefined {
  if (row.anggotaId) {
    const byId = detail.anggota_aktif.find((a) => a.anggota_id === row.anggotaId);
    if (byId) return byId;
  }
  return detail.anggota_aktif.find((ex) => {
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
  const rows = await db.select<{ id: string; nomor_kartu: string; klasifikasi: string }[]>(
    `SELECT k.id, k.nomor_kartu, kk.kode as klasifikasi
     FROM krama k
     JOIN klasifikasi_krama kk ON kk.id = k.klasifikasi_krama_id
       AND kk.kode IN ('KRAMA_TAMIU', 'TAMIU')
     WHERE k.status_krama = 'aktif'`
  );
  return new Map(
    rows.map((r) => [
      nomorKartuLookupKey(r.nomor_kartu),
      { id: r.id, nomor_kartu: r.nomor_kartu, klasifikasi: r.klasifikasi as KlasifikasiKode },
    ])
  );
}

export async function validatePemasihAnggotaImport(
  bytes: Uint8Array,
  filename: string,
  scope: PemasihAnggotaImportScope = {}
): Promise<PemasihAnggotaImportPreview> {
  const { kramaId: fixedKramaId, nomorKartu: fixedNomor } = scope;
  const sheetName = PEMASIH_ANGGOTA_SHEET;
  const errors: ImportIssue[] = [];
  const operations: PemasihAnggotaImportOp[] = [];
  const summary: ImportSheetSummary = {
    sheet: sheetName,
    creates: 0,
    updates: 0,
    errors: 0,
    warnings: 0,
  };

  const sheets = parseWorkbook(bytes);
  const anggotaSheet = getSheet(sheets, sheetName) ?? [];
  if (!validateImportHeaders(sheetName, anggotaSheet, PEMASIH_ANGGOTA_ONLY_HEADERS, errors, [])) {
    return { filename, canCommit: false, summaries: [summary], errors, warnings: [], operations };
  }

  const colMap = buildHeaderColumnMap(anggotaSheet[0]);

  let fixedKrama: { id: string; nomor_kartu: string; klasifikasi: KlasifikasiKode } | null = null;
  if (fixedKramaId) {
    const detail = await getKramaDetail(fixedKramaId);
    if (!detail) {
      errors.push({ sheet: "—", excelRow: 0, message: "Krama tidak ditemukan" });
      return { filename, canCommit: false, summaries: [summary], errors, warnings: [], operations };
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

  for (let i = 0; i < Math.min(anggotaSheet.length - 1, MAX_IMPORT_ROWS); i++) {
    const row = anggotaSheet[i + 1];
    const excelRow = i + 2;
    if (isEmptyRow(row)) continue;

    let nomorKartu = cellAt(row, colMap, "nomor_kartu");
    const anggotaId = cellAt(row, colMap, "anggota_id");
    const nama = cellAt(row, colMap, "nama_lengkap");
    const jk = normalizeJenisKelaminImport(cellAt(row, colMap, "jenis_kelamin"));
    const statusRaw = cellAt(row, colMap, "status_keluarga");

    let kramaRef = fixedKrama;
    if (!kramaRef) {
      if (!nomorKartu) {
        errors.push({ sheet: sheetName, excelRow, column: "nomor_kartu", message: "Wajib diisi" });
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
    } else if (
      nomorKartu &&
      nomorKartuLookupKey(nomorKartu) !== nomorKartuLookupKey(kramaRef.nomor_kartu)
    ) {
      errors.push({
        sheet: sheetName,
        excelRow,
        column: "nomor_kartu",
        message: `Nomor kartu harus ${fixedNomor ?? kramaRef.nomor_kartu}`,
      });
      bump(summary, "errors");
      continue;
    } else {
      nomorKartu = kramaRef.nomor_kartu;
    }

    const kode = kramaRef.klasifikasi;
    if (!nama) {
      errors.push({ sheet: sheetName, excelRow, column: "nama_lengkap", message: "Wajib diisi" });
      bump(summary, "errors");
      continue;
    }
    if (jk !== "L" && jk !== "P") {
      errors.push({ sheet: sheetName, excelRow, column: "jenis_kelamin", message: "Gunakan L atau P" });
      bump(summary, "errors");
      continue;
    }

    const statusFmt = formatStatusKeluargaAnggota(statusRaw, kode);
    if (!statusKeluargaOptions(kode).some((o) => o.toLowerCase() === statusFmt.toLowerCase())) {
      errors.push({
        sheet: sheetName,
        excelRow,
        column: "status_keluarga",
        message: `Status tidak valid: ${statusRaw}`,
      });
      bump(summary, "errors");
      continue;
    }

    const parsed: ParsedRow = {
      excelRow,
      nomorKartu,
      anggotaId,
      nama_lengkap: nama,
      jenis_kelamin: jk,
      status_keluarga: statusFmt,
      tempat_lahir: cellAt(row, colMap, "tempat_lahir") || undefined,
      tanggal_lahir: parseImportDateField(
        cellAt(row, colMap, "tanggal_lahir"),
        sheetName,
        excelRow,
        "tanggal_lahir",
        errors
      ),
      status_kawin: cellAt(row, colMap, "status_kawin") || undefined,
      pekerjaan: cellAt(row, colMap, "pekerjaan") || undefined,
      nik_atau_nika: cellAt(row, colMap, "nik_atau_nika") || undefined,
      agama: cellAt(row, colMap, "agama") || undefined,
    };

    if (!isGelarKepalaStatus(statusFmt, kode) && !parsed.nik_atau_nika?.trim()) {
      errors.push({
        sheet: sheetName,
        excelRow,
        column: "nik_atau_nika",
        message: "NIK/NIKA wajib untuk anggota selain Pengajeg",
      });
      bump(summary, "errors");
      continue;
    }
    if (kode === "TAMIU" && isGelarKepalaStatus(statusFmt, kode) && !parsed.agama?.trim()) {
      errors.push({
        sheet: sheetName,
        excelRow,
        column: "agama",
        message: "Agama wajib untuk Pengajeg Tamiu",
      });
      bump(summary, "errors");
      continue;
    }

    const detail = await getDetailCached(kramaRef.id);
    if (!detail) {
      errors.push({ sheet: sheetName, excelRow, message: "Data krama tidak dapat dimuat" });
      bump(summary, "errors");
      continue;
    }

    const isGelar = isGelarKepalaStatus(statusFmt, kode);
    const matched = matchAnggota(detail, parsed);

    if (isGelar) {
      if (!matched || !isKepalaPenduduk(matched.penduduk_id, detail.kepala.id)) {
        errors.push({
          sheet: sheetName,
          excelRow,
          message: `Tidak bisa menambah ${gelarKepalaStatus(kode)} lewat impor — tetapkan di aplikasi`,
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

    if (!isValidStatusKeluarga(statusFmt, kode)) {
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
    warnings: [],
    operations,
  };
}

export async function commitPemasihAnggotaImport(preview: PemasihAnggotaImportPreview): Promise<void> {
  if (!preview.canCommit) {
    throw new Error("Impor tidak dapat disimpan: masih ada error validasi");
  }
  for (const op of preview.operations) {
    if (op.kind === "add") await addAnggota(op.input);
    else await updateAnggota(op.input);
  }
}
