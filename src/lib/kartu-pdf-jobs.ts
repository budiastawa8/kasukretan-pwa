import type { AnggotaKeluarga, DesaAdat, KlasifikasiKode, KramaDetail } from "./types";
import { generateKartuKramaPdf, kartuKramaPdfFilename } from "./kartu-krama-pdf";
import {
  generateKartuKramaTamiuPdf,
  kartuKramaTamiuPdfFilename,
} from "./kartu-krama-tamiu-pdf";
import { generateKartuTamiuPdf, kartuTamiuPdfFilename } from "./kartu-tamiu-pdf";

export type KartuPdfKind = "kartu-mipil" | "kartu-krama-tamiu" | "kartu-tamiu";

const KIND_BY_KLASIFIKASI: Record<KlasifikasiKode, KartuPdfKind | null> = {
  MIPIL: "kartu-mipil",
  KRAMA_TAMIU: "kartu-krama-tamiu",
  TAMIU: "kartu-tamiu",
};

export function kartuPdfKindForKlasifikasi(kode: KlasifikasiKode): KartuPdfKind | null {
  return KIND_BY_KLASIFIKASI[kode];
}

export function expectedKlasifikasiForKind(kind: KartuPdfKind): KlasifikasiKode {
  switch (kind) {
    case "kartu-mipil":
      return "MIPIL";
    case "kartu-krama-tamiu":
      return "KRAMA_TAMIU";
    case "kartu-tamiu":
      return "TAMIU";
  }
}

export function kartuPdfKindLabel(kind: KartuPdfKind): string {
  switch (kind) {
    case "kartu-mipil":
      return "Kartu Krama Adat";
    case "kartu-krama-tamiu":
      return "Kartu Krama Tamiu";
    case "kartu-tamiu":
      return "Kartu Tamiu";
  }
}

export async function generateKartuPdfBytes(
  kind: KartuPdfKind,
  krama: KramaDetail,
  desa: DesaAdat | null,
  anggotaList: AnggotaKeluarga[]
): Promise<Uint8Array> {
  switch (kind) {
    case "kartu-mipil":
      return generateKartuKramaPdf(krama, desa, anggotaList);
    case "kartu-krama-tamiu":
      return generateKartuKramaTamiuPdf(krama, desa, anggotaList);
    case "kartu-tamiu":
      return generateKartuTamiuPdf(krama, desa, anggotaList);
  }
}

export function kartuPdfFilename(
  kind: KartuPdfKind,
  krama: KramaDetail,
  anggotaList: AnggotaKeluarga[]
): string {
  const count = anggotaList.length;
  const single = count === 1 ? anggotaList[0] : undefined;
  switch (kind) {
    case "kartu-mipil":
      return kartuKramaPdfFilename(krama, count, single);
    case "kartu-krama-tamiu":
      return kartuKramaTamiuPdfFilename(krama, count, single);
    case "kartu-tamiu":
      return kartuTamiuPdfFilename(krama, count, single);
  }
}
