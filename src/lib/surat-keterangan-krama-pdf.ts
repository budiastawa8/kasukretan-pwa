import { PDFDocument, type PDFImage } from "pdf-lib";
import {
  BODY_SIZE,
  LINE_GAP,
  SECTION_GAP,
  SURAT_CONTENT_W,
  SURAT_MARGIN_X,
  SURAT_MARGIN_Y,
  SURAT_PAGE_H,
  SURAT_PAGE_W,
  drawCenteredBoldUnderline,
  drawImageContain,
  drawLabelValue,
  drawMixedSegments,
  drawSuratKop,
  formatTanggalSuratIndonesia,
  LABEL_COLON_SHIFT_PT,
  LABEL_VALUE_GAP,
} from "./surat-dinas-pdf-common";
import {
  COLOR_TEXT,
  MM,
  drawCenteredText,
  embedDataUrlImage,
  pdfSafeText,
  type PdfFonts,
} from "./pdf-common";
import { createSuratDinasFonts } from "./surat-dinas-pdf-fonts";
import type {
  SuratKeteranganKramaRow,
  SuratKeteranganKramaSnapshot,
} from "./services/surat-keterangan-krama";
import { parseSuratKeteranganSnapshot, snapshotNamaAnggota, buildSuratKeteranganPernyataan } from "./services/surat-keterangan-krama";
import type { DesaAdat } from "./types";

const TITLE_SIZE = 12;
const LABEL_W = 22 * MM;
const FIELD_INDENT_PT = 20;
const INTRO_LINE_EXTRA_GAP_PT = 10;
const PARAGRAPH_GAP_PT = 30;
const CONTENT_RIGHT_X = SURAT_MARGIN_X + SURAT_CONTENT_W;

const SIGN_SIZE = 10.5;
const SIGN_NAME_SIZE = 10.5;
const SIGN_BLOCK_HEIGHT_TRIM_PT = 10;
const SIGN_IMG_H = 26 * MM - SIGN_BLOCK_HEIGHT_TRIM_PT;
const SIGN_IMG_W_FRAC = 0.55;
const SIGN_JABATAN_TO_IMG_GAP = 1.5 * MM;
const SIGN_IMG_TO_NAME_GAP = 0.5 * MM;
const SIGN_BLOCK_W_FRAC = 0.42;

export type SuratKeteranganKramaPdfPayload = {
  filename: string;
  desa: DesaAdat;
  surat: SuratKeteranganKramaRow;
  snapshot: SuratKeteranganKramaSnapshot;
};

function drawCenteredTitle(
  page: ReturnType<PDFDocument["addPage"]>,
  title: string,
  y: number,
  fonts: PdfFonts
): number {
  const safe = pdfSafeText(title);
  const w = fonts.bold.widthOfTextAtSize(safe, TITLE_SIZE);
  const x = SURAT_MARGIN_X + (SURAT_CONTENT_W - w) / 2;
  page.drawText(safe, { x, y, size: TITLE_SIZE, font: fonts.bold, color: COLOR_TEXT });
  page.drawLine({
    start: { x, y: y - 2 },
    end: { x: x + w, y: y - 2 },
    thickness: 1,
    color: COLOR_TEXT,
  });
  return y - LINE_GAP * 1.2;
}

function drawCenteredNomor(
  page: ReturnType<PDFDocument["addPage"]>,
  nomor: string,
  y: number,
  fonts: PdfFonts
): number {
  const text = `Nomor : ${nomor}`;
  const safe = pdfSafeText(text);
  const w = fonts.regular.widthOfTextAtSize(safe, BODY_SIZE);
  const x = SURAT_MARGIN_X + (SURAT_CONTENT_W - w) / 2;
  page.drawText(safe, { x, y, size: BODY_SIZE, font: fonts.regular, color: COLOR_TEXT });
  return y - LINE_GAP * 1.6;
}

function drawBandesaSignature(
  page: ReturnType<PDFDocument["addPage"]>,
  desa: DesaAdat,
  snapshot: SuratKeteranganKramaSnapshot,
  tanggalTerbit: string,
  fonts: PdfFonts,
  italicFont: PdfFonts["regular"],
  bandesaTtd: PDFImage | null,
  yTop: number
): void {
  const blockW = SURAT_CONTENT_W * SIGN_BLOCK_W_FRAC;
  const x = SURAT_MARGIN_X + SURAT_CONTENT_W - blockW;
  const desaNama = snapshot.nama_desa_adat || desa.nama_desa_adat?.trim() || "Desa Adat";
  const tanggalLabel = `${desaNama}, ${formatTanggalSuratIndonesia(tanggalTerbit)}`;
  const jabatan = snapshot.bandesa_jabatan || desa.bandesa_jabatan?.trim() || "Bandesa Adat";
  const bandesaNama = snapshot.bandesa_nama || desa.bandesa_nama?.trim() || "";
  const showTtd = snapshot.tampilkan_ttd_bandesa !== false;

  let y = yTop;
  drawCenteredText(page, tanggalLabel, x, blockW, y, BODY_SIZE, fonts.regular, COLOR_TEXT);
  y -= LINE_GAP * 1.4;
  drawCenteredText(page, jabatan, x, blockW, y, SIGN_SIZE, italicFont, COLOR_TEXT);
  y -= SIGN_JABATAN_TO_IMG_GAP + SIGN_IMG_H;

  if (showTtd && bandesaTtd) {
    const signW = blockW * SIGN_IMG_W_FRAC;
    const signX = x + (blockW - signW) / 2;
    drawImageContain(page, bandesaTtd, signX, y, signW, SIGN_IMG_H, "bottom");
  }

  y -= SIGN_IMG_TO_NAME_GAP;

  if (bandesaNama) {
    drawCenteredBoldUnderline(page, bandesaNama, x, blockW, y, SIGN_NAME_SIZE, fonts.bold);
  }
}

async function drawSuratPage(
  pdf: PDFDocument,
  payload: SuratKeteranganKramaPdfPayload,
  fonts: PdfFonts,
  italicFont: PdfFonts["regular"],
  images: { mdaLogo: PDFImage | null; desaLogo: PDFImage | null; bandesaTtd: PDFImage | null }
): Promise<void> {
  const page = pdf.addPage([SURAT_PAGE_W, SURAT_PAGE_H]);
  const desa = payload.desa;
  const snap = payload.snapshot;
  const desaNama = snap.nama_desa_adat || desa.nama_desa_adat?.trim() || "Desa Adat";

  let y = SURAT_PAGE_H - SURAT_MARGIN_Y;
  y = await drawSuratKop(page, desa, fonts, images.mdaLogo, images.desaLogo, y);
  y -= SECTION_GAP;

  y = drawCenteredTitle(page, "SURAT KETERANGAN KRAMA DESA ADAT", y, fonts);
  y = drawCenteredNomor(page, payload.surat.nomor_surat, y, fonts);
  y -= SECTION_GAP * 0.5;

  page.drawText("Yang bertanda tangan di bawah ini :", {
    x: SURAT_MARGIN_X,
    y,
    size: BODY_SIZE,
    font: fonts.regular,
    color: COLOR_TEXT,
  });
  y -= LINE_GAP * 1.2;
  y -= INTRO_LINE_EXTRA_GAP_PT;

  const fieldX = SURAT_MARGIN_X + FIELD_INDENT_PT;
  const labelMaxW = CONTENT_RIGHT_X - fieldX - LABEL_W - LABEL_VALUE_GAP - LABEL_COLON_SHIFT_PT;

  y = drawLabelValue(page, "Nama", snap.bandesa_nama, fieldX, y, LABEL_W, labelMaxW, fonts, BODY_SIZE, CONTENT_RIGHT_X);
  y -= LINE_GAP * 0.35;
  y = drawLabelValue(page, "NIK", snap.bandesa_nik, fieldX, y, LABEL_W, labelMaxW, fonts, BODY_SIZE, CONTENT_RIGHT_X);
  y -= LINE_GAP * 0.35;
  y = drawLabelValue(
    page,
    "Bertindak selaku",
    `${snap.bandesa_jabatan} Desa Adat ${desaNama}`,
    SURAT_MARGIN_X,
    y,
    LABEL_W,
    CONTENT_RIGHT_X - SURAT_MARGIN_X - LABEL_W - LABEL_VALUE_GAP - LABEL_COLON_SHIFT_PT,
    fonts,
    BODY_SIZE,
    CONTENT_RIGHT_X
  );
  y -= LINE_GAP * 1.4;

  page.drawText("Dengan ini menerangkan bahwa :", {
    x: SURAT_MARGIN_X,
    y,
    size: BODY_SIZE,
    font: fonts.regular,
    color: COLOR_TEXT,
  });
  y -= LINE_GAP * 1.2;
  y -= INTRO_LINE_EXTRA_GAP_PT;

  y = drawLabelValue(page, "Nama", snapshotNamaAnggota(snap), fieldX, y, LABEL_W, labelMaxW, fonts, BODY_SIZE, CONTENT_RIGHT_X);
  y -= LINE_GAP * 0.35;
  y = drawLabelValue(
    page,
    snap.identitas_label,
    snap.identitas_nilai,
    fieldX,
    y,
    LABEL_W,
    labelMaxW,
    fonts,
    BODY_SIZE,
    CONTENT_RIGHT_X
  );
  y -= LINE_GAP * 0.35;
  y = drawLabelValue(page, "Alamat", snap.alamat_lengkap, fieldX, y, LABEL_W, labelMaxW, fonts, BODY_SIZE, CONTENT_RIGHT_X);
  y -= SECTION_GAP;

  const pernyataan = buildSuratKeteranganPernyataan(snap, desaNama);
  y = drawMixedSegments(
    page,
    [{ text: pernyataan }],
    SURAT_MARGIN_X,
    y,
    SURAT_CONTENT_W,
    BODY_SIZE,
    fonts,
    italicFont,
    "justify"
  );
  y -= PARAGRAPH_GAP_PT;

  const penutup = `Demikian surat keterangan ini dibuat dengan sebenar-benarnya untuk dapat dipergunakan sebagaimana mestinya, khususnya untuk keperluan ${snap.tujuan}.`;
  y = drawMixedSegments(
    page,
    [{ text: penutup }],
    SURAT_MARGIN_X,
    y,
    SURAT_CONTENT_W,
    BODY_SIZE,
    fonts,
    italicFont,
    "justify"
  );
  y -= LINE_GAP * 2;

  drawBandesaSignature(
    page,
    desa,
    snap,
    payload.surat.tanggal_terbit,
    fonts,
    italicFont,
    images.bandesaTtd,
    y
  );
}

export function buildSuratKeteranganKramaPdfPayload(
  desa: DesaAdat,
  surat: SuratKeteranganKramaRow
): SuratKeteranganKramaPdfPayload {
  const snapshot = parseSuratKeteranganSnapshot(surat.snapshot_json);
  const safeNomor = surat.nomor_surat.replace(/\//g, "-");
  return {
    filename: `Surat-Keterangan-Krama-${safeNomor}`,
    desa,
    surat,
    snapshot,
  };
}

export async function buildSuratKeteranganKramaPdfBytes(
  payloads: SuratKeteranganKramaPdfPayload[]
): Promise<Uint8Array> {
  if (!payloads.length) throw new Error("Tidak ada surat keterangan krama untuk dicetak.");
  const pdf = await PDFDocument.create();
  const fonts = await createSuratDinasFonts(pdf);
  const italicFont = fonts.italic;

  const desa = payloads[0]!.desa;
  const [mdaLogo, desaLogo, bandesaTtd] = await Promise.all([
    embedDataUrlImage(pdf, desa.logo_mda_url),
    embedDataUrlImage(pdf, desa.logo_url),
    embedDataUrlImage(pdf, desa.bandesa_ttd_url),
  ]);
  const images = { mdaLogo, desaLogo, bandesaTtd };

  for (const payload of payloads) {
    await drawSuratPage(pdf, payload, fonts, italicFont, images);
  }

  return pdf.save();
}
