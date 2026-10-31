import { PDFDocument, type PDFPage } from "pdf-lib";
import type { DesaAdat, PenerimaanDanaLainJenis } from "./types";
import { formatRupiah } from "./dudukan-hitung";
import {
  COLOR_TABLE_BORDER,
  COLOR_TABLE_HEAD,
  COLOR_TEXT,
  createPdfFonts,
  drawCenteredText,
  drawLabelValue,
  embedDataUrlImage,
  MM,
  pdfSafeText,
  type PdfFonts,
} from "./pdf-common";
import { createTableFonts } from "./pdf-table-fonts";
import { formatTanggalLahir } from "./utils";
import { labelJenisPenerimaanDanaLain } from "./services/penerimaan-dana-lain";

const PAGE_W = 210 * MM;
const PAGE_H = 148.5 * MM;
const MARGIN_X = 12 * MM;
const CONTENT_W = PAGE_W - 2 * MARGIN_X;
const TITLE_SIZE = 11;
const BODY_SIZE = 9;
const TABLE_SIZE = 8.5;
const LINE_H = 4.5 * MM;
const ROW_H = 6 * MM;

export type StrukDanaLainPdfPayload = {
  filename: string;
  jenis: PenerimaanDanaLainJenis;
  sumberNama: string;
  sumberTipeLabel: string;
  nomorKartu?: string | null;
  kegiatan?: string | null;
  mitraJenis?: string | null;
  jumlah: number;
  total: number;
  tanggal: string;
  petugasNama: string;
  keterangan?: string | null;
};

type PageCtx = {
  pdf: PDFDocument;
  page: PDFPage;
  y: number;
  bodyFonts: PdfFonts;
  tableFonts: PdfFonts;
};

async function drawStrukHeader(
  ctx: PageCtx,
  desa: DesaAdat | null,
  jenis: PenerimaanDanaLainJenis
): Promise<void> {
  const logoSize = 14 * MM;
  const logoY = ctx.y - logoSize;
  const desaLogo = await embedDataUrlImage(ctx.pdf, desa?.logo_url);
  if (desaLogo) {
    ctx.page.drawImage(desaLogo, {
      x: MARGIN_X,
      y: logoY,
      width: logoSize,
      height: logoSize,
    });
  }
  const desaNama = desa?.nama_desa_adat?.trim().toUpperCase() || "DESA ADAT";
  const kecKab = [desa?.nama_kecamatan, desa?.nama_kabupaten].filter(Boolean).join(", ");
  const centerX = MARGIN_X + (desaLogo ? logoSize + 3 * MM : 0);
  const centerW = CONTENT_W - (desaLogo ? logoSize + 3 * MM : 0);

  drawCenteredText(
    ctx.page,
    pdfSafeText(`DESA ADAT ${desaNama}`),
    centerX,
    centerW,
    ctx.y - 4 * MM,
    10,
    ctx.bodyFonts.bold,
    COLOR_TEXT
  );
  if (kecKab) {
    drawCenteredText(
      ctx.page,
      pdfSafeText(kecKab),
      centerX,
      centerW,
      ctx.y - 8 * MM,
      8,
      ctx.bodyFonts.regular,
      COLOR_TEXT
    );
  }
  ctx.y -= logoSize + 2 * MM;

  drawCenteredText(
    ctx.page,
    `STRUK ${labelJenisPenerimaanDanaLain(jenis).toUpperCase()}`,
    MARGIN_X,
    CONTENT_W,
    ctx.y - TITLE_SIZE,
    TITLE_SIZE,
    ctx.bodyFonts.bold,
    COLOR_TEXT
  );
  ctx.y -= TITLE_SIZE + 3 * MM;
}

function drawInfoLine(ctx: PageCtx, label: string, value: string): void {
  drawLabelValue(ctx.page, label, value, MARGIN_X, ctx.y, 28 * MM, ctx.bodyFonts, BODY_SIZE);
  ctx.y -= LINE_H;
}

export async function buildStrukDanaLainPdfBytes(
  payload: StrukDanaLainPdfPayload,
  desa: DesaAdat | null
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const bodyFonts = await createPdfFonts(pdf);
  const tableFonts = await createTableFonts(pdf);
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const ctx: PageCtx = {
    pdf,
    page,
    y: PAGE_H - 10 * MM,
    bodyFonts,
    tableFonts,
  };

  await drawStrukHeader(ctx, desa, payload.jenis);
  drawInfoLine(ctx, "Nama", payload.sumberNama);
  drawInfoLine(ctx, "Sumber", payload.sumberTipeLabel);
  if (payload.nomorKartu) drawInfoLine(ctx, "No. Kartu", payload.nomorKartu);
  if (payload.kegiatan?.trim()) drawInfoLine(ctx, "Kegiatan", payload.kegiatan.trim());
  if (payload.mitraJenis?.trim()) drawInfoLine(ctx, "Mitra", payload.mitraJenis.trim());
  if (payload.keterangan?.trim()) drawInfoLine(ctx, "Ket.", payload.keterangan.trim());
  ctx.y -= 2 * MM;

  const colLabelW = CONTENT_W * 0.62;
  const colJumlahW = CONTENT_W - colLabelW;
  const label = labelJenisPenerimaanDanaLain(payload.jenis);
  const jumlah = formatRupiah(payload.jumlah);

  page.drawRectangle({
    x: MARGIN_X,
    y: ctx.y - ROW_H,
    width: colLabelW,
    height: ROW_H,
    borderColor: COLOR_TABLE_BORDER,
    borderWidth: 0.5,
    color: COLOR_TABLE_HEAD,
  });
  page.drawRectangle({
    x: MARGIN_X + colLabelW,
    y: ctx.y - ROW_H,
    width: colJumlahW,
    height: ROW_H,
    borderColor: COLOR_TABLE_BORDER,
    borderWidth: 0.5,
    color: COLOR_TABLE_HEAD,
  });
  page.drawText("Rincian", {
    x: MARGIN_X + 1.5 * MM,
    y: ctx.y - ROW_H + 1.5 * MM,
    size: TABLE_SIZE,
    font: tableFonts.bold,
    color: COLOR_TEXT,
  });
  const jmlHdr = "Jumlah";
  const jmlHdrW = tableFonts.bold.widthOfTextAtSize(jmlHdr, TABLE_SIZE);
  page.drawText(jmlHdr, {
    x: MARGIN_X + colLabelW + colJumlahW - 1.5 * MM - jmlHdrW,
    y: ctx.y - ROW_H + 1.5 * MM,
    size: TABLE_SIZE,
    font: tableFonts.bold,
    color: COLOR_TEXT,
  });
  ctx.y -= ROW_H;

  page.drawRectangle({
    x: MARGIN_X,
    y: ctx.y - ROW_H,
    width: colLabelW,
    height: ROW_H,
    borderColor: COLOR_TABLE_BORDER,
    borderWidth: 0.5,
  });
  page.drawRectangle({
    x: MARGIN_X + colLabelW,
    y: ctx.y - ROW_H,
    width: colJumlahW,
    height: ROW_H,
    borderColor: COLOR_TABLE_BORDER,
    borderWidth: 0.5,
  });
  page.drawText(pdfSafeText(label), {
    x: MARGIN_X + 1.5 * MM,
    y: ctx.y - ROW_H + 1.5 * MM,
    size: TABLE_SIZE,
    font: bodyFonts.regular,
    color: COLOR_TEXT,
  });
  const jmlW = bodyFonts.regular.widthOfTextAtSize(jumlah, TABLE_SIZE);
  page.drawText(jumlah, {
    x: MARGIN_X + colLabelW + colJumlahW - 1.5 * MM - jmlW,
    y: ctx.y - ROW_H + 1.5 * MM,
    size: TABLE_SIZE,
    font: bodyFonts.regular,
    color: COLOR_TEXT,
  });
  ctx.y -= ROW_H + 3 * MM;

  drawInfoLine(ctx, "Tanggal", formatTanggalLahir(payload.tanggal));
  drawInfoLine(ctx, "Petugas", payload.petugasNama);
  ctx.y -= 4 * MM;
  drawCenteredText(
    ctx.page,
    "Matur Suksma",
    MARGIN_X,
    CONTENT_W,
    ctx.y,
    9,
    bodyFonts.bold,
    COLOR_TEXT
  );

  return pdf.save();
}
