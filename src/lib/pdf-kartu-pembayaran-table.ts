import type { PDFPage, RGB } from "pdf-lib";
import { MM, truncatePdf, type PdfFonts } from "./pdf-common";

/** Layout tabel riwayat pembayaran pada kartu Paturunan/Dudukan (F4 portrait). */
export type KartuPembayaranTableLayout = {
  marginX: number;
  contentW: number;
  headers: readonly string[];
  colFractions: readonly number[];
  colWidthDeltaPt?: readonly number[];
  centerDataCols: ReadonlySet<number>;
  rightDataCols: ReadonlySet<number>;
  headerSize: number;
  rowSize: number;
  rowH: number;
  headerRowH: number;
  cellPad: number;
  borderColor: RGB;
  textColor: RGB;
};

export function fitKartuPembayaranCell(
  text: string,
  colW: number,
  size: number,
  cellPad: number
): string {
  const maxChars = Math.max(2, Math.floor((colW - 2 * cellPad) / (size * 0.45)));
  return truncatePdf(text, maxChars);
}

export function kartuPembayaranColumnWidths(layout: KartuPembayaranTableLayout): number[] {
  const deltas = layout.colWidthDeltaPt ?? layout.colFractions.map(() => 0);
  const sum = layout.colFractions.reduce((a, b) => a + b, 0);
  return layout.colFractions.map(
    (f, i) => (f / sum) * layout.contentW + (deltas[i] ?? 0)
  );
}

/** Menggambar baris header; mengembalikan Y baru (di bawah header). */
export function drawKartuPembayaranTableHeader(
  page: PDFPage,
  y: number,
  layout: KartuPembayaranTableLayout,
  tableFonts: PdfFonts
): number {
  let x = layout.marginX;
  for (let i = 0; i < layout.headers.length; i++) {
    const w = kartuPembayaranColumnWidths(layout)[i]!;
    page.drawRectangle({
      x,
      y: y - layout.headerRowH,
      width: w,
      height: layout.headerRowH,
      borderColor: layout.borderColor,
      borderWidth: 0.75,
    });
    const text = fitKartuPembayaranCell(layout.headers[i]!, w, layout.headerSize, layout.cellPad);
    const font = tableFonts.bold;
    const textW = font.widthOfTextAtSize(text, layout.headerSize);
    page.drawText(text, {
      x: x + (w - textW) / 2,
      y: y - layout.headerRowH + 3.2 * MM,
      size: layout.headerSize,
      font,
      color: layout.textColor,
    });
    x += w;
  }
  return y - layout.headerRowH;
}

/** Menggambar satu baris data; mengembalikan Y baru (di bawah baris). */
export function drawKartuPembayaranTableRow(
  page: PDFPage,
  y: number,
  layout: KartuPembayaranTableLayout,
  cells: string[],
  tableFonts: PdfFonts
): number {
  const widths = kartuPembayaranColumnWidths(layout);
  let x = layout.marginX;
  for (let i = 0; i < cells.length; i++) {
    const w = widths[i]!;
    page.drawRectangle({
      x,
      y: y - layout.rowH,
      width: w,
      height: layout.rowH,
      borderColor: layout.borderColor,
      borderWidth: 0.75,
    });
    const text = fitKartuPembayaranCell(cells[i] ?? "", w, layout.rowSize, layout.cellPad);
    const font = tableFonts.regular;
    const textW = font.widthOfTextAtSize(text, layout.rowSize);
    const textX = layout.centerDataCols.has(i)
      ? x + (w - textW) / 2
      : layout.rightDataCols.has(i)
        ? x + w - layout.cellPad - textW
        : x + layout.cellPad;
    if (text) {
      page.drawText(text, {
        x: textX,
        y: y - layout.rowH + 3 * MM,
        size: layout.rowSize,
        font,
        color: layout.textColor,
      });
    }
    x += w;
  }
  return y - layout.rowH;
}
