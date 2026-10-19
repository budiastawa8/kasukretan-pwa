import type { StrukDudukanPdfPayload } from "./struk-pembayaran-dudukan-pdf";
import type { StrukPaturunanPdfPayload } from "./struk-pembayaran-paturunan-pdf";

const STORAGE_KEY = "kasukretan:petugas-struk-preview";

export const PETUGAS_STRUK_PREVIEW_PATH = "/pengumpulan/struk";

export type PetugasStrukPreviewState =
  | {
      kind: "dudukan";
      payload: StrukDudukanPdfPayload;
      backTo: string;
      backLabel: string;
    }
  | {
      kind: "paturunan";
      payload: StrukPaturunanPdfPayload;
      backTo: string;
      backLabel: string;
    };

function writePreviewState(state: PetugasStrukPreviewState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    throw new Error("Data struk terlalu besar untuk pratinjau.");
  }
}

export function stashPetugasStrukPreview(state: PetugasStrukPreviewState): void {
  writePreviewState(state);
}

export function readPetugasStrukPreview(): PetugasStrukPreviewState | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PetugasStrukPreviewState;
    if (parsed.kind === "dudukan" && parsed.payload) return parsed;
    if (parsed.kind === "paturunan" && parsed.payload) return parsed;
    return null;
  } catch {
    return null;
  }
}
