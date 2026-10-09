export type TunggakanDudukanPageSize = "8x13" | "A4" | "F4";

export type TunggakanDudukanPdfOptions = {
  pageSize: TunggakanDudukanPageSize;
  titlePt: number;
  subtitlePt: number;
  tablePt: number;
  judul: string;
  catatan: string;
};

/** Pengaturan tetap pratinjau/cetak PDF Tunggakan Dudukan. */
export const DEFAULT_TUNGGAKAN_DUDUKAN_PDF_OPTIONS: TunggakanDudukanPdfOptions = {
  pageSize: "8x13",
  titlePt: 16,
  subtitlePt: 14,
  tablePt: 10,
  judul: "TUNGGAKAN DUDUKAN",
  catatan: "",
};

export const TUNGGKAN_PAGE_SIZE_LABELS: Record<TunggakanDudukanPageSize, string> = {
  "8x13": '8 × 13″',
  A4: "A4",
  F4: "F4 (210 × 330 mm)",
};

export function pageSizePreviewLabel(pageSize: TunggakanDudukanPageSize): string {
  return `${TUNGGKAN_PAGE_SIZE_LABELS[pageSize]} portrait`;
}
