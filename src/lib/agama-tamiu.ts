import type { KlasifikasiKode } from "./types";

/** Agama default untuk Krama Mipil. */
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

export type KlasifikasiPemasih = Extract<KlasifikasiKode, "KRAMA_TAMIU" | "TAMIU">;

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

/**
 * Hindu → Krama Tamiu; selain Hindu → Tamiu.
 * Mengembalikan null jika agama belum valid.
 */
export function tryKlasifikasiPemasihFromAgama(
  agama?: string | null
): KlasifikasiPemasih | null {
  if (!isValidAgamaTamiu(agama)) return null;
  return agama === AGAMA_HINDU ? "KRAMA_TAMIU" : "TAMIU";
}

/** Sama seperti try*, tetapi melempar jika agama tidak valid. */
export function klasifikasiPemasihFromAgama(agama?: string | null): KlasifikasiPemasih {
  assertAgamaTamiu(agama);
  return agama === AGAMA_HINDU ? "KRAMA_TAMIU" : "TAMIU";
}

export function assertKlasifikasiSesuaiAgama(
  kode: KlasifikasiPemasih,
  agama?: string | null
): void {
  const derived = klasifikasiPemasihFromAgama(agama);
  if (derived !== kode) {
    throw new Error(
      derived === "KRAMA_TAMIU"
        ? 'Agama Hindu harus berstatus Krama Tamiu'
        : "Agama selain Hindu harus berstatus Tamiu"
    );
  }
}

/** Nilai agama yang disimpan ke penduduk menurut klasifikasi krama. */
export function agamaForPenduduk(
  kode: KlasifikasiKode,
  agama?: string | null
): string | null {
  if (kode === "MIPIL") return AGAMA_HINDU;
  if (kode === "KRAMA_TAMIU" || kode === "TAMIU") {
    const trimmed = agama?.trim() || null;
    if (kode === "KRAMA_TAMIU" && !trimmed) return AGAMA_HINDU;
    return trimmed;
  }
  return null;
}
