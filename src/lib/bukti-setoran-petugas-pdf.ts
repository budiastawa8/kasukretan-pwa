import { PDFDocument, type PDFPage } from "pdf-lib";
import { formatRupiah } from "./dudukan-hitung";
import {
  COLOR_TABLE_BORDER,
  COLOR_TABLE_HEAD,
  COLOR_TEXT,
  createPdfFonts,
  drawCenteredText,
  embedDataUrlImage,
  MM,
  pdfSafeText,
  truncatePdf,
  type PdfFonts,
} from "./pdf-common";
import type { PembayaranSetoranItem, SetoranRow } from "./services/setoran";
import type { DesaAdat } from "./types";
import { formatTanggalLahir } from "./utils";

const PAGE_W = 210 * MM;
const PAGE_H = 297 * MM;
const MARGIN_X = 15 * MM;
const MARGIN_TOP = 14 * MM;
const MARGIN_BOTTOM = 16 * MM;
const CONTENT_W = PAGE_W - 2 * MARGIN_X;

const BODY_SIZE = 9.5;
const TABLE_SIZE = 8.5;
const LINE_H = 5 * MM;
const ROW_H = 6 * MM;

type Kolom = { header: string; fraction: number; align?: "right" };

const KOLOM: Kolom[] = [
  { header: "No", fraction: 0.05 },
  { header: "Tgl Bayar", fraction: 0.12 },
  { header: "No. Kartu", fraction: 0.16 },
  { header: "Nama Krama", fraction: 0.25 },
  { header: "Uraian", fraction: 0.27 },
  { header: "Jumlah", fraction: 0.15, align: "right" },
];

export type BuktiSetoranPdfInput = {
  setoran: SetoranRow;
  items: PembayaranSetoranItem[];
  desa: DesaAdat | null;
  petugasJabatan?: string | null;
};

type Ctx = {
  pdf: PDFDocument;
  page: PDFPage;
  y: number;
  fonts: PdfFonts;
};

export function nomorBuktiSetoran(setoranId: string): string {
  return `STR-${setoranId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export function namaFileBuktiSetoran(setoran: SetoranRow): string {
  const petugas = (setoran.petugas_nama ?? "tanpa-petugas")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `bukti-setoran-${setoran.tanggal}-${petugas}.pdf`;
}

function addPage(ctx: Ctx): void {
  ctx.page = ctx.pdf.addPage([PAGE_W, PAGE_H]);
  ctx.y = PAGE_H - MARGIN_TOP;
}

function drawText(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  opts?: { bold?: boolean; size?: number; alignRightAt?: number }
): void {
  const size = opts?.size ?? BODY_SIZE;
  const font = opts?.bold ? ctx.fonts.bold : ctx.fonts.regular;
  const safe = pdfSafeText(text);
  const drawX = opts?.alignRightAt != null ? opts.alignRightAt - font.widthOfTextAtSize(safe, size) : x;
  ctx.page.drawText(safe, { x: drawX, y, size, font, color: COLOR_TEXT });
}

async function drawKop(ctx: Ctx, desa: DesaAdat | null): Promise<void> {
  const logoSize = 16 * MM;
  const logo = await embedDataUrlImage(ctx.pdf, desa?.logo_url);
  if (logo) {
    ctx.page.drawImage(logo, {
      x: MARGIN_X,
      y: ctx.y - logoSize,
      width: logoSize,
      height: logoSize,
    });
  }
  const desaNama = desa?.nama_desa_adat?.trim().toUpperCase();
  const kecKab = [
    desa?.nama_kecamatan ? `Kecamatan ${desa.nama_kecamatan}` : "",
    desa?.nama_kabupaten ? `Kabupaten ${desa.nama_kabupaten}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  const centerX = MARGIN_X + (logo ? logoSize + 3 * MM : 0);
  const centerW = CONTENT_W - (logo ? 2 * (logoSize + 3 * MM) : 0);

  drawCenteredText(ctx.page, "TIM KASUKRETAN KRAMA", centerX, centerW, ctx.y - 5 * MM, 10, ctx.fonts.bold, COLOR_TEXT);
  drawCenteredText(ctx.page, desaNama ? `DESA ADAT ${desaNama}` : "DESA ADAT", centerX, centerW, ctx.y - 10 * MM, 12, ctx.fonts.bold, COLOR_TEXT);
  if (kecKab) {
    drawCenteredText(ctx.page, kecKab, centerX, centerW, ctx.y - 14.5 * MM, 9, ctx.fonts.regular, COLOR_TEXT);
  }
  ctx.y -= logoSize + 2.5 * MM;
  ctx.page.drawLine({
    start: { x: MARGIN_X, y: ctx.y },
    end: { x: MARGIN_X + CONTENT_W, y: ctx.y },
    thickness: 1.2,
    color: COLOR_TEXT,
  });
  ctx.y -= 0.8 * MM;
  ctx.page.drawLine({
    start: { x: MARGIN_X, y: ctx.y },
    end: { x: MARGIN_X + CONTENT_W, y: ctx.y },
    thickness: 0.4,
    color: COLOR_TEXT,
  });
  ctx.y -= 8 * MM;
}

function drawInfo(ctx: Ctx, label: string, value: string): void {
  const labelW = 32 * MM;
  drawText(ctx, label, MARGIN_X, ctx.y);
  drawText(ctx, ":", MARGIN_X + labelW, ctx.y);
  drawText(ctx, truncatePdf(value || "-", 80), MARGIN_X + labelW + 3 * MM, ctx.y);
  ctx.y -= LINE_H;
}

function fitText(font: PdfFonts["regular"], text: string, maxW: number): string {
  let t = pdfSafeText(text.trim());
  if (font.widthOfTextAtSize(t, TABLE_SIZE) <= maxW) return t;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, TABLE_SIZE) > maxW) t = t.slice(0, -1);
  return `${t.trimEnd()}...`;
}

function kolomX(index: number): number {
  return MARGIN_X + KOLOM.slice(0, index).reduce((s, k) => s + k.fraction * CONTENT_W, 0);
}

function drawRow(ctx: Ctx, cells: string[], opts?: { header?: boolean; bold?: boolean }): void {
  KOLOM.forEach((k, i) => {
    const x = kolomX(i);
    const w = k.fraction * CONTENT_W;
    ctx.page.drawRectangle({
      x,
      y: ctx.y - ROW_H,
      width: w,
      height: ROW_H,
      borderColor: COLOR_TABLE_BORDER,
      borderWidth: 0.5,
      color: opts?.header ? COLOR_TABLE_HEAD : undefined,
    });
    const font = opts?.header || opts?.bold ? ctx.fonts.bold : ctx.fonts.regular;
    const text = fitText(font, cells[i] ?? "", w - 3 * MM);
    if (!text) return;
    drawText(ctx, text, x + 1.5 * MM, ctx.y - ROW_H + 1.9 * MM, {
      bold: opts?.header || opts?.bold,
      size: TABLE_SIZE,
      alignRightAt: k.align === "right" && !opts?.header ? x + w - 1.5 * MM : undefined,
    });
  });
  ctx.y -= ROW_H;
}

function drawRingkasanRow(ctx: Ctx, label: string, nilai: number, bold = false): void {
  const labelX = kolomX(0);
  const nilaiIdx = KOLOM.length - 1;
  const labelW = kolomX(nilaiIdx) - labelX;
  const nilaiW = KOLOM[nilaiIdx]!.fraction * CONTENT_W;
  for (const [x, w] of [
    [labelX, labelW],
    [kolomX(nilaiIdx), nilaiW],
  ] as const) {
    ctx.page.drawRectangle({
      x,
      y: ctx.y - ROW_H,
      width: w,
      height: ROW_H,
      borderColor: COLOR_TABLE_BORDER,
      borderWidth: 0.5,
      color: bold ? COLOR_TABLE_HEAD : undefined,
    });
  }
  drawText(ctx, label, labelX + labelW - 1.5 * MM, ctx.y - ROW_H + 1.9 * MM, {
    bold,
    size: TABLE_SIZE,
    alignRightAt: labelX + labelW - 1.5 * MM,
  });
  drawText(ctx, formatRupiah(nilai), 0, ctx.y - ROW_H + 1.9 * MM, {
    bold,
    size: TABLE_SIZE,
    alignRightAt: kolomX(nilaiIdx) + nilaiW - 1.5 * MM,
  });
  ctx.y -= ROW_H;
}

function ensureSpace(ctx: Ctx, needed: number, ulangHeader: boolean): void {
  if (ctx.y - needed >= MARGIN_BOTTOM) return;
  addPage(ctx);
  if (ulangHeader) drawRow(ctx, KOLOM.map((k) => k.header), { header: true });
}

function drawTandaTangan(ctx: Ctx, setoran: SetoranRow): void {
  const blokH = 32 * MM;
  ensureSpace(ctx, blokH, false);
  ctx.y -= 6 * MM;
  const colW = CONTENT_W / 2;
  const blok = [
    { judul: "Yang menyetor,", jabatan: "Petugas", nama: setoran.petugas_nama ?? "-" },
    { judul: "Yang menerima,", jabatan: "Bendahara / Keuangan", nama: setoran.diterima_oleh_nama ?? "-" },
  ];
  blok.forEach((b, i) => {
    const x = MARGIN_X + i * colW;
    drawCenteredText(ctx.page, b.judul, x, colW, ctx.y, BODY_SIZE, ctx.fonts.regular, COLOR_TEXT);
    drawCenteredText(ctx.page, b.jabatan, x, colW, ctx.y - LINE_H, BODY_SIZE, ctx.fonts.regular, COLOR_TEXT);
    const nama = `( ${b.nama} )`;
    drawCenteredText(ctx.page, nama, x, colW, ctx.y - 24 * MM, BODY_SIZE, ctx.fonts.bold, COLOR_TEXT);
  });
  ctx.y -= blokH;
}

function drawFooters(pdf: PDFDocument, fonts: PdfFonts, nomor: string): void {
  const pages = pdf.getPages();
  const dicetak = new Date().toLocaleString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  pages.forEach((page, i) => {
    const text = pdfSafeText(`${nomor} - dicetak ${dicetak} - halaman ${i + 1} dari ${pages.length}`);
    const size = 7.5;
    const w = fonts.regular.widthOfTextAtSize(text, size);
    page.drawText(text, {
      x: MARGIN_X + CONTENT_W - w,
      y: MARGIN_BOTTOM / 2,
      size,
      font: fonts.regular,
      color: COLOR_TEXT,
    });
  });
}

export async function buildBuktiSetoranPdfBytes(input: BuktiSetoranPdfInput): Promise<Uint8Array> {
  const { setoran, items, desa } = input;
  const pdf = await PDFDocument.create();
  const fonts = await createPdfFonts(pdf);
  const ctx: Ctx = { pdf, page: pdf.addPage([PAGE_W, PAGE_H]), y: PAGE_H - MARGIN_TOP, fonts };
  const nomor = nomorBuktiSetoran(setoran.id);

  await drawKop(ctx, desa);

  drawCenteredText(ctx.page, "BUKTI SETORAN", MARGIN_X, CONTENT_W, ctx.y, 13, fonts.bold, COLOR_TEXT);
  ctx.y -= 5 * MM;
  drawCenteredText(ctx.page, `Nomor: ${nomor}`, MARGIN_X, CONTENT_W, ctx.y, BODY_SIZE, fonts.regular, COLOR_TEXT);
  ctx.y -= 9 * MM;

  const petugas = [setoran.petugas_nama ?? "Tanpa petugas", input.petugasJabatan?.trim()]
    .filter(Boolean)
    .join(" - ");
  drawInfo(ctx, "Tanggal setor", formatTanggalLahir(setoran.tanggal));
  drawInfo(ctx, "Petugas", petugas);
  drawInfo(ctx, "Diterima oleh", setoran.diterima_oleh_nama ?? "-");
  drawInfo(ctx, "Jumlah transaksi", String(items.length));
  if (setoran.keterangan?.trim()) drawInfo(ctx, "Keterangan", setoran.keterangan.trim());
  ctx.y -= 3 * MM;

  drawRow(ctx, KOLOM.map((k) => k.header), { header: true });
  items.forEach((item, i) => {
    ensureSpace(ctx, ROW_H, true);
    drawRow(ctx, [
      String(i + 1),
      formatTanggalLahir(item.tanggal),
      item.nomor_kartu,
      item.kepala_nama,
      item.uraian,
      formatRupiah(item.jumlah),
    ]);
  });

  const subtotal = (sumber: PembayaranSetoranItem["sumber"]) =>
    items.filter((i) => i.sumber === sumber).reduce((s, i) => s + i.jumlah, 0);
  const paturunan = subtotal("paturunan");
  const dudukan = subtotal("dudukan");
  const total = items.reduce((s, i) => s + i.jumlah, 0);

  ensureSpace(ctx, ROW_H * 3, false);
  if (paturunan > 0 && dudukan > 0) {
    drawRingkasanRow(ctx, "Subtotal Paturunan", paturunan);
    drawRingkasanRow(ctx, "Subtotal Dudukan", dudukan);
  }
  drawRingkasanRow(ctx, "TOTAL DISETOR", total, true);

  drawTandaTangan(ctx, setoran);
  drawFooters(pdf, fonts, nomor);

  return pdf.save();
}
