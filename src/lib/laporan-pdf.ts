import { PDFDocument, type PDFPage } from "pdf-lib";
import type { DesaAdat } from "./types";
import {
  COLOR_TEXT,
  createPdfFonts,
  MM,
  type PdfFonts,
} from "./pdf-common";
import { createTableFonts } from "./pdf-table-fonts";
import {
  computeLaporanSignatureAnchorY,
  drawLaporanContinuationHeader,
  drawLaporanJudulBlock,
  drawLaporanKop,
  drawLaporanMetaLines,
  drawLaporanSignatures,
  laporanSignatureBlockHeight,
  laporanText,
  LAPORAN_CONT_HEADER_MM,
  LAPORAN_SUMMARY_LINE_H,
  loadDesaLogo,
  resolveKetuaTimNama,
  resolveLaporanPageLayout,
  type LaporanPageLayout,
  type LaporanPageSize,
} from "./pdf-laporan-layout";
import {
  createLaporanTableMetrics,
  applyColumnWidthExtraPt,
  drawLaporanGroupBandRow,
  drawLaporanTableHeader,
  drawLaporanTableRow,
  LAPORAN_DEFAULT_HEADER_FONT_SIZE,
  LAPORAN_DEFAULT_ROW_FONT_SIZE,
  LAPORAN_MIN_HEADER_ROW_H,
  laporanCellLineSets,
  laporanGroupBandRowHeight,
  laporanSpacerRowHeight,
  measureLaporanRowHeight,
  resolveLaporanColumnWidths,
  statusCellStyle,
} from "./pdf-laporan-table";

export type { LaporanPageSize };

/** Rasio minimum isi halaman terakhir (0–1) agar baris diregangkan memenuhi tinggi kertas. */
const FILL_PAGE_MIN_RATIO = 0.55;
const ROW_FONT_SIZE = LAPORAN_DEFAULT_ROW_FONT_SIZE;
const HEADER_FONT_SIZE = LAPORAN_DEFAULT_HEADER_FONT_SIZE;

export type LaporanPdfInput = {
  filename: string;
  judul: string;
  /** Sub judul di bawah judul utama (opsional). */
  subjudul?: string;
  /** Sub judul kapital (default mengikuti `uppercase`). */
  subjudulUppercase?: boolean;
  periode: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
  /** Baris ringkasan di atas tabel (opsional). */
  summaryLines?: string[];
  /** Baris meta kiri di atas tabel — kapital tebal (menggantikan ringkasan). */
  metaLines?: string[];
  /** Indeks kolom Status untuk pewarnaan sel. */
  statusColumnIndex?: number;
  /** Kunci status per baris (sejajar `rows`) untuk `statusColumnIndex`. */
  rowStatusKeys?: (string | undefined)[];
  /** Lebar relatif kolom (default merata). */
  columnFractions?: number[];
  /** Kolom dipadatkan selebar teks judul header (+ padding). */
  compactColumns?: number[];
  /** Tambahan lebar (pt) per indeks kolom padat. */
  compactColumnExtraPt?: Record<number, number>;
  /** Tambahan lebar (pt) per indeks kolom (kolom lain disusutkan proporsional). */
  columnWidthExtraPt?: Record<number, number>;
  /** Lebar tetap (pt) per indeks kolom. */
  fixedColumnWidthsPt?: Record<number, number>;
  /** Rata kanan per indeks kolom. */
  alignRight?: number[];
  /** Rata tengah per indeks kolom (header + isi baris). */
  alignCenter?: number[];
  /** Indeks kolom yang teksnya dibungkus ke baris berikutnya. */
  wrapColumns?: number[];
  /** Indeks kolom yang judul header-nya dibungkus ke baris berikutnya. */
  wrapHeaderColumns?: number[];
  /** Indeks baris (0-based) yang dicetak tebal. */
  boldRows?: number[];
  /** Indeks baris (0-based) dengan latar abu-abu (subtotal). */
  highlightRows?: number[];
  /** Indeks baris (0-based) dengan garis bawah tebal setelah baris. */
  thickBorderAfterRows?: number[];
  /** Indeks baris (0-based) dengan garis atas tebal sebelum baris. */
  thickBorderBeforeRows?: number[];
  /** Baris pita lebar penuh (indeks → label grup). */
  groupBandRows?: Record<number, string>;
  /** Ukuran font pita grup per baris (pt). */
  groupBandFontSize?: Record<number, number>;
  /** Baris kosong (jeda) tanpa border tabel. */
  spacerRows?: number[];
  /** Gabung sel per baris: indeks baris → kolom awal → lebar gabungan (jumlah kolom). */
  rowCellMerges?: Record<number, Partial<Record<number, number>>>;
  /** Rata tengah per baris: indeks baris → daftar indeks kolom. */
  rowAlignCenter?: Record<number, number[]>;
  /** Regangkan baris halaman terakhir jika isinya sudah cukup penuh (≥55% ruang tersedia). */
  fillPageVertically?: boolean;
  /** Ukuran font isi tabel (pt). */
  rowFontSize?: number;
  /** Ukuran font header tabel (pt). */
  headerFontSize?: number;
  /** Ruang bawah minimum saat mengisi tabel (mm dari bawah halaman). Default 5. */
  tableBottomMarginMm?: number;
  /** Jarak antarbaris teks dalam sel (× fontSize). Default 1.35. */
  rowLineLeading?: number;
  /** Padding vertikal sel (mm). Default 2. */
  rowPadMm?: number;
  /** Tinggi header lanjutan halaman 2+ (mm). Default 8. */
  continuationHeaderMm?: number;
  /** Font baris ringkasan di atas tabel (pt). Default 7.5. */
  summaryFontSize?: number;
  /** Font baris meta di atas tabel (pt). Default 8.5. */
  metaFontSize?: number;
  /** Font blok tanda tangan (pt). Default 8.5. */
  signatureFontSize?: number;
  /** Orientasi halaman. Default portrait. */
  orientation?: "portrait" | "landscape";
  /** Ukuran kertas. Default A4. F4 = 210×330 mm (portrait). */
  pageSize?: LaporanPageSize;
  /** Semua teks laporan dicetak kapital. */
  uppercase?: boolean;
  /** Font isi tabel. Default Barlow Condensed. */
  tableFont?: "barlow-condensed" | "helvetica";
  /** Tabel tambahan setelah tabel utama (mis. rekap terpisah dari rincian). */
  extraTables?: LaporanPdfTableBlock[];
  /** Jarak vertikal sebelum setiap tabel tambahan (mm). Default 4. */
  extraTableGapMm?: number;
  /** Ukuran font judul section di atas tabel tambahan (pt). Default rowFontSize + 0.5. */
  sectionTitleFontSize?: number;
};

/** Blok tabel lanjutan (header + baris) dengan opsi gaya per tabel. */
export type LaporanPdfTableBlock = {
  /** Judul section di atas tabel (opsional). */
  sectionTitle?: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
  columnFractions?: number[];
  compactColumns?: number[];
  compactColumnExtraPt?: Record<number, number>;
  columnWidthExtraPt?: Record<number, number>;
  fixedColumnWidthsPt?: Record<number, number>;
  alignRight?: number[];
  alignCenter?: number[];
  wrapColumns?: number[];
  wrapHeaderColumns?: number[];
  boldRows?: number[];
  highlightRows?: number[];
  thickBorderAfterRows?: number[];
  thickBorderBeforeRows?: number[];
  groupBandRows?: Record<number, string>;
  groupBandFontSize?: Record<number, number>;
  spacerRows?: number[];
  rowCellMerges?: Record<number, Partial<Record<number, number>>>;
  rowAlignCenter?: Record<number, number[]>;
  statusColumnIndex?: number;
  rowStatusKeys?: (string | undefined)[];
  rowFontSize?: number;
  headerFontSize?: number;
};

function cellText(
  value: string | number | null | undefined,
  uppercase = false
): string {
  if (value == null || value === "") return "";
  return laporanText(String(value), uppercase);
}

function drawFirstPageHeader(
  page: PDFPage,
  pageLayout: LaporanPageLayout,
  bodyFonts: PdfFonts,
  desa: DesaAdat | null,
  logo: Awaited<ReturnType<typeof loadDesaLogo>>,
  input: LaporanPdfInput,
  uppercase: boolean,
  summaryFontSize: number,
  metaFontSize: number
): number {
  let y = pageLayout.pageH - pageLayout.marginY;

  y = drawLaporanKop(page, pageLayout, desa, bodyFonts, logo, y);
  y = drawLaporanJudulBlock(
    page,
    pageLayout,
    bodyFonts,
    input.judul,
    input.periode,
    y,
    input.subjudul,
    uppercase,
    input.subjudulUppercase
  );

  if (input.metaLines?.length) {
    y = drawLaporanMetaLines(page, pageLayout, bodyFonts, input.metaLines, y, metaFontSize);
  } else if (input.summaryLines?.length) {
    const summaryLineH = (summaryFontSize / 7.5) * LAPORAN_SUMMARY_LINE_H;
    for (const line of input.summaryLines) {
      page.drawText(laporanText(line, uppercase), {
        x: pageLayout.marginX,
        y: y - 3.5 * MM,
        size: summaryFontSize,
        font: bodyFonts.regular,
        color: COLOR_TEXT,
      });
      y -= summaryLineH;
    }
    y -= 2 * MM;
  }

  return y;
}

function startContinuationPage(
  page: PDFPage,
  pageLayout: LaporanPageLayout,
  bodyFonts: PdfFonts,
  judul: string,
  pageNum: number,
  continuationHeaderMm: number,
  uppercase: boolean
): number {
  return drawLaporanContinuationHeader(
    page,
    pageLayout,
    bodyFonts,
    judul,
    pageNum,
    pageLayout.pageH - pageLayout.marginY,
    continuationHeaderMm,
    uppercase
  );
}

type LaporanTableRenderCtx = {
  pdf: PDFDocument;
  pages: PDFPage[];
  page: PDFPage;
  pageNum: number;
  y: number;
  pageLayout: LaporanPageLayout;
  tableMetrics: ReturnType<typeof createLaporanTableMetrics>;
  bodyFonts: PdfFonts;
  tableFonts: PdfFonts;
  judul: string;
  uppercase: boolean;
  continuationHeaderMm: number;
  minY: number;
  rowLineLeading: number;
  rowPadMm: number;
  addPage: () => PDFPage;
};

function renderLaporanTableBlock(
  ctx: LaporanTableRenderCtx,
  block: LaporanPdfTableBlock,
  defaultRowFontSize: number,
  defaultHeaderFontSize: number,
  stretchByIndex?: Map<number, number>
): void {
  const rowFontSize = block.rowFontSize ?? defaultRowFontSize;
  const headerFontSize = block.headerFontSize ?? defaultHeaderFontSize;
  const alignRight = new Set(block.alignRight ?? []);
  const alignCenter = new Set(block.alignCenter ?? []);
  const wrapColumns = new Set(block.wrapColumns ?? []);
  const wrapHeaderColumns = new Set(block.wrapHeaderColumns ?? []);
  const boldRows = new Set(block.boldRows ?? []);
  const highlightRows = new Set(block.highlightRows ?? block.boldRows ?? []);
  const thickBorderAfterRows = new Set(block.thickBorderAfterRows ?? []);
  const thickBorderBeforeRows = new Set(block.thickBorderBeforeRows ?? []);
  const spacerRows = new Set(block.spacerRows ?? []);
  const statusColumnIndex = block.statusColumnIndex;
  const rowStatusKeys = block.rowStatusKeys;

  const headers = ctx.uppercase
    ? block.headers.map((h) => laporanText(h, true))
    : block.headers;

  const widths = applyColumnWidthExtraPt(
    resolveLaporanColumnWidths(ctx.tableMetrics, headers, block.columnFractions, {
      compactColumns: block.compactColumns?.length
        ? new Set(block.compactColumns)
        : undefined,
      compactColumnExtraPt: block.compactColumnExtraPt,
      fixedColumnWidthsPt: block.fixedColumnWidthsPt,
      headerFontSize,
      headerFont: ctx.tableFonts.bold,
    }),
    block.columnWidthExtraPt,
    ctx.tableMetrics.contentW
  );

  const rows = block.rows.map((r) =>
    block.headers.map((_, i) => cellText(r[i], ctx.uppercase))
  );

  let { page, y, pageNum } = ctx;

  const newPageWithHeader = () => {
    pageNum += 1;
    page = ctx.addPage();
    y = drawLaporanContinuationHeader(
      page,
      ctx.pageLayout,
      ctx.bodyFonts,
      ctx.judul,
      pageNum,
      ctx.pageLayout.pageH - ctx.pageLayout.marginY,
      ctx.continuationHeaderMm,
      ctx.uppercase
    );
  };

  const redrawTableHeader = (targetPage: PDFPage, startY: number) =>
    drawLaporanTableHeader(
      targetPage,
      ctx.tableMetrics,
      ctx.tableFonts,
      headers,
      widths,
      startY,
      headerFontSize,
      wrapHeaderColumns,
      alignCenter
    );

  if (block.sectionTitle) {
    const titleSize = rowFontSize + 0.5;
    const titleH = titleSize + 2 * MM;
    if (y - titleH < ctx.minY) {
      newPageWithHeader();
    }
    page.drawText(laporanText(block.sectionTitle, ctx.uppercase), {
      x: ctx.pageLayout.marginX,
      y: y - titleSize,
      size: titleSize,
      font: ctx.tableFonts.bold,
      color: COLOR_TEXT,
    });
    y -= titleH;
  }

  if (y - LAPORAN_MIN_HEADER_ROW_H < ctx.minY) {
    newPageWithHeader();
  }

  y = redrawTableHeader(page, y);

  for (let r = 0; r < rows.length; r++) {
    const rowHeightOverride = stretchByIndex?.get(r);
    if (spacerRows.has(r)) {
      const plannedH = laporanSpacerRowHeight(ctx.rowPadMm);
      if (y - plannedH < ctx.minY) {
        newPageWithHeader();
        y = redrawTableHeader(page, y);
      }
      y -= rowHeightOverride ?? plannedH;
      continue;
    }
    const bandLabel = block.groupBandRows?.[r];
    if (bandLabel != null) {
      const bandFontSize = block.groupBandFontSize?.[r] ?? rowFontSize;
      const plannedH = laporanGroupBandRowHeight(bandFontSize, ctx.rowPadMm);
      const bandH = rowHeightOverride ?? plannedH;
      if (y - plannedH < ctx.minY) {
        newPageWithHeader();
        y = redrawTableHeader(page, y);
      }
      y = drawLaporanGroupBandRow(
        page,
        ctx.tableMetrics,
        ctx.tableFonts,
        laporanText(bandLabel, ctx.uppercase),
        widths,
        y,
        bandFontSize,
        ctx.rowPadMm,
        bandH
      );
      continue;
    }

    const rowCells = rows[r]!;
    const rowCenterCols = new Set([...alignCenter, ...(block.rowAlignCenter?.[r] ?? [])]);
    const measureFont = boldRows.has(r) ? ctx.tableFonts.bold : ctx.tableFonts.regular;
    const lineSets = laporanCellLineSets(
      rowCells,
      widths,
      measureFont,
      rowFontSize,
      wrapColumns,
      block.rowCellMerges?.[r]
    );
    const plannedH = measureLaporanRowHeight(
      lineSets,
      rowFontSize,
      ctx.rowLineLeading,
      ctx.rowPadMm
    );
    if (y - plannedH < ctx.minY) {
      newPageWithHeader();
      y = redrawTableHeader(page, y);
    }
    y = drawLaporanTableRow(page, ctx.tableMetrics, ctx.tableFonts, rowCells, widths, alignRight, y, {
      fontSize: rowFontSize,
      wrapColumns,
      bold: boldRows.has(r),
      highlight: highlightRows.has(r),
      thickTop: thickBorderBeforeRows.has(r),
      thickBottom: thickBorderAfterRows.has(r),
      lineLeading: ctx.rowLineLeading,
      rowPadMm: ctx.rowPadMm,
      rowHeightOverride,
      cellMerges: block.rowCellMerges?.[r],
      alignCenter: rowCenterCols,
      cellStyleAt:
        statusColumnIndex != null
          ? (col) =>
              col === statusColumnIndex
                ? statusCellStyle(rowStatusKeys?.[r])
                : undefined
          : undefined,
    });
  }

  ctx.page = page;
  ctx.pageNum = pageNum;
  ctx.y = y;
}

export async function generateLaporanPdfBytes(
  desa: DesaAdat | null,
  input: LaporanPdfInput
): Promise<Uint8Array | null> {
  if (input.headers.length === 0) return null;

  const ketuaTimNama = await resolveKetuaTimNama();
  const pdf = await PDFDocument.create();
  const bodyFonts = await createPdfFonts(pdf);
  const uppercase = input.uppercase ?? false;
  const tableFonts =
    input.tableFont === "helvetica" ? bodyFonts : await createTableFonts(pdf);
  const logo = await loadDesaLogo(pdf, desa);

  const alignRight = new Set(input.alignRight ?? []);
  const alignCenter = new Set(input.alignCenter ?? []);
  const wrapColumns = new Set(input.wrapColumns ?? []);
  const wrapHeaderColumns = new Set(input.wrapHeaderColumns ?? []);
  const boldRows = new Set(input.boldRows ?? []);
  const highlightRows = new Set(input.highlightRows ?? input.boldRows ?? []);
  const thickBorderAfterRows = new Set(input.thickBorderAfterRows ?? []);
  const thickBorderBeforeRows = new Set(input.thickBorderBeforeRows ?? []);
  const spacerRows = new Set(input.spacerRows ?? []);
  const rowFontSize = input.rowFontSize ?? ROW_FONT_SIZE;
  const headerFontSize = input.headerFontSize ?? HEADER_FONT_SIZE;
  const tableBottomMargin = (input.tableBottomMarginMm ?? 5) * MM;
  const rowLineLeading = input.rowLineLeading ?? 1.35;
  const rowPadMm = input.rowPadMm ?? 2;
  const continuationHeaderMm = input.continuationHeaderMm ?? LAPORAN_CONT_HEADER_MM;
  const summaryFontSize = input.summaryFontSize ?? 7.5;
  const metaFontSize = input.metaFontSize ?? 8.5;
  const signatureFontSize = input.signatureFontSize ?? 8.5;
  const statusColumnIndex = input.statusColumnIndex;
  const rowStatusKeys = input.rowStatusKeys;
  const headers = uppercase
    ? input.headers.map((h) => laporanText(h, true))
    : input.headers;

  const pageLayout = resolveLaporanPageLayout({
    orientation: input.orientation,
    pageSize: input.pageSize,
  });
  const tableMetrics = createLaporanTableMetrics(pageLayout.contentW);

  const widths = applyColumnWidthExtraPt(
    resolveLaporanColumnWidths(tableMetrics, headers, input.columnFractions, {
      compactColumns: input.compactColumns?.length
        ? new Set(input.compactColumns)
        : undefined,
      compactColumnExtraPt: input.compactColumnExtraPt,
      fixedColumnWidthsPt: input.fixedColumnWidthsPt,
      headerFontSize,
      headerFont: tableFonts.bold,
    }),
    input.columnWidthExtraPt,
    tableMetrics.contentW
  );
  const rows = input.rows.map((r) => input.headers.map((_, i) => cellText(r[i], uppercase)));

  const pages: PDFPage[] = [];
  let pageNum = 1;

  const addPage = (): PDFPage => {
    const p = pdf.addPage([pageLayout.pageW, pageLayout.pageH]);
    pages.push(p);
    return p;
  };

  let page = addPage();
  let y = drawFirstPageHeader(page, pageLayout, bodyFonts, desa, logo, input, uppercase, summaryFontSize, metaFontSize);

  y = drawLaporanTableHeader(
    page,
    tableMetrics,
    tableFonts,
    headers,
    widths,
    y,
    headerFontSize,
    wrapHeaderColumns,
    alignCenter
  );

  const fillPageRequested = input.fillPageVertically ?? false;
  const signatureAnchorY = computeLaporanSignatureAnchorY(pageLayout, signatureFontSize);
  const signatureReserve = laporanSignatureBlockHeight(signatureFontSize);
  const stretchByIndex = new Map<number, number>();
  let stretchLastPage = false;
  const tableEndMinY = pageLayout.marginY + tableBottomMargin;
  const minY = tableEndMinY;

  if (fillPageRequested) {
    const plannedHeights: number[] = [];
    for (let r = 0; r < rows.length; r++) {
      if (spacerRows.has(r)) {
        plannedHeights[r] = laporanSpacerRowHeight(rowPadMm);
        continue;
      }
      const bandLabel = input.groupBandRows?.[r];
      if (bandLabel != null) {
        const bandFontSize = input.groupBandFontSize?.[r] ?? rowFontSize;
        plannedHeights[r] = laporanGroupBandRowHeight(bandFontSize, rowPadMm);
      } else {
        const rowCells = rows[r]!;
        const measureFont = boldRows.has(r) ? tableFonts.bold : tableFonts.regular;
        const lineSets = laporanCellLineSets(
          rowCells,
          widths,
          measureFont,
          rowFontSize,
          wrapColumns,
          input.rowCellMerges?.[r]
        );
        plannedHeights[r] = measureLaporanRowHeight(
          lineSets,
          rowFontSize,
          rowLineLeading,
          rowPadMm
        );
      }
    }

    let simY = y;
    let lastPageStartY = simY;
    let lastPageRowIdxs: number[] = [];
    const contHeaderPt = continuationHeaderMm * MM;
    for (let r = 0; r < rows.length; r++) {
      const h = plannedHeights[r]!;
      if (simY - h < tableEndMinY) {
        simY = pageLayout.pageH - pageLayout.marginY - contHeaderPt - LAPORAN_MIN_HEADER_ROW_H;
        lastPageStartY = simY;
        lastPageRowIdxs = [];
      }
      lastPageRowIdxs.push(r);
      simY -= h;
    }

    const totalLastH = lastPageRowIdxs.reduce((s, idx) => s + plannedHeights[idx]!, 0);
    const available = lastPageStartY - signatureAnchorY;
    const fillRatio = available > 0 ? totalLastH / available : 0;
    if (
      available > totalLastH &&
      lastPageRowIdxs.length > 0 &&
      fillRatio >= FILL_PAGE_MIN_RATIO
    ) {
      stretchLastPage = true;
      const scale = available / totalLastH;
      for (const idx of lastPageRowIdxs) {
        stretchByIndex.set(idx, plannedHeights[idx]! * scale);
      }
    }
  }

  const redrawTableHeader = (targetPage: PDFPage, startY: number) =>
    drawLaporanTableHeader(
      targetPage,
      tableMetrics,
      tableFonts,
      headers,
      widths,
      startY,
      headerFontSize,
      wrapHeaderColumns,
      alignCenter
    );

  for (let r = 0; r < rows.length; r++) {
    const rowHeightOverride = stretchByIndex.get(r);
    if (spacerRows.has(r)) {
      const plannedH = laporanSpacerRowHeight(rowPadMm);
      if (y - plannedH < minY) {
        pageNum += 1;
        page = addPage();
        y = startContinuationPage(
          page,
          pageLayout,
          bodyFonts,
          input.judul,
          pageNum,
          continuationHeaderMm,
          uppercase
        );
        y = redrawTableHeader(page, y);
      }
      y -= rowHeightOverride ?? plannedH;
      continue;
    }
    const bandLabel = input.groupBandRows?.[r];
    if (bandLabel != null) {
      const bandFontSize = input.groupBandFontSize?.[r] ?? rowFontSize;
      const plannedH = laporanGroupBandRowHeight(bandFontSize, rowPadMm);
      const bandH = rowHeightOverride ?? plannedH;
      if (y - plannedH < minY) {
        pageNum += 1;
        page = addPage();
        y = startContinuationPage(
          page,
          pageLayout,
          bodyFonts,
          input.judul,
          pageNum,
          continuationHeaderMm,
          uppercase
        );
        y = redrawTableHeader(page, y);
      }
      y = drawLaporanGroupBandRow(
        page,
        tableMetrics,
        tableFonts,
        laporanText(bandLabel, uppercase),
        widths,
        y,
        bandFontSize,
        rowPadMm,
        bandH
      );
      continue;
    }

    const rowCells = rows[r]!;
    const rowCenterCols = new Set([...alignCenter, ...(input.rowAlignCenter?.[r] ?? [])]);
    const measureFont = boldRows.has(r) ? tableFonts.bold : tableFonts.regular;
    const lineSets = laporanCellLineSets(
      rowCells,
      widths,
      measureFont,
      rowFontSize,
      wrapColumns,
      input.rowCellMerges?.[r]
    );
    const plannedH = measureLaporanRowHeight(lineSets, rowFontSize, rowLineLeading, rowPadMm);
    if (y - plannedH < minY) {
      pageNum += 1;
      page = addPage();
      y = startContinuationPage(
        page,
        pageLayout,
        bodyFonts,
        input.judul,
        pageNum,
        continuationHeaderMm,
        uppercase
      );
      y = redrawTableHeader(page, y);
    }
    y = drawLaporanTableRow(page, tableMetrics, tableFonts, rowCells, widths, alignRight, y, {
      fontSize: rowFontSize,
      wrapColumns,
      bold: boldRows.has(r),
      highlight: highlightRows.has(r),
      thickTop: thickBorderBeforeRows.has(r),
      thickBottom: thickBorderAfterRows.has(r),
      lineLeading: rowLineLeading,
      rowPadMm,
      rowHeightOverride,
      cellMerges: input.rowCellMerges?.[r],
      alignCenter: rowCenterCols,
      cellStyleAt:
        statusColumnIndex != null
          ? (col) =>
              col === statusColumnIndex
                ? statusCellStyle(rowStatusKeys?.[r])
                : undefined
          : undefined,
    });
  }

  const extraGapMm = (input.extraTableGapMm ?? 4) * MM;
  if (input.extraTables?.length) {
    const tableRenderCtx: LaporanTableRenderCtx = {
      pdf,
      pages,
      page,
      pageNum,
      y,
      pageLayout,
      tableMetrics,
      bodyFonts,
      tableFonts,
      judul: input.judul,
      uppercase,
      continuationHeaderMm,
      minY,
      rowLineLeading,
      rowPadMm,
      addPage,
    };
    for (const extra of input.extraTables) {
      tableRenderCtx.y -= extraGapMm;
      renderLaporanTableBlock(tableRenderCtx, extra, rowFontSize, headerFontSize);
      page = tableRenderCtx.page;
      pageNum = tableRenderCtx.pageNum;
      y = tableRenderCtx.y;
    }
  }

  const lastPage = pages[pages.length - 1]!;
  if (stretchLastPage) {
    drawLaporanSignatures(
      lastPage,
      pageLayout,
      bodyFonts,
      desa,
      ketuaTimNama,
      signatureAnchorY,
      signatureFontSize,
      uppercase
    );
  } else if (y < pageLayout.marginY + signatureReserve) {
    pageNum += 1;
    page = addPage();
    y = startContinuationPage(
      page,
      pageLayout,
      bodyFonts,
      input.judul,
      pageNum,
      continuationHeaderMm,
      uppercase
    );
    drawLaporanSignatures(page, pageLayout, bodyFonts, desa, ketuaTimNama, y, signatureFontSize, uppercase);
  } else {
    drawLaporanSignatures(
      lastPage,
      pageLayout,
      bodyFonts,
      desa,
      ketuaTimNama,
      y,
      signatureFontSize,
      uppercase
    );
  }

  return pdf.save();
}

/** Muat profil desa lalu buat byte PDF laporan tabel (A4 portrait). */
export async function buildLaporanPdfBytes(input: LaporanPdfInput): Promise<Uint8Array | null> {
  const { getDesaAdat } = await import("./services/desa");
  const desa = await getDesaAdat();
  return generateLaporanPdfBytes(desa, input);
}
