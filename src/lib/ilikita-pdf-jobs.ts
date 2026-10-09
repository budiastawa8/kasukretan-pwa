import type { KlasifikasiKode } from "./types";
import { generatePemasihPdf, pemasihPdfFilename } from "./pemasih-pdf";
import { generatePipilPdf, pipilPdfFilename } from "./pipil-pdf";
import { pemasihPrintMeta } from "./pemasih-print";
import type { DesaAdat, KramaDetail } from "./types";

export type IlikitaPdfDoc = "pipil" | "pemasih";

export function expectedKlasifikasiForIlikita(doc: IlikitaPdfDoc): KlasifikasiKode[] {
  if (doc === "pipil") return ["MIPIL"];
  return ["KRAMA_TAMIU", "TAMIU"];
}

export function ilikitaPdfTitle(doc: IlikitaPdfDoc, krama: KramaDetail): string {
  if (doc === "pipil") return "Pipil";
  const meta = pemasihPrintMeta(krama.klasifikasi_kode);
  return meta?.sheetTitle ?? "Pemasih";
}

export async function generateIlikitaPdfBytes(
  doc: IlikitaPdfDoc,
  krama: KramaDetail,
  desa: DesaAdat | null,
  options?: { tampilkanTtdBandesa?: boolean }
): Promise<Uint8Array> {
  if (doc === "pipil") {
    return generatePipilPdf(krama, desa, options);
  }
  const meta = pemasihPrintMeta(krama.klasifikasi_kode);
  if (!meta) throw new Error("Format Pemasih tidak dikenali");
  return generatePemasihPdf(krama, desa, meta, options);
}

export function ilikitaPdfFilename(doc: IlikitaPdfDoc, krama: KramaDetail): string {
  if (doc === "pipil") return pipilPdfFilename(krama);
  return pemasihPdfFilename(krama);
}
