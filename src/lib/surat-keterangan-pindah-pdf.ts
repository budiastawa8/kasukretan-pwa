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
  SuratKeteranganPindahRow,
  SuratKeteranganPindahSnapshot,
} from "./services/surat-keterangan-pindah";
import {
  buildSkpPernyataan,
  formatSkpAlamatBaris,
  parseSkpSnapshot,
} from "./services/surat-keterangan-pindah";
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

export type SuratKeteranganPindahPdfPayload = {
  filename: string;
  desa: DesaAdat;
  surat: SuratKeteranganPindahRow;
  snapshot: SuratKeteranganPindahSnapshot;
};

/** Lebar kolom label seragam agar titik dua sejajar vertikal */
function labelColumnWidth(
  labels: string[],
  fonts: PdfFonts,
  size: number,
  minW: number
): number {
  let w = minW;
  for (const label of labels) {
    w = Math.max(w, fonts.bold.widthOfTextAtSize(pdfSafeText(label), size));
  }
  return w;
}

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
  snapshot: SuratKeteranganPindahSnapshot,
  tanggalTerbit: string,
  fonts: PdfFonts,
  italicFont: PdfFonts["regular"],
  bandesaTtd: PDFImage | null,
  yTop: number
): void {
  const blockW = SURAT_CONTENT_W * SIGN_BLOCK_W_FRAC;
  const x = SURAT_MARGIN_X + SURAT_CONTENT_W - blockW;
  const kec = snapshot.kecamatan_asal || desa.nama_kecamatan?.trim() || "";
  const tanggalLabel = kec
    ? `${kec}, ${formatTanggalSuratIndonesia(tanggalTerbit)}`
    : formatTanggalSuratIndonesia(tanggalTerbit);
  const desaNama = snapshot.nama_desa_adat || desa.nama_desa_adat?.trim() || "Desa Adat";
  const jabatan = `Bandesa Adat ${desaNama}`;
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
  payload: SuratKeteranganPindahPdfPayload,
  fonts: PdfFonts,
  italicFont: PdfFonts["regular"],
  images: { mdaLogo: PDFImage | null; desaLogo: PDFImage | null; bandesaTtd: PDFImage | null }
): Promise<void> {
  const page = pdf.addPage([SURAT_PAGE_W, SURAT_PAGE_H]);
  const desa = payload.desa;
  const snap = payload.snapshot;
  const desaNama = snap.nama_desa_adat || desa.nama_desa_adat?.trim() || "Desa Adat";
  const kecAsal = snap.kecamatan_asal || desa.nama_kecamatan?.trim() || "—";
  const kabAsal = snap.kabupaten_asal || desa.nama_kabupaten?.trim() || "—";

  let y = SURAT_PAGE_H - SURAT_MARGIN_Y;
  y = await drawSuratKop(page, desa, fonts, images.mdaLogo, images.desaLogo, y);
  y -= SECTION_GAP;

  y = drawCenteredTitle(page, "SURAT KETERANGAN PINDAH", y, fonts);
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

  const bandesaLabelW = labelColumnWidth(["Nama", "NIK"], fonts, BODY_SIZE, LABEL_W);
  const bandesaLabelMaxW =
    CONTENT_RIGHT_X - fieldX - bandesaLabelW - LABEL_VALUE_GAP - LABEL_COLON_SHIFT_PT;
  const fullLabelW = CONTENT_RIGHT_X - SURAT_MARGIN_X - LABEL_W - LABEL_VALUE_GAP - LABEL_COLON_SHIFT_PT;

  y = drawLabelValue(page, "Nama", snap.bandesa_nama, fieldX, y, bandesaLabelW, bandesaLabelMaxW, fonts, BODY_SIZE, CONTENT_RIGHT_X);
  y -= LINE_GAP * 0.35;
  y = drawLabelValue(page, "NIK", snap.bandesa_nik, fieldX, y, bandesaLabelW, bandesaLabelMaxW, fonts, BODY_SIZE, CONTENT_RIGHT_X);
  y -= LINE_GAP * 0.35;
  y = drawLabelValue(
    page,
    "Bertindak selaku",
    `${snap.bandesa_jabatan} Desa Adat ${desaNama}, Kecamatan ${kecAsal}, Kabupaten ${kabAsal}.`,
    SURAT_MARGIN_X,
    y,
    LABEL_W,
    fullLabelW,
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

  const ttl = snap.tempat_lahir && snap.tanggal_lahir
    ? `${snap.tempat_lahir}, ${snap.tanggal_lahir}`
    : snap.tanggal_lahir || snap.tempat_lahir || "—";

  const subjekLabels = [
    "Nama",
    "Tempat/Tgl. Lahir",
    "Jenis Kelamin",
    "Umur",
    "Pekerjaan",
    "Alamat",
    "No. Pipil",
    "NIK/NIKA",
  ];
  const subjekLabelW = labelColumnWidth(subjekLabels, fonts, BODY_SIZE, LABEL_W);
  const subjekLabelMaxW =
    CONTENT_RIGHT_X - fieldX - subjekLabelW - LABEL_VALUE_GAP - LABEL_COLON_SHIFT_PT;

  y = drawLabelValue(page, "Nama", snap.nama_subjek, fieldX, y, subjekLabelW, subjekLabelMaxW, fonts, BODY_SIZE, CONTENT_RIGHT_X);
  y -= LINE_GAP * 0.35;
  y = drawLabelValue(page, "Tempat/Tgl. Lahir", ttl, fieldX, y, subjekLabelW, subjekLabelMaxW, fonts, BODY_SIZE, CONTENT_RIGHT_X);
  y -= LINE_GAP * 0.35;
  y = drawLabelValue(page, "Jenis Kelamin", snap.jenis_kelamin, fieldX, y, subjekLabelW, subjekLabelMaxW, fonts, BODY_SIZE, CONTENT_RIGHT_X);
  y -= LINE_GAP * 0.35;
  y = drawLabelValue(page, "Umur", snap.umur, fieldX, y, subjekLabelW, subjekLabelMaxW, fonts, BODY_SIZE, CONTENT_RIGHT_X);
  y -= LINE_GAP * 0.35;
  y = drawLabelValue(page, "Pekerjaan", snap.pekerjaan, fieldX, y, subjekLabelW, subjekLabelMaxW, fonts, BODY_SIZE, CONTENT_RIGHT_X);
  y -= LINE_GAP * 0.35;
  y = drawLabelValue(
    page,
    "Alamat",
    formatSkpAlamatBaris(snap),
    fieldX,
    y,
    subjekLabelW,
    subjekLabelMaxW,
    fonts,
    BODY_SIZE,
    CONTENT_RIGHT_X
  );
  y -= LINE_GAP * 0.35;

  if (snap.jenis === "keluarga" && snap.pipil_nomor) {
    y = drawLabelValue(page, "No. Pipil", snap.pipil_nomor, fieldX, y, subjekLabelW, subjekLabelMaxW, fonts, BODY_SIZE, CONTENT_RIGHT_X);
    y -= LINE_GAP * 0.35;
  } else if (snap.jenis === "anggota" && snap.nika) {
    y = drawLabelValue(page, "NIK/NIKA", snap.nika, fieldX, y, subjekLabelW, subjekLabelMaxW, fonts, BODY_SIZE, CONTENT_RIGHT_X);
    y -= LINE_GAP * 0.35;
  }

  y -= SECTION_GAP * 0.5;

  const pernyataan = buildSkpPernyataan(snap);
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

  const penutup =
    "Demikian Surat Keterangan Pindah ini dibuat dengan sebenar-benarnya untuk dapat dipergunakan sebagaimana mestinya.";
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

export function buildSuratKeteranganPindahPdfPayload(
  desa: DesaAdat,
  surat: SuratKeteranganPindahRow
): SuratKeteranganPindahPdfPayload {
  const snapshot = parseSkpSnapshot(surat.snapshot_json);
  const safeNomor = surat.nomor_surat.replace(/\//g, "-");
  return {
    filename: `Surat-Keterangan-Pindah-${safeNomor}`,
    desa,
    surat,
    snapshot,
  };
}

export async function buildSuratKeteranganPindahPdfBytes(
  payloads: SuratKeteranganPindahPdfPayload[]
): Promise<Uint8Array> {
  if (!payloads.length) throw new Error("Tidak ada surat keterangan pindah untuk dicetak.");
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
