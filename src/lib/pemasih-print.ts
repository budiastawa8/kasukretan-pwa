import type { KlasifikasiKode } from "./types";

export function isPemasihPrintKlasifikasi(kode: KlasifikasiKode): boolean {
  return kode === "KRAMA_TAMIU" || kode === "TAMIU";
}

/** Layout lama (kop kuning layar) — Krama Tamiu */
export type PemasihPrintLayoutClassic = {
  layout: "classic";
  sheetTitle: string;
  nomorPrefix: string;
  documentTitle: string;
};

/** Layout formulir ILIKITA Pemasih Tamiu — hanya Tamiu */
export type PemasihPrintLayoutTamiuOfficial = {
  layout: "tamiu-official";
  sheetTitle: string;
  nomorPrefix: string;
  documentTitle: string;
  nikColumnHeader: string;
  labelTempek: string;
  labelAsalDesa: string;
  showAgamaPengajeg: boolean;
  showProvinsiAsal: boolean;
};

export type PemasihPrintMeta = PemasihPrintLayoutClassic | PemasihPrintLayoutTamiuOfficial;

export function pemasihPrintMeta(kode: KlasifikasiKode): PemasihPrintMeta | null {
  if (kode === "KRAMA_TAMIU") {
    return {
      layout: "classic",
      sheetTitle: "ILIKITA PEMASIH KRAMA TAMIU",
      nomorPrefix: "NPKT",
      documentTitle: "Ilikita Pemasih Krama Tamiu",
    };
  }
  if (kode === "TAMIU") {
    return {
      layout: "tamiu-official",
      sheetTitle: "ILIKITA PEMASIH TAMIU",
      nomorPrefix: "NPT",
      documentTitle: "Ilikita Pemasih Tamiu",
      nikColumnHeader: "NIK",
      labelTempek: "Tempek",
      labelAsalDesa: "Desa/Kel. Asal",
      showAgamaPengajeg: true,
      showProvinsiAsal: true,
    };
  }
  return null;
}
