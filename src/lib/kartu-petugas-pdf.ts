import {
  PDFDocument,
  rgb,
  StandardFonts,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import { MM_TO_PT } from "./kartu-a4-grid";
import { formatNomorPengenalDisplay } from "./penomoran-petugas";
import { generatePetugasKartuQrPngBytes } from "./petugas-kartu-qr";
import type { DesaAdat, TimKasukretan } from "./types";

/** Kartu petugas portrait — depan|belakang berdampingan di A4. */
const PETUGAS_CARD = {
  wMm: 54,
  hMm: 86,
  pairGapMm: 4,
  pageWmm: 210,
  pageHmm: 297,
  marginLeftMm: 12,
  marginTopMm: 12,
} as const;

const BG_DEPAN = "/kartu/petugas-bg-depan.png";
const BG_BELAKANG = "/kartu/petugas-bg-belakang.png";

const MM = MM_TO_PT;
const CARD_W = PETUGAS_CARD.wMm * MM;
const CARD_H = PETUGAS_CARD.hMm * MM;

const GOLD = rgb(212 / 255, 175 / 255, 55 / 255);
const GOLD_BRIGHT = rgb(242 / 255, 215 / 255, 106 / 255);
const WHITE = rgb(1, 250 / 255, 240 / 255);
const WHITE_DIM = rgb(0.92, 0.9, 0.85);
const MAROON_DEEP = rgb(46 / 255, 8 / 255, 8 / 255);

function pdfSafe(text: string): string {
  return text
    .replace(/\u2026/g, "...")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014·]/g, "-")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "?");
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1]! : dataUrl;
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function fetchPngBytes(path: string): Promise<Uint8Array> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Gagal memuat aset kartu: ${path}`);
  return new Uint8Array(await res.arrayBuffer());
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
    if (src.includes("image/jpeg") || src.includes("image/jpg")) {
      return await pdf.embedJpg(bytes);
    }
    try {
      return await pdf.embedPng(bytes);
    } catch {
      return await pdf.embedJpg(bytes);
    }
  } catch {
    return null;
  }
}

function petugasSlotOrigin(): { front: { x: number; y: number }; back: { x: number; y: number } } {
  const ml = PETUGAS_CARD.marginLeftMm * MM;
  const mt = PETUGAS_CARD.marginTopMm * MM;
  const pageH = PETUGAS_CARD.pageHmm * MM;
  const gap = PETUGAS_CARD.pairGapMm * MM;
  const y = pageH - mt - CARD_H;
  return {
    front: { x: ml, y },
    back: { x: ml + CARD_W + gap, y },
  };
}

function drawCenteredText(
  page: PDFPage,
  text: string,
  ox: number,
  y: number,
  size: number,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  color: ReturnType<typeof rgb>,
  maxWidth?: number
) {
  const tw = font.widthOfTextAtSize(text, size);
  const limit = maxWidth ?? CARD_W - 6 * MM;
  const w = Math.min(tw, limit);
  page.drawText(text, {
    x: ox + (CARD_W - w) / 2,
    y,
    size,
    font,
    color,
    maxWidth: limit,
  });
}

async function drawFront(
  pdf: PDFDocument,
  page: PDFPage,
  ox: number,
  oy: number,
  tim: TimKasukretan,
  desa: DesaAdat | null,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  fontBold: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  bg: PDFImage
) {
  page.drawImage(bg, { x: ox, y: oy, width: CARD_W, height: CARD_H });

  const pad = 3.2 * MM;
  const desaNama = pdfSafe(desa?.nama_desa_adat?.trim() || "Desa Adat").toUpperCase();

  const logo = await embedDataUrlImage(pdf, desa?.logo_url);
  const logoSize = 13 * MM;
  const logoLeft = 5.5 * MM;
  if (logo) {
    page.drawImage(logo, {
      x: ox + logoLeft,
      y: oy + CARD_H - 2.8 * MM - logoSize,
      width: logoSize,
      height: logoSize,
    });
  }

  // Nama desa rata kiri dengan blok kop template
  const desaSize = 5.4;
  const kopLeft = 20 * MM + 3; // 3pt ke kanan dari baseline 20mm
  page.drawText(desaNama, {
    x: ox + kopLeft,
    y: oy + CARD_H - 16.2 * MM,
    size: desaSize,
    font: fontBold,
    color: WHITE,
    maxWidth: CARD_W - kopLeft - 3.4 * MM,
  });

  const photoSize = 21 * MM;
  const photoX = ox + (CARD_W - photoSize) / 2;
  const photoY = oy + CARD_H * 0.42 + 7; // 7pt ke atas
  page.drawRectangle({
    x: photoX,
    y: photoY,
    width: photoSize,
    height: photoSize,
    color: MAROON_DEEP,
    borderColor: GOLD,
    borderWidth: 0.8,
  });
  const foto = await embedDataUrlImage(pdf, tim.foto_url);
  if (foto) {
    const inset = 0.5 * MM;
    page.drawImage(foto, {
      x: photoX + inset,
      y: photoY + inset,
      width: photoSize - inset * 2,
      height: photoSize - inset * 2,
    });
  }

  const namaY = photoY - 4 * MM - 5 + 2; // nama naik 2pt
  drawCenteredText(page, pdfSafe(tim.nama).toUpperCase(), ox, namaY, 8, fontBold, WHITE);
  // jabatan tetap di posisi semula (tidak ikut naik bersama nama)
  const jabatanY = photoY - 4 * MM - 5 - (5.2 + 2);
  drawCenteredText(
    page,
    pdfSafe(tim.jabatan || "Anggota Tim Kasukretan"),
    ox,
    jabatanY,
    7,
    fontBold,
    GOLD_BRIGHT
  );
  let ty = jabatanY;

  const nomor = formatNomorPengenalDisplay(tim.nomor_pengenal);
  const fields: [string, string][] = [
    ["No. Anggota", nomor === "—" ? "-" : nomor],
    ["Banjar", tim.banjar_nama || "-"],
    ["Desa Adat", desa?.nama_desa_adat?.trim() || "-"],
  ];
  ty -= 8.5 + 15 - 5 - 2; // kompensasi agar field tidak ikut turun bersama jabatan
  const labelX = ox + pad + 1 * MM + 15; // +15pt ke kanan
  const valueX = ox + pad + 17 * MM + 15;
  const fieldLine = 8.2; // jarak baris lebih renggang
  for (const [label, value] of fields) {
    page.drawText(pdfSafe(`${label}:`), {
      x: labelX,
      y: ty,
      size: 5.8,
      font,
      color: WHITE_DIM,
    });
    page.drawText(pdfSafe(value), {
      x: valueX,
      y: ty,
      size: 5.8,
      font: fontBold,
      color: WHITE,
      maxWidth: CARD_W - (valueX - ox) - pad,
    });
    ty -= fieldLine;
  }
}

async function drawBack(
  pdf: PDFDocument,
  page: PDFPage,
  ox: number,
  oy: number,
  tim: TimKasukretan,
  desa: DesaAdat | null,
  bg: PDFImage
) {
  page.drawImage(bg, { x: ox, y: oy, width: CARD_W, height: CARD_H });

  // Logo desa di paling atas (di atas kata TIM pada template)
  const logo = await embedDataUrlImage(pdf, desa?.logo_url);
  const logoSize = 9.5 * MM;
  if (logo) {
    page.drawImage(logo, {
      x: ox + (CARD_W - logoSize) / 2,
      y: oy + CARD_H - 2.6 * MM - logoSize,
      width: logoSize,
      height: logoSize,
    });
  }

  const nomor = tim.nomor_pengenal?.trim();
  const qrSize = 17 * MM;
  const qrX = ox + (CARD_W - qrSize) / 2;
  // Zona kosong tengah template (di atas teks "Scan QR Code")
  const qrY = oy + CARD_H * 0.42;
  page.drawRectangle({
    x: qrX - 0.9 * MM,
    y: qrY - 0.9 * MM,
    width: qrSize + 1.8 * MM,
    height: qrSize + 1.8 * MM,
    color: rgb(1, 1, 1),
    borderColor: GOLD,
    borderWidth: 0.7,
  });
  if (nomor) {
    const qrBytes = await generatePetugasKartuQrPngBytes(nomor, 180);
    const qrImg = await pdf.embedPng(qrBytes);
    page.drawImage(qrImg, { x: qrX, y: qrY, width: qrSize, height: qrSize });
  }
}

export async function generateKartuPetugasPdf(
  tim: TimKasukretan,
  desa: DesaAdat | null
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const [depanBytes, belakangBytes] = await Promise.all([
    fetchPngBytes(BG_DEPAN),
    fetchPngBytes(BG_BELAKANG),
  ]);
  const bgDepan = await pdf.embedPng(depanBytes);
  const bgBelakang = await pdf.embedPng(belakangBytes);

  const page = pdf.addPage([PETUGAS_CARD.pageWmm * MM, PETUGAS_CARD.pageHmm * MM]);
  const { front, back } = petugasSlotOrigin();
  await drawFront(pdf, page, front.x, front.y, tim, desa, font, fontBold, bgDepan);
  await drawBack(pdf, page, back.x, back.y, tim, desa, bgBelakang);
  return pdf.save();
}

export function kartuPetugasPdfFilename(tim: TimKasukretan): string {
  const nomor = (tim.nomor_pengenal || "kartu").replace(/[^\w.-]+/g, "_");
  const nama = tim.nama.trim().replace(/[^\w.-]+/g, "_").slice(0, 40) || "petugas";
  return `Kartu_Petugas_${nomor}_${nama}.pdf`;
}

export const KARTU_PETUGAS_SIZE_LABEL = "5,4 × 8,6 cm (portrait)";
