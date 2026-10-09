import type { PDFDocument, PDFImage, PDFPage, RGB } from "pdf-lib";
import { rgb, StandardFonts } from "pdf-lib";

export const MM = 2.834645669;
export const PAGE_LANDSCAPE_W = 297 * MM;
export const PAGE_LANDSCAPE_H = 210 * MM;
export const MARGIN_X = 10 * MM;
export const MARGIN_Y = 8 * MM;
export const CONTENT_W = PAGE_LANDSCAPE_W - 2 * MARGIN_X;

export const COLOR_TEXT = rgb(0.07, 0.07, 0.07);
export const COLOR_HEADER_PIPIL = rgb(185 / 255, 28 / 255, 28 / 255);
export const COLOR_HEADER_CLASSIC = rgb(232 / 255, 197 / 255, 71 / 255);
export const COLOR_HEADER_TAMIU = rgb(0, 0, 0);
export const COLOR_HEADER_TEXT_LIGHT = rgb(1, 1, 1);
export const COLOR_TABLE_HEAD = rgb(0.92, 0.92, 0.92);
export const COLOR_TABLE_BORDER = rgb(0.55, 0.55, 0.55);

export type PdfFonts = {
  regular: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  bold: Awaited<ReturnType<PDFDocument["embedFont"]>>;
};

export function pdfSafeText(text: string): string {
  return text
    .replace(/\u2026/g, "...")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "?");
}

/** Sama seperti pratinjau HTML (text-transform: uppercase). */
export function ilikitaUpper(text: string): string {
  return pdfSafeText(text).toUpperCase();
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1]! : dataUrl;
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function embedDataUrlImage(
  pdf: PDFDocument,
  dataUrl?: string | null
): Promise<PDFImage | null> {
  const src = dataUrl?.trim();
  if (!src?.startsWith("data:image/") || src.startsWith("data:image/svg")) return null;
  try {
    const bytes = dataUrlToBytes(src);
    if (src.includes("image/png")) {
      try {
        return await pdf.embedPng(bytes);
      } catch {
        return await pdf.embedJpg(bytes);
      }
    }
    try {
      return await pdf.embedJpg(bytes);
    } catch {
      return await pdf.embedPng(bytes);
    }
  } catch {
    return null;
  }
}

export async function createPdfFonts(pdf: PDFDocument): Promise<PdfFonts> {
  return {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };
}

export function truncatePdf(text: string, maxLen: number): string {
  const t = pdfSafeText(text.trim());
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 3)}...`;
}

export function drawCenteredText(
  page: PDFPage,
  text: string,
  centerX: number,
  width: number,
  y: number,
  size: number,
  font: PdfFonts["bold"],
  color: RGB
) {
  const safe = pdfSafeText(text);
  const w = font.widthOfTextAtSize(safe, size);
  page.drawText(safe, {
    x: centerX + (width - w) / 2,
    y,
    size,
    font,
    color,
  });
}

export type HeaderStyle = "pipil-red" | "classic-yellow" | "tamiu-black";

export function headerColors(style: HeaderStyle): { bg: RGB; text: RGB } {
  switch (style) {
    case "pipil-red":
      return { bg: COLOR_HEADER_PIPIL, text: COLOR_HEADER_TEXT_LIGHT };
    case "classic-yellow":
      return { bg: COLOR_HEADER_CLASSIC, text: COLOR_TEXT };
    case "tamiu-black":
      return { bg: COLOR_HEADER_TAMIU, text: COLOR_HEADER_TEXT_LIGHT };
  }
}

export function drawSheetHeader(
  page: PDFPage,
  desa: { logo_mda_url?: string | null; logo_url?: string | null; nama_desa_adat?: string | null; nama_kecamatan?: string | null; nama_kabupaten?: string | null } | null,
  style: HeaderStyle,
  fonts: PdfFonts,
  images: { mdaLogo: PDFImage | null; desaLogo: PDFImage | null },
  yTop: number
): number {
  const headerH = 22 * MM;
  const { bg, text } = headerColors(style);
  const bodyTop = yTop - headerH;

  page.drawRectangle({
    x: MARGIN_X,
    y: bodyTop,
    width: CONTENT_W,
    height: headerH,
    color: bg,
  });

  const logoSize = 18 * MM;
  const logoY = bodyTop + (headerH - logoSize) / 2;

  if (images.desaLogo) {
    page.drawImage(images.desaLogo, {
      x: MARGIN_X + 2 * MM,
      y: logoY,
      width: logoSize,
      height: logoSize,
    });
  }

  if (images.mdaLogo) {
    page.drawImage(images.mdaLogo, {
      x: MARGIN_X + CONTENT_W - logoSize - 2 * MM,
      y: logoY,
      width: logoSize,
      height: logoSize,
    });
  }

  const centerX = MARGIN_X + logoSize + 4 * MM;
  const centerW = CONTENT_W - 2 * logoSize - 8 * MM;
  const desaNama = desa?.nama_desa_adat?.trim().toUpperCase() ?? "DESA ADAT";
  const kecKab = [desa?.nama_kecamatan, desa?.nama_kabupaten].filter(Boolean).join(" Kabupaten ");
  const lokasi = kecKab ? `Kecamatan ${kecKab}` : "";

  drawCenteredText(page, "MAJELIS DESA ADAT (MDA) BALI", centerX, centerW, bodyTop + 14 * MM, 11, fonts.bold, text);
  drawCenteredText(page, `DESA ADAT ${desaNama}`, centerX, centerW, bodyTop + 10 * MM, 10.5, fonts.bold, text);
  if (lokasi) {
    drawCenteredText(page, lokasi, centerX, centerW, bodyTop + 6.5 * MM, 9, fonts.regular, text);
  }

  if (style !== "pipil-red") {
    page.drawLine({
      start: { x: MARGIN_X, y: bodyTop },
      end: { x: MARGIN_X + CONTENT_W, y: bodyTop },
      thickness: 0.8,
      color: COLOR_TEXT,
    });
  }

  return bodyTop - 2 * MM;
}

export function drawLabelValue(
  page: PDFPage,
  label: string,
  value: string | undefined | null,
  x: number,
  y: number,
  labelW: number,
  fonts: PdfFonts,
  size = 8
) {
  const lab = pdfSafeText(label);
  page.drawText(lab, { x, y, size, font: fonts.bold, color: COLOR_TEXT });
  const colonX = x + labelW;
  page.drawText(":", { x: colonX, y, size, font: fonts.bold, color: COLOR_TEXT });
  const val = truncatePdf(value ?? "", 48);
  if (val) {
    page.drawText(` ${val}`, {
      x: colonX + fonts.bold.widthOfTextAtSize(":", size),
      y,
      size,
      font: fonts.regular,
      color: COLOR_TEXT,
    });
  }
}

export type TableColumn = {
  header: string;
  fraction: number;
  cell: (rowIndex: number, row: unknown) => string;
};

export function drawDataTable(
  page: PDFPage,
  columns: TableColumn[],
  rows: unknown[],
  startY: number,
  fonts: PdfFonts,
  options?: { rowSize?: number; headerSize?: number; minRowH?: number }
): number {
  const rowSize = options?.rowSize ?? 7;
  const headerSize = options?.headerSize ?? 7;
  const minRowH = options?.minRowH ?? 5 * MM;
  const headerH = 6 * MM;

  const widths = columns.map((c) => c.fraction * CONTENT_W);
  let y = startY;

  let x = MARGIN_X;
  for (let i = 0; i < columns.length; i++) {
    const w = widths[i]!;
    page.drawRectangle({
      x,
      y: y - headerH,
      width: w,
      height: headerH,
      borderColor: COLOR_TABLE_BORDER,
      borderWidth: 0.5,
      color: COLOR_TABLE_HEAD,
    });
    const hText = pdfSafeText(columns[i]!.header);
    page.drawText(hText, {
      x: x + 1 * MM,
      y: y - headerH + 1.8 * MM,
      size: headerSize,
      font: fonts.bold,
      color: COLOR_TEXT,
    });
    x += w;
  }
  y -= headerH;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    x = MARGIN_X;
    let rowH = minRowH;
    const cellLines: string[][] = [];

    for (let i = 0; i < columns.length; i++) {
      const w = widths[i]!;
      const raw = columns[i]!.cell(r, row);
      const maxChars = Math.max(8, Math.floor(w / (rowSize * 0.42)));
      const text = truncatePdf(raw, maxChars);
      cellLines.push([text]);
      x += w;
    }

    for (let i = 0; i < columns.length; i++) {
      const w = widths[i]!;
      page.drawRectangle({
        x: MARGIN_X + widths.slice(0, i).reduce((a, b) => a + b, 0),
        y: y - rowH,
        width: w,
        height: rowH,
        borderColor: COLOR_TABLE_BORDER,
        borderWidth: 0.5,
      });
      const text = cellLines[i]![0]!;
      if (text) {
        page.drawText(text, {
          x: MARGIN_X + widths.slice(0, i).reduce((a, b) => a + b, 0) + 1 * MM,
          y: y - rowH + 1.6 * MM,
          size: rowSize,
          font: fonts.regular,
          color: COLOR_TEXT,
        });
      }
    }
    y -= rowH;
  }

  return y;
}
