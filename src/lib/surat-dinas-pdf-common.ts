import type { PDFImage, PDFPage } from "pdf-lib";
import {
  COLOR_TEXT,
  MM,
  drawCenteredText,
  pdfSafeText,
  type PdfFonts,
} from "./pdf-common";
import type { DesaAdat } from "./types";

export const SURAT_PAGE_W = 210 * MM;
export const SURAT_PAGE_H = 297 * MM;
/** Margin kiri/kanan — 15 mm + 10 pt tambahan untuk surat keterangan. */
export const SURAT_MARGIN_X = 15 * MM + 10;
/** Margin atas — dikurangi 30 pt dari 15 mm agar kop tidak terlalu jauh dari tepi. */
export const SURAT_MARGIN_Y = 15 * MM - 30;
export const SURAT_CONTENT_W = SURAT_PAGE_W - 2 * SURAT_MARGIN_X;

export const BODY_SIZE = 10.5;
export const LABEL_SIZE = 10.5;
export const KOP_LINE1 = 11;
export const KOP_LINE2 = 12;
export const KOP_LINE3 = 9.5;
export const KOP_LINE_THICK = 2;
export const LABEL_COLON_SHIFT_PT = 5;
export const LABEL_VALUE_GAP = 2.5 * MM;
export const LINE_GAP = 4.8 * MM;
export const SECTION_GAP = 5 * MM;
export const PARAGRAPH_INDENT_PT = 20;

const KOP_LINE_STEP = 6 * MM;
const KOP_LOGO = (2 * KOP_LINE_STEP + 4.5 * MM) * 1.5;
const KOP_GAP = 2.5 * MM;

const BULAN_SURAT = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;

export function formatTanggalSuratIndonesia(tanggal: string): string {
  const parts = tanggal.trim().slice(0, 10).split("-");
  if (parts.length !== 3) return tanggal;
  const [y, m, d] = parts;
  const bulan = BULAN_SURAT[Math.max(0, Math.min(11, parseInt(m!, 10) - 1))] ?? m;
  return `${parseInt(d!, 10)} ${bulan} ${y}`;
}

export function drawImageContain(
  page: PDFPage,
  image: PDFImage,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  valign: "center" | "bottom" = "center"
) {
  const scale = Math.min(boxW / image.width, boxH / image.height);
  const drawW = image.width * scale;
  const drawH = image.height * scale;
  const drawY = valign === "bottom" ? boxY : boxY + (boxH - drawH) / 2;
  page.drawImage(image, {
    x: boxX + (boxW - drawW) / 2,
    y: drawY,
    width: drawW,
    height: drawH,
  });
}

export function metaColonX(x: number, labelW: number): number {
  return x + labelW + LABEL_COLON_SHIFT_PT;
}

export function metaValueX(x: number, labelW: number): number {
  return metaColonX(x, labelW) + LABEL_VALUE_GAP;
}

function splitOversizedWord(
  word: string,
  maxWidth: number,
  size: number,
  font: PdfFonts["regular"]
): string[] {
  if (font.widthOfTextAtSize(word, size) <= maxWidth) return [word];
  const chunks: string[] = [];
  let chunk = "";
  for (const ch of word) {
    const next = chunk + ch;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      chunk = next;
    } else {
      if (chunk) chunks.push(chunk);
      chunk = ch;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks.length ? chunks : [""];
}

export function splitWordsToLines(
  text: string,
  maxWidth: number,
  size: number,
  font: PdfFonts["regular"]
): string[] {
  const words = pdfSafeText(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const segments = splitOversizedWord(word, maxWidth, size, font);
    for (const segment of segments) {
      const candidate = current ? `${current} ${segment}` : segment;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
      } else {
        if (current) lines.push(current);
        current = segment;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function drawWrappedText(
  page: PDFPage,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  font: PdfFonts["regular"]
): number {
  const lineH = size * 1.35;
  const lines = splitWordsToLines(text, maxWidth, size, font);
  let cy = y;
  for (const line of lines) {
    page.drawText(line, { x, y: cy, size, font, color: COLOR_TEXT });
    cy -= lineH;
  }
  return cy;
}

export function drawLabelValue(
  page: PDFPage,
  label: string,
  value: string,
  x: number,
  y: number,
  labelW: number,
  maxValueW: number,
  fonts: PdfFonts,
  size = LABEL_SIZE,
  contentRightX?: number
): number {
  const lab = pdfSafeText(label);
  const actualLabelW = Math.max(labelW, fonts.bold.widthOfTextAtSize(lab, size));
  const colonX = x + actualLabelW + LABEL_COLON_SHIFT_PT;
  const valueX = colonX + LABEL_VALUE_GAP;
  const rightX = contentRightX ?? valueX + maxValueW;
  const effectiveMaxValueW = Math.max(20, rightX - valueX);

  const lineH = size * 1.35;
  const valueLines = splitWordsToLines(value, effectiveMaxValueW, size, fonts.regular);

  let cy = y;
  for (let i = 0; i < valueLines.length; i++) {
    if (i === 0) {
      page.drawText(lab, { x, y: cy, size, font: fonts.bold, color: COLOR_TEXT });
      page.drawText(":", { x: colonX, y: cy, size, font: fonts.bold, color: COLOR_TEXT });
    }
    page.drawText(valueLines[i]!, { x: valueX, y: cy, size, font: fonts.regular, color: COLOR_TEXT });
    if (i < valueLines.length - 1) cy -= lineH;
  }
  if (valueLines.length > 0) cy -= lineH;
  return cy;
}

export type TextSegment = { text: string; italic?: boolean };

type StyledWord = { text: string; font: PdfFonts["regular"] };

function flattenSegments(
  segments: TextSegment[],
  fonts: PdfFonts,
  italicFont: PdfFonts["regular"]
): StyledWord[] {
  const words: StyledWord[] = [];
  for (const seg of segments) {
    const font = seg.italic ? italicFont : fonts.regular;
    for (const word of pdfSafeText(seg.text).split(/\s+/).filter(Boolean)) {
      words.push({ text: word, font });
    }
  }
  return words;
}

function wrapStyledWords(
  words: StyledWord[],
  maxWidth: number,
  size: number,
  spaceFont: PdfFonts["regular"],
  firstLineIndent = 0
): StyledWord[][] {
  const spaceW = spaceFont.widthOfTextAtSize(" ", size);
  const lines: StyledWord[][] = [];
  let line: StyledWord[] = [];
  let lineW = 0;
  let lineIndex = 0;
  const lineMaxWidth = (idx: number) => (idx === 0 ? maxWidth - firstLineIndent : maxWidth);

  for (const word of words) {
    const wordW = word.font.widthOfTextAtSize(word.text, size);
    const maxW = lineMaxWidth(lineIndex);
    const addW = line.length === 0 ? wordW : spaceW + wordW;
    if (line.length > 0 && lineW + addW > maxW) {
      lines.push(line);
      lineIndex++;
      line = [word];
      lineW = wordW;
    } else {
      line.push(word);
      lineW += addW;
    }
  }
  if (line.length) lines.push(line);
  return lines;
}

function drawStyledLine(
  page: PDFPage,
  line: StyledWord[],
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  spaceFont: PdfFonts["regular"],
  justify: boolean
): void {
  if (!line.length) return;
  const spaceW = spaceFont.widthOfTextAtSize(" ", size);
  const wordWidths = line.map((w) => w.font.widthOfTextAtSize(w.text, size));
  const natural = wordWidths.reduce((sum, w) => sum + w, 0) + (line.length - 1) * spaceW;
  const gap =
    justify && line.length > 1 ? spaceW + (maxWidth - natural) / (line.length - 1) : spaceW;

  let cx = x;
  for (let i = 0; i < line.length; i++) {
    const word = line[i]!;
    page.drawText(word.text, { x: cx, y, size, font: word.font, color: COLOR_TEXT });
    cx += wordWidths[i]! + (i < line.length - 1 ? gap : 0);
  }
}

export function drawMixedSegments(
  page: PDFPage,
  segments: TextSegment[],
  x: number,
  y: number,
  maxWidth: number,
  size: number,
  fonts: PdfFonts,
  italicFont: PdfFonts["regular"],
  align: "left" | "justify" = "left",
  firstLineIndent = 0
): number {
  const words = flattenSegments(segments, fonts, italicFont);
  const lines = wrapStyledWords(words, maxWidth, size, fonts.regular, firstLineIndent);
  const lineH = size * 1.35;
  let cy = y;
  for (let i = 0; i < lines.length; i++) {
    const lineX = i === 0 ? x + firstLineIndent : x;
    const lineW = i === 0 ? maxWidth - firstLineIndent : maxWidth;
    const justify = align === "justify" && i < lines.length - 1;
    drawStyledLine(page, lines[i]!, lineX, cy, lineW, size, fonts.regular, justify);
    if (i < lines.length - 1) cy -= lineH;
  }
  return cy;
}

export function drawCenteredBoldUnderline(
  page: PDFPage,
  text: string,
  boxX: number,
  boxW: number,
  y: number,
  size: number,
  font: PdfFonts["bold"]
) {
  const safe = pdfSafeText(text).toUpperCase();
  const w = font.widthOfTextAtSize(safe, size);
  const x = boxX + (boxW - w) / 2;
  page.drawText(safe, { x, y, size, font, color: COLOR_TEXT });
  page.drawLine({
    start: { x, y: y - 1.5 },
    end: { x: x + w, y: y - 1.5 },
    thickness: 0.8,
    color: COLOR_TEXT,
  });
}

type KopTextLine = { text: string; size: number; bold: boolean };

function buildKopTextLines(desa: DesaAdat): KopTextLine[] {
  const desaNama = (desa.nama_desa_adat?.trim() || "DESA ADAT").toUpperCase();
  const kec = desa.nama_kecamatan?.trim() || "";
  const kab = desa.nama_kabupaten?.trim() || "";
  const lokasi =
    kec && kab ? `Kecamatan ${kec}, Kabupaten ${kab}` : kec || kab ? `Kecamatan ${kec}${kab}` : "";

  const lines: KopTextLine[] = [
    { text: "MAJELIS DESA ADAT (MDA) BALI", size: KOP_LINE1, bold: true },
    { text: `DESA ADAT ${desaNama}`, size: KOP_LINE2, bold: true },
  ];
  const alamat = desa.alamat_desa_adat?.trim();
  if (alamat) lines.push({ text: alamat, size: KOP_LINE3, bold: false });
  if (lokasi) lines.push({ text: lokasi, size: KOP_LINE3, bold: false });
  return lines;
}

export async function drawSuratKop(
  page: PDFPage,
  desa: DesaAdat,
  fonts: PdfFonts,
  mdaLogo: PDFImage | null,
  desaLogo: PDFImage | null,
  yTop: number
): Promise<number> {
  const textLines = buildKopTextLines(desa);
  const kopH = KOP_LOGO + (textLines.length > 3 ? 7 : 5) * MM;
  const bodyTop = yTop - kopH;
  const logoY = bodyTop + (kopH - KOP_LOGO) / 2;
  const logoRightX = SURAT_MARGIN_X + SURAT_CONTENT_W - KOP_LOGO;

  if (mdaLogo) {
    drawImageContain(page, mdaLogo, SURAT_MARGIN_X, logoY, KOP_LOGO, KOP_LOGO);
  }
  if (desaLogo) {
    drawImageContain(page, desaLogo, logoRightX, logoY, KOP_LOGO, KOP_LOGO);
  }

  const centerX = SURAT_MARGIN_X + KOP_LOGO + KOP_GAP;
  const centerW = SURAT_CONTENT_W - 2 * (KOP_LOGO + KOP_GAP);
  const textCenterY = bodyTop + kopH / 2 + 0.5 * MM;
  const halfSpan = ((textLines.length - 1) * KOP_LINE_STEP) / 2;

  for (let i = 0; i < textLines.length; i++) {
    const line = textLines[i]!;
    const y = textCenterY + halfSpan - i * KOP_LINE_STEP;
    drawCenteredText(
      page,
      line.text,
      centerX,
      centerW,
      y,
      line.size,
      line.bold ? fonts.bold : fonts.regular,
      COLOR_TEXT
    );
  }

  page.drawLine({
    start: { x: SURAT_MARGIN_X, y: bodyTop - 2 * MM + 10 },
    end: { x: SURAT_MARGIN_X + SURAT_CONTENT_W, y: bodyTop - 2 * MM + 10 },
    thickness: KOP_LINE_THICK,
    color: COLOR_TEXT,
  });

  return bodyTop - 6 * MM;
}
