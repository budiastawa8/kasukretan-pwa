import { preprocessKkImage } from "./preprocess";

export type KkOcrProgress = {
  phase: "preprocess" | "load" | "recognize";
  /** 0–1 */
  progress: number;
  message: string;
};

type TessWorker = Awaited<ReturnType<typeof import("tesseract.js").createWorker>>;

let workerPromise: Promise<TessWorker> | null = null;

function publicTesseractBase(): string {
  const base = import.meta.env.BASE_URL || "/";
  const root = base.endsWith("/") ? base : `${base}/`;
  return `${root}tesseract`;
}

async function getWorker(onProgress?: (p: KkOcrProgress) => void): Promise<TessWorker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      onProgress?.({
        phase: "load",
        progress: 0.05,
        message: "Memuat mesin baca KK…",
      });
      const { createWorker, PSM } = await import("tesseract.js");
      const base = publicTesseractBase();
      const worker = await createWorker("ind", 1, {
        workerPath: `${base}/worker.min.js`,
        corePath: `${base}/tesseract-core.wasm.js`,
        langPath: base,
        logger: (m) => {
          if (m.status === "loading tesseract core") {
            onProgress?.({
              phase: "load",
              progress: 0.15,
              message: "Memuat inti OCR…",
            });
          } else if (m.status === "loading language traineddata") {
            onProgress?.({
              phase: "load",
              progress: 0.35,
              message: "Memuat bahasa Indonesia…",
            });
          } else if (m.status === "initializing api") {
            onProgress?.({
              phase: "load",
              progress: 0.5,
              message: "Menyiapkan OCR…",
            });
          } else if (m.status === "recognizing text" && typeof m.progress === "number") {
            onProgress?.({
              phase: "recognize",
              progress: 0.55 + m.progress * 0.4,
              message: "Membaca tulisan di KK…",
            });
          }
        },
      });

      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        preserve_interword_spaces: "1",
      });
      return worker;
    })().catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

/** Bebaskan worker (opsional — hemat memori setelah dialog ditutup). */
export async function terminateKkOcrWorker(): Promise<void> {
  if (!workerPromise) return;
  try {
    const w = await workerPromise;
    await w.terminate();
  } catch {
    /* abaikan */
  } finally {
    workerPromise = null;
  }
}

/**
 * Baca teks dari foto Kartu Keluarga (client-side, bahasa Indonesia).
 * Asset OCR dilayani dari `/tesseract/` agar bisa di-cache PWA.
 */
export async function recognizeKkImage(
  file: Blob,
  onProgress?: (p: KkOcrProgress) => void
): Promise<string> {
  onProgress?.({
    phase: "preprocess",
    progress: 0.02,
    message: "Menyiapkan foto…",
  });
  const prepared = await preprocessKkImage(file);
  const worker = await getWorker(onProgress);
  onProgress?.({
    phase: "recognize",
    progress: 0.55,
    message: "Membaca tulisan di KK…",
  });
  const { data } = await worker.recognize(prepared);
  onProgress?.({
    phase: "recognize",
    progress: 1,
    message: "Selesai membaca.",
  });
  return data.text ?? "";
}
