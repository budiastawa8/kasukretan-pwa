/**
 * Kompres foto sebelum diunggah ke Vision (OpenRouter).
 * Resolusi lebih kecil → upload lebih cepat dan biasanya token gambar lebih hemat.
 */

export type VisionImagePreset = "kk" | "ktp";

type CompressOpts = {
  /** Sisi terpanjang (px). */
  maxEdge: number;
  /** JPEG 0–1. */
  quality: number;
};

/** Preset hemat: cukup untuk baca tabel KK / field KTP tanpa kirim foto penuh kamera HP. */
const PRESETS: Record<VisionImagePreset, CompressOpts> = {
  kk: { maxEdge: 1280, quality: 0.74 },
  ktp: { maxEdge: 1024, quality: 0.72 },
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Gagal memuat foto."));
    img.src = src;
  });
}

function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Gagal membaca foto."));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error("Gagal membaca foto."));
    reader.readAsDataURL(file);
  });
}

/**
 * Hasil: data URL JPEG siap dikirim ke /api/kk-scan atau /api/ktp-scan.
 * @param preset `kk` (default) atau `ktp` — KTP boleh lebih kecil.
 */
export async function prepareKkImageForUpload(
  file: Blob,
  preset: VisionImagePreset = "kk"
): Promise<string> {
  const { maxEdge, quality } = PRESETS[preset];
  const dataUrl = await readFileAsDataUrl(file);
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Kanvas tidak tersedia di perangkat ini.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Gagal memproses foto."));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result !== "string") {
            reject(new Error("Gagal membaca hasil kompresi."));
            return;
          }
          resolve(reader.result);
        };
        reader.onerror = () => reject(new Error("Gagal membaca hasil kompresi."));
        reader.readAsDataURL(blob);
      },
      "image/jpeg",
      quality
    );
  });
}
