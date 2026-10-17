/** Kompres foto KK untuk diunggah ke Vision API (lebih kecil = lebih cepat). */

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Gagal memuat foto KK."));
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

/** Hasil: data URL JPEG siap dikirim ke /api/kk-scan. */
export async function prepareKkImageForUpload(file: Blob): Promise<string> {
  const dataUrl = await readFileAsDataUrl(file);
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Kanvas tidak tersedia di perangkat ini.");
  ctx.drawImage(img, 0, 0, w, h);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Gagal memproses foto KK."));
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
      JPEG_QUALITY
    );
  });
}
