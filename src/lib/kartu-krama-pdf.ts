import {
  clip,
  concatTransformationMatrix,
  endPath,
  PDFDocument,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  type PDFImage,
  type PDFPage,
  rgb,
  StandardFonts,
} from "pdf-lib";
import {
  chunkKartuA4Pages,
  kartuA4PageSizePt,
  kartuGridBackOriginPt,
  kartuGridSlotOriginPt,
  KARTU_A4_GRID,
  MM_TO_PT,
} from "./kartu-a4-grid";
import { KARTU_FOTO_MM } from "./foto-penduduk";
import {
  buildKartuFieldLayout,
  drawKartuField,
  drawKartuFieldWrapped,
} from "./kartu-field-pdf";
import { showBerlakuSdPipilCetak } from "./ilikita-kebijakan";
import { formatBerlakuSdKrama } from "./masa-berlaku";
import { kartuKecamatanTanggal } from "./kartu-krama-utils";
import { drawKartuBackAt, KARTU_BACK_BAR_MIPIL } from "./kartu-krama-back-pdf";
import { kartuCountSuffix } from "./kartu-pdf-filename";
import type { AnggotaKeluarga, DesaAdat, KramaDetail } from "./types";
import { formatJenisKelamin, formatTempatTanggalLahir } from "./utils";

const MM = MM_TO_PT;
const CARD_W = KARTU_A4_GRID.cardWmm * MM;
const CARD_H = KARTU_A4_GRID.cardHmm * MM;
const HEADER_H = 11 * MM;
const MARGIN = 2 * MM;
const FIELD_FONT_SIZE = 6.2;
const FIELD_LINE_GAP_MM = 3.35;
const WRAPPED_LINE_STEP_MM = 2.25;

const KARTU_MIPIL_LABELS = [
  "NIKA",
  "Nama",
  "Klasifikasi",
  "Jenis Kelamin",
  "TTL",
  "Pekerjaan",
  "Alamat",
  "Tempek",
  "Banjar",
  "Berlaku S/D",
] as const;

const COLOR_RED = KARTU_BACK_BAR_MIPIL;
const COLOR_BODY = rgb(244 / 255, 239 / 255, 230 / 255);
const COLOR_TEXT = rgb(0.07, 0.07, 0.07);
const COLOR_PHOTO_BG = rgb(220 / 255, 233 / 255, 245 / 255);

/** pdf-lib StandardFonts — pertahankan huruf asli (untuk ketentuan). */
function pdfSafeMixed(text: string): string {
  return text
    .replace(/\u2026/g, "...")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "?");
}

/** pdf-lib StandardFonts hanya mendukung WinAnsi — hindari karakter di luar Latin-1. */
function pdfSafeText(text: string): string {
  return pdfSafeMixed(text).toUpperCase();
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1]! : dataUrl;
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function embedDataUrlImage(
  pdf: PDFDocument,
  dataUrl?: string | null
): Promise<PDFImage | null> {
  const src = dataUrl?.trim();
  if (!src?.startsWith("data:image/") || src.startsWith("data:image/svg")) return null;
  try {
    const bytes = dataUrlToBytes(src);
    if (src.includes("image/png")) {
      try {
        return await pdf.embedPng(bytes);
      } catch {
        return await pdf.embedJpg(bytes);
      }
    }
    try {
      return await pdf.embedJpg(bytes);
    } catch {
      return await pdf.embedPng(bytes);
    }
  } catch {
    return null;
  }
}

/** Sama seperti CSS object-fit: cover di pratinjau kartu. */
function drawImageCover(
  page: PDFPage,
  image: PDFImage,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number
) {
  const imgW = image.width;
  const imgH = image.height;
  const scale = Math.max(boxW / imgW, boxH / imgH);
  const drawW = imgW * scale;
  const drawH = imgH * scale;
  const drawX = boxX + (boxW - drawW) / 2;
  const drawY = boxY + (boxH - drawH) / 2;

  page.pushOperators(
    pushGraphicsState(),
    rectangle(boxX, boxY, boxW, boxH),
    clip(),
    endPath()
  );
  page.drawImage(image, { x: drawX, y: drawY, width: drawW, height: drawH });
  page.pushOperators(popGraphicsState());
}

function truncateText(text: string, maxLen: number): string {
  const t = pdfSafeText(text.trim());
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 3)}...`;
}

function drawCenteredText(
  page: PDFPage,
  text: string,
  y: number,
  size: number,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>
) {
  const safe = pdfSafeText(text);
  const w = font.widthOfTextAtSize(safe, size);
  page.drawText(safe, {
    x: (CARD_W - w) / 2,
    y,
    size,
    font,
    color: COLOR_TEXT,
  });
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

async function drawCardPage(
  _pdf: PDFDocument,
  page: PDFPage,
  krama: KramaDetail,
  desa: DesaAdat | null,
  anggota: AnggotaKeluarga,
  fonts: {
    regular: Awaited<ReturnType<PDFDocument["embedFont"]>>;
    bold: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  },
  images: {
    mdaLogo: PDFImage | null;
    desaLogo: PDFImage | null;
    foto: PDFImage | null;
  }
) {
  const bodyTop = CARD_H - HEADER_H;

  page.drawRectangle({
    x: 0,
    y: bodyTop,
    width: CARD_W,
    height: HEADER_H,
    color: COLOR_RED,
  });

  page.drawRectangle({
    x: 0,
    y: 0,
    width: CARD_W,
    height: bodyTop,
    color: COLOR_BODY,
  });

  const desaNama = desa?.nama_desa_adat?.trim().toUpperCase() ?? "DESA ADAT";
  const kec = desa?.nama_kecamatan?.trim();
  const kab = desa?.nama_kabupaten?.trim();
  const lokasi =
    kec && kab ? `Kecamatan ${kec} Kabupaten ${kab}` : kec ? `Kecamatan ${kec}` : kab ? `Kabupaten ${kab}` : "";

  const logoSize = 8 * MM;
  const logoY = bodyTop + (HEADER_H - logoSize) / 2;

  if (images.desaLogo) {
    page.drawImage(images.desaLogo, {
      x: MARGIN,
      y: logoY,
      width: logoSize,
      height: logoSize,
    });
  }

  if (images.mdaLogo) {
    page.drawImage(images.mdaLogo, {
      x: CARD_W - MARGIN - logoSize,
      y: logoY,
      width: logoSize,
      height: logoSize,
    });
  }

  drawCenteredText(page, "KARTU KRAMA ADAT", bodyTop + 7.1 * MM, 6.4, fonts.bold);
  drawCenteredText(page, `DESA ADAT ${desaNama}`, bodyTop + 4.7 * MM, 6, fonts.bold);
  if (lokasi) {
    drawCenteredText(page, lokasi, bodyTop + 2.4 * MM, 5, fonts.regular);
  }

  const klasifikasi = krama.jenis_nama?.trim() || krama.klasifikasi_nama;
  const ttl = formatTempatTanggalLahir(anggota.tempat_lahir, anggota.tanggal_lahir);
  const photoW = KARTU_FOTO_MM.w * MM;
  const photoH = KARTU_FOTO_MM.h * MM;
  const photoX = CARD_W - MARGIN - photoW;
  const photoY = bodyTop - photoH - 3 * MM;

  let y = bodyTop - 3.5 * MM;
  const bodyFont = fonts.regular;
  const layout = buildKartuFieldLayout(
    bodyFont,
    KARTU_MIPIL_LABELS,
    2,
    photoX,
    FIELD_FONT_SIZE
  );
  const indentLayout = { ...layout, labelX: layout.labelX + 3 * MM };

  drawKartuField(page, "NIKA", anggota.nika, y, layout, bodyFont, bodyFont, FIELD_FONT_SIZE, COLOR_TEXT);
  y -= FIELD_LINE_GAP_MM * MM;
  drawKartuField(page, "Nama", anggota.nama_lengkap, y, layout, bodyFont, bodyFont, FIELD_FONT_SIZE, COLOR_TEXT);
  y -= FIELD_LINE_GAP_MM * MM;
  drawKartuField(page, "Klasifikasi", klasifikasi, y, layout, bodyFont, bodyFont, FIELD_FONT_SIZE, COLOR_TEXT);
  y -= FIELD_LINE_GAP_MM * MM;
  drawKartuField(
    page,
    "Jenis Kelamin",
    formatJenisKelamin(anggota.jenis_kelamin),
    y,
    layout,
    bodyFont,
    bodyFont,
    FIELD_FONT_SIZE,
    COLOR_TEXT
  );
  y -= FIELD_LINE_GAP_MM * MM;
  y = drawKartuFieldWrapped(
    page,
    "TTL",
    ttl,
    y,
    layout,
    2,
    bodyFont,
    bodyFont,
    FIELD_FONT_SIZE,
    COLOR_TEXT,
    WRAPPED_LINE_STEP_MM,
    FIELD_LINE_GAP_MM
  );
  drawKartuField(page, "Pekerjaan", anggota.pekerjaan, y, layout, bodyFont, bodyFont, FIELD_FONT_SIZE, COLOR_TEXT);
  y -= FIELD_LINE_GAP_MM * MM;
  y = drawKartuFieldWrapped(
    page,
    "Alamat",
    krama.alamat,
    y,
    layout,
    2,
    bodyFont,
    bodyFont,
    FIELD_FONT_SIZE,
    COLOR_TEXT,
    WRAPPED_LINE_STEP_MM,
    FIELD_LINE_GAP_MM
  );
  drawKartuField(page, "Tempek", krama.tempek_nama, y, indentLayout, bodyFont, bodyFont, FIELD_FONT_SIZE, COLOR_TEXT);
  y -= FIELD_LINE_GAP_MM * MM;
  drawKartuField(page, "Banjar", krama.banjar_nama, y, indentLayout, bodyFont, bodyFont, FIELD_FONT_SIZE, COLOR_TEXT);
  if (showBerlakuSdPipilCetak(desa)) {
    y -= FIELD_LINE_GAP_MM * MM;
    drawKartuField(
      page,
      "Berlaku S/D",
      formatBerlakuSdKrama(krama, anggota),
      y,
      layout,
      bodyFont,
      bodyFont,
      FIELD_FONT_SIZE,
      COLOR_TEXT
    );
  }

  if (!images.foto) {
    page.drawRectangle({
      x: photoX,
      y: photoY,
      width: photoW,
      height: photoH,
      color: COLOR_PHOTO_BG,
    });
  }

  if (images.foto) {
    drawImageCover(page, images.foto, photoX, photoY, photoW, photoH);
  }

  const sideFooter = truncateText(kartuKecamatanTanggal(kec, krama.tanggal_terdaftar), 22);
  drawCenteredInBox(page, sideFooter, photoX, photoW, photoY - 3 * MM, 5, fonts.regular);
}

async function drawCardAt(
  pdf: PDFDocument,
  page: PDFPage,
  originX: number,
  originY: number,
  krama: KramaDetail,
  desa: DesaAdat | null,
  anggota: AnggotaKeluarga,
  fonts: {
    regular: Awaited<ReturnType<PDFDocument["embedFont"]>>;
    bold: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  },
  images: {
    mdaLogo: PDFImage | null;
    desaLogo: PDFImage | null;
    foto: PDFImage | null;
  }
) {
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(1, 0, 0, 1, originX, originY));
  await drawCardPage(pdf, page, krama, desa, anggota, fonts, images);
  page.pushOperators(popGraphicsState());
}

export function kartuKramaPdfFilename(
  krama: KramaDetail,
  count: number,
  anggota?: AnggotaKeluarga
): string {
  const nomor = krama.nomor_kartu.replace(/[^\w.-]+/g, "-");
  return `kartu-krama-adat-${nomor}${kartuCountSuffix(count, anggota)}.pdf`;
}

export async function generateKartuKramaPdf(
  krama: KramaDetail,
  desa: DesaAdat | null,
  anggotaList: AnggotaKeluarga[]
): Promise<Uint8Array> {
  if (!anggotaList.length) {
    throw new Error("Tidak ada anggota untuk diekspor");
  }

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const mdaLogo = await embedDataUrlImage(pdf, desa?.logo_mda_url);
  const desaLogo = await embedDataUrlImage(pdf, desa?.logo_url);
  const bandesaTtd = await embedDataUrlImage(pdf, desa?.bandesa_ttd_url);
  const [pageW, pageH] = kartuA4PageSizePt();
  const pages = chunkKartuA4Pages(anggotaList);

  for (const pageMembers of pages) {
    const page = pdf.addPage([pageW, pageH]);
    for (let i = 0; i < pageMembers.length; i++) {
      const anggota = pageMembers[i]!;
      const col = i % KARTU_A4_GRID.cols;
      const row = Math.floor(i / KARTU_A4_GRID.cols);
      const { x, y } = kartuGridSlotOriginPt(col, row);
      const back = kartuGridBackOriginPt(x, y);
      const foto = await embedDataUrlImage(pdf, anggota.foto_url);
      await drawCardAt(pdf, page, x, y, krama, desa, anggota, { regular, bold }, {
        mdaLogo,
        desaLogo,
        foto,
      });
      await drawKartuBackAt(pdf, page, back.x, back.y, krama, desa, { regular, bold }, {
        desaLogo,
        bandesaTtd,
      }, KARTU_BACK_BAR_MIPIL);
    }
  }

  return pdf.save();
}
