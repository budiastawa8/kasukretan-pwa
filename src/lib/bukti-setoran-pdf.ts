import { formatTanggalLahir } from "./utils";

export {
  buildBuktiSetoranDudukanPdfBytes,
  buildBuktiSetoranDudukanPdfPayload,
  paymentDayKey,
  type BuktiSetoranDudukanPdfPayload,
} from "./bukti-setoran-dudukan-pdf";

export {
  buildBuktiSetoranPaturunanPdfBytes,
  buildBuktiSetoranPaturunanPdfPayload,
  buildBuktiSetoranPaturunanSlip,
  type BuktiSetoranPaturunanPdfPayload,
} from "./bukti-setoran-paturunan-pdf";

export function buildPeriodeSetoranLabel(dari?: string, sampai?: string): string {
  const d = dari?.trim();
  const s = sampai?.trim();
  if (d && s) return `${formatTanggalLahir(d)} – ${formatTanggalLahir(s)}`;
  if (d) return `Sejak ${formatTanggalLahir(d)}`;
  if (s) return `Sampai ${formatTanggalLahir(s)}`;
  return "Semua tanggal";
}
