import type { PDFDocument, PDFPage, RGB } from "pdf-lib";
import type { DesaAdat } from "./types";
import {
  COLOR_TEXT,
  drawCenteredText,
  MM,
  pdfSafeText,
  type PdfFonts,
} from "./pdf-common";

export type StrukThermalWidthMm = 58 | 80;

export type ThermalMetrics = {
  widthMm: StrukThermalWidthMm;
  pageW: number;
  marginX: number;
  marginY: number;
  contentW: number;
  titleSize: number;
  bodySize: number;
  tableSize: number;
  lineH: number;
  rowH: number;
  labelW: number;
};

export function getThermalMetrics(widthMm: StrukThermalWidthMm): ThermalMetrics {
  const pageW = widthMm * MM;
  const marginX = (widthMm === 58 ? 2.5 : 3) * MM;
  const marginY = 3 * MM;
  const contentW = pageW - 2 * marginX;
  return {
    widthMm,
    pageW,
    marginX,
    marginY,
    contentW,
    titleSize: widthMm === 58 ? 8.5 : 9.5,
    bodySize: widthMm === 58 ? 7.5 : 8.5,
    tableSize: widthMm === 58 ? 7 : 8,
    lineH: widthMm === 58 ? 3.6 * MM : 4 * MM,
    rowH: widthMm === 58 ? 4.8 * MM : 5.2 * MM,
    labelW: widthMm === 58 ? 16 * MM : 20 * MM,
  };
}

export type ThermalPageCtx = {
  pdf: PDFDocument;
  page: PDFPage;
  y: number;
  m: ThermalMetrics;
  fonts: PdfFonts;
};

export function wrapThermalText(
  text: string,
  font: PdfFonts["regular"],
  size: number,
  maxWidth: number
): string[] {
  const safe = pdfSafeText(text.trim());
  if (!safe) return ["—"];
  const words = safe.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : ["—"];
}

export function drawThermalSeparator(ctx: ThermalPageCtx, color: RGB = COLOR_TEXT): void {
  const y = ctx.y - 0.8 * MM;
  ctx.page.drawLine({
    start: { x: ctx.m.marginX, y },
    end: { x: ctx.m.pageW - ctx.m.marginX, y },
    thickness: 0.4,
    color,
  });
  ctx.y = y - 1.5 * MM;
}

export function drawThermalHeader(
  ctx: ThermalPageCtx,
  desa: DesaAdat | null,
  docTitle: string
): void {
  const desaNama = desa?.nama_desa_adat?.trim() || "—";

  drawCenteredText(
    ctx.page,
    "Tim Kasukretan Krama",
    ctx.m.marginX,
    ctx.m.contentW,
    ctx.y - ctx.m.titleSize,
    ctx.m.titleSize,
    ctx.fonts.bold,
    COLOR_TEXT
  );
  ctx.y -= ctx.m.lineH;

  drawCenteredText(
    ctx.page,
    pdfSafeText(`Desa Adat ${desaNama}`),
    ctx.m.marginX,
    ctx.m.contentW,
    ctx.y - ctx.m.bodySize,
    ctx.m.bodySize,
    ctx.fonts.bold,
    COLOR_TEXT
  );
  ctx.y -= ctx.m.lineH + 0.5 * MM;

  drawCenteredText(
    ctx.page,
    docTitle,
    ctx.m.marginX,
    ctx.m.contentW,
    ctx.y - ctx.m.titleSize,
    ctx.m.titleSize,
    ctx.fonts.bold,
    COLOR_TEXT
  );
  ctx.y -= ctx.m.lineH + 1 * MM;

  drawThermalSeparator(ctx);
}

export function drawThermalInfoField(
  ctx: ThermalPageCtx,
  label: string,
  value: string | null | undefined
): void {
  const colonW = ctx.fonts.bold.widthOfTextAtSize(":", ctx.m.bodySize);
  const valueX = ctx.m.marginX + ctx.m.labelW + colonW + 1 * MM;
  const valueMaxW = ctx.m.pageW - ctx.m.marginX - valueX;
  const lines = wrapThermalText(value ?? "—", ctx.fonts.regular, ctx.m.bodySize, valueMaxW);

  const lab = pdfSafeText(label);
  ctx.page.drawText(lab, {
    x: ctx.m.marginX,
    y: ctx.y - ctx.m.bodySize,
    size: ctx.m.bodySize,
    font: ctx.fonts.bold,
    color: COLOR_TEXT,
  });
  ctx.page.drawText(":", {
    x: ctx.m.marginX + ctx.m.labelW,
    y: ctx.y - ctx.m.bodySize,
    size: ctx.m.bodySize,
    font: ctx.fonts.bold,
    color: COLOR_TEXT,
  });

  for (let i = 0; i < lines.length; i++) {
    const lineY = ctx.y - ctx.m.bodySize - i * ctx.m.lineH;
    if (i === 0) {
      ctx.page.drawText(lines[i]!, {
        x: valueX,
        y: lineY,
        size: ctx.m.bodySize,
        font: ctx.fonts.regular,
        color: COLOR_TEXT,
      });
    } else {
      ctx.page.drawText(lines[i]!, {
        x: ctx.m.marginX,
        y: lineY,
        size: ctx.m.bodySize,
        font: ctx.fonts.regular,
        color: COLOR_TEXT,
      });
    }
  }
  ctx.y -= Math.max(ctx.m.lineH, lines.length * ctx.m.lineH);
}

export function drawThermalClosingMessage(ctx: ThermalPageCtx, message: string): void {
  ctx.y -= 0.5 * MM;
  drawCenteredText(
    ctx.page,
    pdfSafeText(message),
    ctx.m.marginX,
    ctx.m.contentW,
    ctx.y - ctx.m.bodySize,
    ctx.m.bodySize,
    ctx.fonts.regular,
    COLOR_TEXT
  );
  ctx.y -= ctx.m.lineH;
}

export function estimateThermalPageHeight(
  m: ThermalMetrics,
  infoFieldLines: number,
  tableDataRows: number
): number {
  const headerBlock = 4 * m.lineH + 2 * MM;
  const infoBlock = infoFieldLines * m.lineH + m.lineH;
  const tableBlock = (tableDataRows + 2) * m.rowH + 2 * MM;
  const footerBlock = 3 * m.lineH + 1.5 * MM;
  return m.marginY * 2 + headerBlock + infoBlock + tableBlock + footerBlock;
}
