import { rgb, type PDFPage, type RGB } from "pdf-lib";
import {
  COLOR_TABLE_BORDER,
  COLOR_TABLE_HEAD,
  COLOR_TEXT,
  MM,
  MARGIN_X,
  pdfSafeText,
  truncatePdf,
  type PdfFonts,
} from "./pdf-common";

const ROW_H = 5 * MM;
const HEADER_ROW_H = 5.5 * MM;
const CELL_PAD = 1 * MM;

export const LAPORAN_DEFAULT_ROW_FONT_SIZE = 6;
export const LAPORAN_DEFAULT_HEADER_FONT_SIZE = 6.5;

/** Metrik layout tabel laporan (lebar konten mengikuti orientasi/ukuran kertas). */
export type LaporanTableMetrics = {
  marginX: number;
  contentW: number;
};

export const LAPORAN_MIN_HEADER_ROW_H = HEADER_ROW_H;

export function createLaporanTableMetrics(contentW: number, marginX = MARGIN_X): LaporanTableMetrics {
  return { marginX, contentW };
}

export type CellPdfStyle = { fill?: RGB; text?: RGB; bold?: boolean };

const PATURUNAN_STATUS_CELL: Record<string, CellPdfStyle> = {
  belum: { fill: rgb(254 / 255, 226 / 255, 226 / 255), text: rgb(153 / 255, 27 / 255, 27 / 255), bold: true },
  cicil: { fill: rgb(254 / 255, 243 / 255, 199 / 255), text: rgb(146 / 255, 64 / 255, 14 / 255), bold: true },
  cicil_punia: {
    fill: rgb(255 / 255, 251 / 255, 235 / 255),
    text: rgb(146 / 255, 64 / 255, 14 / 255),
    bold: true,
  },
  lunas: { fill: rgb(220 / 255, 252 / 255, 231 / 255), text: rgb(22 / 255, 101 / 255, 52 / 255), bold: true },
  lunas_punia: { fill: rgb(186 / 255, 230 / 255, 253 / 255), text: rgb(12 / 255, 74 / 255, 110 / 255), bold: true },
  punia: { fill: rgb(245 / 255, 243 / 255, 255 / 255), text: rgb(107 / 255, 33 / 255, 168 / 255), bold: true },
};

export function statusCellStyle(statusKey: string | undefined): CellPdfStyle | undefined {
  if (!statusKey || statusKey === "tidak_wajib") return undefined;
  return PATURUNAN_STATUS_CELL[statusKey];
}

function truncateHeader(text: string, colW: number, fontSize = LAPORAN_DEFAULT_HEADER_FONT_SIZE): string {
  const maxChars = Math.max(4, Math.floor(colW / (fontSize * 0.42)));
  return truncatePdf(text, maxChars);
}

function headerRowHeightPt(headerFontSize: number, maxLines = 1): number {
  const lineH = headerFontSize * 1.2;
  const pad = 1.5 * MM;
  return Math.max(HEADER_ROW_H, pad + maxLines * lineH);
}

export function drawLaporanTableHeader(
  page: PDFPage,
  metrics: LaporanTableMetrics,
  fonts: PdfFonts,
  headers: string[],
  widths: number[],
  y: number,
  headerFontSize = LAPORAN_DEFAULT_HEADER_FONT_SIZE,
  wrapHeaderColumns?: Set<number>,
  alignCenter?: Set<number>
): number {
  const centerCols = alignCenter ?? new Set<number>();
  const lineH = headerFontSize * 1.2;
  const headerLines = headers.map((header, i) => {
    const w = widths[i] ?? 0;
    const maxW = Math.max(8, w - 2 * CELL_PAD);
    if (wrapHeaderColumns?.has(i)) {
      return wrapPdfLines(header, fonts.bold, headerFontSize, maxW);
    }
    return [truncateHeader(header, w, headerFontSize)];
  });
  const maxLines = Math.max(1, ...headerLines.map((lines) => lines.length));
  const headerH = headerRowHeightPt(headerFontSize, maxLines);
  let x = metrics.marginX;
  for (let i = 0; i < headers.length; i++) {
    const w = widths[i]!;
    const lines = headerLines[i]!;
    page.drawRectangle({
      x,
      y: y - headerH,
      width: w,
      height: headerH,
      borderColor: COLOR_TABLE_BORDER,
      borderWidth: 0.5,
      color: COLOR_TABLE_HEAD,
    });
    const blockH = lines.length * lineH;
    let lineY = y - (headerH - blockH) / 2 - headerFontSize;
    for (const line of lines) {
      const textW = fonts.bold.widthOfTextAtSize(line, headerFontSize);
      const tx = centerCols.has(i)
        ? x + (w - textW) / 2
        : x + CELL_PAD;
      page.drawText(line, {
        x: tx,
        y: lineY,
        size: headerFontSize,
        font: fonts.bold,
        color: COLOR_TEXT,
      });
      lineY -= lineH;
    }
    x += w;
  }
  return y - headerH;
}

export function fitLaporanCellText(
  text: string,
  colW: number,
  fontSize = LAPORAN_DEFAULT_ROW_FONT_SIZE
): string {
  const maxChars = Math.max(4, Math.floor((colW - 2 * CELL_PAD) / (fontSize * 0.42)));
  return truncatePdf(text, maxChars);
}

function wrapPdfLines(
  text: string,
  font: PdfFonts["regular"],
  fontSize: number,
  maxWidth: number
): string[] {
  const safe = pdfSafeText(text.trim());
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

type RowSegment = { startCol: number; span: number; text: string };

function buildRowSegments(
  cells: string[],
  merges?: Partial<Record<number, number>>
): RowSegment[] {
  const segments: RowSegment[] = [];
  for (let i = 0; i < cells.length; ) {
    const span = merges?.[i] ?? 1;
    segments.push({ startCol: i, span, text: cells[i] ?? "" });
    i += span;
  }
  return segments;
}

function segmentWidth(widths: number[], startCol: number, span: number): number {
  let w = 0;
  for (let i = startCol; i < startCol + span; i++) w += widths[i] ?? 0;
  return w;
}

export function laporanCellLineSets(
  cells: string[],
  widths: number[],
  font: PdfFonts["regular"],
  fontSize: number,
  wrapColumns: Set<number>,
  cellMerges?: Partial<Record<number, number>>
): string[][] {
  if (cellMerges && Object.keys(cellMerges).length > 0) {
    return buildRowSegments(cells, cellMerges).map((seg) => {
      const w = segmentWidth(widths, seg.startCol, seg.span);
      const wrap = Array.from({ length: seg.span }, (_, j) => seg.startCol + j).some((col) =>
        wrapColumns.has(col)
      );
      if (wrap) {
        return wrapPdfLines(seg.text, font, fontSize, Math.max(8, w - 2 * CELL_PAD));
      }
      return [fitLaporanCellText(seg.text, w, fontSize)];
    });
  }
  return cells.map((cell, i) => {
    const w = widths[i] ?? 0;
    if (wrapColumns.has(i)) {
      return wrapPdfLines(cell ?? "", font, fontSize, Math.max(8, w - 2 * CELL_PAD));
    }
    return [fitLaporanCellText(cell ?? "", w, fontSize)];
  });
}

export function measureLaporanRowHeight(
  lineSets: string[][],
  fontSize: number,
  lineLeading: number,
  rowPadMm: number
): number {
  const maxLines = Math.max(1, ...lineSets.map((lines) => lines.length));
  const lineH = fontSize * lineLeading;
  const pad = rowPadMm * MM;
  const minH = Math.max(fontSize * 1.15 + pad, ROW_H * 0.72);
  return Math.max(minH, pad + maxLines * lineH);
}

export type LaporanTableRowOptions = {
  fontSize?: number;
  wrapColumns?: Set<number>;
  bold?: boolean;
  highlight?: boolean;
  thickTop?: boolean;
  thickBottom?: boolean;
  lineLeading?: number;
  rowPadMm?: number;
  rowHeightOverride?: number;
  cellStyleAt?: (colIndex: number) => CellPdfStyle | undefined;
  cellMerges?: Partial<Record<number, number>>;
  alignCenter?: Set<number>;
};

export function drawLaporanTableRow(
  page: PDFPage,
  metrics: LaporanTableMetrics,
  fonts: PdfFonts,
  cells: string[],
  widths: number[],
  alignRight: Set<number>,
  y: number,
  opts?: LaporanTableRowOptions
): number {
  const fontSize = opts?.fontSize ?? LAPORAN_DEFAULT_ROW_FONT_SIZE;
  const lineLeading = opts?.lineLeading ?? 1.35;
  const rowPadMm = opts?.rowPadMm ?? 2;
  const rowBold = opts?.bold ?? false;
  const wrapColumns = opts?.wrapColumns ?? new Set<number>();
  const measureFont = rowBold ? fonts.bold : fonts.regular;
  const cellMerges = opts?.cellMerges;
  const alignCenter = opts?.alignCenter ?? new Set<number>();
  const lineSets = laporanCellLineSets(cells, widths, measureFont, fontSize, wrapColumns, cellMerges);
  const naturalH = measureLaporanRowHeight(lineSets, fontSize, lineLeading, rowPadMm);
  const rowH = opts?.rowHeightOverride ?? naturalH;
  const lineH = fontSize * lineLeading;
  const maxLines = Math.max(1, ...lineSets.map((lines) => lines.length));
  const textBlockH = maxLines * lineH;
  const startY =
    opts?.rowHeightOverride != null
      ? y - (rowH - textBlockH) / 2 - fontSize
      : y - (rowPadMm * MM) / 2 - fontSize;
  const rowFill = opts?.highlight ? COLOR_TABLE_HEAD : undefined;

  const segments =
    cellMerges && Object.keys(cellMerges).length > 0
      ? buildRowSegments(cells, cellMerges)
      : cells.map((cell, i) => ({ startCol: i, span: 1, text: cell ?? "" }));

  let x = metrics.marginX;
  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si]!;
    const w = segmentWidth(widths, seg.startCol, seg.span);
    const cellStyle = opts?.cellStyleAt?.(seg.startCol);
    const fillColor = cellStyle?.fill ?? rowFill;
    const cellFont = cellStyle?.bold || rowBold ? fonts.bold : fonts.regular;
    const textColor = cellStyle?.text ?? COLOR_TEXT;

    page.drawRectangle({
      x,
      y: y - rowH,
      width: w,
      height: rowH,
      borderColor: COLOR_TABLE_BORDER,
      borderWidth: 0.5,
      color: fillColor,
    });

    const lines = lineSets[si] ?? [""];
    for (let li = 0; li < lines.length; li++) {
      const text = lines[li] ?? "";
      if (!text) continue;
      const textW = cellFont.widthOfTextAtSize(text, fontSize);
      const tx = alignCenter.has(seg.startCol)
        ? x + (w - textW) / 2
        : alignRight.has(seg.startCol)
          ? x + w - CELL_PAD - textW
          : x + CELL_PAD;
      page.drawText(text, {
        x: Math.max(x + CELL_PAD, tx),
        y: startY - li * lineH,
        size: fontSize,
        font: cellFont,
        color: textColor,
      });
    }
    x += w;
  }

  const tableLeft = metrics.marginX;
  const tableRight = metrics.marginX + widths.reduce((s, w) => s + w, 0);
  const rowBottom = y - rowH;
  if (opts?.thickTop) {
    page.drawLine({
      start: { x: tableLeft, y },
      end: { x: tableRight, y },
      thickness: 1.4,
      color: COLOR_TEXT,
    });
  }
  if (opts?.thickBottom) {
    page.drawLine({
      start: { x: tableLeft, y: rowBottom },
      end: { x: tableRight, y: rowBottom },
      thickness: 1.4,
      color: COLOR_TEXT,
    });
  }

  return rowBottom;
}

export function laporanGroupBandRowHeight(fontSize: number, rowPadMm: number): number {
  return Math.max(ROW_H, fontSize * 1.35 + rowPadMm * MM);
}

export function laporanSpacerRowHeight(rowPadMm: number): number {
  return Math.max(ROW_H * 0.55, rowPadMm * MM * 1.2);
}

export function drawLaporanGroupBandRow(
  page: PDFPage,
  metrics: LaporanTableMetrics,
  fonts: PdfFonts,
  label: string,
  widths: number[],
  y: number,
  fontSize: number,
  rowPadMm: number,
  rowHeightOverride?: number
): number {
  const rowH = rowHeightOverride ?? Math.max(ROW_H, fontSize * 1.35 + rowPadMm * MM);
  const totalW = widths.reduce((s, w) => s + w, 0);
  page.drawRectangle({
    x: metrics.marginX,
    y: y - rowH,
    width: totalW,
    height: rowH,
    borderColor: COLOR_TABLE_BORDER,
    borderWidth: 0.5,
    color: COLOR_TABLE_HEAD,
  });
  const text = fitLaporanCellText(label, totalW, fontSize);
  if (text) {
    page.drawText(text, {
      x: metrics.marginX + CELL_PAD,
      y: y - rowH + (rowH - fontSize) / 2,
      size: fontSize,
      font: fonts.bold,
      color: COLOR_TEXT,
    });
  }
  return y - rowH;
}

function headerColumnWidth(header: string, font: PdfFonts["bold"], fontSize: number): number {
  const text = pdfSafeText(header);
  return Math.ceil(font.widthOfTextAtSize(text, fontSize) + 2 * CELL_PAD);
}

export function resolveLaporanColumnWidths(
  metrics: LaporanTableMetrics,
  headers: string[],
  fractions: number[] | undefined,
  opts?: {
    compactColumns?: Set<number>;
    compactColumnExtraPt?: Record<number, number>;
    fixedColumnWidthsPt?: Record<number, number>;
    headerFontSize?: number;
    headerFont?: PdfFonts["bold"];
  }
): number[] {
  const compact = opts?.compactColumns;
  const fixed = opts?.fixedColumnWidthsPt;
  const headerFont = opts?.headerFont;
  const headerFontSize = opts?.headerFontSize ?? LAPORAN_DEFAULT_HEADER_FONT_SIZE;
  const hasFixed = fixed != null && Object.keys(fixed).length > 0;
  const hasCompact = (compact?.size ?? 0) > 0 && headerFont != null;

  if (hasFixed || hasCompact) {
    const widths = new Array<number>(headers.length).fill(0);
    let used = 0;
    for (let i = 0; i < headers.length; i++) {
      if (fixed?.[i] != null) {
        widths[i] = fixed[i]!;
        used += widths[i]!;
      } else if (compact?.has(i) && headerFont) {
        const extraPt = opts?.compactColumnExtraPt?.[i] ?? 0;
        widths[i] = headerColumnWidth(headers[i]!, headerFont, headerFontSize) + extraPt;
        used += widths[i]!;
      }
    }
    const flexIndices = headers
      .map((_, i) => i)
      .filter((i) => fixed?.[i] == null && !compact?.has(i));
    if (flexIndices.length === 0) return widths;
    const flexFractions = flexIndices.map((i) => fractions?.[i] ?? 1);
    const flexSum = flexFractions.reduce((a, b) => a + b, 0) || 1;
    const remain = Math.max(0, metrics.contentW - used);
    flexIndices.forEach((idx, fi) => {
      widths[idx] = (flexFractions[fi]! / flexSum) * remain;
    });
    return widths;
  }

  if (fractions && fractions.length === headers.length) {
    const sum = fractions.reduce((a, b) => a + b, 0) || 1;
    return fractions.map((f) => (f / sum) * metrics.contentW);
  }
  const w = metrics.contentW / headers.length;
  return headers.map(() => w);
}

/** Tambah lebar kolom tertentu; kolom lain disusutkan proporsional agar total tetap muat. */
export function applyColumnWidthExtraPt(
  widths: number[],
  extra: Record<number, number> | undefined,
  contentW: number
): number[] {
  if (!extra || Object.keys(extra).length === 0) return widths;

  const result = [...widths];
  let totalExtra = 0;
  for (const [idx, pt] of Object.entries(extra)) {
    const i = Number(idx);
    if (i >= 0 && i < result.length && pt > 0) {
      result[i]! += pt;
      totalExtra += pt;
    }
  }
  if (totalExtra <= 0) return result;

  const shrinkIndices = result.map((_, i) => i).filter((i) => !(extra[i]! > 0));
  const shrinkSum = shrinkIndices.reduce((sum, i) => sum + result[i]!, 0);
  if (shrinkSum <= 0) return result;

  for (const i of shrinkIndices) {
    result[i]! -= (result[i]! / shrinkSum) * totalExtra;
  }

  const sum = result.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - contentW) > 0.5 && sum > 0) {
    const scale = contentW / sum;
    return result.map((w) => w * scale);
  }
  return result;
}
