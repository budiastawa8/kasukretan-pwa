import QRCode from "qrcode";

/** Payload QR di kartu fisik — dipindai petugas lapangan. */
export const KARTU_QR_PREFIX = "kasukretan:kartu:";

export function kartuQrPayload(nomorKartu: string): string {
  const key = nomorKartu.trim().replace(/-/g, "");
  return `${KARTU_QR_PREFIX}${key}`;
}

/** Ambil nomor kartu dari hasil scan (format berprefiks atau plain). */
export function parseKartuQrPayload(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (s.toLowerCase().startsWith(KARTU_QR_PREFIX)) {
    const key = s.slice(KARTU_QR_PREFIX.length).replace(/-/g, "").trim();
    return key || null;
  }
  const plain = s.replace(/-/g, "").trim();
  return plain.length >= 4 ? plain : null;
}

export function normalizeNomorKartuKey(nomor: string): string {
  return nomor.trim().replace(/-/g, "").toLowerCase();
}

export async function generateKartuQrDataUrl(
  nomorKartu: string,
  size = 120
): Promise<string> {
  return QRCode.toDataURL(kartuQrPayload(nomorKartu), {
    margin: 0,
    width: size,
    errorCorrectionLevel: "M",
  });
}

export function qrDataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1]! : dataUrl;
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function generateKartuQrPngBytes(
  nomorKartu: string,
  size = 160
): Promise<Uint8Array> {
  const dataUrl = await generateKartuQrDataUrl(nomorKartu, size);
  return qrDataUrlToBytes(dataUrl);
}
