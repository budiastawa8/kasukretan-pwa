import type { PDFDocument, PDFImage, PDFPage, RGB } from "pdf-lib";
import { rgb } from "pdf-lib";
import {
  ILIKITA_FOOTER_GAP_AFTER_TABLE_PT,
  ILIKITA_FOOTER_LINE_STEP_PT,
  ILIKITA_FOOTER_SIGN_DROP_PT,
  ILIKITA_FOOTER_QR_GAP_BEFORE_PT,
  ILIKITA_FOOTER_QR_OFFSET_X_PT,
  ILIKITA_FOOTER_QR_OFFSET_Y_PT,
  ILIKITA_FOOTER_QR_SIZE_PT,
} from "./ilikita-footer-qr-layout";
import { drawKartuQrOnPage } from "./kartu-qr-pdf";
import {
  COLOR_HEADER_CLASSIC,
  COLOR_HEADER_PIPIL,
  COLOR_HEADER_TAMIU,
  COLOR_TEXT,
  CONTENT_W,
  embedDataUrlImage,
  ilikitaUpper,
  MM,
  MARGIN_X,
  PAGE_LANDSCAPE_H,
  PAGE_LANDSCAPE_W,
  truncatePdf,
  type PdfFonts,
} from "./pdf-common";
import { drawImageContain } from "./surat-dinas-pdf-common";

/** Padding horizontal isi di bawah kop (dikurangi 10pt dari 5mm). */
export const BODY_PAD_X = 5 * MM - 10;
/** Jarak bawah kop → judul (+1 baris dari sebelumnya). */
export const BODY_PAD_TOP = 3.5 * MM + ILIKITA_FOOTER_LINE_STEP_PT;
export const FIELD_SIZE = 10.5;
export const TABLE_SIZE = 8;
export const TABLE_HEADER_SIZE = 8;

export type HeaderVariant = "pipil-red" | "classic-yellow" | "tamiu-black";

export function contentLeft(): number {
  return MARGIN_X + BODY_PAD_X;
}

export function contentWidth(): number {
  return CONTENT_W - 2 * BODY_PAD_X;
}

export async function loadSheetLogos(
  pdf: PDFDocument,
  desa: { logo_mda_url?: string | null; logo_url?: string | null } | null
) {
  return {
    mdaLogo: await embedDataUrlImage(pdf, desa?.logo_mda_url),
    desaLogo: await embedDataUrlImage(pdf, desa?.logo_url),
  };
}

export function drawFullHeader(
  page: PDFPage,
  desa: {
    nama_desa_adat?: string | null;
    nama_kecamatan?: string | null;
    nama_kabupaten?: string | null;
  } | null,
  variant: HeaderVariant,
  fonts: PdfFonts,
  images: { mdaLogo: PDFImage | null; desaLogo: PDFImage | null }
): number {
  const isTamiu = variant === "tamiu-black";
  const headerH = isTamiu ? 35 * MM : 33 * MM;
  const logoMm = isTamiu ? 28 * MM : 25 * MM;
  const padX = isTamiu ? 5 * MM : 4 * MM;
  const kopLineGap = 6.5 * MM;
  const kopSize1 = 16;
  const kopSize2 = isTamiu ? 18 : 17;
  const kopSize3 = 12.5;
  /** Geser teks ke atas agar ruang warna di bawah baris kecamatan/kabupaten lebih tipis. */
  const kopTextLift = 2.5 * MM;
  const kopTextPadTop = 15;
  const yTop = PAGE_LANDSCAPE_H;
  const bodyTop = yTop - headerH;

  const bg =
    variant === "pipil-red"
      ? COLOR_HEADER_PIPIL
      : variant === "classic-yellow"
        ? COLOR_HEADER_CLASSIC
        : COLOR_HEADER_TAMIU;
  const textColor: RGB =
    variant === "classic-yellow" ? COLOR_TEXT : rgb(1, 1, 1);

  page.drawRectangle({
    x: 0,
    y: bodyTop,
    width: PAGE_LANDSCAPE_W,
    height: headerH,
    color: bg,
  });

  const logoY = bodyTop + (headerH - logoMm) / 2;
  /** Geser logo ke dalam: MDA +10pt kanan, Desa Adat +10pt kiri. */
  const logoInsetShift = 10;
  if (images.mdaLogo) {
    page.drawImage(images.mdaLogo, {
      x: padX + logoInsetShift,
      y: logoY,
      width: logoMm,
      height: logoMm,
    });
  }
  if (images.desaLogo) {
    page.drawImage(images.desaLogo, {
      x: PAGE_LANDSCAPE_W - padX - logoMm - logoInsetShift,
      y: logoY,
      width: logoMm,
      height: logoMm,
    });
  }

  const centerX = padX + logoMm + 3 * MM;
  const centerW = PAGE_LANDSCAPE_W - 2 * (padX + logoMm + 3 * MM);
  const desaNama = desa?.nama_desa_adat?.trim().toUpperCase() ?? "DESA ADAT";
  const kecKab = [desa?.nama_kecamatan, desa?.nama_kabupaten].filter(Boolean).join(" Kabupaten ");
  const lokasi = kecKab ? `Kecamatan ${kecKab}` : "";

  const kopCenterY = bodyTop + headerH / 2 + kopTextLift - kopTextPadTop;
  if (lokasi) {
    drawCentered(
      page,
      "MAJELIS DESA ADAT (MDA) BALI",
      centerX,
      centerW,
      kopCenterY + kopLineGap,
      kopSize1,
      fonts.bold,
      textColor
    );
    drawCentered(
      page,
      `DESA ADAT ${desaNama}`,
      centerX,
      centerW,
      kopCenterY,
      kopSize2,
      fonts.bold,
      textColor
    );
    drawCentered(page, lokasi, centerX, centerW, kopCenterY - kopLineGap, kopSize3, fonts.bold, textColor);
  } else {
    drawCentered(
      page,
      "MAJELIS DESA ADAT (MDA) BALI",
      centerX,
      centerW,
      kopCenterY + kopLineGap / 2,
      kopSize1,
      fonts.bold,
      textColor
    );
    drawCentered(
      page,
      `DESA ADAT ${desaNama}`,
      centerX,
      centerW,
      kopCenterY - kopLineGap / 2,
      kopSize2,
      fonts.bold,
      textColor
    );
  }

  let y = bodyTop - BODY_PAD_TOP;
  if (variant !== "pipil-red") {
    page.drawLine({
      start: { x: 0, y: bodyTop },
      end: { x: PAGE_LANDSCAPE_W, y: bodyTop },
      thickness: 1.2,
      color: COLOR_TEXT,
    });
  }
  return y;
}

function drawCentered(
  page: PDFPage,
  text: string,
  boxX: number,
  boxW: number,
  y: number,
  size: number,
  font: PdfFonts["bold"],
  color: RGB
) {
  const safe = ilikitaUpper(text);
  const w = font.widthOfTextAtSize(safe, size);
  page.drawText(safe, { x: boxX + (boxW - w) / 2, y, size, font, color });
}

/** Judul + nomor kartu (nomor di tengah seperti pratinjau HTML). */
export function drawSheetTitle(
  page: PDFPage,
  fonts: PdfFonts,
  title: string,
  nomorLine: string,
  y: number,
  titlePt: number,
  nomorPt: number
): number {
  const left = contentLeft();
  const w = contentWidth();
  const titleDrop = 10;
  const nomorBottomGap = 5;
  drawCentered(page, title, left, w, y - 2 * MM - titleDrop, titlePt, fonts.bold, COLOR_TEXT);
  drawCentered(page, nomorLine, left, w, y - 8 * MM - titleDrop, nomorPt, fonts.bold, COLOR_TEXT);
  return y - 14 * MM - titleDrop - nomorBottomGap;
}

/** Field Pipil: label | : | value (label 44mm). */
export function drawPipilField(
  page: PDFPage,
  fonts: PdfFonts,
  label: string,
  value: string | undefined | null,
  x: number,
  y: number
) {
  const labelW = 44 * MM;
  const colonW = 3 * MM;
  const lab = ilikitaUpper(label);
  page.drawText(lab, { x, y, size: FIELD_SIZE, font: fonts.regular, color: COLOR_TEXT });
  page.drawText(":", {
    x: x + labelW,
    y,
    size: FIELD_SIZE,
    font: fonts.regular,
    color: COLOR_TEXT,
  });
  const val = ilikitaUpper(truncatePdf(value ?? "", 42));
  if (val) {
    page.drawText(val, {
      x: x + labelW + colonW,
      y,
      size: FIELD_SIZE,
      font: fonts.regular,
      color: COLOR_TEXT,
    });
  }
}

/** Lebar label per kolom Pemasih — titik dua sejajar vertikal dalam kolom. */
export const KT_FIELD_COLON_W = 3 * MM;
export const KT_FIELD_LABEL_W = {
  pengajeg: 44 * MM,
  tinggal: 30 * MM,
  asal: 28 * MM,
  footer: 34 * MM,
  classicLeft: 36 * MM + 10,
  classicRight: 44 * MM,
} as const;

/** Field Pemasih: label | : | nilai (kapital, titik dua sejajar per kolom). */
export function drawKtField(
  page: PDFPage,
  fonts: PdfFonts,
  label: string,
  value: string | undefined | null,
  x: number,
  y: number,
  labelW: number,
  maxChars = 36,
  valueMaxWidth?: number
) {
  const lab = ilikitaUpper(label.replace(/\s*:\s*$/, "").trim());
  page.drawText(lab, { x, y, size: FIELD_SIZE, font: fonts.regular, color: COLOR_TEXT });
  page.drawText(":", {
    x: x + labelW,
    y,
    size: FIELD_SIZE,
    font: fonts.regular,
    color: COLOR_TEXT,
  });
  const raw = ilikitaUpper(truncatePdf(value ?? "", valueMaxWidth != null ? 120 : maxChars));
  const val =
    valueMaxWidth != null && raw
      ? fitTextToWidth(fonts.regular, raw, FIELD_SIZE, valueMaxWidth)
      : raw;
  if (val) {
    page.drawText(val, {
      x: x + labelW + KT_FIELD_COLON_W,
      y,
      size: FIELD_SIZE,
      font: fonts.regular,
      color: COLOR_TEXT,
    });
  }
}

export function drawColHeading(page: PDFPage, fonts: PdfFonts, text: string, x: number, y: number) {
  page.drawText(ilikitaUpper(text), {
    x,
    y,
    size: FIELD_SIZE,
    font: fonts.regular,
    color: COLOR_TEXT,
  });
}

export type ColAlign = "left" | "center";

export type TableColDef = {
  header: string;
  widthFrac: number;
  align: ColAlign;
  cell: (rowIndex: number, row: unknown) => string;
};

const TABLE_WRAP_LINE_LEADING = 1.25;
const TABLE_WRAP_PAD_MM = 1.1;

export function drawStyledTable(
  page: PDFPage,
  fonts: PdfFonts,
  columns: TableColDef[],
  rows: unknown[],
  startY: number,
  options?: { boldHeaders?: boolean; wrapCells?: boolean; fontSize?: number; headerFontSize?: number }
): number {
  const wrapCells = options?.wrapCells ?? false;
  const fontSize = options?.fontSize ?? TABLE_SIZE;
  const headerFontSize = options?.headerFontSize ?? TABLE_HEADER_SIZE;
  const headerFont = options?.boldHeaders === false ? fonts.regular : fonts.bold;
  const tableW = contentWidth();
  const left = contentLeft();
  const widths = columns.map((c) => c.widthFrac * tableW);
  const baseHeaderH = 5 * MM;
  const baseRowH = 4.8 * MM;
  const cellPadX = 0.8 * MM;
  let y = startY;

  const headerLineSets = wrapCells
    ? columns.map((col, i) =>
        wrapIlikitaCellLines(
          headerFont,
          col.header,
          headerFontSize,
          Math.max(1, widths[i]! - 2 * cellPadX)
        )
      )
    : null;
  const headerH =
    headerLineSets != null
      ? measureWrappedRowHeight(headerLineSets, headerFontSize, baseHeaderH)
      : baseHeaderH;

  let x = left;
  for (let i = 0; i < columns.length; i++) {
    const w = widths[i]!;
    page.drawRectangle({
      x,
      y: y - headerH,
      width: w,
      height: headerH,
      borderColor: COLOR_TEXT,
      borderWidth: 0.6,
    });
    if (headerLineSets) {
      drawWrappedCellText(
        page,
        headerFont,
        headerLineSets[i]!,
        x,
        w,
        y,
        headerFontSize,
        "center",
        cellPadX
      );
    } else {
      drawCellText(
        page,
        headerFont,
        columns[i]!.header,
        x,
        w,
        y - headerH + 1.3 * MM,
        headerFontSize,
        "center",
        cellPadX
      );
    }
    x += w;
  }
  y -= headerH;

  for (let r = 0; r < rows.length; r++) {
    const bodyLineSets = wrapCells
      ? columns.map((col, i) =>
          wrapIlikitaCellLines(
            fonts.regular,
            col.cell(r, rows[r]),
            fontSize,
            Math.max(1, widths[i]! - 2 * cellPadX)
          )
        )
      : null;
    const rowH =
      bodyLineSets != null
        ? measureWrappedRowHeight(bodyLineSets, fontSize, baseRowH)
        : baseRowH;

    x = left;
    for (let i = 0; i < columns.length; i++) {
      const w = widths[i]!;
      page.drawRectangle({
        x,
        y: y - rowH,
        width: w,
        height: rowH,
        borderColor: COLOR_TEXT,
        borderWidth: 0.6,
      });
      if (bodyLineSets) {
        drawWrappedCellText(
          page,
          fonts.regular,
          bodyLineSets[i]!,
          x,
          w,
          y,
          fontSize,
          columns[i]!.align,
          cellPadX
        );
      } else {
        const raw = columns[i]!.cell(r, rows[r]);
        drawCellText(
          page,
          fonts.regular,
          raw,
          x,
          w,
          y - rowH + 1.2 * MM,
          fontSize,
          columns[i]!.align,
          cellPadX
        );
      }
      x += w;
    }
    y -= rowH;
  }

  return y;
}

function drawCellText(
  page: PDFPage,
  font: PdfFonts["regular"],
  text: string,
  cellX: number,
  cellW: number,
  y: number,
  size: number,
  align: ColAlign,
  padX: number
) {
  const safe = ilikitaUpper(text.trim());
  if (!safe) return;
  const innerW = Math.max(1, cellW - 2 * padX);
  const fitted = fitTextToWidth(font, safe, size, innerW);
  if (!fitted) return;
  const tw = font.widthOfTextAtSize(fitted, size);
  let tx = cellX + padX;
  if (align === "center") tx = cellX + (cellW - tw) / 2;
  page.drawText(fitted, { x: tx, y, size, font, color: COLOR_TEXT });
}

function wrapIlikitaCellLines(
  font: PdfFonts["regular"],
  text: string,
  size: number,
  maxWidth: number
): string[] {
  const safe = ilikitaUpper(text.trim());
  if (!safe) return [];

  const lines: string[] = [];
  let line = "";

  for (const word of safe.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      line = word;
      continue;
    }
    let chunk = "";
    for (const ch of word) {
      const test = chunk + ch;
      if (font.widthOfTextAtSize(test, size) <= maxWidth) {
        chunk = test;
      } else {
        if (chunk) lines.push(chunk);
        chunk = ch;
      }
    }
    line = chunk;
  }
  if (line) lines.push(line);
  return lines;
}

function measureWrappedRowHeight(
  lineSets: string[][],
  size: number,
  minH: number
): number {
  const maxLines = Math.max(1, ...lineSets.map((lines) => Math.max(1, lines.length)));
  const lineH = size * TABLE_WRAP_LINE_LEADING;
  const pad = TABLE_WRAP_PAD_MM * MM * 2;
  return Math.max(minH, pad + maxLines * lineH);
}

function drawWrappedCellText(
  page: PDFPage,
  font: PdfFonts["regular"],
  lines: string[],
  cellX: number,
  cellW: number,
  cellTopY: number,
  size: number,
  align: ColAlign,
  padX: number
) {
  if (!lines.length) return;
  const lineH = size * TABLE_WRAP_LINE_LEADING;
  const startY = cellTopY - TABLE_WRAP_PAD_MM * MM - size;
  for (let li = 0; li < lines.length; li++) {
    const text = lines[li]!;
    if (!text) continue;
    const tw = font.widthOfTextAtSize(text, size);
    let tx = cellX + padX;
    if (align === "center") tx = cellX + (cellW - tw) / 2;
    page.drawText(text, {
      x: tx,
      y: startY - li * lineH,
      size,
      font,
      color: COLOR_TEXT,
    });
  }
}

function fitTextToWidth(
  font: PdfFonts["regular"],
  text: string,
  size: number,
  maxW: number
): string {
  if (font.widthOfTextAtSize(text, size) <= maxW) return text;
  let lo = 1;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const slice = `${text.slice(0, mid)}...`;
    if (font.widthOfTextAtSize(slice, size) <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return lo >= text.length ? text : `${text.slice(0, lo)}...`;
}

/** Jarak tabel → blok tanda tangan (setara margin-top di pratinjau HTML). */
const FOOTER_GAP_AFTER_TABLE = ILIKITA_FOOTER_GAP_AFTER_TABLE_PT;
const FOOTER_LINE_STEP = ILIKITA_FOOTER_LINE_STEP_PT;
const FOOTER_SIGN_DROP = ILIKITA_FOOTER_SIGN_DROP_PT;
/** Ruang teks antara jabatan dan nama (~56px di pratinjau HTML). */
const FOOTER_SIGN_SPACE = 15 * MM;
const FOOTER_ALIGN_LINE_H = 4 * MM;
/** Tinggi gambar TTD: melewati jabatan di atas dan nama di bawah. */
const FOOTER_TTD_OVERLAP_UP = 5 * MM;
const FOOTER_TTD_OVERLAP_DOWN = 4 * MM;
const FOOTER_TTD_W_FRAC = 0.92;

export function drawThreeColumnFooter(
  page: PDFPage,
  fonts: PdfFonts,
  y: number,
  blocks: {
    left: { lines: { label: string; value?: string }[] };
    center: { role: string; name: string; placeDate?: string; hidePlaceLine?: boolean };
    right: {
      placeDate: string;
      role: string;
      name: string;
      /** Gambar TTD Bandesa (opsional). */
      signImage?: PDFImage | null;
    };
  },
  usePipilFields = false
): void {
  const left = contentLeft();
  const w = contentWidth();
  const third = w / 3;
  const fy = y - FOOTER_GAP_AFTER_TABLE;

  const x0 = left;
  const x1 = left + third;
  const x2 = left + 2 * third;

  let ly = fy;
  if (usePipilFields) {
    for (const line of blocks.left.lines) {
      drawPipilField(page, fonts, line.label, line.value, x0, ly);
      ly -= FOOTER_LINE_STEP;
    }
  } else {
    for (const line of blocks.left.lines) {
      drawKtField(page, fonts, line.label, line.value, x0, ly, KT_FIELD_LABEL_W.footer, 22);
      ly -= FOOTER_LINE_STEP;
    }
  }

  let cy = fy - FOOTER_SIGN_DROP;
  if (blocks.center.placeDate) {
    drawCentered(page, blocks.center.placeDate, x1, third, cy, FIELD_SIZE, fonts.regular, COLOR_TEXT);
    cy -= FOOTER_LINE_STEP;
  } else if (blocks.center.hidePlaceLine) {
    cy -= FOOTER_ALIGN_LINE_H;
  }
  const roleFont = fonts.regular;
  drawCentered(page, blocks.center.role, x1, third, cy, FIELD_SIZE, roleFont, COLOR_TEXT);
  cy -= FOOTER_LINE_STEP;
  drawCentered(
    page,
    blocks.center.name,
    x1,
    third,
    cy - FOOTER_SIGN_SPACE,
    FIELD_SIZE,
    fonts.regular,
    COLOR_TEXT
  );

  let ry = fy - FOOTER_SIGN_DROP;
  drawCentered(page, blocks.right.placeDate, x2, third, ry, FIELD_SIZE, fonts.regular, COLOR_TEXT);
  ry -= FOOTER_LINE_STEP;
  const rightRoleY = ry;
  drawCentered(page, blocks.right.role, x2, third, ry, FIELD_SIZE, roleFont, COLOR_TEXT);
  ry -= FOOTER_LINE_STEP;
  const rightNameY = ry - FOOTER_SIGN_SPACE;
  drawCentered(
    page,
    blocks.right.name || " ",
    x2,
    third,
    rightNameY,
    FIELD_SIZE,
    fonts.regular,
    COLOR_TEXT
  );

  // Gambar TTD digambar terakhir agar menutupi jabatan/nama (PNG transparan).
  if (blocks.right.signImage) {
    const signW = third * FOOTER_TTD_W_FRAC;
    const signX = x2 + (third - signW) / 2;
    const boxTop = rightRoleY + FOOTER_TTD_OVERLAP_UP;
    const boxBottom = rightNameY - FOOTER_TTD_OVERLAP_DOWN;
    const signH = Math.max(boxTop - boxBottom, FOOTER_SIGN_SPACE);
    drawImageContain(page, blocks.right.signImage, signX, boxBottom, signW, signH, "center");
  }
}

/** QR di kolom kiri footer ILIKITA, di bawah baris terakhir (mis. masa berlaku). */
export async function drawIlikitaFooterQr(
  pdf: PDFDocument,
  page: PDFPage,
  nomorKartu: string,
  tableBottomY: number,
  leftLineCount: number
): Promise<void> {
  const left = contentLeft();
  const fy = tableBottomY - FOOTER_GAP_AFTER_TABLE;
  const ly = fy - leftLineCount * FOOTER_LINE_STEP;
  const qrSize = ILIKITA_FOOTER_QR_SIZE_PT;
  const qrX = left + ILIKITA_FOOTER_QR_OFFSET_X_PT;
  const qrY = ly - ILIKITA_FOOTER_QR_GAP_BEFORE_PT - qrSize + ILIKITA_FOOTER_QR_OFFSET_Y_PT;
  await drawKartuQrOnPage(pdf, page, nomorKartu, qrX, qrY, qrSize);
}
