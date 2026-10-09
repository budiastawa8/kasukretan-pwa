import { PDFDocument, rgb, type PDFPage } from "pdf-lib";
import type { DudukanTunggakanBulan, DudukanTunggakanLaporanRow } from "./services/dudukan";
import {
  bulanSaatIni,
  formatBulanIndonesiaSingkat,
  formatTunggakanPeriodeRingkas,
  tahunSaatIni,
  type PeriodeBulanTahun,
} from "./dudukan-hitung";
import {
  DEFAULT_TUNGGAKAN_DUDUKAN_PDF_OPTIONS,
  type TunggakanDudukanPageSize,
  type TunggakanDudukanPdfOptions,
} from "./tunggakan-dudukan-pdf-options";
import {
  COLOR_TEXT,
  createPdfFonts,
  ilikitaUpper,
  MM,
  type PdfFonts,
} from "./pdf-common";
import {
  drawGridTableDataRow,
  drawGridTableHeader,
  measureGridDataRowHeight,
  type GridTableColDef,
} from "./pdf-grid-table";

const INCH = 72;
const CELL_PAD = 1.2 * MM;
const TITLE_GAP_PT = 6;
const SUBTITLE_GAP = 4 * MM;
const SECTION_GAP = 4 * MM;
const GROUP_LABEL_GAP = 2 * MM;
const HEADER_LINE_THICK = 1.8;
const FOOTER_GAP = 3 * MM;

const COLOR_BADGE_BG = rgb(0.42, 0.42, 0.42);
const COLOR_BADGE_TEXT = rgb(1, 1, 1);

type ColKey = "no" | "pengajeg" | "alamat" | "bln" | "jumlah" | "dariBln" | "periode";

type ColDef = GridTableColDef & { key: ColKey };

const ROW_PAD = 1.2 * MM;
const PAGE_NUM_SIZE = 9;
const PAGE_NUM_RESERVE = 14;

/** Kolom tabel tetap: No, Pengajeg, Alamat, Bln, Jumlah, Periode. */
const VISIBLE_TABLE_COLS: ColKey[] = ["no", "pengajeg", "alamat", "bln", "jumlah", "periode"];

const COL_DEFS: ColDef[] = [
  { key: "no", header: "NO", fraction: 0.28, align: "center", uppercase: true, shrink: false, wrap: false },
  { key: "pengajeg", header: "PENGAJEG", fraction: 1.45, align: "left", uppercase: true, shrink: false, wrap: true },
  { key: "alamat", header: "ALAMAT", fraction: 1.62, align: "left", uppercase: true, shrink: false, wrap: true },
  { key: "bln", header: "BLN", fraction: 0.38, align: "center", uppercase: true, shrink: false, wrap: false },
  { key: "jumlah", header: "JUMLAH", fraction: 0.75, align: "right", uppercase: false, shrink: false, wrap: false },
  { key: "periode", header: "PERIODE", fraction: 0.78, align: "center", uppercase: true, shrink: false, wrap: false },
];

export type TunggakanDudukanPdfLine = {
  no: number;
  pengajeg: string;
  alamat: string;
  bln: number;
  jumlah: number;
  dariBulan: string;
  periode: string;
};

export type TunggakanDudukanRtGroup = {
  rtBtn: string;
  lines: TunggakanDudukanPdfLine[];
};

export type TunggakanDudukanPdfPayload = {
  filename: string;
  banjarNama: string;
  sdLabel: string;
  groups: TunggakanDudukanRtGroup[];
  options: TunggakanDudukanPdfOptions;
};

type PdfLayout = {
  pageW: number;
  pageH: number;
  marginX: number;
  marginY: number;
  contentW: number;
  titleSize: number;
  subtitleSize: number;
  badgeSize: number;
  groupLabelSize: number;
  tableHeaderSize: number;
  tableRowSize: number;
  tableRowMinSize: number;
  rowH: number;
  headerRowH: number;
  columns: ColDef[];
  options: TunggakanDudukanPdfOptions;
};

type PageCtx = {
  pdf: PDFDocument;
  page: PDFPage;
  y: number;
  bodyFonts: PdfFonts;
  tableFonts: PdfFonts;
  layout: PdfLayout;
  docHeaderDrawn: boolean;
};

function pdfCaps(text: string): string {
  return ilikitaUpper(text);
}

function pageDimensions(pageSize: TunggakanDudukanPageSize): { w: number; h: number } {
  switch (pageSize) {
    case "8x13":
      return { w: 8 * INCH, h: 13 * INCH };
    case "F4":
      return { w: 210 * MM, h: 330 * MM };
    case "A4":
    default:
      return { w: 210 * MM, h: 297 * MM };
  }
}

function resolveLayout(options: TunggakanDudukanPdfOptions): PdfLayout {
  const { w, h } = pageDimensions(options.pageSize);
  const marginX = 10 * MM;
  const marginY = 10 * MM;
  const tablePt = options.tablePt;
  const columns = COL_DEFS.filter((c) => VISIBLE_TABLE_COLS.includes(c.key));

  return {
    pageW: w,
    pageH: h,
    marginX,
    marginY,
    contentW: w - 2 * marginX,
    titleSize: options.titlePt,
    subtitleSize: options.subtitlePt,
    badgeSize: Math.max(6, options.subtitlePt - 1),
    groupLabelSize: options.subtitlePt,
    tableHeaderSize: tablePt,
    tableRowSize: tablePt,
    tableRowMinSize: Math.max(6, tablePt - 2),
    rowH: Math.max(4.5 * MM, tablePt * 0.68 * MM),
    headerRowH: Math.max(4.8 * MM, tablePt * 0.72 * MM),
    columns,
    options,
  };
}

function periodeUrutKey(p: PeriodeBulanTahun): number {
  return p.tahun * 100 + p.bulan;
}

function formatDariBulan(bulan: DudukanTunggakanBulan[]): string {
  if (!bulan.length) return "—";
  const sorted = [...bulan].sort((a, b) => periodeUrutKey(a) - periodeUrutKey(b));
  const first = sorted[0]!;
  return formatBulanIndonesiaSingkat(first.bulan, first.tahun);
}

function formatPeriodePdf(periodes: PeriodeBulanTahun[]): string {
  const ringkas = formatTunggakanPeriodeRingkas(periodes);
  return ringkas.replace(/ s\/d /g, " – ");
}

function formatPengajegPdf(row: DudukanTunggakanLaporanRow): string {
  const nama = row.kepala_nama?.trim() || "—";
  const nomor = row.nomor_kartu?.trim();
  if (!nomor) return nama;
  return `${nama}\n${nomor}`;
}

function formatAlamatPdf(row: DudukanTunggakanLaporanRow): string {
  const alamat = row.alamat?.trim() || "—";
  const jenis = row.jenis_nama?.trim();
  if (!jenis || jenis === "—") return alamat;
  return `${alamat}\n(${jenis})`;
}

function resolveBanjarNama(rows: DudukanTunggakanLaporanRow[]): string {
  const names = [...new Set(rows.map((r) => r.banjar_nama?.trim() || "—"))];
  if (names.length === 1) return names[0]!;
  return "SEMUA BANJAR";
}

function groupByKey<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return map;
}

export function buildRtBtnGroups(rows: DudukanTunggakanLaporanRow[]): TunggakanDudukanRtGroup[] {
  const byRt = groupByKey(rows, (r) => r.rt_btn?.trim() || "—");
  return [...byRt.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "id"))
    .map(([rtBtn, groupRows]) => {
      const sorted = [...groupRows].sort((a, b) => {
        const alamat = (a.alamat ?? "").localeCompare(b.alamat ?? "", "id", { sensitivity: "base" });
        if (alamat !== 0) return alamat;
        return (a.kepala_nama ?? "").localeCompare(b.kepala_nama ?? "", "id");
      });
      return {
        rtBtn,
        lines: sorted.map((r, idx) => ({
          no: idx + 1,
          pengajeg: formatPengajegPdf(r),
          alamat: formatAlamatPdf(r),
          bln: Math.max(0, Math.round(Number(r.tunggakan_bulan) || r.bulan_tunggakan.length)),
          jumlah: Math.round(Number(r.total_sisa) || 0),
          dariBulan: formatDariBulan(r.bulan_tunggakan),
          periode: formatPeriodePdf(r.bulan_tunggakan),
        })),
      };
    });
}

export function buildTunggakanDudukanPdfPayload(
  rows: DudukanTunggakanLaporanRow[]
): TunggakanDudukanPdfPayload {
  return {
    filename: "tunggakan-dudukan",
    banjarNama: resolveBanjarNama(rows),
    sdLabel: formatBulanIndonesiaSingkat(bulanSaatIni(), tahunSaatIni()),
    groups: buildRtBtnGroups(rows),
    options: { ...DEFAULT_TUNGGAKAN_DUDUKAN_PDF_OPTIONS },
  };
}

function gridTableLayout(layout: PdfLayout) {
  return {
    marginX: layout.marginX,
    contentW: layout.contentW,
    columns: layout.columns,
    headerSize: layout.tableHeaderSize,
    rowSize: layout.tableRowSize,
    rowMinSize: layout.tableRowMinSize,
    wrapSecondarySize: Math.max(6, layout.tableRowSize - 3),
    headerRowH: layout.headerRowH,
    cellPad: CELL_PAD,
    rowPad: ROW_PAD,
  };
}

function cellTextsForLine(layout: PdfLayout, line: TunggakanDudukanPdfLine): string[] {
  return layout.columns.map((col) => cellValue(line, col.key));
}

function formatRupiahPdf(value: number): string {
  return `Rp ${Math.round(value).toLocaleString("id-ID")}`;
}

function cellValue(line: TunggakanDudukanPdfLine, key: ColKey): string {
  switch (key) {
    case "no":
      return String(line.no);
    case "pengajeg":
      return line.pengajeg;
    case "alamat":
      return line.alamat;
    case "bln":
      return String(line.bln);
    case "jumlah":
      return formatRupiahPdf(line.jumlah);
    case "dariBln":
      return line.dariBulan;
    case "periode":
      return line.periode;
  }
}

function addPage(ctx: PageCtx): void {
  const { pageW, pageH } = ctx.layout;
  ctx.page = ctx.pdf.addPage([pageW, pageH]);
  ctx.y = pageH - ctx.layout.marginY;
}

function ensureSpace(ctx: PageCtx, needed: number): void {
  const catatanReserve = ctx.layout.options.catatan.trim()
    ? ctx.layout.subtitleSize + FOOTER_GAP + 2 * MM
    : 0;
  const footerReserve = PAGE_NUM_RESERVE + catatanReserve;
  if (ctx.y - needed < ctx.layout.marginY + footerReserve) addPage(ctx);
}

function drawSdBadge(ctx: PageCtx, label: string, topY: number): void {
  const { layout } = ctx;
  const text = pdfCaps(`S/D ${label}`);
  const padX = 3 * MM;
  const padY = 1.8 * MM;
  const textW = ctx.bodyFonts.bold.widthOfTextAtSize(text, layout.badgeSize);
  const badgeW = textW + 2 * padX;
  const badgeH = layout.badgeSize + 2 * padY;
  const badgeX = layout.marginX + layout.contentW - badgeW;
  const badgeY = topY - badgeH;

  ctx.page.drawRectangle({
    x: badgeX,
    y: badgeY,
    width: badgeW,
    height: badgeH,
    color: COLOR_BADGE_BG,
  });
  ctx.page.drawText(text, {
    x: badgeX + padX,
    y: badgeY + padY,
    size: layout.badgeSize,
    font: ctx.bodyFonts.bold,
    color: COLOR_BADGE_TEXT,
  });
}

function drawDocHeader(ctx: PageCtx, payload: TunggakanDudukanPdfPayload): void {
  if (ctx.docHeaderDrawn) return;
  const { layout } = ctx;
  const headerBlockH =
    layout.titleSize + TITLE_GAP_PT + layout.subtitleSize + SUBTITLE_GAP + 2 * MM;
  ensureSpace(ctx, headerBlockH);

  const titleTopY = ctx.y;
  ctx.page.drawText(pdfCaps(payload.options.judul), {
    x: layout.marginX,
    y: titleTopY - layout.titleSize,
    size: layout.titleSize,
    font: ctx.bodyFonts.bold,
    color: COLOR_TEXT,
  });
  drawSdBadge(ctx, payload.sdLabel, titleTopY);

  ctx.y -= layout.titleSize + TITLE_GAP_PT;
  ctx.page.drawText(pdfCaps(`BANJAR ADAT: ${payload.banjarNama}`), {
    x: layout.marginX,
    y: ctx.y - layout.subtitleSize,
    size: layout.subtitleSize,
    font: ctx.bodyFonts.regular,
    color: COLOR_TEXT,
  });
  ctx.y -= layout.subtitleSize + SUBTITLE_GAP;

  ctx.page.drawLine({
    start: { x: layout.marginX, y: ctx.y },
    end: { x: layout.marginX + layout.contentW, y: ctx.y },
    thickness: HEADER_LINE_THICK,
    color: COLOR_TEXT,
  });
  ctx.y -= 3 * MM;
  ctx.docHeaderDrawn = true;
}

function drawRtBtnLabel(ctx: PageCtx, rtBtn: string): void {
  const { layout } = ctx;
  const labelH = layout.groupLabelSize + GROUP_LABEL_GAP;
  ensureSpace(ctx, labelH);
  ctx.page.drawText(pdfCaps(`RT/BTN: ${rtBtn}`), {
    x: layout.marginX,
    y: ctx.y - layout.groupLabelSize,
    size: layout.groupLabelSize,
    font: ctx.tableFonts.bold,
    color: COLOR_TEXT,
  });
  ctx.y -= labelH;
}

function drawTableHeaderRow(ctx: PageCtx): void {
  ensureSpace(ctx, ctx.layout.headerRowH);
  ctx.y = drawGridTableHeader(
    ctx.page,
    ctx.y,
    gridTableLayout(ctx.layout),
    ctx.tableFonts
  );
}

function ensureTableRowSpace(
  ctx: PageCtx,
  rtBtn: string,
  repeatHeader: () => void,
  rowH: number
): void {
  const yBefore = ctx.y;
  ensureSpace(ctx, rowH);
  if (ctx.y > yBefore) {
    drawRtBtnLabel(ctx, rtBtn);
    repeatHeader();
  }
}

function drawDataRow(ctx: PageCtx, line: TunggakanDudukanPdfLine): void {
  ctx.y = drawGridTableDataRow(
    ctx.page,
    ctx.y,
    gridTableLayout(ctx.layout),
    ctx.tableFonts.bold,
    cellTextsForLine(ctx.layout, line)
  );
}

function drawCatatanFooter(ctx: PageCtx): void {
  const catatan = ctx.layout.options.catatan.trim();
  if (!catatan) return;
  const { layout } = ctx;
  ctx.page.drawText(pdfCaps(catatan), {
    x: layout.marginX,
    y: layout.marginY + PAGE_NUM_RESERVE * 0.35,
    size: layout.subtitleSize,
    font: ctx.bodyFonts.regular,
    color: COLOR_TEXT,
  });
}

function stampPageNumbers(pdf: PDFDocument, fonts: PdfFonts, layout: PdfLayout): void {
  const pages = pdf.getPages();
  const total = pages.length;
  pages.forEach((page, index) => {
    const label = pdfCaps(`${index + 1} / ${total}`);
    const textW = fonts.regular.widthOfTextAtSize(label, PAGE_NUM_SIZE);
    page.drawText(label, {
      x: (layout.pageW - textW) / 2,
      y: layout.marginY * 0.55,
      size: PAGE_NUM_SIZE,
      font: fonts.regular,
      color: COLOR_TEXT,
    });
  });
}

function drawGroup(ctx: PageCtx, group: TunggakanDudukanRtGroup): void {
  const grid = gridTableLayout(ctx.layout);
  const repeatHeader = () => drawTableHeaderRow(ctx);

  drawRtBtnLabel(ctx, group.rtBtn);
  repeatHeader();

  for (const line of group.lines) {
    const cellTexts = cellTextsForLine(ctx.layout, line);
    const rowH = measureGridDataRowHeight(grid, ctx.tableFonts.bold, cellTexts);
    ensureTableRowSpace(ctx, group.rtBtn, repeatHeader, rowH);
    drawDataRow(ctx, line);
  }
  ctx.y -= SECTION_GAP;
}

export async function buildTunggakanDudukanPdfBytes(
  payload: TunggakanDudukanPdfPayload
): Promise<Uint8Array | null> {
  if (!payload.groups.length) return null;
  const merged: TunggakanDudukanPdfPayload = {
    ...payload,
    options: { ...DEFAULT_TUNGGAKAN_DUDUKAN_PDF_OPTIONS, ...payload.options },
  };
  const layout = resolveLayout(merged.options);
  if (layout.columns.length === 0) return null;

  const pdf = await PDFDocument.create();
  const bodyFonts = await createPdfFonts(pdf);
  const tableFonts = bodyFonts;
  const page = pdf.addPage([layout.pageW, layout.pageH]);
  const ctx: PageCtx = {
    pdf,
    page,
    y: layout.pageH - layout.marginY,
    bodyFonts,
    tableFonts,
    layout,
    docHeaderDrawn: false,
  };

  drawDocHeader(ctx, merged);
  for (const group of merged.groups) {
    drawGroup(ctx, group);
  }
  drawCatatanFooter(ctx);
  stampPageNumbers(pdf, bodyFonts, layout);

  return pdf.save();
}
