export type KramaStatusKode = "aktif" | "nonaktif";

export const KRAMA_STATUS_OPTIONS: { value: KramaStatusKode; label: string }[] = [
  { value: "aktif", label: "Aktif" },
  { value: "nonaktif", label: "Nonaktif" },
];

export function normalizeKramaStatus(status?: string | null): KramaStatusKode {
  return status?.trim().toLowerCase() === "nonaktif" ? "nonaktif" : "aktif";
}

export function formatKramaStatus(status?: string | null): string {
  return normalizeKramaStatus(status) === "aktif" ? "Aktif" : "Nonaktif";
}

export type AlasanTidakAktifKode = "meninggal" | "pindah" | "pawanengan_3_bulan";

export const ALASAN_TIDAK_AKTIF_OPTIONS: { value: AlasanTidakAktifKode; label: string }[] = [
  { value: "meninggal", label: "Meninggal" },
  { value: "pindah", label: "Pindah" },
  { value: "pawanengan_3_bulan", label: "Pawanengan 3 bulan" },
];

export function normalizeAlasanTidakAktif(value?: string | null): AlasanTidakAktifKode | null {
  const raw = value?.trim().toLowerCase() ?? "";
  if (!raw) return null;
  const v = raw.replace(/\s+/g, "_");
  if (v === "meninggal" || v === "pindah" || v === "pawanengan_3_bulan") return v;
  // Label impor Excel: "Pawanengan 3 bulan"
  if (raw.includes("pawanengan")) return "pawanengan_3_bulan";
  return null;
}

export function formatAlasanTidakAktif(value?: string | null): string {
  const kode = normalizeAlasanTidakAktif(value);
  if (!kode) return "—";
  return ALASAN_TIDAK_AKTIF_OPTIONS.find((o) => o.value === kode)?.label ?? value ?? "—";
}

/** Pembayaran paturunan/dudukan hanya untuk krama aktif (kecuali impor riwayat). */
export function assertKramaStatusAktifUntukPembayaran(status?: string | null): void {
  if (normalizeKramaStatus(status) !== "aktif") {
    throw new Error("Krama nonaktif tidak dapat melakukan pembayaran");
  }
}

export function assertNonaktifFields(
  statusKrama: string | undefined,
  alasanTidakAktif: string | undefined,
  tanggalTidakAktif: string | undefined
): void {
  if (normalizeKramaStatus(statusKrama) !== "nonaktif") return;
  if (!normalizeAlasanTidakAktif(alasanTidakAktif)) {
    throw new Error("Alasan tidak aktif wajib diisi (Meninggal, Pindah, atau Pawanengan 3 bulan)");
  }
  if (!tanggalTidakAktif?.trim()) {
    throw new Error("Tanggal mulai tidak aktif wajib diisi");
  }
}
