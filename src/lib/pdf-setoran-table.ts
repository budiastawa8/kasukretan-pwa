import type { PDFFont, PDFPage } from "pdf-lib";
import {
  COLOR_TABLE_BORDER,
  COLOR_TABLE_HEAD,
  COLOR_TEXT,
  MM,
  pdfSafeText,
  truncatePdf,
  type PdfFonts,
} from "./pdf-common";

/** Layout tabel bukti setoran Dudukan/Paturunan (A4 portrait, header abu-abu). */
export type SetoranTableLayout = {
  marginX: number;
  contentW: number;
  headers: readonly string[];
  colFractions: readonly number[];
  colWidthDeltaPt?: readonly number[];
  rightDataCols: ReadonlySet<number>;
  /** Kolom data rata tengah (No, Periode, dll.). */
  centerDataCols?: ReadonlySet<number>;
  /** Header kolom rata tengah (boleh berbeda dari data, mis. Nama/Alamat). */
  centerHeaderCols?: ReadonlySet<number>;
  /** Kolom data yang dibungkus (tinggi baris menyesuaikan). */
  wrapDataCols?: ReadonlySet<number>;
  headerSize: number;
  rowSize: number;
  rowH: number;
  headerRowH: number;
  cellPad: number;
  /** Transform teks sel sebelum truncate (mis. `ilikitaUpper`). */
  cellText?: (text: string) => string;
  minCellChars?: number;
  /** Leading antar baris teks wrap (default 1.2). */
  rowLineLeading?: number;
};

const DEFAULT_ROW_LINE_LEADING = 1.2;

export function fitSetoranCell(
  text: string,
  colW: number,
  size: number,
  cellPad: number,
  minChars = 3,
  transform?: (text: string) => string
): string {
  const maxChars = Math.max(minChars, Math.floor((colW - 2 * cellPad) / (size * 0.45)));
  const truncated = truncatePdf(text, maxChars);
  return transform ? transform(truncated) : truncated;
}

export function setoranColumnWidths(layout: SetoranTableLayout): number[] {
  const deltas = layout.colWidthDeltaPt ?? layout.colFractions.map(() => 0);
  const sum = layout.colFractions.reduce((a, b) => a + b, 0);
  return layout.colFractions.map(
    (f, i) => (f / sum) * layout.contentW + (deltas[i] ?? 0)
  );
}

function wrapSetoranLines(
  font: PDFFont,
  text: string,
  fontSize: number,
  maxWidth: number,
  transform?: (text: string) => string
): string[] {
  const raw = transform ? transform(text) : pdfSafeText(text.trim());
  if (!raw) return [""];

  const lines: string[] = [];
  let line = "";

  for (const word of raw.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    if (font.widthOfTextAtSize(word, fontSize) <= maxWidth) {
      line = word;
      continue;
    }
    let chunk = "";
    for (const ch of word) {
      const test = chunk + ch;
      if (font.widthOfTextAtSize(test, fontSize) <= maxWidth) {
        chunk = test;
      } else {
        if (chunk) lines.push(chunk);
        chunk = ch;
      }
    }
    line = chunk;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function cellAlignX(
  layout: SetoranTableLayout,
  colIndex: number,
  cellX: number,
  cellW: number,
  textW: number
): number {
  if (layout.centerDataCols?.has(colIndex)) {
    return cellX + (cellW - textW) / 2;
  }
  if (layout.rightDataCols.has(colIndex)) {
    return cellX + cellW - layout.cellPad - textW;
  }
  return cellX + layout.cellPad;
}

function headerAlignX(
  layout: SetoranTableLayout,
  colIndex: number,
  cellX: number,
  cellW: number,
  textW: number
): number {
  if (layout.centerHeaderCols?.has(colIndex)) {
    return cellX + (cellW - textW) / 2;
  }
  if (layout.rightDataCols.has(colIndex)) {
    return cellX + cellW - layout.cellPad - textW;
  }
  return cellX + layout.cellPad;
}

/** Susun baris teks per kolom (wrap atau truncate). */
export function buildSetoranRowLines(
  layout: SetoranTableLayout,
  cells: string[],
  tableFonts: PdfFonts
): string[][] {
  const widths = setoranColumnWidths(layout);
  const wrapCols = layout.wrapDataCols ?? new Set<number>();
  const font = tableFonts.regular;
  return cells.map((cell, i) => {
    const w = widths[i]!;
    const maxW = Math.max(8, w - 2 * layout.cellPad);
    if (wrapCols.has(i)) {
      return wrapSetoranLines(font, cell ?? "", layout.rowSize, maxW, layout.cellText);
    }
    return [
      fitSetoranCell(
        cell ?? "",
        w,
        layout.rowSize,
        layout.cellPad,
        layout.minCellChars,
        layout.cellText
      ),
    ];
  });
}

/** Tinggi baris data berdasarkan isi (wrap menaikkan tinggi). */
export function measureSetoranTableRowHeight(
  layout: SetoranTableLayout,
  cells: string[],
  tableFonts: PdfFonts
): number {
  const lineSets = buildSetoranRowLines(layout, cells, tableFonts);
  const maxLines = Math.max(1, ...lineSets.map((lines) => lines.length));
  if (maxLines <= 1) return layout.rowH;
  const leading = layout.rowLineLeading ?? DEFAULT_ROW_LINE_LEADING;
  const lineH = layout.rowSize * leading;
  const pad = layout.rowH - layout.rowSize;
  return Math.max(layout.rowH, pad + maxLines * lineH);
}

/** Menggambar baris header; mengembalikan Y baru (di bawah header). */
export function drawSetoranTableHeader(
  page: PDFPage,
  y: number,
  layout: SetoranTableLayout,
  tableFonts: PdfFonts
): number {
  const widths = setoranColumnWidths(layout);
  let x = layout.marginX;
  for (let i = 0; i < layout.headers.length; i++) {
    const w = widths[i]!;
    page.drawRectangle({
      x,
      y: y - layout.headerRowH,
      width: w,
      height: layout.headerRowH,
      borderColor: COLOR_TABLE_BORDER,
      borderWidth: 0.5,
      color: COLOR_TABLE_HEAD,
    });
    const text = fitSetoranCell(
      layout.headers[i]!,
      w,
      layout.headerSize,
      layout.cellPad,
      layout.minCellChars,
      layout.cellText
    );
    const font = tableFonts.bold;
    const textW = font.widthOfTextAtSize(text, layout.headerSize);
    page.drawText(text, {
      x: Math.max(x + layout.cellPad * 0.3, headerAlignX(layout, i, x, w, textW)),
      y: y - layout.headerRowH + 2 * MM,
      size: layout.headerSize,
      font,
      color: COLOR_TEXT,
    });
    x += w;
  }
  return y - layout.headerRowH;
}

/** Menggambar satu baris data; mengembalikan Y baru (di bawah baris). */
export function drawSetoranTableRow(
  page: PDFPage,
  y: number,
  layout: SetoranTableLayout,
  cells: string[],
  tableFonts: PdfFonts
): number {
  const widths = setoranColumnWidths(layout);
  const lineSets = buildSetoranRowLines(layout, cells, tableFonts);
  const rowH = measureSetoranTableRowHeight(layout, cells, tableFonts);
  const leading = layout.rowLineLeading ?? DEFAULT_ROW_LINE_LEADING;
  const lineH = layout.rowSize * leading;
  const maxLines = Math.max(1, ...lineSets.map((lines) => lines.length));
  const font = tableFonts.regular;
  const singleLineBaseline = y - layout.rowH + 1.8 * MM;

  let x = layout.marginX;
  for (let i = 0; i < cells.length; i++) {
    const w = widths[i]!;
    page.drawRectangle({
      x,
      y: y - rowH,
      width: w,
      height: rowH,
      borderColor: COLOR_TABLE_BORDER,
      borderWidth: 0.5,
    });
    const lines = lineSets[i] ?? [""];
    const cellTopPad =
      maxLines <= 1
        ? 0
        : Math.max(1.2 * MM, (rowH - lines.length * lineH) / 2);
    for (let li = 0; li < lines.length; li++) {
      const text = lines[li] ?? "";
      if (!text) continue;
      const textW = font.widthOfTextAtSize(text, layout.rowSize);
      const tx = cellAlignX(layout, i, x, w, textW);
      const textY =
        maxLines <= 1
          ? singleLineBaseline
          : y - cellTopPad - layout.rowSize - li * lineH;
      page.drawText(text, {
        x: Math.max(x + layout.cellPad * 0.3, tx),
        y: textY,
        size: layout.rowSize,
        font,
        color: COLOR_TEXT,
      });
    }
    x += w;
  }
  return y - rowH;
}

/** Band lebar penuh (label iuran/arahan) dengan fill header. */
export function drawSetoranFullWidthBand(
  page: PDFPage,
  y: number,
  layout: SetoranTableLayout,
  totalW: number,
  text: string,
  tableFonts: PdfFonts,
  bold = true,
  align: "left" | "center" = "left"
): number {
  page.drawRectangle({
    x: layout.marginX,
    y: y - layout.rowH,
    width: totalW,
    height: layout.rowH,
    borderColor: COLOR_TABLE_BORDER,
    borderWidth: 0.5,
    color: COLOR_TABLE_HEAD,
  });
  const cellText = fitSetoranCell(
    text,
    totalW - 2 * layout.cellPad,
    layout.rowSize,
    layout.cellPad,
    layout.minCellChars,
    layout.cellText
  );
  const font = bold ? tableFonts.bold : tableFonts.regular;
  const textW = font.widthOfTextAtSize(cellText, layout.rowSize);
  const tx =
    align === "center"
      ? layout.marginX + (totalW - textW) / 2
      : layout.marginX + layout.cellPad;
  page.drawText(cellText, {
    x: Math.max(layout.marginX + layout.cellPad * 0.3, tx),
    y: y - layout.rowH + 1.8 * MM,
    size: layout.rowSize,
    font,
    color: COLOR_TEXT,
  });
  return y - layout.rowH;
}

/** Baris ringkasan: label (kolom 0..amountColIndex-1) + nominal + kolom kosong trailing. */
export function drawSetoranLabelAmountRow(
  page: PDFPage,
  y: number,
  layout: SetoranTableLayout,
  widths: number[],
  opts: {
    label: string;
    amountText: string;
    amountColIndex: number;
    trailingCols?: number;
  },
  tableFonts: PdfFonts
): number {
  const { label, amountText, amountColIndex, trailingCols = 0 } = opts;
  const labelW = widths.slice(0, amountColIndex).reduce((s, w) => s + w, 0);
  const amountW = widths[amountColIndex]!;
  let x = layout.marginX;

  const drawFilledCell = (cellX: number, cellW: number, text: string, right = false) => {
    page.drawRectangle({
      x: cellX,
      y: y - layout.rowH,
      width: cellW,
      height: layout.rowH,
      borderColor: COLOR_TABLE_BORDER,
      borderWidth: 0.5,
      color: COLOR_TABLE_HEAD,
    });
    const display = layout.cellText ? layout.cellText(text) : text;
    const font = tableFonts.bold;
    const textW = font.widthOfTextAtSize(display, layout.rowSize);
    const tx = right ? cellX + cellW - layout.cellPad - textW : cellX + layout.cellPad;
    page.drawText(display, {
      x: Math.max(cellX + layout.cellPad, tx),
      y: y - layout.rowH + 1.8 * MM,
      size: layout.rowSize,
      font,
      color: COLOR_TEXT,
    });
  };

  drawFilledCell(x, labelW, label);
  x += labelW;
  drawFilledCell(x, amountW, amountText, true);
  x += amountW;

  for (let t = 0; t < trailingCols; t++) {
    const w = widths[amountColIndex + 1 + t]!;
    page.drawRectangle({
      x,
      y: y - layout.rowH,
      width: w,
      height: layout.rowH,
      borderColor: COLOR_TABLE_BORDER,
      borderWidth: 0.5,
      color: COLOR_TABLE_HEAD,
    });
    x += w;
  }

  return y - layout.rowH;
}
