import { PDFDocument, rgb, type PDFPage } from "pdf-lib";
import type { DesaAdat } from "./types";
import {
  COLOR_TABLE_HEAD,
  createPdfFonts,
  drawCenteredText,
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
  kartuPaturunanTempekArahan,
  kartuPaturunanMetaFields,
  type KartuPaturunanData,
} from "./services/kartu-paturunan";

const PAGE_W = 210 * MM;
const PAGE_H = 330 * MM;
const MARGIN_X = 12 * MM;
const MARGIN_Y = 12 * MM;
const CONTENT_W = PAGE_W - 2 * MARGIN_X;

const COLOR_BORDER = rgb(0, 0, 0);
const COLOR_TEXT = rgb(0, 0, 0);

const TITLE_BOX_H = 10.5 * MM;
const TITLE_SIZE = 13;
const NAME_SIZE = 12;
const ADDRESS_SIZE = 14;
const SUBTITLE_SIZE = 12;
const META_SIZE = 11;
const TABLE_HEADER_SIZE = 10;
const TABLE_ROW_SIZE = 10;

const ROW_H = 9.5 * MM;
const HEADER_ROW_H = 10 * MM;
const CELL_PAD = 1.2 * MM;
const META_LINE_H = 5.8 * MM;
const META_QR_SIZE = 2 * META_LINE_H + 2 * MM;
const META_QR_RIGHT_PAD = 1.5 * MM;
const META_QR_GAP = 2.5 * MM;
const META_QR_OFFSET_X = -10;
const META_QR_OFFSET_Y = 5;
const META_LABEL_W = 24 * MM;
const META_COL_GAP = 6 * MM;
const JENIS_KRAMA_GAP_MM = 8;
const ALAMAT_GAP_MM = 7;
const RULE_GAP_MM = 7;

const TABLE_HEADERS = ["NO", "PATURUNAN", "JENIS", "TGL BAYAR", "JML. BAYAR", "PETUGAS"];
const TABLE_COL_FRACTIONS = [0.42, 1.2, 0.75, 1.0, 1.1, 0.83];
const TABLE_COL_WIDTH_DELTA_PT = [0, 0, 0, -10, -10, 30] as const;
const CENTER_DATA_COLS = new Set([0, 2, 3]);
const RIGHT_DATA_COLS = new Set([4]);

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

async function drawDocumentHeader(ctx: PageCtx, data: KartuPaturunanData): Promise<void> {
  if (ctx.headerDrawn) return;

  const { krama } = data;
  const meta = kartuPaturunanMetaFields(data);
  const headerBlockH =
    TITLE_BOX_H +
    4.5 * MM +
    ALAMAT_GAP_MM * MM +
    4.5 * MM +
    JENIS_KRAMA_GAP_MM * MM +
    1 +
    RULE_GAP_MM * MM +
    Math.max(META_LINE_H * 3, META_QR_SIZE) +
    3 * MM;
  ensureSpace(ctx, headerBlockH);

  const boxY = ctx.y - TITLE_BOX_H;
  ctx.page.drawRectangle({
    x: MARGIN_X,
    y: boxY,
    width: CONTENT_W,
    height: TITLE_BOX_H,
    borderColor: COLOR_BORDER,
    borderWidth: 1,
    color: COLOR_TABLE_HEAD,
  });
  drawCenteredText(
    ctx.page,
    data.cardTitle,
    MARGIN_X,
    CONTENT_W,
    boxY + 3.2 * MM,
    TITLE_SIZE,
    ctx.bodyFonts.bold,
    COLOR_TEXT
  );
  ctx.y = boxY - 4.5 * MM;

  const nama = pdfSafeText(krama.kepala.nama_lengkap?.trim() || "—");
  const nameY = ctx.y - NAME_SIZE;
  drawCenteredText(
    ctx.page,
    nama,
    MARGIN_X,
    CONTENT_W,
    nameY,
    NAME_SIZE,
    ctx.bodyFonts.bold,
    COLOR_TEXT
  );
  ctx.y -= 5 * MM;

  const lokasi = pdfSafeText(kartuPaturunanTempekArahan(krama));
  drawCenteredText(
    ctx.page,
    lokasi,
    MARGIN_X,
    CONTENT_W,
    ctx.y - ADDRESS_SIZE,
    ADDRESS_SIZE,
    ctx.bodyFonts.bold,
    COLOR_TEXT
  );
  ctx.y -= ALAMAT_GAP_MM * MM;

  drawCenteredText(
    ctx.page,
    pdfSafeText(data.jenisLabel),
    MARGIN_X,
    CONTENT_W,
    ctx.y - SUBTITLE_SIZE,
    SUBTITLE_SIZE,
    ctx.bodyFonts.regular,
    COLOR_TEXT
  );
  ctx.y -= JENIS_KRAMA_GAP_MM * MM;

  const ruleY = ctx.y;
  ctx.page.drawLine({
    start: { x: MARGIN_X, y: ruleY },
    end: { x: MARGIN_X + CONTENT_W, y: ruleY },
    thickness: 1,
    color: COLOR_BORDER,
  });
  ctx.y -= RULE_GAP_MM * MM;

  const metaTextW = CONTENT_W - META_QR_SIZE - META_QR_GAP - META_QR_RIGHT_PAD;
  const colW = (metaTextW - META_COL_GAP) / 2;
  const xLeft = MARGIN_X;
  const xRight = MARGIN_X + colW + META_COL_GAP;
  const metaTop = ctx.y;

  drawMetaField(ctx.page, xLeft, metaTop, "BANJAR", meta.banjarAdat, ctx.bodyFonts);
  drawMetaField(ctx.page, xRight, metaTop, "No. Pipil", meta.nomorPipil, ctx.bodyFonts);

  const row2Y = metaTop - META_LINE_H;
  drawMetaField(ctx.page, xLeft, row2Y, "TEMPEK", meta.tempek, ctx.bodyFonts);
  drawMetaField(ctx.page, xRight, row2Y, "Tgl. Pipil", meta.tglPipil, ctx.bodyFonts);

  const row3Y = row2Y - META_LINE_H;
  drawMetaField(ctx.page, xLeft, row3Y, "ARAHAN", meta.arahan, ctx.bodyFonts);
  drawMetaField(ctx.page, xRight, row3Y, "No. Kontak", meta.nomorKontak, ctx.bodyFonts);

  const nomorKartu = krama.nomor_kartu?.trim() ?? "";
  if (nomorKartu) {
    const qrX = MARGIN_X + CONTENT_W - META_QR_RIGHT_PAD - META_QR_SIZE + META_QR_OFFSET_X;
    const qrY = row3Y + (metaTop - row3Y - META_QR_SIZE) / 2 + META_QR_OFFSET_Y;
    await drawKartuQrOnPage(ctx.pdf, ctx.page, nomorKartu, qrX, qrY, META_QR_SIZE);
  }

  ctx.y = row3Y - 3 * MM;
  ctx.headerDrawn = true;
}

function drawTableHeaderRow(ctx: PageCtx): void {
  ensureSpace(ctx, HEADER_ROW_H);
  ctx.y = drawKartuPembayaranTableHeader(ctx.page, ctx.y, TABLE_LAYOUT, ctx.tableFonts);
}

async function ensureTableRowSpace(
  ctx: PageCtx,
  data: KartuPaturunanData
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
  data: KartuPaturunanData
): Promise<void> {
  await ensureTableRowSpace(ctx, data);
  ctx.y = drawKartuPembayaranTableRow(ctx.page, ctx.y, TABLE_LAYOUT, cells, ctx.tableFonts);
}

export function kartuPaturunanPdfFilename(data: KartuPaturunanData): string {
  const nomor = data.krama.nomor_kartu.replace(/[^\w.-]+/g, "-");
  return `kartu-paturunan-${nomor}.pdf`;
}

export async function generateKartuPaturunanPdf(
  data: KartuPaturunanData,
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

  await drawDocumentHeader(ctx, data);

  drawTableHeaderRow(ctx);
  for (const row of data.rows) {
    await drawTableDataRow(ctx, [
      String(row.no),
      row.iuran,
      row.jenis,
      row.tglBayar,
      row.jumlahBayar,
      row.petugas,
    ], data);
  }

  return pdf.save();
}
