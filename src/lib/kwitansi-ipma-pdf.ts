import { PDFDocument, type PDFPage } from "pdf-lib";
import type { DesaAdat } from "./types";
import { formatRupiah } from "./paturunan-hitung";
import { getAkunKeuangan } from "./services/akun-keuangan";
import { staffRoleLabel } from "./auth-roles";
import { readStoredSessionUser, sessionUserDisplayName } from "./services/auth";
import {
  BODY_SIZE,
  LINE_GAP,
  SURAT_CONTENT_W,
  SURAT_MARGIN_X,
  SURAT_PAGE_H,
  SURAT_PAGE_W,
  drawSuratKop,
  formatTanggalSuratIndonesia,
} from "./surat-dinas-pdf-common";
import { createSuratDinasFonts } from "./surat-dinas-pdf-fonts";
import {
  COLOR_TEXT,
  MM,
  drawCenteredText,
  embedDataUrlImage,
  pdfSafeText,
  type PdfFonts,
} from "./pdf-common";
import type {
  SuratKeteranganMautsahaAdatRow,
  SuratKeteranganMautsahaAdatSnapshot,
} from "./services/surat-keterangan-mautsaha-adat";
import type { SuratMautsahaAdatPdfPayload } from "./surat-keterangan-mautsaha-adat-pdf";

const TITLE_SIZE = 14;
const LABEL_W = 38 * MM;
const BOX_PAD = 5 * MM;
const SIGN_AREA_H = 14 * MM;
/** Ruang kosong antara label peran dan nama (tempat tanda tangan). */
const SIGN_NAME_GAP = 12 * MM;

/** Zona kwitansi = setengah tinggi A4 portrait (148,5 mm). */
const KWITANSI_BOTTOM_Y = SURAT_PAGE_H / 2;
const KWITANSI_TOP_MARGIN = 6 * MM;
const KWITANSI_BOTTOM_PAD = 4 * MM;

export type KwitansiIpmaMeta = {
  akunNama: string;
  penandatanganPeran: string;
  penandatanganNama: string;
};

function jenisKwitansiLabel(jenis: SuratKeteranganMautsahaAdatRow["jenis"]): string {
  return jenis === "perpanjangan"
    ? "Biaya administrasi IPMA — perpanjangan"
    : "Biaya administrasi IPMA — pendaftaran / terbit baru";
}

export async function resolveKwitansiIpmaMeta(
  surat: SuratKeteranganMautsahaAdatRow
): Promise<KwitansiIpmaMeta> {
  let akunNama = "Dana Kasukretan Lainnya";
  if (surat.akun_keuangan_id) {
    const akun = await getAkunKeuangan(surat.akun_keuangan_id);
    if (akun?.nama?.trim()) akunNama = akun.nama.trim();
  }
  const sessionUser = readStoredSessionUser();
  return {
    akunNama,
    penandatanganPeran: staffRoleLabel(sessionUser?.peran),
    penandatanganNama: sessionUserDisplayName(sessionUser),
  };
}

export function buildKwitansiIpmaFilename(surat: SuratKeteranganMautsahaAdatRow): string {
  const safeNomor = surat.nomor_surat.replace(/\//g, "-");
  return `Kwitansi-IPMA-${safeNomor}`;
}

function drawLabelValueLine(
  page: PDFPage,
  y: number,
  label: string,
  value: string,
  fonts: PdfFonts,
  valueMaxW: number
): number {
  const labelText = pdfSafeText(label);
  const colonX = SURAT_MARGIN_X + LABEL_W;
  const valueX = colonX + 3 * MM;
  page.drawText(labelText, {
    x: SURAT_MARGIN_X,
    y,
    size: BODY_SIZE,
    font: fonts.regular,
    color: COLOR_TEXT,
  });
  page.drawText(":", { x: colonX, y, size: BODY_SIZE, font: fonts.regular, color: COLOR_TEXT });

  const safeValue = pdfSafeText(value);
  const words = safeValue.split(/\s+/);
  let line = "";
  let lineY = y;
  const lineH = LINE_GAP * 0.95;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (fonts.regular.widthOfTextAtSize(next, BODY_SIZE) <= valueMaxW) {
      line = next;
    } else {
      if (line) {
        page.drawText(line, {
          x: valueX,
          y: lineY,
          size: BODY_SIZE,
          font: fonts.regular,
          color: COLOR_TEXT,
        });
        lineY -= lineH;
      }
      line = word;
    }
  }
  if (line) {
    page.drawText(line, {
      x: valueX,
      y: lineY,
      size: BODY_SIZE,
      font: fonts.regular,
      color: COLOR_TEXT,
    });
    lineY -= lineH;
  }
  return lineY - 2;
}

function drawKwitansiBody(
  page: PDFPage,
  payload: SuratMautsahaAdatPdfPayload & KwitansiIpmaMeta,
  fonts: PdfFonts,
  yStart: number
): number {
  const { surat, snapshot } = payload;
  const nominal = Math.round(Number(surat.tarif_nominal) || 0);
  if (nominal <= 0) return yStart;

  const valueMaxW = SURAT_CONTENT_W - LABEL_W - 4 * MM;
  const dari = `${snapshot.lembaga_nama}${snapshot.pj_nama?.trim() ? ` (a.n. ${snapshot.pj_nama.trim()})` : ""}`;
  const untuk = `${jenisKwitansiLabel(surat.jenis)} — ${snapshot.lembaga_nama}`;

  let y = yStart;
  y = drawLabelValueLine(page, y, "Sudah terima dari", dari, fonts, valueMaxW);
  y = drawLabelValueLine(
    page,
    y,
    "Uang sebanyak",
    formatRupiah(nominal),
    fonts,
    valueMaxW
  );
  y = drawLabelValueLine(page, y, "Untuk pembayaran", untuk, fonts, valueMaxW);
  y = drawLabelValueLine(page, y, "Diterima di", payload.akunNama, fonts, valueMaxW);
  if (surat.transaksi_pemasukan_id) {
    y = drawLabelValueLine(
      page,
      y,
      "Ref. buku kas",
      surat.transaksi_pemasukan_id.slice(0, 8).toUpperCase(),
      fonts,
      valueMaxW
    );
  }
  return y;
}

function drawKwitansiSignature(
  page: PDFPage,
  desa: DesaAdat,
  snapshot: SuratKeteranganMautsahaAdatSnapshot,
  tanggalTerbit: string,
  penandatanganPeran: string,
  penandatanganNama: string,
  fonts: PdfFonts,
  yTop: number
): void {
  const x = SURAT_MARGIN_X + SURAT_CONTENT_W * 0.58;
  const desaNama = snapshot.nama_desa_adat || desa.nama_desa_adat?.trim() || "Desa Adat";
  const tanggalLabel = `${desaNama}, ${formatTanggalSuratIndonesia(tanggalTerbit)}`;
  const peranLabel = pdfSafeText(penandatanganPeran.trim() || "Petugas");

  let y = yTop;
  page.drawText(pdfSafeText(tanggalLabel), {
    x,
    y,
    size: BODY_SIZE,
    font: fonts.regular,
    color: COLOR_TEXT,
  });
  y -= LINE_GAP * 1.2;
  page.drawText(`${peranLabel},`, {
    x,
    y,
    size: BODY_SIZE,
    font: fonts.regular,
    color: COLOR_TEXT,
  });
  y -= SIGN_NAME_GAP;
  if (penandatanganNama.trim()) {
    page.drawText(pdfSafeText(penandatanganNama.trim()), {
      x,
      y,
      size: BODY_SIZE,
      font: fonts.bold,
      color: COLOR_TEXT,
    });
  }
}

export async function drawKwitansiIpmaPage(
  pdf: PDFDocument,
  payload: SuratMautsahaAdatPdfPayload & KwitansiIpmaMeta,
  fonts: PdfFonts,
  logos?: { mdaLogo: Awaited<ReturnType<typeof embedDataUrlImage>>; desaLogo: Awaited<ReturnType<typeof embedDataUrlImage>> }
): Promise<void> {
  const nominal = Math.round(Number(payload.surat.tarif_nominal) || 0);
  if (nominal <= 0) return;

  const page = pdf.addPage([SURAT_PAGE_W, SURAT_PAGE_H]);
  const zoneTop = SURAT_PAGE_H - KWITANSI_TOP_MARGIN;
  let y = zoneTop;

  const desa = payload.desa;
  const [mdaLogo, desaLogo] = logos
    ? [logos.mdaLogo, logos.desaLogo]
    : await Promise.all([
        embedDataUrlImage(pdf, desa.logo_mda_url),
        embedDataUrlImage(pdf, desa.logo_url),
      ]);

  y = await drawSuratKop(page, desa, fonts, mdaLogo, desaLogo, y);
  y -= 4;

  drawCenteredText(
    page,
    "KWITANSI",
    SURAT_MARGIN_X,
    SURAT_CONTENT_W,
    y,
    TITLE_SIZE,
    fonts.bold,
    COLOR_TEXT
  );
  y -= LINE_GAP * 1.2;

  const nomorText = pdfSafeText(`Nomor : ${payload.surat.nomor_surat}`);
  const nomorW = fonts.regular.widthOfTextAtSize(nomorText, BODY_SIZE);
  page.drawText(nomorText, {
    x: SURAT_MARGIN_X + (SURAT_CONTENT_W - nomorW) / 2,
    y,
    size: BODY_SIZE,
    font: fonts.regular,
    color: COLOR_TEXT,
  });
  y -= LINE_GAP * 1.4;

  const contentTop = y;
  const contentBottom = KWITANSI_BOTTOM_Y + KWITANSI_BOTTOM_PAD;

  y = contentTop - BOX_PAD;
  y = drawKwitansiBody(page, payload, fonts, y);
  drawKwitansiSignature(
    page,
    desa,
    payload.snapshot,
    payload.surat.tanggal_terbit,
    payload.penandatanganPeran,
    payload.penandatanganNama,
    fonts,
    contentBottom + BOX_PAD + SIGN_AREA_H + SIGN_NAME_GAP
  );
}

export async function buildKwitansiIpmaPdfBytes(
  payloads: SuratMautsahaAdatPdfPayload[]
): Promise<Uint8Array> {
  const paid = payloads.filter((p) => Math.round(Number(p.surat.tarif_nominal) || 0) > 0);
  if (!paid.length) {
    throw new Error("Tidak ada biaya administrasi untuk dicetak kwitansi.");
  }

  const pdf = await PDFDocument.create();
  const fonts = await createSuratDinasFonts(pdf);
  const desa = paid[0]!.desa;
  const [mdaLogo, desaLogo] = await Promise.all([
    embedDataUrlImage(pdf, desa.logo_mda_url),
    embedDataUrlImage(pdf, desa.logo_url),
  ]);

  for (const payload of paid) {
    const meta = await resolveKwitansiIpmaMeta(payload.surat);
    await drawKwitansiIpmaPage(pdf, { ...payload, ...meta }, fonts, { mdaLogo, desaLogo });
  }

  return pdf.save();
}

export function suratPayloadHasKwitansi(payload: SuratMautsahaAdatPdfPayload): boolean {
  return Math.round(Number(payload.surat.tarif_nominal) || 0) > 0;
}
