import type { KlasifikasiKode } from "./types";

export function kramaListPath(kode: KlasifikasiKode): string {
  return kode === "MIPIL" ? "/krama-mipil" : "/krama-pemasih";
}

export function kramaNewPath(kode: KlasifikasiKode): string {
  if (kode === "MIPIL") return "/krama-mipil/baru";
  return "/krama-pemasih/baru";
}

export function kramaEditPath(kode: KlasifikasiKode, id: string): string {
  return `${kramaListPath(kode)}/${id}/edit`;
}

export function kramaDetailPath(kode: KlasifikasiKode, id: string): string {
  return `${kramaListPath(kode)}/${id}`;
}

/** Flash setelah simpan kartu baru — form kosong siap input berikutnya. */
export type KramaJustSavedFlash = {
  id: string;
  nomorKartu: string;
  label: "Pipil" | "Pemasih";
};

export type KramaNewLocationState = {
  justSaved?: KramaJustSavedFlash;
};
