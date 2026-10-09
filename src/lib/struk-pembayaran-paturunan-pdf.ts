import { PDFDocument, type PDFPage } from "pdf-lib";
import type { DesaAdat } from "./types";
import { formatRupiah } from "./paturunan-hitung";
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
import { STRUK_FOOTER_PATURUNAN } from "./struk-thermal-content";

const PAGE_W = 210 * MM;
const PAGE_H = 148.5 * MM;
const MARGIN_X = 12 * MM;
const MARGIN_Y = 10 * MM;
const CONTENT_W = PAGE_W - 2 * MARGIN_X;

const TITLE_SIZE = 11;
const BODY_SIZE = 9;
const TABLE_SIZE = 8.5;
const LINE_H = 4.5 * MM;
const ROW_H = 6 * MM;

export type StrukPaturunanPdfPayload = {
  filename: string;
  iuranNama: string;
  krama: {
    nomor_kartu: string;
    kepala_nama: string;
    banjar_nama: string;
    jenis_nama: string | null;
    tempek_nama?: string | null;
    arahan_nama?: string | null;
  };
  wajib: number;
  punia: number;
  total: number;
  tanggal: string;
  petugasNama: string;
  akunNama?: string;
  keterangan?: string;
};

type PageCtx = {
  pdf: PDFDocument;
  page: PDFPage;
  y: number;
  bodyFonts: PdfFonts;
  tableFonts: PdfFonts;
};

async function drawStrukHeader(ctx: PageCtx, desa: DesaAdat | null): Promise<void> {
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
    "STRUK PEMBAYARAN PATURUNAN",
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
  drawLabelValue(
    ctx.page,
    label,
    value,
    MARGIN_X,
    ctx.y,
    22 * MM,
    ctx.bodyFonts,
    BODY_SIZE
  );
  ctx.y -= LINE_H;
}

function drawBreakdownTable(
  ctx: PageCtx,
  rows: { label: string; jumlah: number }[],
  total: number
): void {
  const colLabelW = CONTENT_W * 0.62;
  const colJumlahW = CONTENT_W - colLabelW;

  const drawHeader = () => {
    ctx.page.drawRectangle({
      x: MARGIN_X,
      y: ctx.y - ROW_H,
      width: colLabelW,
      height: ROW_H,
      borderColor: COLOR_TABLE_BORDER,
      borderWidth: 0.5,
      color: COLOR_TABLE_HEAD,
    });
    ctx.page.drawRectangle({
      x: MARGIN_X + colLabelW,
      y: ctx.y - ROW_H,
      width: colJumlahW,
      height: ROW_H,
      borderColor: COLOR_TABLE_BORDER,
      borderWidth: 0.5,
      color: COLOR_TABLE_HEAD,
    });
    ctx.page.drawText("Rincian", {
      x: MARGIN_X + 1.5 * MM,
      y: ctx.y - ROW_H + 1.5 * MM,
      size: TABLE_SIZE,
      font: ctx.tableFonts.bold,
      color: COLOR_TEXT,
    });
    const jmlHdr = "Jumlah";
    const jmlHdrW = ctx.tableFonts.bold.widthOfTextAtSize(jmlHdr, TABLE_SIZE);
    ctx.page.drawText(jmlHdr, {
      x: MARGIN_X + colLabelW + colJumlahW - 1.5 * MM - jmlHdrW,
      y: ctx.y - ROW_H + 1.5 * MM,
      size: TABLE_SIZE,
      font: ctx.tableFonts.bold,
      color: COLOR_TEXT,
    });
    ctx.y -= ROW_H;
  };

  drawHeader();

  for (const row of rows) {
    const jumlah = formatRupiah(row.jumlah);
    ctx.page.drawRectangle({
      x: MARGIN_X,
      y: ctx.y - ROW_H,
      width: colLabelW,
      height: ROW_H,
      borderColor: COLOR_TABLE_BORDER,
      borderWidth: 0.5,
    });
    ctx.page.drawRectangle({
      x: MARGIN_X + colLabelW,
      y: ctx.y - ROW_H,
      width: colJumlahW,
      height: ROW_H,
      borderColor: COLOR_TABLE_BORDER,
      borderWidth: 0.5,
    });
    ctx.page.drawText(pdfSafeText(row.label), {
      x: MARGIN_X + 1.5 * MM,
      y: ctx.y - ROW_H + 1.5 * MM,
      size: TABLE_SIZE,
      font: ctx.bodyFonts.regular,
      color: COLOR_TEXT,
    });
    const jmlW = ctx.bodyFonts.regular.widthOfTextAtSize(jumlah, TABLE_SIZE);
    ctx.page.drawText(jumlah, {
      x: MARGIN_X + colLabelW + colJumlahW - 1.5 * MM - jmlW,
      y: ctx.y - ROW_H + 1.5 * MM,
      size: TABLE_SIZE,
      font: ctx.bodyFonts.regular,
      color: COLOR_TEXT,
    });
    ctx.y -= ROW_H;
  }

  ctx.page.drawRectangle({
    x: MARGIN_X,
    y: ctx.y - ROW_H,
    width: colLabelW,
    height: ROW_H,
    borderColor: COLOR_TABLE_BORDER,
    borderWidth: 0.5,
    color: COLOR_TABLE_HEAD,
  });
  ctx.page.drawRectangle({
    x: MARGIN_X + colLabelW,
    y: ctx.y - ROW_H,
    width: colJumlahW,
    height: ROW_H,
    borderColor: COLOR_TABLE_BORDER,
    borderWidth: 0.5,
    color: COLOR_TABLE_HEAD,
  });
  ctx.page.drawText("TOTAL", {
    x: MARGIN_X + 1.5 * MM,
    y: ctx.y - ROW_H + 1.5 * MM,
    size: TABLE_SIZE,
    font: ctx.tableFonts.bold,
    color: COLOR_TEXT,
  });
  const totalText = formatRupiah(total);
  const totalW = ctx.tableFonts.bold.widthOfTextAtSize(totalText, TABLE_SIZE);
  ctx.page.drawText(totalText, {
    x: MARGIN_X + colLabelW + colJumlahW - 1.5 * MM - totalW,
    y: ctx.y - ROW_H + 1.5 * MM,
    size: TABLE_SIZE,
    font: ctx.tableFonts.bold,
    color: COLOR_TEXT,
  });
  ctx.y -= ROW_H + 2 * MM;
}

export async function buildStrukPaturunanPdfBytes(
  payload: StrukPaturunanPdfPayload,
  desa: DesaAdat | null
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const bodyFonts = await createPdfFonts(pdf);
  const tableFonts = await createTableFonts(pdf);
  const page = pdf.addPage([PAGE_W, PAGE_H]);

  const ctx: PageCtx = {
    pdf,
    page,
    y: PAGE_H - MARGIN_Y,
    bodyFonts,
    tableFonts,
  };

  await drawStrukHeader(ctx, desa);

  const k = payload.krama;
  drawInfoLine(ctx, "Nama", k.kepala_nama);
  drawInfoLine(ctx, "No. Kartu", k.nomor_kartu);
  drawInfoLine(ctx, "Jenis", k.jenis_nama?.trim() || "—");
  drawInfoLine(ctx, "Banjar", k.banjar_nama);
  const lokasi = [k.tempek_nama?.trim(), k.arahan_nama?.trim()].filter(Boolean).join(" · ");
  if (lokasi) drawInfoLine(ctx, "Lokasi", lokasi);
  drawInfoLine(ctx, "Iuran", payload.iuranNama);

  ctx.y -= 1 * MM;

  const breakdown: { label: string; jumlah: number }[] = [];
  if (payload.wajib > 0) breakdown.push({ label: "Paturunan wajib", jumlah: payload.wajib });
  if (payload.punia > 0) breakdown.push({ label: "Punia (sukarela)", jumlah: payload.punia });
  if (!breakdown.length) breakdown.push({ label: "Pembayaran", jumlah: payload.total });

  drawBreakdownTable(ctx, breakdown, payload.total);

  drawInfoLine(ctx, "Tanggal", formatTanggalLahir(payload.tanggal));
  drawInfoLine(ctx, "Petugas", payload.petugasNama);
  if (payload.akunNama?.trim()) {
    drawInfoLine(ctx, "Diterima di", payload.akunNama.trim());
  }
  if (payload.keterangan?.trim()) {
    drawInfoLine(ctx, "Keterangan", payload.keterangan.trim());
  }

  const panyarikan = desa?.panyarikan_nama?.trim();
  if (panyarikan) {
    ctx.y -= 2 * MM;
    drawCenteredText(
      ctx.page,
      pdfSafeText(panyarikan),
      MARGIN_X,
      CONTENT_W,
      ctx.y - BODY_SIZE,
      BODY_SIZE,
      ctx.bodyFonts.regular,
      COLOR_TEXT
    );
    const jabatan = desa?.panyarikan_jabatan?.trim() || "Panyarikan";
    drawCenteredText(
      ctx.page,
      pdfSafeText(jabatan),
      MARGIN_X,
      CONTENT_W,
      ctx.y - BODY_SIZE - 3.5 * MM,
      8,
      ctx.bodyFonts.regular,
      COLOR_TEXT
    );
    ctx.y -= BODY_SIZE + 3.5 * MM + 2 * MM;
  }

  ctx.y -= 1 * MM;
  drawCenteredText(
    ctx.page,
    pdfSafeText(STRUK_FOOTER_PATURUNAN),
    MARGIN_X,
    CONTENT_W,
    ctx.y - BODY_SIZE,
    BODY_SIZE,
    ctx.bodyFonts.regular,
    COLOR_TEXT
  );

  return pdf.save();
}
