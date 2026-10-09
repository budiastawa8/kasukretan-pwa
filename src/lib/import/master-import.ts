import { getDb } from "../db/client";
import { cellStr, getSheet, isEmptyRow, parseWorkbook, type SheetRows } from "../excel-import";
import { parseMasaBerlakuTahun } from "../masa-berlaku";
import { parsePaturunanPersen } from "../paturunan-hitung";
import { getDesaAdat } from "../services/desa";
import {
  createArahan,
  createBanjar,
  createJenisKramaTamiu,
  createJenisMipil,
  createJenisTamiu,
  createTempek,
  createTimKasukretan,
  listBanjar,
  listJenisKramaTamiu,
  listJenisMipil,
  listJenisTamiu,
  listTimKasukretan,
  updateArahan,
  updateBanjar,
  updateJenisKramaTamiu,
  updateJenisKramaTamiuMasaBerlaku,
  updateJenisMipil,
  updateJenisMipilMasaBerlaku,
  updateJenisTamiu,
  updateJenisTamiuMasaBerlaku,
  updateTempek,
  updateTimKasukretan,
} from "../services/master";
import { MASTER_SHEET_HEADERS, MASTER_SHEET_NAMES } from "./master-template";

const MAX_ROWS_PER_SHEET = 500;

export type ImportIssue = {
  sheet: string;
  excelRow: number;
  column?: string;
  message: string;
};

export type ImportSheetSummary = {
  sheet: string;
  creates: number;
  updates: number;
  errors: number;
  warnings: number;
};

export type MasterImportOp =
  | { kind: "banjar"; action: "create" | "update"; id?: string; kode: string; nama: string }
  | {
      kind: "tempek";
      action: "create" | "update";
      id?: string;
      banjarKode: string;
      nama: string;
      kode?: string;
    }
  | {
      kind: "arahan";
      action: "create" | "update";
      id?: string;
      banjarKode: string;
      tempekNama: string;
      nama: string;
      kode?: string;
    }
  | {
      kind: "jenisMipil";
      action: "create" | "update";
      id?: string;
      nama: string;
      paturunanPersen: number;
      masaBerlakuTahun?: number;
    }
  | {
      kind: "jenisKramaTamiu";
      action: "create" | "update";
      id?: string;
      nama: string;
      dudukanNominal: number;
      masaBerlakuTahun?: number;
    }
  | {
      kind: "jenisTamiu";
      action: "create" | "update";
      id?: string;
      nama: string;
      dudukanNominal: number;
      masaBerlakuTahun?: number;
    }
  | {
      kind: "tim";
      action: "create" | "update";
      id?: string;
      banjarKode: string;
      nama: string;
      jabatan: string;
    };

export type ImportPreviewResult = {
  filename: string;
  canCommit: boolean;
  summaries: ImportSheetSummary[];
  errors: ImportIssue[];
  warnings: ImportIssue[];
  operations: MasterImportOp[];
};

function normalizeBanjarKode(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) throw new Error("Kode banjar wajib diisi");
  return digits.padStart(2, "0").slice(-2);
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

function validateHeaders(
  sheetName: string,
  rows: SheetRows,
  expected: string[],
  errors: ImportIssue[]
): boolean {
  const header = rows[0];
  if (!header || header.length === 0) {
    errors.push({
      sheet: sheetName,
      excelRow: 1,
      message: "Header sheet tidak ditemukan",
    });
    return false;
  }
  const actual = header.map((h) => normalizeHeader(String(h ?? "")));
  const exp = expected.map(normalizeHeader);
  if (actual.length < exp.length || !exp.every((col, i) => actual[i] === col)) {
    errors.push({
      sheet: sheetName,
      excelRow: 1,
      message: `Header harus: ${expected.join(", ")}`,
    });
    return false;
  }
  return true;
}

function parseOptionalMasaBerlaku(
  raw: string,
  sheet: string,
  excelRow: number,
  errors: ImportIssue[]
): number | undefined {
  if (!raw) return undefined;
  try {
    return parseMasaBerlakuTahun(raw);
  } catch (e) {
    errors.push({
      sheet,
      excelRow,
      column: "masa_berlaku_tahun",
      message: String(e),
    });
    return undefined;
  }
}

function parseNominal(
  raw: string,
  sheet: string,
  excelRow: number,
  column: string,
  errors: ImportIssue[]
): number | null {
  if (!raw) {
    errors.push({ sheet, excelRow, column, message: `${column} wajib diisi` });
    return null;
  }
  const n = Number(raw.replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(n) || n < 0) {
    errors.push({ sheet, excelRow, column, message: `${column} harus angka tidak negatif` });
    return null;
  }
  return n;
}

function bumpSummary(
  summaries: Map<string, ImportSheetSummary>,
  sheet: string,
  field: "creates" | "updates" | "errors" | "warnings"
): void {
  const s = summaries.get(sheet)!;
  s[field] += 1;
}

function tempekKey(banjarKode: string, nama: string): string {
  return `${banjarKode}|${nama.trim().toLowerCase()}`;
}

function arahanKey(banjarKode: string, tempekNama: string, nama: string): string {
  return `${banjarKode}|${tempekNama.trim().toLowerCase()}|${nama.trim().toLowerCase()}`;
}

function timKey(banjarKode: string, nama: string): string {
  return `${banjarKode}|${nama.trim().toLowerCase()}`;
}

export async function validateMasterImport(
  bytes: Uint8Array,
  filename: string
): Promise<ImportPreviewResult> {
  const sheets = parseWorkbook(bytes);
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const operations: MasterImportOp[] = [];
  const summaries = new Map<string, ImportSheetSummary>();

  const sheetList = [
    MASTER_SHEET_NAMES.banjar,
    MASTER_SHEET_NAMES.tempek,
    MASTER_SHEET_NAMES.arahan,
    MASTER_SHEET_NAMES.jenisMipil,
    MASTER_SHEET_NAMES.jenisKramaTamiu,
    MASTER_SHEET_NAMES.jenisTamiu,
    MASTER_SHEET_NAMES.tim,
  ];
  for (const name of sheetList) {
    summaries.set(name, { sheet: name, creates: 0, updates: 0, errors: 0, warnings: 0 });
  }

  const desa = await getDesaAdat();
  if (!desa) {
    errors.push({
      sheet: "—",
      excelRow: 0,
      message: "Data desa adat belum dikonfigurasi",
    });
    return {
      filename,
      canCommit: false,
      summaries: [...summaries.values()],
      errors,
      warnings,
      operations: [],
    };
  }

  const banjarList = await listBanjar();
  const banjarByKode = new Map(banjarList.map((b) => [b.kode, b]));

  const db = await getDb();
  const tempekDb = await db.select<{ id: string; nama: string; banjar_kode: string }[]>(
    `SELECT t.id, t.nama, b.kode as banjar_kode
     FROM tempek t
     JOIN banjar b ON b.id = t.banjar_id AND b.aktif = 1
     WHERE t.aktif = 1`
  );
  const tempekByKey = new Map(
    tempekDb.map((t) => [tempekKey(t.banjar_kode, t.nama), t])
  );

  const arahanDb = await db.select<
    { id: string; nama: string; tempek_nama: string; banjar_kode: string }[]
  >(
    `SELECT a.id, a.nama, t.nama as tempek_nama, b.kode as banjar_kode
     FROM arahan a
     JOIN tempek t ON t.id = a.tempek_id AND t.aktif = 1
     JOIN banjar b ON b.id = t.banjar_id AND b.aktif = 1
     WHERE a.aktif = 1`
  );
  const arahanByKey = new Map(
    arahanDb.map((a) => [arahanKey(a.banjar_kode, a.tempek_nama, a.nama), a])
  );

  const jenisMipilList = await listJenisMipil();
  const jenisMipilByNama = new Map(
    jenisMipilList.map((j) => [j.nama.trim().toLowerCase(), j])
  );
  const jenisKTList = await listJenisKramaTamiu();
  const jenisKTByNama = new Map(jenisKTList.map((j) => [j.nama.trim().toLowerCase(), j]));
  const jenisTList = await listJenisTamiu();
  const jenisTByNama = new Map(jenisTList.map((j) => [j.nama.trim().toLowerCase(), j]));

  const timList = await listTimKasukretan();
  const timByKey = new Map(
    timList.map((t) => [timKey(t.banjar_kode, t.nama), t])
  );

  const seenBanjarKode = new Set<string>();
  const seenTempekKey = new Set<string>();
  const seenArahanKey = new Set<string>();
  const seenJenisMipil = new Set<string>();
  const seenJenisKT = new Set<string>();
  const seenJenisT = new Set<string>();
  const seenTimKey = new Set<string>();

  // — Banjar —
  const banjarSheet = getSheet(sheets, MASTER_SHEET_NAMES.banjar) ?? [];
  if (banjarSheet.length > 0) {
    const ok = validateHeaders(
      MASTER_SHEET_NAMES.banjar,
      banjarSheet,
      MASTER_SHEET_HEADERS.banjar,
      errors
    );
    if (ok) {
      const dataRows = banjarSheet.slice(1);
      if (dataRows.length > MAX_ROWS_PER_SHEET) {
        warnings.push({
          sheet: MASTER_SHEET_NAMES.banjar,
          excelRow: 0,
          message: `Lebih dari ${MAX_ROWS_PER_SHEET} baris; hanya ${MAX_ROWS_PER_SHEET} pertama diproses`,
        });
      }
      for (let i = 0; i < Math.min(dataRows.length, MAX_ROWS_PER_SHEET); i++) {
        const row = dataRows[i];
        const excelRow = i + 2;
        if (isEmptyRow(row)) continue;

        const kodeRaw = cellStr(row, 0);
        const nama = cellStr(row, 1);
        if (!nama) {
          errors.push({
            sheet: MASTER_SHEET_NAMES.banjar,
            excelRow,
            column: "nama",
            message: "Nama wajib diisi",
          });
          bumpSummary(summaries, MASTER_SHEET_NAMES.banjar, "errors");
          continue;
        }
        let kode: string;
        try {
          kode = normalizeBanjarKode(kodeRaw);
        } catch (e) {
          errors.push({
            sheet: MASTER_SHEET_NAMES.banjar,
            excelRow,
            column: "kode",
            message: String(e),
          });
          bumpSummary(summaries, MASTER_SHEET_NAMES.banjar, "errors");
          continue;
        }
        if (seenBanjarKode.has(kode)) {
          errors.push({
            sheet: MASTER_SHEET_NAMES.banjar,
            excelRow,
            column: "kode",
            message: `Kode banjar ${kode} duplikat dalam file`,
          });
          bumpSummary(summaries, MASTER_SHEET_NAMES.banjar, "errors");
          continue;
        }
        seenBanjarKode.add(kode);

        const existing = banjarByKode.get(kode);
        if (existing) {
          operations.push({
            kind: "banjar",
            action: "update",
            id: existing.id,
            kode,
            nama,
          });
          bumpSummary(summaries, MASTER_SHEET_NAMES.banjar, "updates");
        } else {
          operations.push({ kind: "banjar", action: "create", kode, nama });
          banjarByKode.set(kode, {
            id: `__pending__${kode}`,
            desa_adat_id: desa.id,
            nama,
            kode,
            aktif: 1,
          });
          bumpSummary(summaries, MASTER_SHEET_NAMES.banjar, "creates");
        }
      }
    } else {
      bumpSummary(summaries, MASTER_SHEET_NAMES.banjar, "errors");
    }
  }

  function resolveBanjarKode(
    kodeRaw: string,
    sheet: string,
    excelRow: number
  ): string | null {
    try {
      const kode = normalizeBanjarKode(kodeRaw);
      if (!banjarByKode.has(kode)) {
        errors.push({
          sheet,
          excelRow,
          column: "banjar_kode",
          message: `Banjar kode ${kode} tidak ditemukan`,
        });
        return null;
      }
      return kode;
    } catch (e) {
      errors.push({
        sheet,
        excelRow,
        column: "banjar_kode",
        message: String(e),
      });
      return null;
    }
  }

  // — Tempek —
  const tempekSheet = getSheet(sheets, MASTER_SHEET_NAMES.tempek) ?? [];
  if (tempekSheet.length > 0) {
    const ok = validateHeaders(
      MASTER_SHEET_NAMES.tempek,
      tempekSheet,
      MASTER_SHEET_HEADERS.tempek,
      errors
    );
    if (ok) {
      const dataRows = tempekSheet.slice(1);
      for (let i = 0; i < Math.min(dataRows.length, MAX_ROWS_PER_SHEET); i++) {
        const row = dataRows[i];
        const excelRow = i + 2;
        if (isEmptyRow(row)) continue;

        const banjarKode = resolveBanjarKode(cellStr(row, 0), MASTER_SHEET_NAMES.tempek, excelRow);
        if (!banjarKode) {
          bumpSummary(summaries, MASTER_SHEET_NAMES.tempek, "errors");
          continue;
        }
        const nama = cellStr(row, 1);
        if (!nama) {
          errors.push({
            sheet: MASTER_SHEET_NAMES.tempek,
            excelRow,
            column: "nama",
            message: "Nama wajib diisi",
          });
          bumpSummary(summaries, MASTER_SHEET_NAMES.tempek, "errors");
          continue;
        }
        const kode = cellStr(row, 2) || undefined;
        const key = tempekKey(banjarKode, nama);
        if (seenTempekKey.has(key)) {
          errors.push({
            sheet: MASTER_SHEET_NAMES.tempek,
            excelRow,
            message: `Tempek duplikat: ${banjarKode} / ${nama}`,
          });
          bumpSummary(summaries, MASTER_SHEET_NAMES.tempek, "errors");
          continue;
        }
        seenTempekKey.add(key);

        const existing = tempekByKey.get(key);
        if (existing) {
          operations.push({
            kind: "tempek",
            action: "update",
            id: existing.id,
            banjarKode,
            nama,
            kode,
          });
          bumpSummary(summaries, MASTER_SHEET_NAMES.tempek, "updates");
        } else {
          operations.push({ kind: "tempek", action: "create", banjarKode, nama, kode });
          tempekByKey.set(key, { id: `__pending__${key}`, nama, banjar_kode: banjarKode });
          bumpSummary(summaries, MASTER_SHEET_NAMES.tempek, "creates");
        }
      }
    }
  }

  // — Arahan —
  const arahanSheet = getSheet(sheets, MASTER_SHEET_NAMES.arahan) ?? [];
  if (arahanSheet.length > 0) {
    const ok = validateHeaders(
      MASTER_SHEET_NAMES.arahan,
      arahanSheet,
      MASTER_SHEET_HEADERS.arahan,
      errors
    );
    if (ok) {
      const dataRows = arahanSheet.slice(1);
      for (let i = 0; i < Math.min(dataRows.length, MAX_ROWS_PER_SHEET); i++) {
        const row = dataRows[i];
        const excelRow = i + 2;
        if (isEmptyRow(row)) continue;

        const tempekNama = cellStr(row, 0);
        const banjarKode = resolveBanjarKode(cellStr(row, 1), MASTER_SHEET_NAMES.arahan, excelRow);
        const nama = cellStr(row, 2);
        if (!tempekNama) {
          errors.push({
            sheet: MASTER_SHEET_NAMES.arahan,
            excelRow,
            column: "tempek_nama",
            message: "Nama tempek wajib diisi",
          });
          bumpSummary(summaries, MASTER_SHEET_NAMES.arahan, "errors");
          continue;
        }
        if (!banjarKode) {
          bumpSummary(summaries, MASTER_SHEET_NAMES.arahan, "errors");
          continue;
        }
        if (!nama) {
          errors.push({
            sheet: MASTER_SHEET_NAMES.arahan,
            excelRow,
            column: "nama",
            message: "Nama wajib diisi",
          });
          bumpSummary(summaries, MASTER_SHEET_NAMES.arahan, "errors");
          continue;
        }
        if (!tempekByKey.has(tempekKey(banjarKode, tempekNama))) {
          errors.push({
            sheet: MASTER_SHEET_NAMES.arahan,
            excelRow,
            column: "tempek_nama",
            message: `Tempek "${tempekNama}" di banjar ${banjarKode} tidak ditemukan`,
          });
          bumpSummary(summaries, MASTER_SHEET_NAMES.arahan, "errors");
          continue;
        }
        const kode = cellStr(row, 3) || undefined;
        const key = arahanKey(banjarKode, tempekNama, nama);
        if (seenArahanKey.has(key)) {
          errors.push({
            sheet: MASTER_SHEET_NAMES.arahan,
            excelRow,
            message: `Arahan duplikat: ${banjarKode} / ${tempekNama} / ${nama}`,
          });
          bumpSummary(summaries, MASTER_SHEET_NAMES.arahan, "errors");
          continue;
        }
        seenArahanKey.add(key);

        const existing = arahanByKey.get(key);
        if (existing) {
          operations.push({
            kind: "arahan",
            action: "update",
            id: existing.id,
            banjarKode,
            tempekNama,
            nama,
            kode,
          });
          bumpSummary(summaries, MASTER_SHEET_NAMES.arahan, "updates");
        } else {
          operations.push({
            kind: "arahan",
            action: "create",
            banjarKode,
            tempekNama,
            nama,
            kode,
          });
          arahanByKey.set(key, {
            id: `__pending__${key}`,
            nama,
            tempek_nama: tempekNama,
            banjar_kode: banjarKode,
          });
          bumpSummary(summaries, MASTER_SHEET_NAMES.arahan, "creates");
        }
      }
    }
  }

  function processJenisSheet(
    sheetName: string,
    rows: SheetRows,
    headers: string[],
    kind: "jenisMipil" | "jenisKramaTamiu" | "jenisTamiu",
    byNama: Map<string, { id: string; nama: string }>,
    seen: Set<string>
  ): void {
    if (rows.length === 0) return;
    const ok = validateHeaders(sheetName, rows, headers, errors);
    if (!ok) return;

    const dataRows = rows.slice(1);
    for (let i = 0; i < Math.min(dataRows.length, MAX_ROWS_PER_SHEET); i++) {
      const row = dataRows[i];
      const excelRow = i + 2;
      if (isEmptyRow(row)) continue;

      const nama = cellStr(row, 0);
      if (!nama) {
        errors.push({ sheet: sheetName, excelRow, column: "nama", message: "Nama wajib diisi" });
        bumpSummary(summaries, sheetName, "errors");
        continue;
      }
      const namaKey = nama.toLowerCase();
      if (seen.has(namaKey)) {
        errors.push({
          sheet: sheetName,
          excelRow,
          message: `Nama jenis duplikat: ${nama}`,
        });
        bumpSummary(summaries, sheetName, "errors");
        continue;
      }
      seen.add(namaKey);

      const masa = parseOptionalMasaBerlaku(cellStr(row, 2), sheetName, excelRow, errors);

      if (kind === "jenisMipil") {
        const persenRaw = cellStr(row, 1);
        let persen: number | null = null;
        try {
          persen = parsePaturunanPersen(Number(persenRaw));
        } catch (e) {
          errors.push({
            sheet: sheetName,
            excelRow,
            column: "paturunan_persen",
            message: String(e),
          });
          bumpSummary(summaries, sheetName, "errors");
          continue;
        }
        if (persenRaw === "") {
          errors.push({
            sheet: sheetName,
            excelRow,
            column: "paturunan_persen",
            message: "paturunan_persen wajib diisi",
          });
          bumpSummary(summaries, sheetName, "errors");
          continue;
        }
        const existing = jenisMipilByNama.get(namaKey);
        if (existing) {
          operations.push({
            kind: "jenisMipil",
            action: "update",
            id: existing.id,
            nama,
            paturunanPersen: persen,
            masaBerlakuTahun: masa,
          });
          bumpSummary(summaries, sheetName, "updates");
        } else {
          operations.push({
            kind: "jenisMipil",
            action: "create",
            nama,
            paturunanPersen: persen,
            masaBerlakuTahun: masa,
          });
          bumpSummary(summaries, sheetName, "creates");
        }
      } else {
        const col = kind === "jenisKramaTamiu" ? "dudukan_nominal" : "dudukan_nominal";
        const nominal = parseNominal(cellStr(row, 1), sheetName, excelRow, col, errors);
        if (nominal == null) {
          bumpSummary(summaries, sheetName, "errors");
          continue;
        }
        const existing = byNama.get(namaKey);
        if (existing) {
          operations.push({
            kind,
            action: "update",
            id: existing.id,
            nama,
            dudukanNominal: nominal,
            masaBerlakuTahun: masa,
          } as MasterImportOp);
          bumpSummary(summaries, sheetName, "updates");
        } else {
          operations.push({
            kind,
            action: "create",
            nama,
            dudukanNominal: nominal,
            masaBerlakuTahun: masa,
          } as MasterImportOp);
          bumpSummary(summaries, sheetName, "creates");
        }
      }
    }
  }

  processJenisSheet(
    MASTER_SHEET_NAMES.jenisMipil,
    getSheet(sheets, MASTER_SHEET_NAMES.jenisMipil) ?? [],
    MASTER_SHEET_HEADERS.jenisMipil,
    "jenisMipil",
    jenisMipilByNama,
    seenJenisMipil
  );
  processJenisSheet(
    MASTER_SHEET_NAMES.jenisKramaTamiu,
    getSheet(sheets, MASTER_SHEET_NAMES.jenisKramaTamiu) ?? [],
    MASTER_SHEET_HEADERS.jenisKramaTamiu,
    "jenisKramaTamiu",
    jenisKTByNama,
    seenJenisKT
  );
  processJenisSheet(
    MASTER_SHEET_NAMES.jenisTamiu,
    getSheet(sheets, MASTER_SHEET_NAMES.jenisTamiu) ?? [],
    MASTER_SHEET_HEADERS.jenisTamiu,
    "jenisTamiu",
    jenisTByNama,
    seenJenisT
  );

  // — Tim —
  const timSheet = getSheet(sheets, MASTER_SHEET_NAMES.tim) ?? [];
  if (timSheet.length > 0) {
    const ok = validateHeaders(
      MASTER_SHEET_NAMES.tim,
      timSheet,
      MASTER_SHEET_HEADERS.tim,
      errors
    );
    if (ok) {
      const dataRows = timSheet.slice(1);
      for (let i = 0; i < Math.min(dataRows.length, MAX_ROWS_PER_SHEET); i++) {
        const row = dataRows[i];
        const excelRow = i + 2;
        if (isEmptyRow(row)) continue;

        const banjarKode = resolveBanjarKode(cellStr(row, 0), MASTER_SHEET_NAMES.tim, excelRow);
        const nama = cellStr(row, 1);
        const jabatan = cellStr(row, 2);
        if (!banjarKode) {
          bumpSummary(summaries, MASTER_SHEET_NAMES.tim, "errors");
          continue;
        }
        if (!nama) {
          errors.push({
            sheet: MASTER_SHEET_NAMES.tim,
            excelRow,
            column: "nama",
            message: "Nama wajib diisi",
          });
          bumpSummary(summaries, MASTER_SHEET_NAMES.tim, "errors");
          continue;
        }
        if (!jabatan) {
          errors.push({
            sheet: MASTER_SHEET_NAMES.tim,
            excelRow,
            column: "jabatan",
            message: "Jabatan wajib diisi",
          });
          bumpSummary(summaries, MASTER_SHEET_NAMES.tim, "errors");
          continue;
        }
        const key = timKey(banjarKode, nama);
        if (seenTimKey.has(key)) {
          errors.push({
            sheet: MASTER_SHEET_NAMES.tim,
            excelRow,
            message: `Tim duplikat: ${banjarKode} / ${nama}`,
          });
          bumpSummary(summaries, MASTER_SHEET_NAMES.tim, "errors");
          continue;
        }
        seenTimKey.add(key);

        const existing = timByKey.get(key);
        if (existing) {
          operations.push({
            kind: "tim",
            action: "update",
            id: existing.id,
            banjarKode,
            nama,
            jabatan,
          });
          bumpSummary(summaries, MASTER_SHEET_NAMES.tim, "updates");
        } else {
          operations.push({ kind: "tim", action: "create", banjarKode, nama, jabatan });
          bumpSummary(summaries, MASTER_SHEET_NAMES.tim, "creates");
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

async function loadTempekIdMap(): Promise<Map<string, string>> {
  const db = await getDb();
  const rows = await db.select<{ id: string; nama: string; banjar_kode: string }[]>(
    `SELECT t.id, t.nama, b.kode as banjar_kode
     FROM tempek t
     JOIN banjar b ON b.id = t.banjar_id AND b.aktif = 1
     WHERE t.aktif = 1`
  );
  return new Map(rows.map((r) => [tempekKey(r.banjar_kode, r.nama), r.id]));
}

export async function commitMasterImport(preview: ImportPreviewResult): Promise<void> {
  if (!preview.canCommit) {
    throw new Error("Impor tidak dapat disimpan: masih ada error validasi");
  }

  const desa = await getDesaAdat();
  if (!desa) throw new Error("Data desa adat belum dikonfigurasi");

  const banjarIdByKode = new Map((await listBanjar()).map((b) => [b.kode, b.id]));
  const tempekIdByKey = await loadTempekIdMap();

  const banjarOps = preview.operations.filter((o) => o.kind === "banjar");
  const tempekOps = preview.operations.filter((o) => o.kind === "tempek");
  const arahanOps = preview.operations.filter((o) => o.kind === "arahan");
  const jenisMipilOps = preview.operations.filter((o) => o.kind === "jenisMipil");
  const jenisKTOps = preview.operations.filter((o) => o.kind === "jenisKramaTamiu");
  const jenisTOps = preview.operations.filter((o) => o.kind === "jenisTamiu");
  const timOps = preview.operations.filter((o) => o.kind === "tim");

  // plugin-sql / IPC SQLite tidak mendukung transaksi multi-panggilan (BEGIN terpisah dari
  // execute master.ts) — itu memicu SQLITE_BUSY / database is locked.
  for (const op of banjarOps) {
    if (op.action === "create") {
      const id = await createBanjar(desa.id, op.nama, op.kode);
      banjarIdByKode.set(op.kode, id);
    } else if (op.id) {
      await updateBanjar(op.id, op.nama, op.kode);
      banjarIdByKode.set(op.kode, op.id);
    }
  }

  for (const op of tempekOps) {
    const banjarId = banjarIdByKode.get(op.banjarKode);
    if (!banjarId) {
      throw new Error(`Banjar kode ${op.banjarKode} tidak ditemukan saat commit`);
    }
    if (op.action === "create") {
      const id = await createTempek(banjarId, op.nama, op.kode);
      tempekIdByKey.set(tempekKey(op.banjarKode, op.nama), id);
    } else if (op.id) {
      await updateTempek(op.id, op.nama, op.kode);
      tempekIdByKey.set(tempekKey(op.banjarKode, op.nama), op.id);
    }
  }

  for (const op of arahanOps) {
    const tempekId = tempekIdByKey.get(tempekKey(op.banjarKode, op.tempekNama));
    if (!tempekId) {
      throw new Error(`Tempek ${op.banjarKode}/${op.tempekNama} tidak ditemukan saat commit`);
    }
    if (op.action === "create") {
      await createArahan(tempekId, op.nama, op.kode);
    } else if (op.id) {
      await updateArahan(op.id, op.nama, op.kode);
    }
  }

  for (const op of jenisMipilOps) {
    if (op.action === "create") {
      const id = await createJenisMipil(op.nama, op.paturunanPersen);
      if (op.masaBerlakuTahun != null) {
        await updateJenisMipilMasaBerlaku(id, op.masaBerlakuTahun);
      }
    } else if (op.id) {
      await updateJenisMipil(op.id, op.nama, op.paturunanPersen);
      if (op.masaBerlakuTahun != null) {
        await updateJenisMipilMasaBerlaku(op.id, op.masaBerlakuTahun);
      }
    }
  }

  for (const op of jenisKTOps) {
    if (op.kind !== "jenisKramaTamiu") continue;
    if (op.action === "create") {
      const id = await createJenisKramaTamiu(op.nama, op.dudukanNominal);
      if (op.masaBerlakuTahun != null) {
        await updateJenisKramaTamiuMasaBerlaku(id, op.masaBerlakuTahun);
      }
    } else if (op.id) {
      await updateJenisKramaTamiu(op.id, op.nama, op.dudukanNominal);
      if (op.masaBerlakuTahun != null) {
        await updateJenisKramaTamiuMasaBerlaku(op.id, op.masaBerlakuTahun);
      }
    }
  }

  for (const op of jenisTOps) {
    if (op.kind !== "jenisTamiu") continue;
    if (op.action === "create") {
      const id = await createJenisTamiu(op.nama, op.dudukanNominal);
      if (op.masaBerlakuTahun != null) {
        await updateJenisTamiuMasaBerlaku(id, op.masaBerlakuTahun);
      }
    } else if (op.id) {
      await updateJenisTamiu(op.id, op.nama, op.dudukanNominal);
      if (op.masaBerlakuTahun != null) {
        await updateJenisTamiuMasaBerlaku(op.id, op.masaBerlakuTahun);
      }
    }
  }

  for (const op of timOps) {
    const banjarId = banjarIdByKode.get(op.banjarKode);
    if (!banjarId) {
      throw new Error(`Banjar kode ${op.banjarKode} tidak ditemukan saat commit`);
    }
    if (op.action === "create") {
      await createTimKasukretan(op.nama, banjarId, op.jabatan);
    } else if (op.id) {
      await updateTimKasukretan(op.id, op.nama, banjarId, op.jabatan);
    }
  }
}

/** Uji parse round-trip: semua sheet wajib ada dengan header benar. */
export function assertMasterWorkbookStructure(sheets: Map<string, SheetRows>): string[] {
  const problems: string[] = [];
  const required = Object.entries(MASTER_SHEET_HEADERS) as [string, string[]][];
  for (const [key, headers] of required) {
    const name = MASTER_SHEET_NAMES[key as keyof typeof MASTER_SHEET_HEADERS];
    const rows = getSheet(sheets, name);
    if (!rows || rows.length === 0) {
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
