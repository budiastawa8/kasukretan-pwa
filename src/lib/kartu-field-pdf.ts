import type { PDFDocument, PDFPage, RGB } from "pdf-lib";
import { MM_TO_PT } from "./kartu-a4-grid";

const MM = MM_TO_PT;

/** Jarak antara akhir label dan titik dua. */
const LABEL_COLON_GAP = 0.7 * MM;
/** Jarak antara titik dua dan awal nilai. */
const FIELD_COLON_GAP = 0.9 * MM;
/** Jarak antara akhir nilai dan bingkai foto. */
export const VALUE_PHOTO_GAP = 0.5 * MM;

export type PdfFont = Awaited<ReturnType<PDFDocument["embedFont"]>>;

export type KartuFieldLayout = {
  labelX: number;
  colonX: number;
  valueX: number;
  valueMaxW: number;
};

export function kartuFieldPdfSafeText(text: string): string {
  return text
    .replace(/\u2026/g, "...")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "?")
    .toUpperCase();
}

function textFits(font: PdfFont, text: string, size: number, maxWidth: number): boolean {
  return font.widthOfTextAtSize(text, size) <= maxWidth;
}

function ellipsisToWidth(font: PdfFont, text: string, size: number, maxWidth: number): string {
  let s = text;
  if (textFits(font, s, size, maxWidth)) return s;
  while (s.length > 1 && !textFits(font, `${s}...`, size, maxWidth)) {
    s = s.slice(0, -1);
  }
  return `${s}...`;
}

export function buildKartuFieldLayout(
  labelFont: PdfFont,
  labels: readonly string[],
  marginMm: number,
  valueAreaRight: number,
  fontSize: number
): KartuFieldLayout {
  let maxLabelW = 0;
  for (const label of labels) {
    const w = labelFont.widthOfTextAtSize(kartuFieldPdfSafeText(label), fontSize);
    if (w > maxLabelW) maxLabelW = w;
  }
  const labelX = marginMm * MM;
  const colonX = labelX + maxLabelW + LABEL_COLON_GAP;
  const colonW = labelFont.widthOfTextAtSize(":", fontSize);
  const valueX = colonX + colonW + FIELD_COLON_GAP;
  const valueMaxW = Math.max(8 * MM, valueAreaRight - valueX - VALUE_PHOTO_GAP);
  return { labelX, colonX, valueX, valueMaxW };
}

export function wrapKartuValueLines(
  font: PdfFont,
  text: string,
  size: number,
  maxWidth: number,
  maxLines: number
): string[] {
  const raw = kartuFieldPdfSafeText((text ?? "").trim());
  if (!raw || maxLines < 1) return [];

  const words = raw.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  let truncated = false;

  const flush = () => {
    if (!current) return;
    lines.push(current);
    current = "";
  };

  const capLastLine = () => {
    if (!lines.length) return;
    const idx = lines.length - 1;
    lines[idx] = ellipsisToWidth(font, lines[idx]!, size, maxWidth);
    truncated = true;
  };

  for (const word of words) {
    if (truncated) break;

    const trial = current ? `${current} ${word}` : word;
    if (textFits(font, trial, size, maxWidth)) {
      current = trial;
      continue;
    }

    if (current) {
      flush();
      if (lines.length >= maxLines) {
        capLastLine();
        break;
      }
    }

    if (textFits(font, word, size, maxWidth)) {
      current = word;
      continue;
    }

    for (const ch of word) {
      const next = current + ch;
      if (textFits(font, next, size, maxWidth)) {
        current = next;
        continue;
      }
      if (current) {
        flush();
        if (lines.length >= maxLines) {
          capLastLine();
          break;
        }
      }
      current = ch;
    }
    if (truncated) break;
  }

  if (!truncated && current) {
    if (lines.length < maxLines) {
      lines.push(current);
    } else {
      lines[maxLines - 1] = ellipsisToWidth(
        font,
        `${lines[maxLines - 1]!} ${current}`,
        size,
        maxWidth
      );
    }
  }

  return lines;
}

function drawLabelInColumn(
  page: PDFPage,
  label: string,
  y: number,
  layout: KartuFieldLayout,
  font: PdfFont,
  fontSize: number,
  color: RGB
) {
  page.drawText(kartuFieldPdfSafeText(label), {
    x: layout.labelX,
    y,
    size: fontSize,
    font,
    color,
  });
}

/** Satu baris nilai — dipotong dengan elipsis jika melebihi lebar hingga foto. */
export function drawKartuField(
  page: PDFPage,
  label: string,
  value: string | undefined | null,
  y: number,
  layout: KartuFieldLayout,
  labelFont: PdfFont,
  valueFont: PdfFont,
  fontSize: number,
  color: RGB
) {
  drawLabelInColumn(page, label, y, layout, labelFont, fontSize, color);
  page.drawText(":", { x: layout.colonX, y, size: fontSize, font: labelFont, color });

  const raw = kartuFieldPdfSafeText((value ?? "").trim());
  if (!raw) return;
  const fitted = ellipsisToWidth(valueFont, raw, fontSize, layout.valueMaxW);
  page.drawText(fitted, {
    x: layout.valueX,
    y,
    size: fontSize,
    font: valueFont,
    color,
  });
}

/** Beberapa baris nilai — mengembalikan baseline Y baris berikutnya. */
export function drawKartuFieldWrapped(
  page: PDFPage,
  label: string,
  value: string | undefined | null,
  y: number,
  layout: KartuFieldLayout,
  maxLines: number,
  labelFont: PdfFont,
  valueFont: PdfFont,
  fontSize: number,
  color: RGB,
  lineStepMm: number,
  lineGapMm: number
): number {
  drawLabelInColumn(page, label, y, layout, labelFont, fontSize, color);
  page.drawText(":", { x: layout.colonX, y, size: fontSize, font: labelFont, color });

  const lines = wrapKartuValueLines(valueFont, value ?? "", fontSize, layout.valueMaxW, maxLines);
  const lineStep = lineStepMm * MM;
  for (let i = 0; i < lines.length; i++) {
    page.drawText(lines[i]!, {
      x: layout.valueX,
      y: y - i * lineStep,
      size: fontSize,
      font: valueFont,
      color,
    });
  }

  const extraLines = Math.max(0, lines.length - 1);
  return y - extraLines * lineStep - lineGapMm * MM;
}
