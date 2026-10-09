import type { KlasifikasiKode } from "./types";

/** Agama default untuk Krama Mipil dan Krama Tamiu. */
export const AGAMA_HINDU = "Hindu" as const;

export const AGAMA_TAMIU_OPTIONS = [
  "Islam",
  "Kristen",
  "Katholik",
  "Konghucu",
  "Budha",
  AGAMA_HINDU,
] as const;

export type AgamaTamiu = (typeof AGAMA_TAMIU_OPTIONS)[number];

export function isValidAgamaTamiu(value?: string | null): value is AgamaTamiu {
  return !!value && (AGAMA_TAMIU_OPTIONS as readonly string[]).includes(value);
}

export function assertAgamaTamiu(value?: string | null): void {
  if (!isValidAgamaTamiu(value)) {
    throw new Error(
      "Pilih agama yang valid (Islam, Kristen, Katholik, Konghucu, Budha, atau Hindu)"
    );
  }
}

/** Nilai agama yang disimpan ke penduduk menurut klasifikasi krama. */
export function agamaForPenduduk(
  kode: KlasifikasiKode,
  agama?: string | null
): string | null {
  if (kode === "MIPIL" || kode === "KRAMA_TAMIU") return AGAMA_HINDU;
  if (kode === "TAMIU") return agama?.trim() || null;
  return null;
}
