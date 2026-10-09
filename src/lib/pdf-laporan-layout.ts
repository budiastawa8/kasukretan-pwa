import { PDFDocument, type PDFImage, type PDFPage } from "pdf-lib";
import type { DesaAdat } from "./types";
import {
  COLOR_TABLE_BORDER,
  COLOR_TEXT,
  drawCenteredText,
  embedDataUrlImage,
  MM,
  MARGIN_X,
  MARGIN_Y,
  pdfSafeText,
  type PdfFonts,
} from "./pdf-common";
import { formatTanggalLahir, today } from "./utils";

export type LaporanPageSize = "A4" | "F4";

export type LaporanPageLayout = {
  pageW: number;
  pageH: number;
  marginX: number;
  marginY: number;
  contentW: number;
};

const KOP_LOGO_SIZE = 9 * MM * 1.1;
const KOP_LOGO_DROP_PT = 7;
const JUDUL_LAPORAN_DROP_PT = 10;
const KOP_LOGO_TEXT_GAP = 3 * MM;
const KOP_TITLE_SIZE = 11;
const KOP_SUBTITLE_SIZE = 9;
const KOP_LINE_THICKNESS = 1.2;
const SIGNATURE_TOP_GAP = 6 * MM;
const SIGNATURE_LINE_STEP = 4.5 * MM;
const SIGNATURE_NAME_SPACE = 14 * MM;

export const LAPORAN_CONT_HEADER_MM = 8;
export const LAPORAN_SUMMARY_LINE_H = 4.5 * MM;

export function resolveLaporanPageLayout(options: {
  orientation?: "portrait" | "landscape";
  pageSize?: LaporanPageSize;
}): LaporanPageLayout {
  const landscape = options.orientation === "landscape";
  const pageSize = options.pageSize ?? "A4";
  let pageW: number;
  let pageH: number;

  if (pageSize === "F4") {
    pageW = landscape ? 330 * MM : 210 * MM;
    pageH = landscape ? 210 * MM : 330 * MM;
  } else {
    pageW = landscape ? 297 * MM : 210 * MM;
    pageH = landscape ? 210 * MM : 297 * MM;
  }

  const marginX = MARGIN_X;
  const marginY = MARGIN_Y;
  return {
    pageW,
    pageH,
    marginX,
    marginY,
    contentW: pageW - 2 * marginX,
  };
}

export function laporanText(text: string, uppercase: boolean): string {
  const safe = pdfSafeText(text);
  return uppercase ? safe.toUpperCase() : safe;
}

function formatPlaceDate(desa: DesaAdat | null, uppercase = false): string {
  const tempat = desa?.nama_desa_adat?.trim() || "Desa Adat";
  return laporanText(`${tempat}, ${formatTanggalLahir(today())}`, uppercase);
}

function isJabatanKetuaTim(jabatan: string): boolean {
  return jabatan.trim().toLowerCase().replace(/\s+/g, " ") === "ketua tim";
}

export async function resolveKetuaTimNama(): Promise<string> {
  const { listTimKasukretan } = await import("./services/master");
  const tim = await listTimKasukretan();
  const ketua = tim.find((t) => isJabatanKetuaTim(t.jabatan));
  return ketua?.nama?.trim() ?? "";
}

export async function loadDesaLogo(pdf: PDFDocument, desa: DesaAdat | null): Promise<PDFImage | null> {
  const logoDesa = await embedDataUrlImage(pdf, desa?.logo_url);
  if (logoDesa) return logoDesa;
  return embedDataUrlImage(pdf, desa?.logo_mda_url);
}

export function drawLaporanKop(
  page: PDFPage,
  layout: LaporanPageLayout,
  desa: DesaAdat | null,
  fonts: PdfFonts,
  logo: PDFImage | null,
  yTop: number
): number {
  const desaNama = (desa?.nama_desa_adat?.trim() || "—").toUpperCase();
  const kec = desa?.nama_kecamatan?.trim().toUpperCase() || "—";
  const kab = desa?.nama_kabupaten?.trim().toUpperCase() || "—";
  const line1 = pdfSafeText(`DESA ADAT ${desaNama}`);
  const line2 = pdfSafeText(`KECAMATAN ${kec} KABUPATEN ${kab}`);

  const line1W = fonts.bold.widthOfTextAtSize(line1, KOP_TITLE_SIZE);
  const line2W = fonts.regular.widthOfTextAtSize(line2, KOP_SUBTITLE_SIZE);
  const textW = Math.max(line1W, line2W);

  const hasLogo = !!logo;
  const blockW = (hasLogo ? KOP_LOGO_SIZE + KOP_LOGO_TEXT_GAP : 0) + textW;
  const blockX = layout.marginX + (layout.contentW - blockW) / 2;

  const textBlockH = 8 * MM;
  const line1Y = yTop - 5 * MM;
  const line2Y = yTop - 11 * MM;

  if (logo) {
    const logoY = yTop - textBlockH - (KOP_LOGO_SIZE - textBlockH) / 2 - KOP_LOGO_DROP_PT;
    page.drawImage(logo, {
      x: blockX,
      y: logoY,
      width: KOP_LOGO_SIZE,
      height: KOP_LOGO_SIZE,
    });
  }

  const textX = hasLogo ? blockX + KOP_LOGO_SIZE + KOP_LOGO_TEXT_GAP : blockX;
  page.drawText(line1, {
    x: textX,
    y: line1Y,
    size: KOP_TITLE_SIZE,
    font: fonts.bold,
    color: COLOR_TEXT,
  });
  page.drawText(line2, {
    x: textX,
    y: line2Y,
    size: KOP_SUBTITLE_SIZE,
    font: fonts.regular,
    color: COLOR_TEXT,
  });

  const ruleY = yTop - 15.5 * MM;
  page.drawLine({
    start: { x: blockX, y: ruleY },
    end: { x: blockX + blockW, y: ruleY },
    thickness: KOP_LINE_THICKNESS,
    color: COLOR_TEXT,
  });

  return ruleY - 4 * MM;
}

export function drawLaporanJudulBlock(
  page: PDFPage,
  layout: LaporanPageLayout,
  fonts: PdfFonts,
  judul: string,
  periode: string,
  y: number,
  subjudul?: string,
  uppercase = false,
  subjudulUppercase?: boolean
): number {
  y -= JUDUL_LAPORAN_DROP_PT;
  drawCenteredText(
    page,
    laporanText(judul, true),
    layout.marginX,
    layout.contentW,
    y,
    11,
    fonts.bold,
    COLOR_TEXT
  );
  y -= 5 * MM;
  const sub = subjudul?.trim();
  if (sub) {
    const subCaps = subjudulUppercase ?? uppercase;
    drawCenteredText(
      page,
      laporanText(sub, subCaps),
      layout.marginX,
      layout.contentW,
      y,
      10,
      fonts.bold,
      COLOR_TEXT
    );
    y -= 4.5 * MM;
  }
  const per = periode?.trim();
  if (per) {
    drawCenteredText(
      page,
      laporanText(per, uppercase),
      layout.marginX,
      layout.contentW,
      y,
      8.5,
      fonts.regular,
      COLOR_TEXT
    );
    y -= 4 * MM;
  }
  return y - (per ? 0 : 4 * MM);
}

export function drawLaporanMetaLines(
  page: PDFPage,
  layout: LaporanPageLayout,
  fonts: PdfFonts,
  lines: string[],
  y: number,
  fontSize = 8.5
): number {
  const lineH = 4.2 * MM;
  for (const line of lines) {
    const text = laporanText(line, true);
    page.drawText(text, {
      x: layout.marginX,
      y: y - 3.5 * MM,
      size: fontSize,
      font: fonts.bold,
      color: COLOR_TEXT,
    });
    y -= lineH;
  }
  return y - 2 * MM;
}

export function drawLaporanContinuationHeader(
  page: PDFPage,
  layout: LaporanPageLayout,
  fonts: PdfFonts,
  judul: string,
  pageNum: number,
  y: number,
  headerMm = LAPORAN_CONT_HEADER_MM,
  uppercase = false
): number {
  const short = laporanText(judul, uppercase);
  const headerH = headerMm * MM;
  page.drawText(short, {
    x: layout.marginX,
    y: y - 3.5 * MM,
    size: 7.5,
    font: fonts.bold,
    color: COLOR_TEXT,
  });
  const pageLabel = `Hal. ${pageNum}`;
  const w = fonts.regular.widthOfTextAtSize(pageLabel, 7.5);
  page.drawText(pageLabel, {
    x: layout.marginX + layout.contentW - w,
    y: y - 3.5 * MM,
    size: 7.5,
    font: fonts.regular,
    color: COLOR_TEXT,
  });
  page.drawLine({
    start: { x: layout.marginX, y: y - headerH + 0.8 * MM },
    end: { x: layout.marginX + layout.contentW, y: y - headerH + 0.8 * MM },
    thickness: 0.4,
    color: COLOR_TABLE_BORDER,
  });
  return y - headerH;
}

export function laporanSignatureBlockHeight(signatureFontSize: number): number {
  return SIGNATURE_TOP_GAP + SIGNATURE_LINE_STEP + SIGNATURE_NAME_SPACE + signatureFontSize;
}

/** Y anchor `drawLaporanSignatures` — dasar blok tanda tangan tepat di atas margin bawah. */
export function computeLaporanSignatureAnchorY(
  layout: LaporanPageLayout,
  signatureFontSize: number
): number {
  return layout.marginY + laporanSignatureBlockHeight(signatureFontSize);
}

export function drawLaporanSignatures(
  page: PDFPage,
  layout: LaporanPageLayout,
  fonts: PdfFonts,
  desa: DesaAdat | null,
  ketuaTimNama: string,
  y: number,
  fontSize = 8.5,
  uppercase = false
): void {
  const placeDate = formatPlaceDate(desa, uppercase);
  const half = layout.contentW / 2;
  const xLeft = layout.marginX;
  const xRight = layout.marginX + half;
  const signSpace = 14 * MM;
  const lineStep = 4.5 * MM;
  let ly = y - SIGNATURE_TOP_GAP;

  const bandesaJabatan = desa?.bandesa_jabatan?.trim() || "Bandesa Adat";
  const bandesaNama = desa?.bandesa_nama?.trim() || "";

  drawCenteredText(
    page,
    laporanText("Mengetahui", uppercase),
    xLeft,
    half,
    ly,
    fontSize,
    fonts.regular,
    COLOR_TEXT
  );
  drawCenteredText(page, placeDate, xRight, half, ly, fontSize, fonts.regular, COLOR_TEXT);
  ly -= lineStep;
  drawCenteredText(
    page,
    laporanText(bandesaJabatan, uppercase),
    xLeft,
    half,
    ly,
    fontSize,
    fonts.regular,
    COLOR_TEXT
  );
  drawCenteredText(
    page,
    laporanText("Ketua Tim", uppercase),
    xRight,
    half,
    ly,
    fontSize,
    fonts.regular,
    COLOR_TEXT
  );
  ly -= signSpace;
  if (bandesaNama) {
    drawCenteredText(
      page,
      laporanText(bandesaNama, uppercase),
      xLeft,
      half,
      ly,
      fontSize,
      fonts.bold,
      COLOR_TEXT
    );
  }
  if (ketuaTimNama) {
    drawCenteredText(
      page,
      laporanText(ketuaTimNama, uppercase),
      xRight,
      half,
      ly,
      fontSize,
      fonts.bold,
      COLOR_TEXT
    );
  }
}
