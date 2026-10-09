import type { LaporanPdfInput } from "./laporan-pdf";
import type { BuktiSetoranDudukanPdfPayload } from "./bukti-setoran-dudukan-pdf";
import type { BuktiSetoranPaturunanPdfPayload } from "./bukti-setoran-paturunan-pdf";
import type { TunggakanDudukanPdfPayload } from "./tunggakan-dudukan-pdf";
import type { SuratPenagihanDudukanPdfPayload } from "./surat-penagihan-dudukan-pdf";
import type { SuratKeteranganKramaPdfPayload } from "./surat-keterangan-krama-pdf";
import type { SuratKeteranganPindahPdfPayload } from "./surat-keterangan-pindah-pdf";
import type { SuratMautsahaAdatPdfPayload } from "./surat-keterangan-mautsaha-adat-pdf";

const STORAGE_KEY = "kasukretan:laporan-pdf-preview";

export const LAPORAN_PDF_PREVIEW_PATH = "/laporan/pdf-preview";

export type LaporanPdfPreviewState =
  | {
      kind: "laporan";
      input: LaporanPdfInput;
      backTo: string;
      backLabel: string;
    }
  | {
      kind: "bukti-setoran-dudukan";
      buktiDudukan: BuktiSetoranDudukanPdfPayload;
      backTo: string;
      backLabel: string;
    }
  | {
      kind: "bukti-setoran-paturunan";
      buktiPaturunan: BuktiSetoranPaturunanPdfPayload;
      backTo: string;
      backLabel: string;
    }
  | {
      kind: "tunggakan-dudukan";
      tunggakanDudukan: TunggakanDudukanPdfPayload;
      backTo: string;
      backLabel: string;
    }
  | {
      kind: "surat-penagihan-dudukan";
      suratPenagihan: SuratPenagihanDudukanPdfPayload[];
      backTo: string;
      backLabel: string;
    }
  | {
      kind: "surat-keterangan-krama";
      suratKeteranganKrama: SuratKeteranganKramaPdfPayload[];
      backTo: string;
      backLabel: string;
    }
  | {
      kind: "surat-keterangan-pindah";
      suratKeteranganPindah: SuratKeteranganPindahPdfPayload[];
      backTo: string;
      backLabel: string;
    }
  | {
      kind: "surat-mautsaha-adat";
      suratMautsahaAdat: SuratMautsahaAdatPdfPayload[];
      backTo: string;
      backLabel: string;
    }
  | {
      kind: "kwitansi-ipma";
      kwitansiIpma: SuratMautsahaAdatPdfPayload[];
      backTo: string;
      backLabel: string;
    }
  | {
      kind: "kartu-dudukan";
      kramaIds: string[];
      backTo: string;
      backLabel: string;
    };

function writePreviewState(state: LaporanPdfPreviewState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    throw new Error(
      "Data laporan terlalu besar untuk pratinjau. Persempit filter atau gunakan ekspor Excel."
    );
  }
}

/** @deprecated Gunakan stashLaporanPdfPreviewState — tetap untuk laporan umum. */
export function stashLaporanPdfPreview(state: {
  input: LaporanPdfInput;
  backTo: string;
  backLabel: string;
}): void {
  writePreviewState({ kind: "laporan", ...state });
}

export function stashLaporanPdfPreviewState(state: LaporanPdfPreviewState): void {
  writePreviewState(state);
}

export function stashBuktiSetoranDudukanPreview(
  buktiDudukan: BuktiSetoranDudukanPdfPayload,
  backTo: string,
  backLabel: string
): void {
  writePreviewState({ kind: "bukti-setoran-dudukan", buktiDudukan, backTo, backLabel });
}

export function stashBuktiSetoranPaturunanPreview(
  buktiPaturunan: BuktiSetoranPaturunanPdfPayload,
  backTo: string,
  backLabel: string
): void {
  writePreviewState({ kind: "bukti-setoran-paturunan", buktiPaturunan, backTo, backLabel });
}

export function stashTunggakanDudukanPreview(
  tunggakanDudukan: TunggakanDudukanPdfPayload,
  backTo: string,
  backLabel: string
): void {
  writePreviewState({ kind: "tunggakan-dudukan", tunggakanDudukan, backTo, backLabel });
}

export function stashSuratPenagihanDudukanPreview(
  suratPenagihan: SuratPenagihanDudukanPdfPayload[],
  backTo: string,
  backLabel: string
): void {
  writePreviewState({ kind: "surat-penagihan-dudukan", suratPenagihan, backTo, backLabel });
}

export function stashSuratKeteranganKramaPreview(
  suratKeteranganKrama: SuratKeteranganKramaPdfPayload[],
  backTo: string,
  backLabel: string
): void {
  writePreviewState({ kind: "surat-keterangan-krama", suratKeteranganKrama, backTo, backLabel });
}

export function stashSuratKeteranganPindahPreview(
  suratKeteranganPindah: SuratKeteranganPindahPdfPayload[],
  backTo: string,
  backLabel: string
): void {
  writePreviewState({ kind: "surat-keterangan-pindah", suratKeteranganPindah, backTo, backLabel });
}

export function stashSuratMautsahaAdatPreview(
  suratMautsahaAdat: SuratMautsahaAdatPdfPayload[],
  backTo: string,
  backLabel: string
): void {
  writePreviewState({ kind: "surat-mautsaha-adat", suratMautsahaAdat, backTo, backLabel });
}

export function stashKwitansiIpmaPreview(
  kwitansiIpma: SuratMautsahaAdatPdfPayload[],
  backTo: string,
  backLabel: string
): void {
  writePreviewState({ kind: "kwitansi-ipma", kwitansiIpma, backTo, backLabel });
}

export function stashKartuDudukanBulkPreview(
  kramaIds: string[],
  backTo: string,
  backLabel: string
): void {
  writePreviewState({ kind: "kartu-dudukan", kramaIds, backTo, backLabel });
}

export function readLaporanPdfPreview(): LaporanPdfPreviewState | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as LaporanPdfPreviewState & { input?: LaporanPdfInput };

    if (parsed.kind === "bukti-setoran-dudukan" && parsed.buktiDudukan) {
      return parsed;
    }
    if (parsed.kind === "bukti-setoran-paturunan" && parsed.buktiPaturunan) {
      return parsed;
    }
    if (parsed.kind === "tunggakan-dudukan" && parsed.tunggakanDudukan) {
      return parsed;
    }
    if (parsed.kind === "surat-penagihan-dudukan" && parsed.suratPenagihan?.length) {
      return parsed;
    }
    if (parsed.kind === "surat-keterangan-krama" && parsed.suratKeteranganKrama?.length) {
      return parsed;
    }
    if (parsed.kind === "surat-keterangan-pindah" && parsed.suratKeteranganPindah?.length) {
      return parsed;
    }
    if (parsed.kind === "surat-mautsaha-adat" && parsed.suratMautsahaAdat?.length) {
      return parsed;
    }
    if (parsed.kind === "kwitansi-ipma" && parsed.kwitansiIpma?.length) {
      return parsed;
    }
    if (parsed.kind === "kartu-dudukan" && parsed.kramaIds?.length) {
      return parsed;
    }
    if (parsed.input) {
      return {
        kind: "laporan",
        input: parsed.input,
        backTo: parsed.backTo,
        backLabel: parsed.backLabel,
      };
    }
    return null;
  } catch {
    return null;
  }
}
