import {
  concatTransformationMatrix,
  PDFDocument,
  popGraphicsState,
  pushGraphicsState,
  type PDFImage,
  type PDFPage,
  rgb,
  type RGB,
} from "pdf-lib";
import { KARTU_A4_GRID, MM_TO_PT } from "./kartu-a4-grid";
import {
  KARTU_KRAMA_ADAT_KETENTUAN,
  KARTU_BACK_BODY_GAP_PT,
  KARTU_BACK_FOOTER_BAR_MM,
  KARTU_BACK_KETENTUAN_FONT_PDF,
  KARTU_BACK_LOGO_MM,
  KARTU_BACK_SIGN_SPACE_EXTRA_PT,
  KARTU_BACK_SIGN_SPACE_MM,
  KARTU_BACK_SIGN_SHIFT_UP_PT,
  KARTU_BACK_TOP_BAR_MM,
  kartuKramaAdatBandesaJabatan,
  kartuKramaAdatBandesaNama,
  kartuKramaAdatCallCenter,
} from "./kartu-krama-adat-back";
import { drawKartuQrOnPage } from "./kartu-qr-pdf";
import type { DesaAdat, KramaDetail } from "./types";

const MM = MM_TO_PT;
const CARD_W = KARTU_A4_GRID.cardWmm * MM;
const CARD_H = KARTU_A4_GRID.cardHmm * MM;
const MARGIN = 2 * MM;
const BACK_TOP_BAR_H = KARTU_BACK_TOP_BAR_MM * MM;
const BACK_FOOTER_BAR_H = KARTU_BACK_FOOTER_BAR_MM * MM;
const BACK_LOGO_SIZE = KARTU_BACK_LOGO_MM * MM;
const BACK_SIGN_SPACE_H =
  (KARTU_BACK_SIGN_SPACE_MM + (KARTU_BACK_SIGN_SPACE_EXTRA_PT * 25.4) / 72) * MM;

const COLOR_BODY = rgb(244 / 255, 239 / 255, 230 / 255);
const COLOR_TEXT = rgb(0.07, 0.07, 0.07);

export const KARTU_BACK_BAR_MIPIL = rgb(242 / 255, 184 / 255, 184 / 255);
/** Kop/footer belakang Kartu Krama Tamiu (kuning). */
export const KARTU_BACK_BAR_KRAMA_TAMIU = rgb(232 / 255, 197 / 255, 71 / 255);
/** @deprecated Gunakan KARTU_BACK_BAR_KRAMA_TAMIU */
export const KARTU_BACK_BAR_TAMIU = KARTU_BACK_BAR_KRAMA_TAMIU;
/** Kop/footer belakang Kartu Tamiu anggota (hitam). */
export const KARTU_BACK_BAR_TAMIU_ANGGOTA = rgb(0, 0, 0);

function pdfSafeMixed(text: string): string {
  return text
    .replace(/\u2026/g, "...")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "?");
}

function pdfSafeText(text: string): string {
  return pdfSafeMixed(text).toUpperCase();
}

function drawImageContain(
  page: PDFPage,
  image: PDFImage,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number
) {
  const imgW = image.width;
  const imgH = image.height;
  const scale = Math.min(boxW / imgW, boxH / imgH);
  const drawW = imgW * scale;
  const drawH = imgH * scale;
  const drawX = boxX + (boxW - drawW) / 2;
  const drawY = boxY + (boxH - drawH) / 2;
  page.drawImage(image, { x: drawX, y: drawY, width: drawW, height: drawH });
}

function truncateText(text: string, maxLen: number): string {
  const t = pdfSafeText(text.trim());
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 3)}...`;
}

function drawCenteredInBox(
  page: PDFPage,
  text: string,
  boxX: number,
  boxW: number,
  y: number,
  size: number,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>
) {
  const safe = pdfSafeText(text);
  if (!safe) return;
  const w = font.widthOfTextAtSize(safe, size);
  page.drawText(safe, {
    x: boxX + (boxW - w) / 2,
    y,
    size,
    font,
    color: COLOR_TEXT,
  });
}

function wrapMixedLines(
  text: string,
  maxWidth: number,
  size: number,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>
): string[] {
  const words = pdfSafeMixed(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      line = next;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function drawKartuBackPage(
  pdf: PDFDocument,
  page: PDFPage,
  krama: KramaDetail,
  desa: DesaAdat | null,
  fonts: {
    regular: Awaited<ReturnType<PDFDocument["embedFont"]>>;
    bold: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  },
  images: { desaLogo: PDFImage | null; bandesaTtd: PDFImage | null },
  barColor: RGB
) {
  page.drawRectangle({ x: 0, y: 0, width: CARD_W, height: BACK_FOOTER_BAR_H, color: barColor });
  page.drawRectangle({
    x: 0,
    y: CARD_H - BACK_TOP_BAR_H,
    width: CARD_W,
    height: BACK_TOP_BAR_H,
    color: barColor,
  });
  page.drawRectangle({
    x: 0,
    y: BACK_FOOTER_BAR_H,
    width: CARD_W,
    height: CARD_H - BACK_TOP_BAR_H - BACK_FOOTER_BAR_H,
    color: COLOR_BODY,
  });

  const logoX = (CARD_W - BACK_LOGO_SIZE) / 2;
  const logoY = CARD_H - BACK_TOP_BAR_H + (BACK_TOP_BAR_H - BACK_LOGO_SIZE) / 2;
  if (images.desaLogo) {
    page.drawImage(images.desaLogo, {
      x: logoX,
      y: logoY,
      width: BACK_LOGO_SIZE,
      height: BACK_LOGO_SIZE,
    });
  }

  const bodyTop = CARD_H - BACK_TOP_BAR_H - KARTU_BACK_BODY_GAP_PT;
  const leftW = CARD_W * 0.38;
  const rightX = leftW + 2 * MM;
  const rightW = CARD_W - rightX - MARGIN;

  const jabatan = kartuKramaAdatBandesaJabatan(desa);
  const nama = kartuKramaAdatBandesaNama(desa);
  const callCenter = kartuKramaAdatCallCenter(desa);

  let ly = bodyTop;
  drawCenteredInBox(page, jabatan, 0, leftW, ly, 5.5, fonts.bold);

  const signW = leftW * 0.72;
  const signH = BACK_SIGN_SPACE_H;
  const signX = (leftW - signW) / 2;
  const signY = bodyTop - 2.4 * MM - signH + KARTU_BACK_SIGN_SHIFT_UP_PT;
  if (images.bandesaTtd) {
    drawImageContain(page, images.bandesaTtd, signX, signY, signW, signH);
  }

  ly -= BACK_SIGN_SPACE_H;
  if (nama) {
    drawCenteredInBox(page, truncateText(nama, 28), 0, leftW, ly, 6, fonts.bold);
    ly -= 3 * MM;
  } else {
    ly -= 1.5 * MM;
  }

  const qrSize = 14 * MM;
  const qrX = (leftW - qrSize) / 2;
  const qrY = ly - qrSize;
  await drawKartuQrOnPage(pdf, page, krama.nomor_kartu, qrX, qrY, qrSize);

  ly = qrY - 2 * MM;
  const callLabel = callCenter
    ? `Call Center: ${pdfSafeMixed(callCenter)}`
    : "Call Center:";
  drawCenteredInBox(page, callLabel, 0, leftW, ly, 4.8, fonts.regular);

  drawCenteredInBox(
    page,
    "Support by: Trista Media",
    0,
    leftW,
    BACK_FOOTER_BAR_H + 1.5 * MM,
    4,
    fonts.regular
  );

  let ry = bodyTop;
  page.drawText("KETENTUAN", {
    x: rightX,
    y: ry,
    size: 6,
    font: fonts.bold,
    color: COLOR_TEXT,
  });
  ry -= 3 * MM;

  const itemSize = KARTU_BACK_KETENTUAN_FONT_PDF;
  const lineStep = 2.35 * MM;
  const itemGap = 0.6 * MM;
  KARTU_KRAMA_ADAT_KETENTUAN.forEach((item, index) => {
    const num = `${index + 1}. `;
    const numW = fonts.regular.widthOfTextAtSize(num, itemSize);
    const lines = wrapMixedLines(item, rightW - numW - 0.5 * MM, itemSize, fonts.regular);
    lines.forEach((line, lineIndex) => {
      if (lineIndex === 0) {
        page.drawText(num, { x: rightX, y: ry, size: itemSize, font: fonts.regular, color: COLOR_TEXT });
      }
      page.drawText(line, {
        x: rightX + (lineIndex === 0 ? numW : 2.5 * MM),
        y: ry,
        size: itemSize,
        font: fonts.regular,
        color: COLOR_TEXT,
      });
      ry -= lineStep;
    });
    ry -= itemGap;
  });
}

export async function drawKartuBackAt(
  pdf: PDFDocument,
  page: PDFPage,
  originX: number,
  originY: number,
  krama: KramaDetail,
  desa: DesaAdat | null,
  fonts: {
    regular: Awaited<ReturnType<PDFDocument["embedFont"]>>;
    bold: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  },
  images: { desaLogo: PDFImage | null; bandesaTtd: PDFImage | null },
  barColor: RGB
) {
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(1, 0, 0, 1, originX, originY));
  await drawKartuBackPage(pdf, page, krama, desa, fonts, images, barColor);
  page.pushOperators(popGraphicsState());
}
