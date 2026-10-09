import { PDFDocument, type PDFPage } from "pdf-lib";
import type { DesaAdat } from "./types";
import type { DudukanRiwayatRow } from "./services/dudukan-pembayaran";
import { formatRupiah } from "./paturunan-hitung";
import {
  COLOR_TEXT,
  createPdfFonts,
  drawCenteredText,
  MM,
  pdfSafeText,
  type PdfFonts,
} from "./pdf-common";
import { createTableFonts } from "./pdf-table-fonts";
import {
  drawSetoranLabelAmountRow,
  drawSetoranTableHeader,
  drawSetoranTableRow,
  measureSetoranTableRowHeight,
  setoranColumnWidths,
  type SetoranTableLayout,
} from "./pdf-setoran-table";
import { formatTanggalLahir, today } from "./utils";

const PAGE_W = 210 * MM;
const PAGE_H = 297 * MM;
const MARGIN_X = 15 * MM;
const MARGIN_Y = 15 * MM;
const CONTENT_W = PAGE_W - 2 * MARGIN_X;

const TITLE_SIZE = 14;
const LABEL_SIZE = 11;
const TABLE_HEADER_SIZE = 10;
const TABLE_ROW_SIZE = 10;
const FOOTER_SIZE = 11;
const ROW_H = 7 * MM;
const HEADER_ROW_H = 7 * MM;
const CELL_PAD = 1.2 * MM;
const LABEL_LINE_H = 5.5 * MM;
const GROUP_GAP = 4 * MM;
const TITLE_GAP_PT = 10;
const SIGN_GAP_PT = 30;
const FOOTER_BLOCK_H = 30 * MM;

export type BuktiSetoranDudukanLine = {
  nama: string;
  alamat: string;
  periode: string;
  kali: number;
  jumlah: number;
};

type PeriodeBulan = { tahun: number; bulan: number };

function periodeKey(p: PeriodeBulan): number {
  return p.tahun * 100 + p.bulan;
}

/** Rentang periode ringkas, mis. `01-03/25` atau `11/24 s/d 02/25`. */
export function formatPeriodeDudukanRentang(min: PeriodeBulan, max: PeriodeBulan): string {
  const mm = (b: number) => String(b).padStart(2, "0");
  const yy = (t: number) => String(t).slice(-2);
  if (min.tahun === max.tahun && min.bulan === max.bulan) {
    return `${mm(min.bulan)}/${yy(min.tahun)}`;
  }
  if (min.tahun === max.tahun) {
    return `${mm(min.bulan)}-${mm(max.bulan)}/${yy(max.tahun)}`;
  }
  return `${mm(min.bulan)}/${yy(min.tahun)} s/d ${mm(max.bulan)}/${yy(max.tahun)}`;
}

function rentangPeriodeDariBaris(rows: DudukanRiwayatRow[]): string {
  const periodes = rows.map((r) => ({ tahun: r.tahun, bulan: r.bulan }));
  if (!periodes.length) return "—";
  const sorted = [...periodes].sort((a, b) => periodeKey(a) - periodeKey(b));
  return formatPeriodeDudukanRentang(sorted[0]!, sorted[sorted.length - 1]!);
}

export type BuktiSetoranDudukanSlip = {
  tanggal: string;
  banjarNama: string;
  banjarId?: string;
  petugasNama: string;
  rtBtn: string;
  lines: BuktiSetoranDudukanLine[];
};

export type BuktiSetoranDudukanPdfPayload = {
  filename: string;
  slips: BuktiSetoranDudukanSlip[];
};

export function paymentDayKey(tanggal: string | null | undefined): string {
  return tanggal?.trim().slice(0, 10) ?? "";
}

/** Bukti setoran hanya untuk satu hari tanggal bayar. */
export function assertSinglePaymentDay(rows: { tanggal: string | null | undefined }[]): string {
  const days = [
    ...new Set(rows.map((r) => paymentDayKey(r.tanggal)).filter((d) => d.length > 0)),
  ];
  if (!days.length) {
    throw new Error("Tidak ada tanggal pembayaran pada data yang dipilih.");
  }
  if (days.length > 1) {
    throw new Error(
      "Bukti setoran hanya untuk satu hari pembayaran. Samakan filter Dari tanggal dan Sampai tanggal ke hari yang sama."
    );
  }
  return days[0]!;
}

function slipKey(row: DudukanRiwayatRow): string {
  return [row.petugas_nama?.trim() ?? "—", row.rt_btn?.trim() ?? "—"].join("|");
}

function aggregateLines(rows: DudukanRiwayatRow[]): BuktiSetoranDudukanLine[] {
  const byKrama = new Map<
    string,
    {
      nama: string;
      alamat: string;
      kali: number;
      jumlah: number;
      baris: DudukanRiwayatRow[];
    }
  >();
  for (const r of rows) {
    const key = r.krama_id || r.nomor_kartu;
    const cur = byKrama.get(key) ?? {
      nama: r.kepala_nama?.trim() || "—",
      alamat: r.alamat?.trim() || "—",
      kali: 0,
      jumlah: 0,
      baris: [],
    };
    cur.kali += 1;
    cur.jumlah += Math.round(Number(r.jumlah) || 0);
    cur.baris.push(r);
    byKrama.set(key, cur);
  }
  return [...byKrama.values()]
    .sort(
      (a, b) =>
        a.alamat.localeCompare(b.alamat, "id") || a.nama.localeCompare(b.nama, "id")
    )
    .map((v) => ({
      nama: v.nama,
      alamat: v.alamat,
      periode: rentangPeriodeDariBaris(v.baris),
      kali: v.kali,
      jumlah: v.jumlah,
    }));
}

export function buildBuktiSetoranDudukanSlips(rows: DudukanRiwayatRow[]): BuktiSetoranDudukanSlip[] {
  const tanggalHari = assertSinglePaymentDay(rows);
  const dayRows = rows.filter((r) => paymentDayKey(r.tanggal) === tanggalHari);

  const groups = new Map<string, DudukanRiwayatRow[]>();
  for (const r of dayRows) {
    const key = slipKey(r);
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }

  const slips: BuktiSetoranDudukanSlip[] = [];
  for (const [, groupRows] of groups) {
    const first = groupRows[0]!;
    slips.push({
      tanggal: tanggalHari,
      banjarNama: first.banjar_nama,
      banjarId: first.banjar_id,
      petugasNama: first.petugas_nama?.trim() || "—",
      rtBtn: first.rt_btn?.trim() || "—",
      lines: aggregateLines(groupRows),
    });
  }

  slips.sort((a, b) => {
    const pc = a.petugasNama.localeCompare(b.petugasNama, "id");
    if (pc !== 0) return pc;
    return a.rtBtn.localeCompare(b.rtBtn, "id");
  });

  return slips;
}

export function buildBuktiSetoranDudukanPdfPayload(
  rows: DudukanRiwayatRow[],
  opts: { dari?: string; sampai?: string } = {}
): BuktiSetoranDudukanPdfPayload {
  const tanggalHari = assertSinglePaymentDay(rows);
  const slugDate = opts.dari?.trim() || opts.sampai?.trim() || tanggalHari;
  return {
    filename: `bukti-setoran-dudukan-${slugDate}`,
    slips: buildBuktiSetoranDudukanSlips(rows),
  };
}

export async function resolveBendaharaTimNama(banjarId?: string): Promise<string> {
  const { listTimKasukretan } = await import("./services/master");
  const tim = await listTimKasukretan(banjarId);
  const match = (t: { jabatan: string }) =>
    /bendahara/i.test(t.jabatan.trim());

  const inBanjar = tim.find(match);
  if (inBanjar?.nama?.trim()) return inBanjar.nama.trim();

  const all = await listTimKasukretan();
  const any = all.find(match);
  return any?.nama?.trim() ?? "";
}

type PageCtx = {
  pdf: PDFDocument;
  page: PDFPage;
  y: number;
  bodyFonts: PdfFonts;
  tableFonts: PdfFonts;
};

function addPage(ctx: PageCtx): void {
  ctx.page = ctx.pdf.addPage([PAGE_W, PAGE_H]);
  ctx.y = PAGE_H - MARGIN_Y;
}

function ensureSpace(ctx: PageCtx, needed: number): void {
  if (ctx.y - needed < MARGIN_Y) addPage(ctx);
}

function drawLabelLine(
  ctx: PageCtx,
  label: string,
  value: string
): void {
  ensureSpace(ctx, LABEL_LINE_H);
  const text = pdfSafeText(`${label} : ${value}`);
  ctx.page.drawText(text, {
    x: MARGIN_X,
    y: ctx.y - 3.5 * MM,
    size: LABEL_SIZE,
    font: ctx.bodyFonts.regular,
    color: COLOR_TEXT,
  });
  ctx.y -= LABEL_LINE_H;
}

function drawCenteredBoldLine(ctx: PageCtx, text: string): void {
  ensureSpace(ctx, LABEL_LINE_H);
  drawCenteredText(
    ctx.page,
    pdfSafeText(text),
    MARGIN_X,
    CONTENT_W,
    ctx.y - LABEL_SIZE,
    LABEL_SIZE,
    ctx.bodyFonts.bold,
    COLOR_TEXT
  );
  ctx.y -= LABEL_LINE_H;
}

const TABLE_COL_FRACTIONS = [0.4, 1.25, 1.65, 1.05, 0.55, 1.1];
/** Penyesuaian lebar kolom (pt) relatif terhadap proporsi dasar: No, Nama, Alamat, Periode, #kali, Jml Bayar. */
const TABLE_COL_WIDTH_DELTA_PT = [-5, 25, 30, -20, -15, -15] as const;
const TABLE_HEADERS = ["No", "Nama", "Alamat", "Periode", "#kali", "Jml Bayar"];
const TABLE_AMOUNT_COL = TABLE_HEADERS.length - 1;
/** No, Periode, #kali */
const TABLE_CENTER_DATA_COLS = new Set([0, 3, 4]);
/** Header: No, Nama, Alamat, Periode, #kali */
const TABLE_CENTER_HEADER_COLS = new Set([0, 1, 2, 3, 4]);
/** Nama, Alamat — isi rata kiri + wrap */
const TABLE_WRAP_DATA_COLS = new Set([1, 2]);

const TABLE_LAYOUT: SetoranTableLayout = {
  marginX: MARGIN_X,
  contentW: CONTENT_W,
  headers: TABLE_HEADERS,
  colFractions: TABLE_COL_FRACTIONS,
  colWidthDeltaPt: TABLE_COL_WIDTH_DELTA_PT,
  rightDataCols: new Set([TABLE_AMOUNT_COL]),
  centerDataCols: TABLE_CENTER_DATA_COLS,
  centerHeaderCols: TABLE_CENTER_HEADER_COLS,
  wrapDataCols: TABLE_WRAP_DATA_COLS,
  headerSize: TABLE_HEADER_SIZE,
  rowSize: TABLE_ROW_SIZE,
  rowH: ROW_H,
  headerRowH: HEADER_ROW_H,
  cellPad: CELL_PAD,
};

function drawTableHeaderRow(ctx: PageCtx): void {
  ensureSpace(ctx, HEADER_ROW_H);
  ctx.y = drawSetoranTableHeader(ctx.page, ctx.y, TABLE_LAYOUT, ctx.tableFonts);
}

function ensureTableRowSpace(ctx: PageCtx, needed = ROW_H): void {
  const yBefore = ctx.y;
  ensureSpace(ctx, needed);
  if (ctx.y > yBefore) {
    drawTableHeaderRow(ctx);
    ensureSpace(ctx, needed);
  }
}

function drawTableDataRow(ctx: PageCtx, cells: string[]): void {
  const rowH = measureSetoranTableRowHeight(TABLE_LAYOUT, cells, ctx.tableFonts);
  ensureTableRowSpace(ctx, rowH);
  ctx.y = drawSetoranTableRow(ctx.page, ctx.y, TABLE_LAYOUT, cells, ctx.tableFonts);
}

function drawSummaryRow(
  ctx: PageCtx,
  label: string,
  amount: number,
  opts: { repeatHeaderOnBreak?: boolean } = {}
): void {
  const widths = setoranColumnWidths(TABLE_LAYOUT);
  if (opts.repeatHeaderOnBreak) ensureTableRowSpace(ctx);
  else ensureSpace(ctx, ROW_H);
  ctx.y = drawSetoranLabelAmountRow(
    ctx.page,
    ctx.y,
    TABLE_LAYOUT,
    widths,
    { label, amountText: formatRupiah(amount), amountColIndex: TABLE_AMOUNT_COL },
    ctx.tableFonts
  );
}

function drawGroupTable(ctx: PageCtx, lines: BuktiSetoranDudukanLine[]): number {
  let subtotal = 0;

  drawTableHeaderRow(ctx);
  lines.forEach((line, idx) => {
    subtotal += line.jumlah;
    drawTableDataRow(ctx, [
      String(idx + 1),
      line.nama,
      line.alamat,
      line.periode,
      String(line.kali),
      formatRupiah(line.jumlah),
    ]);
  });

  drawSummaryRow(ctx, "SUB TOTAL", subtotal, { repeatHeaderOnBreak: true });
  return subtotal;
}

function resolveBanjarLabel(slips: BuktiSetoranDudukanSlip[]): string {
  const names = [
    ...new Set(slips.map((s) => s.banjarNama?.trim()).filter((n) => n && n.length > 0)),
  ];
  return names.length ? names.join(", ") : "—";
}

function drawDocumentHeader(ctx: PageCtx, tanggal: string, banjarNama: string): void {
  ensureSpace(ctx, TITLE_SIZE + TITLE_GAP_PT + LABEL_LINE_H * 2);
  drawCenteredText(
    ctx.page,
    "BUKTI SETORAN DUDUKAN",
    MARGIN_X,
    CONTENT_W,
    ctx.y - TITLE_SIZE,
    TITLE_SIZE,
    ctx.bodyFonts.bold,
    COLOR_TEXT
  );
  ctx.y -= TITLE_SIZE + TITLE_GAP_PT;
  drawCenteredBoldLine(ctx, `TANGGAL : ${formatTanggalLahir(tanggal)}`);
  drawCenteredBoldLine(ctx, `BANJAR : ${banjarNama}`);
  ctx.y -= 2 * MM;
}

function drawGroupSection(ctx: PageCtx, slip: BuktiSetoranDudukanSlip): number {
  ensureSpace(ctx, LABEL_LINE_H * 2 + HEADER_ROW_H + ROW_H * 2 + GROUP_GAP);
  drawLabelLine(ctx, "NAMA PETUGAS", slip.petugasNama);
  drawLabelLine(ctx, "RT/BTN", slip.rtBtn);
  ctx.y -= 2 * MM;
  const subtotal = drawGroupTable(ctx, slip.lines);
  ctx.y -= GROUP_GAP;
  return subtotal;
}

function drawGrandTotal(ctx: PageCtx, amount: number): void {
  drawSummaryRow(ctx, "TOTAL", amount);
}

function drawDocumentFooter(
  ctx: PageCtx,
  desa: DesaAdat | null,
  bendaharaNama: string
): void {
  ensureSpace(ctx, FOOTER_BLOCK_H + SIGN_GAP_PT);
  ctx.y -= SIGN_GAP_PT;
  const tempat = desa?.nama_desa_adat?.trim() || "Desa Adat";
  const placeDate = pdfSafeText(`${tempat}, ${formatTanggalLahir(today())}`);
  const half = CONTENT_W / 2;
  const xRight = MARGIN_X + half;
  const signSpace = 16 * MM;
  let ly = ctx.y;

  drawCenteredText(
    ctx.page,
    placeDate,
    xRight,
    half,
    ly,
    FOOTER_SIZE,
    ctx.bodyFonts.regular,
    COLOR_TEXT
  );
  ly -= 5 * MM;
  drawCenteredText(
    ctx.page,
    "Bendahara Tim",
    xRight,
    half,
    ly,
    FOOTER_SIZE,
    ctx.bodyFonts.bold,
    COLOR_TEXT
  );
  ly -= signSpace;
  if (bendaharaNama) {
    drawCenteredText(
      ctx.page,
      pdfSafeText(bendaharaNama),
      xRight,
      half,
      ly,
      FOOTER_SIZE,
      ctx.bodyFonts.regular,
      COLOR_TEXT
    );
  }
}

export async function generateBuktiSetoranDudukanPdfBytes(
  desa: DesaAdat | null,
  payload: BuktiSetoranDudukanPdfPayload
): Promise<Uint8Array | null> {
  if (!payload.slips.length) return null;

  const pdf = await PDFDocument.create();
  const bodyFonts = await createPdfFonts(pdf);
  const tableFonts = await createTableFonts(pdf);
  const firstSlip = payload.slips[0]!;
  const bendaharaNama = await resolveBendaharaTimNama(firstSlip.banjarId);

  const ctx: PageCtx = {
    pdf,
    page: pdf.addPage([PAGE_W, PAGE_H]),
    y: PAGE_H - MARGIN_Y,
    bodyFonts,
    tableFonts,
  };

  drawDocumentHeader(ctx, firstSlip.tanggal, resolveBanjarLabel(payload.slips));

  let grandTotal = 0;
  for (const slip of payload.slips) {
    grandTotal += drawGroupSection(ctx, slip);
  }
  drawGrandTotal(ctx, grandTotal);
  drawDocumentFooter(ctx, desa, bendaharaNama);

  return pdf.save();
}

export async function buildBuktiSetoranDudukanPdfBytes(
  payload: BuktiSetoranDudukanPdfPayload
): Promise<Uint8Array | null> {
  const { getDesaAdat } = await import("./services/desa");
  const desa = await getDesaAdat();
  return generateBuktiSetoranDudukanPdfBytes(desa, payload);
}
