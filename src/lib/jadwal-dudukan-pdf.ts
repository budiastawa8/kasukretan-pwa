import { PDFDocument, rgb, type PDFPage } from "pdf-lib";
import type { DesaAdat } from "./types";
import {
  COLOR_TABLE_HEAD,
  createPdfFonts,
  MM,
  pdfSafeText,
  type PdfFonts,
} from "./pdf-common";
import { createTableFonts } from "./pdf-table-fonts";
import { drawKartuQrOnPage } from "./kartu-qr-pdf";
import {
  drawKartuPembayaranTableHeader,
  drawKartuPembayaranTableRow,
  type KartuPembayaranTableLayout,
} from "./pdf-kartu-pembayaran-table";
import {
  kartuDudukanMetaFields,
  type JadwalDudukanData,
} from "./services/jadwal-dudukan";

const PAGE_W = 210 * MM;
/** F4 portrait — 210 × 330 mm */
const PAGE_H = 330 * MM;
const MARGIN_X = 12 * MM + 20;
const MARGIN_Y = 12 * MM;
const CONTENT_W = PAGE_W - 2 * MARGIN_X;

const COLOR_BORDER = rgb(0, 0, 0);
const COLOR_TEXT = rgb(0, 0, 0);

/** QR kiri — vertikal sejajar blok teks identitas. */
const HEADER_QR_SIZE = 30 * MM;
const HEADER_QR_GAP = 4 * MM;
const HEADER_TEXT_X = MARGIN_X + HEADER_QR_SIZE + HEADER_QR_GAP;
const HEADER_TEXT_W = CONTENT_W - HEADER_QR_SIZE - HEADER_QR_GAP;

const TITLE_SIZE = 20;
const NAME_SIZE = 15;
const ADDRESS_SIZE = 15;
const SUBTITLE_SIZE = 11;
const META_SIZE = 11;
const TABLE_HEADER_SIZE = 10;
const TABLE_ROW_SIZE = 10;

const ROW_H = 9.5 * MM;
const HEADER_ROW_H = 10 * MM;
const CELL_PAD = 1.2 * MM;
const META_LINE_H = 5.8 * MM;
const META_LABEL_W = 24 * MM;
const META_COL_GAP = 6 * MM;
const TITLE_TO_RULE = 2 * MM;
const TITLE_RULE_H = 2.2 * MM;
const RULE_TO_NAME = 3.5 * MM;
const NAME_LINE_GAP = 3 * MM - 5;
const ADDRESS_TO_JENIS = 4 * MM - 5;
const IDENTITY_TO_META = 5 * MM;
const TABLE_RULE_GAP = 3 * MM;
/** Geser judul + garis abu ke bawah (pt). */
const TITLE_BLOCK_SHIFT_DOWN = 5;
/** Geser tulisan judul ke atas (pt), garis abu tidak ikut. */
const TITLE_SHIFT_UP = 3;
/** Geser nama pengajeg ke atas (pt). */
const NAME_SHIFT_UP = 3;
const ADDRESS_SHIFT_UP = 3;
const JENIS_SHIFT_UP = 5;
/** Geser garis bawah kop + meta ke bawah (pt). */
const KOP_RULE_SHIFT_DOWN = 10;

const TABLE_HEADERS = ["NO", "BULAN", "NOMINAL", "TGL BAYAR", "JML. BAYAR", "PETUGAS"];
const TABLE_COL_FRACTIONS = [0.42, 1.05, 1.05, 1.0, 1.15, 0.83];
/** Penyesuaian lebar kolom (pt): kurangi NOMINAL/TGL/JML, tambah PETUGAS. */
const TABLE_COL_WIDTH_DELTA_PT = [0, 0, -10, -10, -10, 30] as const;
const CENTER_DATA_COLS = new Set([0, 3]);
const RIGHT_DATA_COLS = new Set([2, 4]);

const TABLE_LAYOUT: KartuPembayaranTableLayout = {
  marginX: MARGIN_X,
  contentW: CONTENT_W,
  headers: TABLE_HEADERS,
  colFractions: TABLE_COL_FRACTIONS,
  colWidthDeltaPt: TABLE_COL_WIDTH_DELTA_PT,
  centerDataCols: CENTER_DATA_COLS,
  rightDataCols: RIGHT_DATA_COLS,
  headerSize: TABLE_HEADER_SIZE,
  rowSize: TABLE_ROW_SIZE,
  rowH: ROW_H,
  headerRowH: HEADER_ROW_H,
  cellPad: CELL_PAD,
  borderColor: COLOR_BORDER,
  textColor: COLOR_TEXT,
};

type PageCtx = {
  pdf: PDFDocument;
  page: PDFPage;
  y: number;
  bodyFonts: PdfFonts;
  tableFonts: PdfFonts;
  headerDrawn: boolean;
};

function addPage(ctx: PageCtx): void {
  ctx.page = ctx.pdf.addPage([PAGE_W, PAGE_H]);
  ctx.y = PAGE_H - MARGIN_Y;
  ctx.headerDrawn = false;
}

function ensureSpace(ctx: PageCtx, needed: number): void {
  if (ctx.y - needed < MARGIN_Y) addPage(ctx);
}

function drawMetaField(
  page: PDFPage,
  x: number,
  y: number,
  label: string,
  value: string,
  fonts: PdfFonts
): void {
  const safeLabel = pdfSafeText(label);
  const safeValue = pdfSafeText(value);
  page.drawText(safeLabel, {
    x,
    y,
    size: META_SIZE,
    font: fonts.regular,
    color: COLOR_TEXT,
  });
  page.drawText(":", {
    x: x + META_LABEL_W,
    y,
    size: META_SIZE,
    font: fonts.regular,
    color: COLOR_TEXT,
  });
  page.drawText(safeValue, {
    x: x + META_LABEL_W + 3 * MM,
    y,
    size: META_SIZE,
    font: fonts.regular,
    color: COLOR_TEXT,
  });
}

async function drawDocumentHeader(ctx: PageCtx, data: JadwalDudukanData): Promise<void> {
  if (ctx.headerDrawn) return;

  const { detail } = data;
  const meta = kartuDudukanMetaFields(data);

  const identityTextH =
    TITLE_SIZE * 0.35 * MM +
    TITLE_TO_RULE +
    TITLE_RULE_H +
    RULE_TO_NAME +
    NAME_SIZE * 0.35 * MM +
    NAME_LINE_GAP +
    ADDRESS_SIZE * 0.35 * MM +
    ADDRESS_TO_JENIS +
    SUBTITLE_SIZE * 0.35 * MM;
  const identityBlockH = Math.max(HEADER_QR_SIZE, identityTextH);
  const headerBlockH =
    identityBlockH +
    KOP_RULE_SHIFT_DOWN +
    IDENTITY_TO_META +
    META_LINE_H * 3 +
    TABLE_RULE_GAP;
  ensureSpace(ctx, headerBlockH);

  const headerTop = ctx.y;
  const identityBottom = headerTop - identityBlockH;

  const nomorKartu = detail.nomor_kartu?.trim() ?? "";
  if (nomorKartu) {
    const qrY = identityBottom + (identityBlockH - HEADER_QR_SIZE) / 2;
    await drawKartuQrOnPage(ctx.pdf, ctx.page, nomorKartu, MARGIN_X, qrY, HEADER_QR_SIZE);
  }

  const titleBaseY = headerTop - TITLE_SIZE - TITLE_BLOCK_SHIFT_DOWN;
  const titleY = titleBaseY + TITLE_SHIFT_UP;
  ctx.page.drawText(pdfSafeText(data.cardTitle.toUpperCase()), {
    x: HEADER_TEXT_X,
    y: titleY,
    size: TITLE_SIZE,
    font: ctx.bodyFonts.bold,
    color: COLOR_TEXT,
  });

  const ruleY = titleBaseY - TITLE_TO_RULE - TITLE_RULE_H;
  ctx.page.drawRectangle({
    x: HEADER_TEXT_X,
    y: ruleY,
    width: HEADER_TEXT_W,
    height: TITLE_RULE_H,
    color: COLOR_TABLE_HEAD,
  });

  const ruleBottomUnshifted = headerTop - TITLE_SIZE - TITLE_TO_RULE - TITLE_RULE_H;
  const nameY = ruleBottomUnshifted - RULE_TO_NAME - NAME_SIZE + NAME_SHIFT_UP;
  const nama = pdfSafeText(detail.kepala_nama?.trim() || "—").toUpperCase();
  ctx.page.drawText(nama, {
    x: HEADER_TEXT_X,
    y: nameY,
    size: NAME_SIZE,
    font: ctx.bodyFonts.bold,
    color: COLOR_TEXT,
  });

  let textY = ruleBottomUnshifted - RULE_TO_NAME - NAME_SIZE;
  textY -= NAME_LINE_GAP + ADDRESS_SIZE;
  const alamat = pdfSafeText(detail.alamat?.trim() || "—").toUpperCase();
  ctx.page.drawText(alamat, {
    x: HEADER_TEXT_X,
    y: textY + ADDRESS_SHIFT_UP,
    size: ADDRESS_SIZE,
    font: ctx.bodyFonts.bold,
    color: COLOR_TEXT,
  });

  textY -= ADDRESS_TO_JENIS + SUBTITLE_SIZE;
  ctx.page.drawText(pdfSafeText(data.jenisLabel.toUpperCase()), {
    x: HEADER_TEXT_X,
    y: textY + JENIS_SHIFT_UP,
    size: SUBTITLE_SIZE,
    font: ctx.bodyFonts.regular,
    color: COLOR_TEXT,
  });

  const kopRuleY = identityBottom - KOP_RULE_SHIFT_DOWN;
  ctx.page.drawLine({
    start: { x: MARGIN_X, y: kopRuleY },
    end: { x: MARGIN_X + CONTENT_W, y: kopRuleY },
    thickness: 1,
    color: COLOR_BORDER,
  });

  ctx.y = kopRuleY - IDENTITY_TO_META;

  const colW = (CONTENT_W - META_COL_GAP) / 2;
  const xLeft = MARGIN_X;
  const xRight = MARGIN_X + colW + META_COL_GAP;
  const metaTop = ctx.y;

  drawMetaField(ctx.page, xLeft, metaTop, "BANJAR", meta.banjarAdat, ctx.bodyFonts);
  drawMetaField(ctx.page, xRight, metaTop, "No. Pemasih", meta.nomorPemasih, ctx.bodyFonts);

  const row2Y = metaTop - META_LINE_H;
  drawMetaField(ctx.page, xLeft, row2Y, "TEMPEK", meta.tempek, ctx.bodyFonts);
  drawMetaField(ctx.page, xRight, row2Y, "Tgl. Pemasih", meta.tglPemasih, ctx.bodyFonts);

  const row3Y = row2Y - META_LINE_H;
  drawMetaField(ctx.page, xLeft, row3Y, "RT/BTN", meta.rtBtn, ctx.bodyFonts);
  drawMetaField(ctx.page, xRight, row3Y, "No. Kontak", meta.nomorKontak, ctx.bodyFonts);

  ctx.y = row3Y - TABLE_RULE_GAP;
  ctx.headerDrawn = true;
}

function drawTableHeaderRow(ctx: PageCtx): void {
  ensureSpace(ctx, HEADER_ROW_H);
  ctx.y = drawKartuPembayaranTableHeader(ctx.page, ctx.y, TABLE_LAYOUT, ctx.tableFonts);
}

async function ensureTableRowSpace(
  ctx: PageCtx,
  data: JadwalDudukanData
): Promise<void> {
  const yBefore = ctx.y;
  ensureSpace(ctx, ROW_H);
  if (ctx.y > yBefore) {
    await drawDocumentHeader(ctx, data);
    drawTableHeaderRow(ctx);
  }
}

async function drawTableDataRow(
  ctx: PageCtx,
  cells: string[],
  data: JadwalDudukanData
): Promise<void> {
  await ensureTableRowSpace(ctx, data);
  ctx.y = drawKartuPembayaranTableRow(ctx.page, ctx.y, TABLE_LAYOUT, cells, ctx.tableFonts);
}

export function jadwalDudukanPdfFilename(data: JadwalDudukanData): string {
  const nomor = data.detail.nomor_kartu.replace(/[^\w.-]+/g, "-");
  return `kartu-dudukan-${nomor}.pdf`;
}

export function jadwalDudukanBatchPdfFilename(count: number): string {
  return `kartu-dudukan-${count}-pemasih.pdf`;
}

async function appendJadwalDudukanToPdf(
  ctx: PageCtx,
  data: JadwalDudukanData,
  startNewPage: boolean
): Promise<void> {
  if (startNewPage) {
    addPage(ctx);
    ctx.headerDrawn = false;
  }

  await drawDocumentHeader(ctx, data);

  drawTableHeaderRow(ctx);
  for (const row of data.rows) {
    await drawTableDataRow(
      ctx,
      [
        String(row.no),
        row.bulan,
        row.nominal,
        row.tglBayar,
        row.jumlahBayar,
        row.petugas,
      ],
      data
    );
  }
}

export async function generateJadwalDudukanPdfBatch(
  dataList: JadwalDudukanData[]
): Promise<Uint8Array> {
  if (!dataList.length) {
    throw new Error("Tidak ada kartu dudukan untuk dicetak.");
  }

  const pdf = await PDFDocument.create();
  const bodyFonts = await createPdfFonts(pdf);
  const tableFonts = await createTableFonts(pdf);
  const ctx: PageCtx = {
    pdf,
    page: pdf.addPage([PAGE_W, PAGE_H]),
    y: PAGE_H - MARGIN_Y,
    bodyFonts,
    tableFonts,
    headerDrawn: false,
  };

  for (let i = 0; i < dataList.length; i++) {
    await appendJadwalDudukanToPdf(ctx, dataList[i]!, i > 0);
  }

  return pdf.save();
}

export async function generateJadwalDudukanPdf(
  data: JadwalDudukanData,
  _desa?: DesaAdat | null
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const bodyFonts = await createPdfFonts(pdf);
  const tableFonts = await createTableFonts(pdf);
  const ctx: PageCtx = {
    pdf,
    page: pdf.addPage([PAGE_W, PAGE_H]),
    y: PAGE_H - MARGIN_Y,
    bodyFonts,
    tableFonts,
    headerDrawn: false,
  };

  await appendJadwalDudukanToPdf(ctx, data, false);

  return pdf.save();
}
