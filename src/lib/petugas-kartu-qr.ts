import QRCode from "qrcode";
import { publicCekPetugasUrl } from "./cek-petugas-publik";

/** Legacy payload (kartu lama) — scanner in-app masih menerima. */
export const PETUGAS_KARTU_QR_PREFIX = "kasukretan:petugas:";

export function normalizeNomorPengenalKey(nomor: string): string {
  return nomor.trim().replace(/-/g, "").toLowerCase();
}

/**
 * Isi QR kartu petugas.
 * Prefer URL https://…/cek-petugas/{nomor} agar kamera HP membuka halaman validasi.
 * Jika origin publik tidak diketahui, jatuh ke format legacy berprefiks.
 */
export function petugasKartuQrPayload(nomorPengenal: string, publicBase?: string): string {
  const key = normalizeNomorPengenalKey(nomorPengenal);
  const base = (publicBase ?? publicCekPetugasUrl()).replace(/\/$/, "");
  if (/^https?:\/\//i.test(base)) {
    return `${base}/${encodeURIComponent(key)}`;
  }
  return `${PETUGAS_KARTU_QR_PREFIX}${key}`;
}

/** Ambil nomor pengenal dari hasil scan (URL, format berprefiks, atau plain). */
export function parsePetugasKartuQrPayload(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  const fromPath = (pathname: string): string | null => {
    const parts = pathname.split("/").filter(Boolean);
    const idx = parts.findIndex((p) => p.toLowerCase() === "cek-petugas");
    if (idx < 0 || !parts[idx + 1]) return null;
    try {
      const key = normalizeNomorPengenalKey(decodeURIComponent(parts[idx + 1]!));
      return key || null;
    } catch {
      return null;
    }
  };

  if (/^https?:\/\//i.test(s)) {
    try {
      const key = fromPath(new URL(s).pathname);
      if (key) return key;
    } catch {
      /* lanjut format lain */
    }
  }

  const pathOnly = s.match(/\/cek-petugas\/([^/?#]+)/i);
  if (pathOnly?.[1]) {
    try {
      const key = normalizeNomorPengenalKey(decodeURIComponent(pathOnly[1]));
      if (key) return key;
    } catch {
      /* lanjut */
    }
  }

  if (s.toLowerCase().startsWith(PETUGAS_KARTU_QR_PREFIX)) {
    const key = normalizeNomorPengenalKey(s.slice(PETUGAS_KARTU_QR_PREFIX.length));
    return key || null;
  }

  // Plain: jangan bentrok dengan nomor kartu krama panjang — terima 3–12 digit/huruf
  const plain = normalizeNomorPengenalKey(s);
  if (/^[a-z0-9]{3,12}$/.test(plain)) return plain;
  return null;
}

export async function generatePetugasKartuQrDataUrl(
  nomorPengenal: string,
  size = 160
): Promise<string> {
  return QRCode.toDataURL(petugasKartuQrPayload(nomorPengenal), {
    margin: 0,
    width: size,
    errorCorrectionLevel: "M",
  });
}

export function petugasQrDataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1]! : dataUrl;
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function generatePetugasKartuQrPngBytes(
  nomorPengenal: string,
  size = 200
): Promise<Uint8Array> {
  const dataUrl = await generatePetugasKartuQrDataUrl(nomorPengenal, size);
  return petugasQrDataUrlToBytes(dataUrl);
}
