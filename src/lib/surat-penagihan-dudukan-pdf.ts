import { PDFDocument, StandardFonts, type PDFImage, type PDFPage } from "pdf-lib";
import { formatBulanIndonesia, formatRupiah } from "./dudukan-hitung";
import {
  COLOR_TABLE_BORDER,
  COLOR_TABLE_HEAD,
  COLOR_TEXT,
  MM,
  createPdfFonts,
  drawCenteredText,
  embedDataUrlImage,
  pdfSafeText,
  type PdfFonts,
} from "./pdf-common";
import type { SuratPenagihanDudukanRow, SuratPenagihanTunggakanSnapshot } from "./services/surat-penagihan-dudukan";
import type { DudukanTunggakanLaporanRow } from "./services/dudukan";
import type { DesaAdat } from "./types";

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

function formatTanggalSuratIndonesia(tanggal: string): string {
  const parts = tanggal.trim().slice(0, 10).split("-");
  if (parts.length !== 3) return tanggal;
  const [y, m, d] = parts;
  const bulan = BULAN_SURAT[Math.max(0, Math.min(11, parseInt(m!, 10) - 1))] ?? m;
  return `${parseInt(d!, 10)} ${bulan} ${y}`;
}

const PAGE_W = 210 * MM;
const PAGE_H = 297 * MM;
/** A4 portrait — jangan pakai CONTENT_W dari pdf-common (itu lebar landscape). */
const SURAT_MARGIN_X = 15 * MM;
/** Margin atas — dikurangi 30 pt dari 15 mm agar kop tidak terlalu jauh dari tepi. */
const SURAT_MARGIN_Y = 15 * MM - 30;
const SURAT_CONTENT_W = PAGE_W - 2 * SURAT_MARGIN_X;

const BODY_SIZE = 10.5;
const LABEL_SIZE = 10.5;
const KOP_LINE1 = 11;
const KOP_LINE2 = 12;
const KOP_LINE3 = 9.5;
const TABLE_HEADER_SIZE = 10;
const TABLE_ROW_SIZE = 10;
const SIGN_SIZE = 10.5;
const SIGN_NAME_SIZE = 10.5;

const KOP_LINE_THICK = 2;
const PERIHAL_INDENT = 0;
const TABLE_WIDTH_FRAC = 0.88;
/** Jarak antar baris teks kop (baseline ke baseline). */
const KOP_LINE_STEP = 6 * MM;
/** Logo kop — 50% lebih besar dari tinggi blok teks kop. */
const KOP_LOGO = (2 * KOP_LINE_STEP + 4.5 * MM) * 1.5;
const KOP_GAP = 2.5 * MM;
/** Geser titik dua metadata ke kanan (pt). */
const LABEL_COLON_SHIFT_PT = 5;
/** Geser tanggal surat dan alamat penerima ke kanan (pt). */
const TANGGAL_ALAMAT_SHIFT_PT = 25;
/** Indent baris pertama setiap paragraf isi surat (pt). */
const PARAGRAPH_INDENT_PT = 20;
const LABEL_VALUE_GAP = 2.5 * MM;
const LINE_GAP = 4.8 * MM;
const SECTION_GAP = 5 * MM;
const TABLE_ROW_H = 7 * MM;
const SIGN_IMG_H = 26 * MM;
const SIGN_IMG_W_FRAC = 0.68;
/** Jarak jabatan ke atas kotak tanda tangan. */
const SIGN_JABATAN_TO_IMG_GAP = 1.5 * MM;
/** Jarak bawah gambar tanda tangan ke nama (kecil agar sedikit menyentuh). */
const SIGN_IMG_TO_NAME_GAP = 0.5 * MM;
/** Turunkan Om Santih dari paragraf penutup (pt). */
const OM_SANTIH_DROP_PT = 10;
/** Jarak Om Santih ke baris jabatan tanda tangan (pt). */
const OM_SANTIH_TO_SIGN_GAP_PT = 25;

type TextSegment = { text: string; italic?: boolean };

export type SuratPenagihanTunggakanBaris = {
  no: number;
  klasifikasi: string;
  /** Rentang `bulan tahun - bulan tahun`, atau satu bulan bila tunggal. */
  periode: string;
  /** Jumlah bulan tunggakan, mis. `3 bln`. */
  jumlahBln: string;
  jumlah: string;
};

export type SuratPenagihanDudukanPdfPayload = {
  filename: string;
  desa: DesaAdat;
  surat: SuratPenagihanDudukanRow;
  penerima: {
    kepala_nama: string;
    alamat: string;
    banjar_nama: string;
  };
  barisTunggakan: SuratPenagihanTunggakanBaris[];
  klasifikasiLabel: string;
};

function drawImageContain(
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

function metaColonX(x: number, labelW: number): number {
  return x + labelW + LABEL_COLON_SHIFT_PT;
}

function metaValueX(x: number, labelW: number): number {
  return metaColonX(x, labelW) + LABEL_VALUE_GAP;
}

function drawLabelValue(
  page: PDFPage,
  label: string,
  value: string,
  x: number,
  y: number,
  labelW: number,
  maxValueW: number,
  fonts: PdfFonts,
  size = LABEL_SIZE
): number {
  const lab = pdfSafeText(label);
  page.drawText(lab, { x, y, size, font: fonts.bold, color: COLOR_TEXT });
  const colonX = metaColonX(x, labelW);
  page.drawText(":", { x: colonX, y, size, font: fonts.bold, color: COLOR_TEXT });
  const valueX = metaValueX(x, labelW);
  return drawWrappedText(page, value, valueX, y, maxValueW, size, fonts.regular);
}

function splitWordsToLines(
  text: string,
  maxWidth: number,
  size: number,
  font: PdfFonts["regular"]
): string[] {
  const safe = pdfSafeText(text).trim();
  if (!safe) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of safe.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
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
    current = chunk;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function drawWrappedText(
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

function drawMixedSegments(
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

function openingParagraphSegments(desa: DesaAdat): TextSegment[] {
  const namaDesa = desa.nama_desa_adat?.trim() || "Desa Adat";
  const noPararem = desa.pararem_nomor?.trim() || "—";
  const thnPararem = desa.pararem_tahun?.trim() || "—";
  const judulPararem = desa.pararem_judul?.trim() || "—";
  return [
    { text: "Berdasarkan " },
    { text: "Pararem", italic: true },
    {
      text: ` Desa Adat ${namaDesa} Nomor ${noPararem} Tahun ${thnPararem} tentang ${judulPararem}, bersama ini kami beritahukan kepada Saudara/i bahwa kewajiban membayar kontribusi `,
    },
    { text: "Dudukan", italic: true },
    { text: " yang telah jatuh tempo adalah sebagai berikut:" },
  ];
}

function drawPerihalBlock(
  page: PDFPage,
  x: number,
  y: number,
  labelW: number,
  valueX: number,
  fonts: PdfFonts,
  size = LABEL_SIZE
): number {
  const lineH = size * 1.35;
  const colonX = metaColonX(x, labelW);
  page.drawText("Perihal", { x, y, size, font: fonts.bold, color: COLOR_TEXT });
  page.drawText(":", { x: colonX, y, size, font: fonts.bold, color: COLOR_TEXT });
  page.drawText("Pemberitahuan jatuh tempo", {
    x: valueX,
    y,
    size,
    font: fonts.regular,
    color: COLOR_TEXT,
  });
  page.drawText("Dudukan", {
    x: valueX + PERIHAL_INDENT,
    y: y - lineH,
    size,
    font: fonts.regular,
    color: COLOR_TEXT,
  });
  return y - lineH;
}

async function drawSuratKop(
  page: PDFPage,
  desa: DesaAdat,
  fonts: PdfFonts,
  mdaLogo: PDFImage | null,
  desaLogo: PDFImage | null,
  yTop: number
): Promise<number> {
  const desaNama = (desa.nama_desa_adat?.trim() || "DESA ADAT").toUpperCase();
  const kec = desa.nama_kecamatan?.trim() || "";
  const kab = desa.nama_kabupaten?.trim() || "";
  const lokasi =
    kec && kab ? `Kecamatan ${kec}, Kabupaten ${kab}` : kec || kab ? `Kecamatan ${kec}${kab}` : "";
  const alamat = desa.alamat_desa_adat?.trim() || "";
  const textLineCount = 2 + (alamat ? 1 : 0) + (lokasi ? 1 : 0);
  const kopH = KOP_LOGO + (textLineCount > 3 ? 7 : 5) * MM;

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
  const halfSpan = ((textLineCount - 1) * KOP_LINE_STEP) / 2;

  const lines: { text: string; size: number; bold: boolean }[] = [
    { text: "MAJELIS DESA ADAT (MDA) BALI", size: KOP_LINE1, bold: true },
    { text: `DESA ADAT ${desaNama}`, size: KOP_LINE2, bold: true },
  ];
  if (alamat) lines.push({ text: alamat, size: KOP_LINE3, bold: false });
  if (lokasi) lines.push({ text: lokasi, size: KOP_LINE3, bold: false });

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
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
    start: { x: SURAT_MARGIN_X, y: bodyTop - 2 * MM },
    end: { x: SURAT_MARGIN_X + SURAT_CONTENT_W, y: bodyTop - 2 * MM },
    thickness: KOP_LINE_THICK,
    color: COLOR_TEXT,
  });

  return bodyTop - 6 * MM;
}

function drawSignatures(
  page: PDFPage,
  desa: DesaAdat,
  fonts: PdfFonts,
  italicFont: PdfFonts["regular"],
  bandesaTtd: PDFImage | null,
  panyarikanTtd: PDFImage | null,
  yTop: number
): void {
  const half = SURAT_CONTENT_W / 2;
  const xLeft = SURAT_MARGIN_X;
  const xRight = SURAT_MARGIN_X + half;
  const bandesaJabatan = desa.bandesa_jabatan?.trim() || "Bandesa Adat";
  const bandesaNama = desa.bandesa_nama?.trim() || "";
  const panyarikanJabatan = desa.panyarikan_jabatan?.trim() || "Panyarikan";
  const panyarikanNama = desa.panyarikan_nama?.trim() || "";

  let y = yTop;
  drawCenteredText(page, bandesaJabatan, xLeft, half, y, SIGN_SIZE, italicFont, COLOR_TEXT);
  drawCenteredText(page, `${panyarikanJabatan},`, xRight, half, y, SIGN_SIZE, italicFont, COLOR_TEXT);
  y -= SIGN_JABATAN_TO_IMG_GAP + SIGN_IMG_H;

  const signW = half * SIGN_IMG_W_FRAC;
  const signXLeft = xLeft + (half - signW) / 2;
  const signXRight = xRight + (half - signW) / 2;
  const signY = y;

  if (bandesaTtd) {
    drawImageContain(page, bandesaTtd, signXLeft, signY, signW, SIGN_IMG_H, "bottom");
  }
  if (panyarikanTtd) {
    drawImageContain(page, panyarikanTtd, signXRight, signY, signW, SIGN_IMG_H, "bottom");
  }

  y = signY - SIGN_IMG_TO_NAME_GAP;

  if (bandesaNama) {
    drawCenteredBoldUnderline(page, bandesaNama, xLeft, half, y, SIGN_NAME_SIZE, fonts.bold);
  }
  if (panyarikanNama) {
    drawCenteredBoldUnderline(page, panyarikanNama, xRight, half, y, SIGN_NAME_SIZE, fonts.bold);
  }
}

function drawCenteredBoldUnderline(
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

const TABLE_CELL_PAD_X = 2 * MM;
const TABLE_CELL_PAD_Y = 1.6 * MM;
const TABLE_LINE_LEADING = 1.3;

function tableCellMaxTextW(colW: number): number {
  return Math.max(4, colW - 2 * TABLE_CELL_PAD_X);
}

function tableRowHeight(lineCount: number, size: number): number {
  const textH = size * TABLE_LINE_LEADING * Math.max(1, lineCount);
  return Math.max(TABLE_ROW_H, textH + 2 * TABLE_CELL_PAD_Y);
}

function alignCellTextX(
  align: "left" | "center" | "right",
  cellX: number,
  cellW: number,
  textW: number
): number {
  if (align === "center") return cellX + (cellW - textW) / 2;
  if (align === "right") return cellX + cellW - TABLE_CELL_PAD_X - textW;
  return cellX + TABLE_CELL_PAD_X;
}

function drawTableRow(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  cols: { key: string; fraction: number; align: "left" | "center" | "right" }[],
  colW: number[],
  values: string[],
  size: number,
  font: PdfFonts["regular"] | PdfFonts["bold"],
  opts?: { fill?: boolean }
): number {
  const lineSets = values.map((val, i) =>
    splitWordsToLines(val ?? "", tableCellMaxTextW(colW[i]!), size, font)
  );
  const lineCount = Math.max(1, ...lineSets.map((lines) => lines.length));
  const rowH = tableRowHeight(lineCount, size);
  const lineH = size * TABLE_LINE_LEADING;

  page.drawRectangle({
    x,
    y: y - rowH,
    width,
    height: rowH,
    color: opts?.fill ? COLOR_TABLE_HEAD : undefined,
    borderColor: COLOR_TABLE_BORDER,
    borderWidth: 0.6,
  });

  let cx = x;
  for (let i = 0; i < cols.length; i++) {
    const col = cols[i]!;
    const w = colW[i]!;
    const lines = lineSets[i]!;
    const blockH = lines.length * lineH;
    let ty = y - (rowH - blockH) / 2 - size;
    for (const line of lines) {
      const tw = font.widthOfTextAtSize(line, size);
      page.drawText(line, {
        x: alignCellTextX(col.align, cx, w, tw),
        y: ty,
        size,
        font,
        color: COLOR_TEXT,
      });
      ty -= lineH;
    }
    cx += w;
  }
  return y - rowH;
}

function drawTunggakanTable(
  page: PDFPage,
  fonts: PdfFonts,
  yTop: number,
  rows: SuratPenagihanTunggakanBaris[],
  totalDudukan: number
): number {
  const width = SURAT_CONTENT_W * TABLE_WIDTH_FRAC;
  const x = SURAT_MARGIN_X + (SURAT_CONTENT_W - width) / 2;
  const cols = [
    { key: "no", label: "No", fraction: 0.07, align: "center" as const },
    { key: "klasifikasi", label: "Klasifikasi", fraction: 0.28, align: "left" as const },
    { key: "periode", label: "Periode", fraction: 0.32, align: "left" as const },
    { key: "jumlahBln", label: "# Bln", fraction: 0.12, align: "center" as const },
    { key: "jumlah", label: "Jumlah", fraction: 0.21, align: "right" as const },
  ];

  const colW = cols.map((c) => width * c.fraction);
  let y = yTop;

  y = drawTableRow(
    page,
    x,
    y,
    width,
    cols,
    colW,
    cols.map((c) => c.label),
    TABLE_HEADER_SIZE,
    fonts.bold,
    { fill: true }
  );

  for (const row of rows) {
    y = drawTableRow(
      page,
      x,
      y,
      width,
      cols,
      colW,
      [String(row.no), row.klasifikasi, row.periode, row.jumlahBln, row.jumlah],
      TABLE_ROW_SIZE,
      fonts.regular
    );
  }

  y = drawTableRow(
    page,
    x,
    y,
    width,
    cols,
    colW,
    ["", "Total Dudukan", "", "", formatRupiah(totalDudukan)],
    TABLE_ROW_SIZE,
    fonts.bold
  );

  return y - SECTION_GAP;
}

async function drawSuratPage(
  pdf: PDFDocument,
  payload: SuratPenagihanDudukanPdfPayload,
  fonts: PdfFonts,
  italicFont: PdfFonts["regular"],
  images: { mdaLogo: PDFImage | null; desaLogo: PDFImage | null; bandesaTtd: PDFImage | null; panyarikanTtd: PDFImage | null }
): Promise<void> {
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const desa = payload.desa;
  const colGap = 4 * MM;
  const half = (SURAT_CONTENT_W - colGap) / 2;
  const leftX = SURAT_MARGIN_X;
  const labelW = 16 * MM;
  const valueX = metaValueX(leftX, labelW);
  const rightX = SURAT_MARGIN_X + half + colGap;
  const leftValueMaxW = half - labelW - 4 * MM;
  const rightMaxW = half;

  let y = PAGE_H - SURAT_MARGIN_Y;
  y = await drawSuratKop(page, desa, fonts, images.mdaLogo, images.desaLogo, y);
  y -= SECTION_GAP;

  const metaStartY = y;

  y = drawLabelValue(page, "Nomor", payload.surat.nomor_surat, leftX, metaStartY, labelW, leftValueMaxW, fonts);
  y -= LINE_GAP * 0.4;
  y = drawLabelValue(page, "Lampiran", "-", leftX, y, labelW, leftValueMaxW, fonts);
  y -= LINE_GAP * 0.4;
  const perihalY = y;
  y = drawPerihalBlock(page, leftX, perihalY, labelW, valueX, fonts);

  const tempat = desa.nama_desa_adat?.trim() || "Desa Adat";
  const tanggalLabel = `${tempat}, ${formatTanggalSuratIndonesia(payload.surat.tanggal_terbit)}`;
  const rightColX = rightX + TANGGAL_ALAMAT_SHIFT_PT;
  const rightColMaxW = rightMaxW - TANGGAL_ALAMAT_SHIFT_PT;
  let ry = drawWrappedText(page, tanggalLabel, rightColX, metaStartY, rightColMaxW, BODY_SIZE, fonts.regular);
  ry -= LINE_GAP * 0.6;

  ry = drawWrappedText(page, "Kepada Yth.", rightColX, perihalY, rightColMaxW, BODY_SIZE, fonts.regular);
  ry -= LINE_GAP * 0.35;
  ry = drawWrappedText(
    page,
    `Sdr/i. ${payload.penerima.kepala_nama}`,
    rightColX,
    ry,
    rightColMaxW,
    BODY_SIZE,
    fonts.bold
  );
  ry -= LINE_GAP * 0.35;
  ry = drawWrappedText(page, payload.penerima.alamat || "—", rightColX, ry, rightColMaxW, BODY_SIZE, fonts.bold);
  ry -= LINE_GAP * 0.35;
  ry = drawWrappedText(
    page,
    `Banjar Adat ${payload.penerima.banjar_nama}`,
    rightColX,
    ry,
    rightColMaxW,
    BODY_SIZE,
    fonts.regular
  );
  ry -= LINE_GAP * 0.35;
  ry = drawWrappedText(page, `Desa Adat ${tempat}`, rightColX, ry, rightColMaxW, BODY_SIZE, fonts.regular);

  y = Math.min(y, ry) - SECTION_GAP;
  page.drawText("Om Swastyastu,", {
    x: SURAT_MARGIN_X,
    y,
    size: BODY_SIZE,
    font: italicFont,
    color: COLOR_TEXT,
  });
  y -= LINE_GAP * 1.6;

  y = drawMixedSegments(
    page,
    openingParagraphSegments(desa),
    SURAT_MARGIN_X,
    y,
    SURAT_CONTENT_W,
    BODY_SIZE,
    fonts,
    italicFont,
    "justify",
    PARAGRAPH_INDENT_PT
  );
  y -= LINE_GAP * 1.4;

  y = drawTunggakanTable(page, fonts, y, payload.barisTunggakan, payload.surat.total_sisa);
  y -= SECTION_GAP;

  const closing =
    "Demikian pemberitahuan ini disampaikan untuk menjadi perhatian, dan ditindaklanjuti. Atas perhatian dan kerjasamanya kami ucapkan terima kasih.";
  y = drawMixedSegments(
    page,
    [{ text: closing }],
    SURAT_MARGIN_X,
    y,
    SURAT_CONTENT_W,
    BODY_SIZE,
    fonts,
    italicFont,
    "justify",
    PARAGRAPH_INDENT_PT
  );
  y -= LINE_GAP * 0.8;
  y -= OM_SANTIH_DROP_PT;
  page.drawText("Om Santih Santih Santih Om.", {
    x: SURAT_MARGIN_X,
    y,
    size: BODY_SIZE,
    font: italicFont,
    color: COLOR_TEXT,
  });

  drawSignatures(
    page,
    desa,
    fonts,
    italicFont,
    images.bandesaTtd,
    images.panyarikanTtd,
    y - OM_SANTIH_TO_SIGN_GAP_PT
  );
}

function formatPeriodeBulanTahunRentang(
  bulan: { bulan: number; tahun: number; sisa: number }[]
): { periode: string; jumlahBln: string; total: number } {
  if (!bulan.length) return { periode: "—", jumlahBln: "0 bln", total: 0 };
  const sorted = [...bulan].sort((a, b) => a.tahun * 100 + a.bulan - (b.tahun * 100 + b.bulan));
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const dari = formatBulanIndonesia(first.bulan, first.tahun);
  const sampai = formatBulanIndonesia(last.bulan, last.tahun);
  const periode = dari === sampai ? dari : `${dari} - ${sampai}`;
  const total = sorted.reduce((s, b) => s + (Number(b.sisa) || 0), 0);
  return { periode, jumlahBln: `${sorted.length} bln`, total };
}

export function buildSuratPenagihanBarisTunggakan(
  klasifikasiLabel: string,
  snapshot: SuratPenagihanTunggakanSnapshot
): SuratPenagihanTunggakanBaris[] {
  const { periode, jumlahBln, total } = formatPeriodeBulanTahunRentang(snapshot.bulan_tunggakan);
  if (!snapshot.bulan_tunggakan.length) return [];
  return [
    {
      no: 1,
      klasifikasi: `Dudukan ${klasifikasiLabel}`,
      periode,
      jumlahBln,
      jumlah: formatRupiah(total),
    },
  ];
}

export function buildSuratPenagihanPdfPayload(
  desa: DesaAdat,
  surat: SuratPenagihanDudukanRow,
  row: DudukanTunggakanLaporanRow
): SuratPenagihanDudukanPdfPayload {
  const snapshot = JSON.parse(surat.snapshot_json) as SuratPenagihanTunggakanSnapshot;
  const klasifikasiLabel = snapshot.jenis_nama?.trim() || row.jenis_nama?.trim() || row.klasifikasi_nama;
  const safeNomor = surat.nomor_surat.replace(/\//g, "-");
  return {
    filename: `Surat-Penagihan-Dudukan-${safeNomor}`,
    desa,
    surat,
    penerima: {
      kepala_nama: row.kepala_nama,
      alamat: row.alamat,
      banjar_nama: row.banjar_nama,
    },
    klasifikasiLabel,
    barisTunggakan: buildSuratPenagihanBarisTunggakan(klasifikasiLabel, snapshot),
  };
}

export async function buildSuratPenagihanDudukanPdfBytes(
  payloads: SuratPenagihanDudukanPdfPayload[]
): Promise<Uint8Array> {
  if (!payloads.length) throw new Error("Tidak ada surat penagihan untuk dicetak.");
  const pdf = await PDFDocument.create();
  const fonts = await createPdfFonts(pdf);
  const italicFont = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const desa = payloads[0]!.desa;
  const [mdaLogo, desaLogo, bandesaTtd, panyarikanTtd] = await Promise.all([
    embedDataUrlImage(pdf, desa.logo_mda_url),
    embedDataUrlImage(pdf, desa.logo_url),
    embedDataUrlImage(pdf, desa.bandesa_ttd_url),
    embedDataUrlImage(pdf, desa.panyarikan_ttd_url),
  ]);
  const images = { mdaLogo, desaLogo, bandesaTtd, panyarikanTtd };

  for (const payload of payloads) {
    await drawSuratPage(pdf, payload, fonts, italicFont, images);
  }

  return pdf.save();
}
