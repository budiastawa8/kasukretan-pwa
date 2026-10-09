import type { KlasifikasiKode } from "./types";

export function kramaListPath(kode: KlasifikasiKode): string {
  return kode === "MIPIL" ? "/krama-mipil" : "/krama-pemasih";
}

export function kramaNewPath(kode: KlasifikasiKode): string {
  if (kode === "MIPIL") return "/krama-mipil/baru";
  if (kode === "KRAMA_TAMIU") return "/krama-pemasih/krama-tamiu/baru";
  return "/krama-pemasih/tamiu/baru";
}

export function kramaEditPath(kode: KlasifikasiKode, id: string): string {
  return `${kramaListPath(kode)}/${id}/edit`;
}

export function kramaDetailPath(kode: KlasifikasiKode, id: string): string {
  return `${kramaListPath(kode)}/${id}`;
}
