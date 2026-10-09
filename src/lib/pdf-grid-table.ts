import type { PDFPage } from "pdf-lib";
import {
  COLOR_TABLE_BORDER,
  COLOR_TABLE_HEAD,
  COLOR_TEXT,
  MM,
  ilikitaUpper,
  pdfSafeText,
  truncatePdf,
  type PdfFonts,
} from "./pdf-common";

/** Definisi kolom tabel grid laporan (wrap/shrink/align per kolom). */
export type GridTableColDef = {
  header: string;
  fraction: number;
  align: "left" | "center" | "right";
  uppercase: boolean;
  shrink: boolean;
  wrap: boolean;
};

export type GridTableLayout = {
  marginX: number;
  contentW: number;
  columns: readonly GridTableColDef[];
  headerSize: number;
  rowSize: number;
  rowMinSize: number;
  headerRowH: number;
  cellPad: number;
  rowLineLeading?: number;
  rowPad?: number;
  /** Ukuran font baris lanjutan (setelah `\n`) pada sel wrap; default rowMinSize. */
  wrapSecondarySize?: number;
};

export type GridCellLine = {
  text: string;
  size: number;
};

export type GridCellRender = {
  lines: GridCellLine[];
};

const DEFAULT_ROW_LINE_LEADING = 1.1;
const DEFAULT_ROW_PAD = 0.8 * MM;
const DESCENDER_PAD_PT = 1.8;

function measureCellContentHeight(
  lines: GridCellLine[],
  rowLineLeading = DEFAULT_ROW_LINE_LEADING
): number {
  if (!lines.length) return 0;
  let height = lines[0]!.size;
  for (let i = 0; i < lines.length - 1; i++) {
    height += lines[i]!.size * rowLineLeading;
  }
  const lastSize = lines[lines.length - 1]!.size;
  height += Math.max(DESCENDER_PAD_PT, lastSize * 0.25);
  return height;
}

function gridUpper(text: string): string {
  return ilikitaUpper(text);
}

export function gridColumnWidths(layout: GridTableLayout): number[] {
  const sum = layout.columns.reduce((a, c) => a + c.fraction, 0);
  return layout.columns.map((c) => (c.fraction / sum) * layout.contentW);
}

export function fitGridHeaderCell(
  font: PdfFonts["bold"],
  text: string,
  colW: number,
  size: number,
  cellPad: number
): string {
  const display = gridUpper(text);
  const avail = colW - 2 * cellPad;
  if (font.widthOfTextAtSize(display, size) <= avail) return display;
  const maxChars = Math.max(3, Math.floor(avail / (size * 0.38)));
  return gridUpper(truncatePdf(text, maxChars));
}

function wrapGridTableParagraph(
  font: PdfFonts["regular"],
  text: string,
  fontSize: number,
  maxWidth: number,
  uppercase: boolean
): string[] {
  const safe = uppercase ? gridUpper(text.trim()) : pdfSafeText(text.trim());
  if (!safe) return [""];

  const lines: string[] = [];
  let line = "";

  for (const word of safe.split(/\s+/)) {
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

function fitGridTableCell(
  font: PdfFonts["regular"],
  text: string,
  colW: number,
  maxSize: number,
  minSize: number,
  cellPad: number,
  opts: { uppercase?: boolean; shrink?: boolean } = {}
): { display: string; size: number } {
  const uppercase = opts.uppercase ?? true;
  const shrink = opts.shrink ?? false;
  const display = uppercase ? gridUpper(text) : pdfSafeText(text);
  const avail = colW - 2 * cellPad;

  if (shrink) {
    let size = maxSize;
    while (size >= minSize) {
      if (font.widthOfTextAtSize(display, size) <= avail) {
        return { display, size };
      }
      size -= 0.25;
    }
  }

  const size = maxSize;
  if (font.widthOfTextAtSize(display, size) <= avail) {
    return { display, size };
  }

  const maxChars = Math.max(3, Math.floor(avail / (size * 0.38)));
  return {
    display: uppercase ? gridUpper(truncatePdf(text, maxChars)) : truncatePdf(display, maxChars),
    size,
  };
}

export function buildGridRowRenders(
  font: PdfFonts["regular"],
  layout: GridTableLayout,
  widths: number[],
  cellTexts: string[]
): GridCellRender[] {
  return layout.columns.map((col, i) => {
    const colW = widths[i]!;
    const raw = cellTexts[i] ?? "";
    if (col.wrap) {
      const paragraphs = raw.split(/\n/);
      const secondarySize = layout.wrapSecondarySize ?? layout.rowMinSize;
      const maxWidth = Math.max(8, colW - 2 * layout.cellPad);
      const lines: GridCellLine[] = [];
      for (let pi = 0; pi < paragraphs.length; pi++) {
        const fontSize = pi === 0 ? layout.rowSize : secondarySize;
        const wrapped = wrapGridTableParagraph(
          font,
          paragraphs[pi] ?? "",
          fontSize,
          maxWidth,
          col.uppercase
        );
        for (const text of wrapped) {
          lines.push({ text, size: fontSize });
        }
      }
      return { lines: lines.length ? lines : [{ text: "", size: layout.rowSize }] };
    }
    const { display, size } = fitGridTableCell(
      font,
      raw,
      colW,
      layout.rowSize,
      layout.rowMinSize,
      layout.cellPad,
      { uppercase: col.uppercase, shrink: col.shrink }
    );
    return { lines: [{ text: display, size }] };
  });
}

export function measureGridRowHeight(
  renders: GridCellRender[],
  fallbackFontSize: number,
  rowLineLeading = DEFAULT_ROW_LINE_LEADING,
  rowPad = DEFAULT_ROW_PAD
): number {
  const contentHeights = renders.map((render) =>
    measureCellContentHeight(render.lines, rowLineLeading)
  );
  const maxContentH = Math.max(
    measureCellContentHeight([{ text: "X", size: fallbackFontSize }], rowLineLeading),
    ...contentHeights
  );
  return rowPad + maxContentH;
}

/** Menggambar baris header; mengembalikan Y baru (di bawah header). */
export function drawGridTableHeader(
  page: PDFPage,
  y: number,
  layout: GridTableLayout,
  tableFonts: PdfFonts
): number {
  const widths = gridColumnWidths(layout);
  let x = layout.marginX;
  for (let i = 0; i < layout.columns.length; i++) {
    const col = layout.columns[i]!;
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
    const font = tableFonts.bold;
    const headerText = fitGridHeaderCell(font, col.header, w, layout.headerSize, layout.cellPad);
    const textW = font.widthOfTextAtSize(headerText, layout.headerSize);
    let tx = x + layout.cellPad;
    if (col.align === "center") tx = x + (w - textW) / 2;
    else if (col.align === "right") tx = x + w - layout.cellPad - textW;
    page.drawText(headerText, {
      x: Math.max(x + layout.cellPad, tx),
      y: y - layout.headerRowH + 1.2 * MM,
      size: layout.headerSize,
      font,
      color: COLOR_TEXT,
    });
    x += w;
  }
  return y - layout.headerRowH;
}

/** Menggambar satu baris data; mengembalikan Y baru (di bawah baris). */
export function drawGridTableDataRow(
  page: PDFPage,
  y: number,
  layout: GridTableLayout,
  font: PdfFonts["regular"],
  cellTexts: string[]
): number {
  const widths = gridColumnWidths(layout);
  const renders = buildGridRowRenders(font, layout, widths, cellTexts);
  const rowLineLeading = layout.rowLineLeading ?? DEFAULT_ROW_LINE_LEADING;
  const rowPad = layout.rowPad ?? DEFAULT_ROW_PAD;
  const rowH = measureGridRowHeight(renders, layout.rowSize, rowLineLeading, rowPad);
  const topPad = rowPad / 2;

  let x = layout.marginX;
  for (let i = 0; i < layout.columns.length; i++) {
    const col = layout.columns[i]!;
    const w = widths[i]!;
    const render = renders[i]!;

    page.drawRectangle({
      x,
      y: y - rowH,
      width: w,
      height: rowH,
      borderColor: COLOR_TABLE_BORDER,
      borderWidth: 0.5,
    });

    let textY = y - topPad - (render.lines[0]?.size ?? layout.rowSize);
    for (const line of render.lines) {
      const display = line.text;
      if (!display) {
        textY -= line.size * rowLineLeading;
        continue;
      }
      const textW = font.widthOfTextAtSize(display, line.size);
      let tx = x + layout.cellPad;
      if (col.align === "right") tx = x + w - layout.cellPad - textW;
      else if (col.align === "center") tx = x + (w - textW) / 2;
      page.drawText(display, {
        x: Math.max(x + layout.cellPad, tx),
        y: textY,
        size: line.size,
        font,
        color: COLOR_TEXT,
      });
      textY -= line.size * rowLineLeading;
    }
    x += w;
  }
  return y - rowH;
}

/** Ukuran baris sebelum digambar (untuk pagination). */
export function measureGridDataRowHeight(
  layout: GridTableLayout,
  font: PdfFonts["regular"],
  cellTexts: string[]
): number {
  const widths = gridColumnWidths(layout);
  const renders = buildGridRowRenders(font, layout, widths, cellTexts);
  return measureGridRowHeight(
    renders,
    layout.rowSize,
    layout.rowLineLeading,
    layout.rowPad
  );
}
