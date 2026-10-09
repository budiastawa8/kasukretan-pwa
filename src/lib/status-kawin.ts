import type { KlasifikasiKode } from "./types";

export const STATUS_KAWIN_KODE = {
  KAWIN: "kawin",
  BELUM_KAWIN: "belum_kawin",
  CERAI_HIDUP: "cerai_hidup",
  CERAI_MATI: "cerai_mati",
  KAWIN_SIRI: "kawin_siri",
} as const;

export type StatusKawinKode = (typeof STATUS_KAWIN_KODE)[keyof typeof STATUS_KAWIN_KODE];

const STATUS_KAWIN_LABEL: Record<string, string> = {
  [STATUS_KAWIN_KODE.KAWIN]: "Kawin",
  [STATUS_KAWIN_KODE.BELUM_KAWIN]: "Belum Kawin",
  [STATUS_KAWIN_KODE.CERAI_HIDUP]: "Cerai Hidup",
  [STATUS_KAWIN_KODE.CERAI_MATI]: "Cerai Mati",
  [STATUS_KAWIN_KODE.KAWIN_SIRI]: "Kawin Siri",
};

/** Label tampilan (case-insensitive) → kode kanonis. */
const STATUS_KAWIN_LABEL_TO_KODE: Record<string, string> = Object.fromEntries(
  Object.entries(STATUS_KAWIN_LABEL).map(([kode, label]) => [label.toLowerCase(), kode])
);

function statusKawinSlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function statusKawinCompact(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

const STATUS_KAWIN_COMPACT_TO_KODE: Record<string, string> = {
  kawin: STATUS_KAWIN_KODE.KAWIN,
  belumkawin: STATUS_KAWIN_KODE.BELUM_KAWIN,
  ceraihidup: STATUS_KAWIN_KODE.CERAI_HIDUP,
  ceraimati: STATUS_KAWIN_KODE.CERAI_MATI,
  kawinsiri: STATUS_KAWIN_KODE.KAWIN_SIRI,
};

export const STATUS_KAWIN_OPTIONS_BASE: { value: StatusKawinKode; label: string }[] = [
  { value: STATUS_KAWIN_KODE.KAWIN, label: "Kawin" },
  { value: STATUS_KAWIN_KODE.BELUM_KAWIN, label: "Belum Kawin" },
  { value: STATUS_KAWIN_KODE.CERAI_HIDUP, label: "Cerai Hidup" },
  { value: STATUS_KAWIN_KODE.CERAI_MATI, label: "Cerai Mati" },
];

export function isAgamaIslam(agama?: string | null): boolean {
  return agama?.trim().toLowerCase() === "islam";
}

/** Kawin Siri hanya untuk Tamiu beragama Islam. */
export function showKawinSiriOption(
  klasifikasi: KlasifikasiKode,
  agama?: string | null
): boolean {
  return klasifikasi === "TAMIU" && isAgamaIslam(agama);
}

export function statusKawinOptionsForForm(
  klasifikasi: KlasifikasiKode,
  agama?: string | null,
  currentValue?: string | null
): { value: string; label: string }[] {
  const opts: { value: string; label: string }[] = [...STATUS_KAWIN_OPTIONS_BASE];
  const current = currentValue?.trim().toLowerCase();
  if (
    showKawinSiriOption(klasifikasi, agama) ||
    current === STATUS_KAWIN_KODE.KAWIN_SIRI
  ) {
    opts.push({
      value: STATUS_KAWIN_KODE.KAWIN_SIRI,
      label: STATUS_KAWIN_LABEL[STATUS_KAWIN_KODE.KAWIN_SIRI]!,
    });
  }
  return opts;
}

export function formatStatusKawin(status?: string | null): string {
  if (!status) return "";
  const kode = normalizeStatusKawinKode(status);
  if (kode && kode in STATUS_KAWIN_LABEL) return STATUS_KAWIN_LABEL[kode]!;
  return status.trim();
}

/** Normalisasi ke kode kanonis — tidak peka huruf besar/kecil; terima label ("Belum Kawin") atau slug. */
export function normalizeStatusKawinKode(status?: string | null): string | undefined {
  if (!status?.trim()) return undefined;
  const trimmed = status.trim();
  const slug = statusKawinSlug(trimmed);
  if (slug in STATUS_KAWIN_LABEL) return slug;

  const byLabel = STATUS_KAWIN_LABEL_TO_KODE[trimmed.toLowerCase()];
  if (byLabel) return byLabel;

  const byCompact = STATUS_KAWIN_COMPACT_TO_KODE[statusKawinCompact(trimmed)];
  if (byCompact) return byCompact;

  return slug;
}

export function isStatusKawinBelumKawin(status?: string | null): boolean {
  return normalizeStatusKawinKode(status) === STATUS_KAWIN_KODE.BELUM_KAWIN;
}

export function isStatusKawinCerai(status?: string | null): boolean {
  const kode = normalizeStatusKawinKode(status);
  return kode === STATUS_KAWIN_KODE.CERAI_HIDUP || kode === STATUS_KAWIN_KODE.CERAI_MATI;
}
