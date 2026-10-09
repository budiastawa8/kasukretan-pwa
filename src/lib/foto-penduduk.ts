/** Bingkai foto di kartu: 20 mm lebar × 24 mm tinggi (rasio 11∶13). */
export const KARTU_FOTO_MM = { w: 20, h: 24 } as const;
export const KARTU_FOTO_ASPECT = KARTU_FOTO_MM.w / KARTU_FOTO_MM.h;

/** Ukuran piksel disarankan saat unggah (≈2× kualitas cetak 300 dpi). */
export const KARTU_FOTO_PX = { w: 400, h: 480 } as const;

/** Crop tengah seperti object-fit: cover ke rasio bingkai kartu. */
function cropSourceRect(srcW: number, srcH: number): { sx: number; sy: number; sw: number; sh: number } {
  const srcRatio = srcW / srcH;
  if (srcRatio > KARTU_FOTO_ASPECT) {
    const sw = srcH * KARTU_FOTO_ASPECT;
    return { sx: (srcW - sw) / 2, sy: 0, sw, sh: srcH };
  }
  const sh = srcW / KARTU_FOTO_ASPECT;
  return { sx: 0, sy: (srcH - sh) / 2, sw: srcW, sh };
}

/** Kecilkan + crop foto agar pas bingkai kartu (data URL di database). */
export async function normalizeFotoUntukKartu(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith("data:image/")) return dataUrl;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const { w: outW, h: outH } = KARTU_FOTO_PX;
      const { sx, sy, sw, sh } = cropSourceRect(img.naturalWidth, img.naturalHeight);

      const canvas = document.createElement("canvas");
      canvas.width = outW;
      canvas.height = outH;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
      resolve(canvas.toDataURL("image/jpeg", 0.88));
    };
    img.onerror = () => reject(new Error("Gagal memproses foto"));
    img.src = dataUrl;
  });
}
/** WebView2/Windows sering tidak mencetak src data: — ubah ke blob: hanya saat cetak. */
export async function prepareKartuPhotosForPrint(root: ParentNode): Promise<() => void> {
  const imgs = Array.from(root.querySelectorAll<HTMLImageElement>(".kartu-photo-img"));
  const restores: Array<() => void> = [];

  for (const img of imgs) {
    const original = img.dataset.fotoSrc || img.getAttribute("src") || "";
    if (!original.startsWith("data:image/")) continue;

    try {
      const res = await fetch(original);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const prevSrc = img.src;
      const box = img.closest(".kartu-photo") as HTMLElement | null;
      const prevBg = box?.style.backgroundImage ?? "";

      img.src = blobUrl;
      if (box) {
        box.style.setProperty("background-image", `url("${blobUrl}")`);
        box.style.setProperty("background-size", "cover");
        box.style.setProperty("background-position", "center center");
        box.style.setProperty("background-repeat", "no-repeat");
      }

      await new Promise<void>((resolve) => {
        if (img.complete && img.naturalWidth > 0) {
          resolve();
          return;
        }
        img.onload = () => resolve();
        img.onerror = () => resolve();
      });

      restores.push(() => {
        URL.revokeObjectURL(blobUrl);
        img.src = prevSrc;
        if (box) {
          box.style.backgroundImage = prevBg;
          box.style.removeProperty("background-size");
          box.style.removeProperty("background-position");
          box.style.removeProperty("background-repeat");
        }
      });
    } catch {
      /* tetap cetak tanpa foto jika konversi gagal */
    }
  }

  return () => {
    for (const r of restores) r();
  };
}

export function waitForKartuPhotos(root: ParentNode = document): Promise<void> {
  const imgs = Array.from(root.querySelectorAll<HTMLImageElement>(".kartu-photo-img"));
  if (!imgs.length) return Promise.resolve();

  return Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve();
            return;
          }
          const done = () => resolve();
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
        })
    )
  ).then(() => undefined);
}
