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
import type { DesaAdat } from "./types";
import {
  parseSuratMautsahaSnapshot,
  type SuratKeteranganMautsahaAdatRow,
  type SuratKeteranganMautsahaAdatSnapshot,
} from "./services/surat-keterangan-mautsaha-adat";
import { formatJenisKelamin, formatTanggalLahir } from "./utils";
import { drawKwitansiIpmaPage, resolveKwitansiIpmaMeta } from "./kwitansi-ipma-pdf";

const TITLE_SIZE = 12;
const SUBTITLE_SIZE = 10;
const LABEL_W = 52 * MM;
const FIELD_INDENT_PT = 20;
const PJ_SECTION_DROP_PT = 15;
const PHOTO_BOX_W = 32 * MM;
const PHOTO_BOX_H = 40 * MM;
const CONTENT_RIGHT_X = SURAT_MARGIN_X + SURAT_CONTENT_W;

const SIGN_SIZE = 10.5;
const SIGN_NAME_SIZE = 10.5;
const SIGN_BLOCK_HEIGHT_TRIM_PT = 10;
const SIGN_IMG_H = 26 * MM - SIGN_BLOCK_HEIGHT_TRIM_PT;
const SIGN_IMG_W_FRAC = 0.55;
const SIGN_JABATAN_TO_IMG_GAP = 1.5 * MM;
const SIGN_IMG_TO_NAME_GAP = 0.5 * MM;
const SIGN_BLOCK_W_FRAC = 0.42;

export type SuratMautsahaAdatPdfPayload = {
  filename: string;
  desa: DesaAdat;
  surat: SuratKeteranganMautsahaAdatRow;
  snapshot: SuratKeteranganMautsahaAdatSnapshot;
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

function drawCenteredSubtitle(
  page: ReturnType<PDFDocument["addPage"]>,
  subtitle: string,
  y: number,
  fonts: PdfFonts
): number {
  const safe = pdfSafeText(subtitle);
  const w = fonts.regular.widthOfTextAtSize(safe, SUBTITLE_SIZE);
  const x = SURAT_MARGIN_X + (SURAT_CONTENT_W - w) / 2;
  page.drawText(safe, { x, y, size: SUBTITLE_SIZE, font: fonts.regular, color: COLOR_TEXT });
  return y - LINE_GAP * 1.4;
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
  snapshot: SuratKeteranganMautsahaAdatSnapshot,
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
  payload: SuratMautsahaAdatPdfPayload,
  fonts: PdfFonts,
  italicFont: PdfFonts["regular"],
  images: {
    mdaLogo: PDFImage | null;
    desaLogo: PDFImage | null;
    bandesaTtd: PDFImage | null;
    pjFoto: PDFImage | null;
  }
): Promise<void> {
  const page = pdf.addPage([SURAT_PAGE_W, SURAT_PAGE_H]);
  const desa = payload.desa;
  const snap = payload.snapshot;
  const desaNama = snap.nama_desa_adat || desa.nama_desa_adat?.trim() || "Desa Adat";

  let y = SURAT_PAGE_H - SURAT_MARGIN_Y;
  y = await drawSuratKop(page, desa, fonts, images.mdaLogo, images.desaLogo, y);
  y -= SECTION_GAP;

  y = drawCenteredTitle(page, "ILIKITA PEMASIH MAUTSAHA ADAT", y, fonts);
  y = drawCenteredSubtitle(
    page,
    "(SURAT PENCATATAN USAHA DI WEWIDANGAN DESA ADAT)",
    y,
    fonts
  );
  y = drawCenteredNomor(page, payload.surat.nomor_surat, y, fonts);
  y -= SECTION_GAP * 0.5;

  page.drawText(pdfSafeText("Om awighnam astu namo sidham,"), {
    x: SURAT_MARGIN_X,
    y,
    size: BODY_SIZE,
    font: italicFont,
    color: COLOR_TEXT,
  });
  y -= LINE_GAP;
  page.drawText(pdfSafeText("Om sidhirastu tad astu swaha,"), {
    x: SURAT_MARGIN_X,
    y,
    size: BODY_SIZE,
    font: italicFont,
    color: COLOR_TEXT,
  });
  y -= LINE_GAP * 1.5;

  const dasar = `Berdasarkan Awig-awig dan Pararem Desa Adat ${desaNama} Nomor ${snap.pararem_nomor} Tahun ${snap.pararem_tahun} tentang ${snap.pararem_judul}, dengan ini menerbitkan ILIKITA PEMASIH MAUTSAHA ADAT (Surat Pencatatan Usaha di wewidangan Desa Adat) dan diberikan kepada:`;
  y = drawMixedSegments(
    page,
    [{ text: dasar }],
    SURAT_MARGIN_X,
    y,
    SURAT_CONTENT_W,
    BODY_SIZE,
    fonts,
    italicFont,
    "justify"
  );
  y -= LINE_GAP;
  y -= PJ_SECTION_DROP_PT;

  const pjFields: [string, string][] = [
    ["Nama", snap.pj_nama],
    ["NIK/NIKA", snap.pj_nik_nika],
    ["Tempat/Tgl Lahir", `${snap.pj_tempat_lahir}${snap.pj_tanggal_lahir ? `, ${formatTanggalLahir(snap.pj_tanggal_lahir)}` : ""}`],
    ["Jenis Kelamin", formatJenisKelamin(snap.pj_jenis_kelamin)],
    ["Agama", snap.pj_agama],
    ["Status Krama", `${snap.pj_klasifikasi_nama}${snap.pj_jenis_nama ? ` — ${snap.pj_jenis_nama}` : ""}`],
    ["Pekerjaan", snap.pj_pekerjaan],
    ["Alamat Asal", snap.pj_alamat_asal],
    ["Alamat Sekarang", snap.pj_alamat_sekarang],
  ];

  page.drawText("Data Penanggung Jawab:", {
    x: SURAT_MARGIN_X + FIELD_INDENT_PT,
    y,
    size: BODY_SIZE,
    font: fonts.bold,
    color: COLOR_TEXT,
  });
  y -= LINE_GAP;

  const labelMaxW = CONTENT_RIGHT_X - (SURAT_MARGIN_X + FIELD_INDENT_PT + LABEL_W);

  for (const [label, value] of pjFields) {
    if (!value?.trim()) continue;
    y = drawLabelValue(
      page,
      label,
      value,
      SURAT_MARGIN_X + FIELD_INDENT_PT,
      y,
      LABEL_W,
      labelMaxW,
      fonts,
      BODY_SIZE,
      CONTENT_RIGHT_X
    );
  }
  y -= LINE_GAP * 0.5;

  const usahaFields: [string, string][] = [
    ["Perusahaan/Lembaga Usaha", snap.lembaga_nama],
    ["Bentuk Hukum", snap.lembaga_bentuk_hukum],
    ["No Dokumen/Legalitas", snap.lembaga_nomor_legalitas],
    ["Bidang Usaha", snap.lembaga_fokus_bidang],
    ["Alamat Usaha", snap.lembaga_alamat],
  ];

  page.drawText("Data Usaha:", {
    x: SURAT_MARGIN_X + FIELD_INDENT_PT,
    y,
    size: BODY_SIZE,
    font: fonts.bold,
    color: COLOR_TEXT,
  });
  y -= LINE_GAP;

  for (const [label, value] of usahaFields) {
    if (!value?.trim()) continue;
    y = drawLabelValue(
      page,
      label,
      value,
      SURAT_MARGIN_X + FIELD_INDENT_PT,
      y,
      LABEL_W,
      labelMaxW,
      fonts,
      BODY_SIZE,
      CONTENT_RIGHT_X
    );
  }
  y -= LINE_GAP;

  const hakKewajiban =
    "Pemegang surat ini berhak menjalankan usaha di wewidangan Desa Adat sesuai ketentuan adat, dan wajib menaati kewajiban (swadharma) serta berhak mendapatkan hak (swadikara) pasayuban sebagaimana diatur dalam Awig-awig dan Pararem Desa Adat.";
  y = drawMixedSegments(
    page,
    [{ text: hakKewajiban }],
    SURAT_MARGIN_X,
    y,
    SURAT_CONTENT_W,
    BODY_SIZE,
    fonts,
    italicFont,
    "justify"
  );
  y -= LINE_GAP * 2;

  const signY = y;
  const photoX = SURAT_MARGIN_X + FIELD_INDENT_PT;
  if (images.pjFoto) {
    drawImageContain(
      page,
      images.pjFoto,
      photoX,
      signY - PHOTO_BOX_H,
      PHOTO_BOX_W,
      PHOTO_BOX_H
    );
  } else {
    drawCenteredText(
      page,
      "Foto PJ",
      photoX,
      PHOTO_BOX_W,
      signY - PHOTO_BOX_H / 2,
      9,
      fonts.regular,
      COLOR_TEXT
    );
  }

  drawBandesaSignature(
    page,
    desa,
    snap,
    payload.surat.tanggal_terbit,
    fonts,
    italicFont,
    images.bandesaTtd,
    signY
  );

  y = signY - PHOTO_BOX_H - LINE_GAP * 2;
  const catatanSize = 9;
  page.drawText(pdfSafeText("Catatan:"), {
    x: SURAT_MARGIN_X,
    y,
    size: catatanSize,
    font: italicFont,
    color: COLOR_TEXT,
  });
  y -= LINE_GAP * 0.9;
  y = drawMixedSegments(
    page,
    [{ text: "(1) Surat ini bukan izin usaha negara, hanya berlaku di wewidangan Desa Adat;" }],
    SURAT_MARGIN_X,
    y,
    SURAT_CONTENT_W,
    catatanSize,
    fonts,
    italicFont,
    "justify"
  );
  y -= 10;
  drawMixedSegments(
    page,
    [{
      text: "(2) Wajib diperpanjang setiap tahun; surat batal apabila usaha berhenti atau melanggar hukum negara/adat.",
    }],
    SURAT_MARGIN_X,
    y,
    SURAT_CONTENT_W,
    catatanSize,
    fonts,
    italicFont,
    "justify"
  );
}

export function buildSuratMautsahaAdatPdfPayload(
  desa: DesaAdat,
  surat: SuratKeteranganMautsahaAdatRow
): SuratMautsahaAdatPdfPayload {
  const snapshot = parseSuratMautsahaSnapshot(surat.snapshot_json);
  const safeNomor = surat.nomor_surat.replace(/\//g, "-");
  return {
    filename: `IPMA-${safeNomor}`,
    desa,
    surat,
    snapshot,
  };
}

export async function buildSuratMautsahaAdatPdfBytes(
  payloads: SuratMautsahaAdatPdfPayload[]
): Promise<Uint8Array> {
  if (!payloads.length) throw new Error("Tidak ada surat IPMA untuk dicetak.");
  const pdf = await PDFDocument.create();
  const fonts = await createSuratDinasFonts(pdf);
  const italicFont = fonts.italic;
  const desa = payloads[0]!.desa;

  const [mdaLogo, desaLogo, bandesaTtd] = await Promise.all([
    embedDataUrlImage(pdf, desa.logo_mda_url),
    embedDataUrlImage(pdf, desa.logo_url),
    embedDataUrlImage(pdf, desa.bandesa_ttd_url),
  ]);

  for (const payload of payloads) {
    const pjFoto = await embedDataUrlImage(pdf, payload.snapshot.pj_foto_url);
    await drawSuratPage(pdf, payload, fonts, italicFont, {
      mdaLogo,
      desaLogo,
      bandesaTtd,
      pjFoto,
    });

    if (Math.round(Number(payload.surat.tarif_nominal) || 0) > 0) {
      const meta = await resolveKwitansiIpmaMeta(payload.surat);
      await drawKwitansiIpmaPage(pdf, { ...payload, ...meta }, fonts, {
        mdaLogo,
        desaLogo,
      });
    }
  }

  return pdf.save();
}
