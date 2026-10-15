import { PDFDocument, type PDFPage } from "pdf-lib";
import type { DesaAdat } from "./types";
import type { PaturunanRiwayatRow } from "./services/paturunan-pembayaran";
import { paymentDayKey, resolveBendaharaTimNama } from "./bukti-setoran-dudukan-pdf";
import { formatRupiah } from "./paturunan-hitung";
import {
  COLOR_TEXT,
  createPdfFonts,
  drawCenteredText,
  ilikitaUpper,
  MM,
  type PdfFonts,
} from "./pdf-common";
import { createTableFonts } from "./pdf-table-fonts";
import {
  drawSetoranFullWidthBand,
  drawSetoranLabelAmountRow,
  drawSetoranTableHeader,
  drawSetoranTableRow,
  setoranColumnWidths,
  type SetoranTableLayout,
} from "./pdf-setoran-table";
import { formatTanggalLahir, today } from "./utils";

const PAGE_W = 210 * MM;
const PAGE_H = 297 * MM;
const MARGIN_X = 15 * MM;
const MARGIN_Y = 15 * MM;
const CONTENT_W = PAGE_W - 2 * MARGIN_X;

const TITLE_SIZE = 13;
const META_SIZE = 11;
const TABLE_HEADER_SIZE = 10;
const TABLE_ROW_SIZE = 10;
const ROW_H = 7 * MM;
const HEADER_ROW_H = 7 * MM;
const CELL_PAD = 1.2 * MM;
const META_LINE_H = 5.5 * MM;
const SECTION_GAP = 3 * MM;
const TITLE_GAP_PT = 8;
const FOOTER_SIZE = 11;
const FOOTER_TOP_GAP = 10 * MM;
const FOOTER_LINE_STEP = 5 * MM;
const FOOTER_SIGN_SPACE = 18 * MM;
const FOOTER_BLOCK_H = 32 * MM;

const TABLE_COL_FRACTIONS = [0.32, 1.55, 0.95, 1.18];
const TABLE_HEADERS = ["No", "Nama Krama", "Jml Bayar", "Petugas"];
const COL_JUMLAH = 2;
const COL_NO = 0;

const TABLE_LAYOUT: SetoranTableLayout = {
  marginX: MARGIN_X,
  contentW: CONTENT_W,
  headers: TABLE_HEADERS,
  colFractions: TABLE_COL_FRACTIONS,
  rightDataCols: new Set([COL_JUMLAH]),
  centerDataCols: new Set([COL_NO]),
  centerHeaderCols: new Set([0, 1, 2, 3]),
  headerSize: TABLE_HEADER_SIZE,
  rowSize: TABLE_ROW_SIZE,
  rowH: ROW_H,
  headerRowH: HEADER_ROW_H,
  cellPad: CELL_PAD,
  cellText: ilikitaUpper,
};

function pdfCaps(text: string): string {
  return ilikitaUpper(text);
}

function tableTotalWidth(): number {
  return setoranColumnWidths(TABLE_LAYOUT).reduce((s, w) => s + w, 0);
}

export type BuktiSetoranPaturunanLine = {
  no: number;
  nama: string;
  jumlah: number;
  petugas: string;
};

export type BuktiSetoranPaturunanJenisGroup = {
  jenisLabel: string;
  lines: BuktiSetoranPaturunanLine[];
};

export type BuktiSetoranPaturunanArahanGroup = {
  arahanNama: string;
  jenisGroups: BuktiSetoranPaturunanJenisGroup[];
  subtotal: number;
};

export type BuktiSetoranPaturunanIuranSection = {
  iuranNama: string;
  arahanGroups: BuktiSetoranPaturunanArahanGroup[];
};

export type BuktiSetoranPaturunanSlip = {
  /** Awal rentang tanggal bayar (YYYY-MM-DD). */
  tanggal: string;
  /** Akhir rentang; sama dengan `tanggal` untuk bukti satu hari. */
  tanggalSampai?: string;
  banjarNama: string;
  banjarId?: string;
  tempekNama: string;
  sections: BuktiSetoranPaturunanIuranSection[];
  grandTotal: number;
};

export type BuktiSetoranPaturunanPdfPayload = {
  filename: string;
  slip: BuktiSetoranPaturunanSlip;
};

type PageCtx = {
  pdf: PDFDocument;
  page: PDFPage;
  y: number;
  bodyFonts: PdfFonts;
  tableFonts: PdfFonts;
};

function assertSingleBanjarTempek(rows: PaturunanRiwayatRow[]): {
  banjarNama: string;
  banjarId?: string;
  tempekNama: string;
} {
  const banjars = [...new Set(rows.map((r) => r.banjar_nama?.trim() || "—"))];
  const tempeks = [...new Set(rows.map((r) => r.tempek_nama?.trim() || "—"))];
  const banjarIds = [
    ...new Set(rows.map((r) => r.banjar_id?.trim()).filter((id): id is string => !!id)),
  ];
  if (banjars.length > 1) {
    throw new Error(
      "Bukti setoran hanya untuk satu banjar. Pilih filter Banjar ke banjar yang sama."
    );
  }
  if (tempeks.length > 1) {
    throw new Error(
      "Bukti setoran hanya untuk satu tempek. Pilih filter sehingga semua baris dari tempek yang sama."
    );
  }
  return {
    banjarNama: banjars[0] ?? "—",
    banjarId: banjarIds[0],
    tempekNama: tempeks[0] ?? "—",
  };
}

function formatJenisGroupLabel(jenisNama: string): string {
  const n = jenisNama.trim() || "—";
  if (/^krama\s/i.test(n)) return `${n} :`;
  return `Krama ${n} :`;
}

function formatArahanLabel(arahanNama: string): string {
  return `Arahan : ${arahanNama.trim() || "—"}`;
}

function groupByKey<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return map;
}

/** Urutan standar jenis krama mipil (sesuai urutan pembuatan di master). */
const JENIS_MIPIL_ORDER = [
  "ngarep jangkep",
  "ngarep balu",
  "ngarep nyapihan",
  "nyada",
] as const;

function normalizeJenisOrderName(nama: string): string {
  return nama.trim().replace(/^krama\s+/i, "").toLowerCase();
}

function jenisMipilRank(nama: string): number {
  const n = normalizeJenisOrderName(nama);
  const idx = JENIS_MIPIL_ORDER.indexOf(n as (typeof JENIS_MIPIL_ORDER)[number]);
  return idx >= 0 ? idx : JENIS_MIPIL_ORDER.length;
}

function jenisMipilSortKey(row: PaturunanRiwayatRow): string {
  const created = row.jenis_created_at?.trim();
  if (created) return created;
  return `\uffff${String(jenisMipilRank(row.jenis_nama ?? "")).padStart(3, "0")}`;
}

function compareJenisMipilRows(a: PaturunanRiwayatRow, b: PaturunanRiwayatRow): number {
  const byCreated = jenisMipilSortKey(a).localeCompare(jenisMipilSortKey(b));
  if (byCreated !== 0) return byCreated;
  const byRank = jenisMipilRank(a.jenis_nama ?? "") - jenisMipilRank(b.jenis_nama ?? "");
  if (byRank !== 0) return byRank;
  return (a.jenis_nama ?? "").localeCompare(b.jenis_nama ?? "", "id");
}

function buildArahanGroups(rows: PaturunanRiwayatRow[]): BuktiSetoranPaturunanArahanGroup[] {
  const byArahan = groupByKey(rows, (r) => r.arahan_nama?.trim() || "—");
  return [...byArahan.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "id"))
    .map(([arahanNama, arahanRows]) => {
      const byJenis = groupByKey(
        arahanRows,
        (r) => r.jenis_krama_mipil_id?.trim() || r.jenis_nama?.trim() || "—"
      );
      const jenisGroups = [...byJenis.entries()]
        .sort(([, aRows], [, bRows]) => compareJenisMipilRows(aRows[0]!, bRows[0]!))
        .map(([, jenisRows]) => {
          const jenisNama = jenisRows[0]?.jenis_nama?.trim() || "—";
          const sorted = [...jenisRows].sort((a, b) =>
            (a.kepala_nama ?? "").localeCompare(b.kepala_nama ?? "", "id")
          );
          return {
            jenisLabel: formatJenisGroupLabel(jenisNama),
            lines: sorted.map((r, idx) => ({
              no: idx + 1,
              nama: r.kepala_nama?.trim() || "—",
              jumlah: Math.round(Number(r.jumlah) || 0),
              petugas: r.petugas_nama?.trim() || "—",
            })),
          };
        });
      const subtotal = arahanRows.reduce((s, r) => s + Math.round(Number(r.jumlah) || 0), 0);
      return { arahanNama, jenisGroups, subtotal };
    });
}

function buildIuranSections(rows: PaturunanRiwayatRow[]): BuktiSetoranPaturunanIuranSection[] {
  const byIuran = groupByKey(rows, (r) => r.iuran_id);
  return [...byIuran.entries()]
    .sort(([, a], [, b]) =>
      (a[0]?.iuran_nama ?? "").localeCompare(b[0]?.iuran_nama ?? "", "id")
    )
    .map(([, iuranRows]) => ({
      iuranNama: iuranRows[0]?.iuran_nama?.trim() || "—",
      arahanGroups: buildArahanGroups(iuranRows),
    }));
}

/** "Tanggal : 01/10/2026" atau "Tanggal : 01/10/2026 s/d 15/10/2026". */
export function formatBuktiSetoranPaturunanPeriode(slip: BuktiSetoranPaturunanSlip): string {
  const sampai = slip.tanggalSampai ?? slip.tanggal;
  if (sampai === slip.tanggal) return formatTanggalLahir(slip.tanggal);
  return `${formatTanggalLahir(slip.tanggal)} s/d ${formatTanggalLahir(sampai)}`;
}

/**
 * Tanpa `range`, rentang diambil dari tanggal bayar terawal–terakhir pada `rows`.
 * Dengan `range`, hanya baris di dalam rentang yang dipakai.
 */
export function buildBuktiSetoranPaturunanSlip(
  rows: PaturunanRiwayatRow[],
  range?: { dari: string; sampai: string }
): BuktiSetoranPaturunanSlip {
  const periodRows = range
    ? rows.filter((r) => {
        const day = paymentDayKey(r.tanggal);
        return day >= range.dari && day <= range.sampai;
      })
    : rows.filter((r) => paymentDayKey(r.tanggal).length > 0);
  if (!periodRows.length) {
    throw new Error("Tidak ada tanggal pembayaran pada data yang dipilih.");
  }
  const days = periodRows.map((r) => paymentDayKey(r.tanggal)).sort();
  const tanggal = range?.dari ?? days[0]!;
  const tanggalSampai = range?.sampai ?? days[days.length - 1]!;

  const { banjarNama, banjarId, tempekNama } = assertSingleBanjarTempek(periodRows);
  const sections = buildIuranSections(periodRows);
  const grandTotal = periodRows.reduce((s, r) => s + Math.round(Number(r.jumlah) || 0), 0);
  return { tanggal, tanggalSampai, banjarNama, banjarId, tempekNama, sections, grandTotal };
}

export function buildBuktiSetoranPaturunanPdfPayload(
  rows: PaturunanRiwayatRow[],
  range?: { dari: string; sampai: string }
): BuktiSetoranPaturunanPdfPayload {
  const slip = buildBuktiSetoranPaturunanSlip(rows, range);
  const sampai = slip.tanggalSampai ?? slip.tanggal;
  const slugDate = sampai === slip.tanggal ? slip.tanggal : `${slip.tanggal}_sd_${sampai}`;
  return {
    filename: `bukti-setoran-paturunan-${slugDate}`,
    slip,
  };
}

function addPage(ctx: PageCtx): void {
  ctx.page = ctx.pdf.addPage([PAGE_W, PAGE_H]);
  ctx.y = PAGE_H - MARGIN_Y;
}

function ensureSpace(ctx: PageCtx, needed: number): void {
  if (ctx.y - needed < MARGIN_Y) addPage(ctx);
}

function drawMetaHeader(ctx: PageCtx, slip: BuktiSetoranPaturunanSlip): void {
  ensureSpace(ctx, TITLE_SIZE + TITLE_GAP_PT + META_LINE_H * 2 + 3 * MM);
  ctx.page.drawText("PENERIMAAN SETORAN PATURUNAN", {
    x: MARGIN_X,
    y: ctx.y - TITLE_SIZE,
    size: TITLE_SIZE,
    font: ctx.bodyFonts.bold,
    color: COLOR_TEXT,
  });
  ctx.y -= TITLE_SIZE + TITLE_GAP_PT;

  const tanggalLabel = pdfCaps(`Tanggal : ${formatBuktiSetoranPaturunanPeriode(slip)}`);
  const tanggalW = ctx.bodyFonts.regular.widthOfTextAtSize(tanggalLabel, META_SIZE);
  ctx.page.drawText(pdfCaps(`BANJAR ADAT : ${slip.banjarNama}`), {
    x: MARGIN_X,
    y: ctx.y - 3.5 * MM,
    size: META_SIZE,
    font: ctx.bodyFonts.regular,
    color: COLOR_TEXT,
  });
  ctx.page.drawText(tanggalLabel, {
    x: MARGIN_X + CONTENT_W - tanggalW,
    y: ctx.y - 3.5 * MM,
    size: META_SIZE,
    font: ctx.bodyFonts.regular,
    color: COLOR_TEXT,
  });
  ctx.y -= META_LINE_H;

  ctx.page.drawText(pdfCaps(`Tempek : ${slip.tempekNama}`), {
    x: MARGIN_X,
    y: ctx.y - 3.5 * MM,
    size: META_SIZE,
    font: ctx.bodyFonts.regular,
    color: COLOR_TEXT,
  });
  ctx.y -= META_LINE_H + 2 * MM;

  ctx.page.drawLine({
    start: { x: MARGIN_X, y: ctx.y },
    end: { x: MARGIN_X + CONTENT_W, y: ctx.y },
    thickness: 0.8,
    color: COLOR_TEXT,
  });
  ctx.y -= 3 * MM;
}

function drawFullWidthBand(
  ctx: PageCtx,
  text: string,
  bold = true,
  align: "left" | "center" = "left"
): void {
  ensureSpace(ctx, ROW_H);
  ctx.y = drawSetoranFullWidthBand(
    ctx.page,
    ctx.y,
    TABLE_LAYOUT,
    tableTotalWidth(),
    text,
    ctx.tableFonts,
    bold,
    align
  );
}

function drawTableHeaderRow(ctx: PageCtx): void {
  ensureSpace(ctx, HEADER_ROW_H);
  ctx.y = drawSetoranTableHeader(ctx.page, ctx.y, TABLE_LAYOUT, ctx.tableFonts);
}

function ensureTableRowSpace(ctx: PageCtx, repeatHeader: () => void): void {
  const yBefore = ctx.y;
  ensureSpace(ctx, ROW_H);
  if (ctx.y > yBefore) repeatHeader();
}

function drawDataRow(ctx: PageCtx, cells: string[]): void {
  ctx.y = drawSetoranTableRow(ctx.page, ctx.y, TABLE_LAYOUT, cells, ctx.tableFonts);
}

function drawAmountSummaryRow(ctx: PageCtx, label: string, amount: number): void {
  ensureSpace(ctx, ROW_H);
  const widths = setoranColumnWidths(TABLE_LAYOUT);
  ctx.y = drawSetoranLabelAmountRow(
    ctx.page,
    ctx.y,
    TABLE_LAYOUT,
    widths,
    {
      label: pdfCaps(label),
      amountText: pdfCaps(formatRupiah(amount)),
      amountColIndex: COL_JUMLAH,
      trailingCols: 1,
    },
    ctx.tableFonts
  );
}

function drawIuranSection(
  ctx: PageCtx,
  section: BuktiSetoranPaturunanIuranSection,
  repeatHeader: () => void
): void {
  drawFullWidthBand(ctx, section.iuranNama, true, "center");
  drawTableHeaderRow(ctx);

  for (const arahan of section.arahanGroups) {
    ensureTableRowSpace(ctx, repeatHeader);
    drawFullWidthBand(ctx, formatArahanLabel(arahan.arahanNama));

    for (const jenis of arahan.jenisGroups) {
      ensureTableRowSpace(ctx, repeatHeader);
      drawFullWidthBand(ctx, jenis.jenisLabel, false);

      for (const line of jenis.lines) {
        ensureTableRowSpace(ctx, repeatHeader);
        drawDataRow(ctx, [
          String(line.no),
          line.nama,
          formatRupiah(line.jumlah),
          line.petugas,
        ]);
      }
    }

    ensureTableRowSpace(ctx, repeatHeader);
    drawAmountSummaryRow(
      ctx,
      `JUMLAH ARAHAN : ${arahan.arahanNama}`,
      arahan.subtotal
    );
  }

  ctx.y -= SECTION_GAP;
}

function drawPenerimaFooter(
  ctx: PageCtx,
  desa: DesaAdat | null,
  bendaharaNama: string
): void {
  ensureSpace(ctx, FOOTER_BLOCK_H);
  ctx.y -= FOOTER_TOP_GAP;

  const half = CONTENT_W / 2;
  const xRight = MARGIN_X + half;
  let ly = ctx.y;
  const tempat = desa?.nama_desa_adat?.trim() || "Desa Adat";
  const placeDate = pdfCaps(`${tempat}, ${formatTanggalLahir(today())}`);

  drawCenteredText(
    ctx.page,
    placeDate,
    xRight,
    half,
    ly,
    FOOTER_SIZE,
    ctx.bodyFonts.regular,
    COLOR_TEXT
  );
  ly -= FOOTER_LINE_STEP;
  drawCenteredText(
    ctx.page,
    pdfCaps("Yang menerima,"),
    xRight,
    half,
    ly,
    FOOTER_SIZE,
    ctx.bodyFonts.regular,
    COLOR_TEXT
  );
  ly -= FOOTER_SIGN_SPACE;
  if (bendaharaNama) {
    drawCenteredText(
      ctx.page,
      pdfCaps(bendaharaNama),
      xRight,
      half,
      ly,
      FOOTER_SIZE,
      ctx.bodyFonts.regular,
      COLOR_TEXT
    );
    ly -= FOOTER_LINE_STEP;
  }
  drawCenteredText(
    ctx.page,
    pdfCaps("Bendahara Tim"),
    xRight,
    half,
    ly,
    FOOTER_SIZE,
    ctx.bodyFonts.regular,
    COLOR_TEXT
  );
}

export async function generateBuktiSetoranPaturunanPdfBytes(
  desa: DesaAdat | null,
  payload: BuktiSetoranPaturunanPdfPayload
): Promise<Uint8Array | null> {
  if (!payload.slip.sections.length) return null;

  const pdf = await PDFDocument.create();
  const bodyFonts = await createPdfFonts(pdf);
  const tableFonts = await createTableFonts(pdf);
  const ctx: PageCtx = {
    pdf,
    page: pdf.addPage([PAGE_W, PAGE_H]),
    y: PAGE_H - MARGIN_Y,
    bodyFonts,
    tableFonts,
  };

  const repeatHeader = () => {
    drawTableHeaderRow(ctx);
  };

  drawMetaHeader(ctx, payload.slip);
  for (const section of payload.slip.sections) {
    drawIuranSection(ctx, section, repeatHeader);
  }
  drawAmountSummaryRow(ctx, "JUMLAH KESELURUHAN", payload.slip.grandTotal);

  const bendaharaNama = await resolveBendaharaTimNama(payload.slip.banjarId);
  drawPenerimaFooter(ctx, desa, bendaharaNama);

  return pdf.save();
}

export async function buildBuktiSetoranPaturunanPdfBytes(
  payload: BuktiSetoranPaturunanPdfPayload
): Promise<Uint8Array | null> {
  const { getDesaAdat } = await import("./services/desa");
  const desa = await getDesaAdat();
  return generateBuktiSetoranPaturunanPdfBytes(desa, payload);
}
