import QRCode from "qrcode";

/** Payload QR di kartu petugas Tim Kasukretan — untuk verifikasi publik. */
export const PETUGAS_KARTU_QR_PREFIX = "kasukretan:petugas:";

export function normalizeNomorPengenalKey(nomor: string): string {
  return nomor.trim().replace(/-/g, "").toLowerCase();
}

export function petugasKartuQrPayload(nomorPengenal: string): string {
  const key = normalizeNomorPengenalKey(nomorPengenal);
  return `${PETUGAS_KARTU_QR_PREFIX}${key}`;
}

/** Ambil nomor pengenal dari hasil scan (format berprefiks atau plain). */
export function parsePetugasKartuQrPayload(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
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
