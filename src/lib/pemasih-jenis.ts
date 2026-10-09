import type { KlasifikasiKode } from "./types";

/** Pedoman resmi — Jenis Krama Tamiu (Pemasih). */
export const JENIS_KRAMA_TAMIU_NAMA = [
  "Krama Tamiu Rajeg",
  "Krama Tamiu Padunungan",
  "Krama Tamiu Padgatakala",
] as const;

/** Pedoman resmi — Jenis Tamiu (Pemasih). */
export const JENIS_TAMIU_NAMA = [
  "Tamiu Rajeg Mula",
  "Tamiu Rajeg Anyar",
  "Tamiu Padunungan",
  "Tamiu Padgatakala",
] as const;

export function klasifikasiPemasihLabel(kode: KlasifikasiKode): string {
  if (kode === "KRAMA_TAMIU") return "Krama Tamiu";
  if (kode === "TAMIU") return "Tamiu";
  return kode;
}

/** Kode internal database → label impor/ekspor Excel. */
export function klasifikasiPemasihExportValue(kode: string): string {
  if (kode === "KRAMA_TAMIU") return "Krama Tamiu";
  if (kode === "TAMIU") return "Tamiu";
  return kode;
}

/**
 * Terima label manusia (Krama Tamiu / Tamiu) atau kode sistem (KRAMA_TAMIU / TAMIU).
 * KRAMA_TAMIU memakai underscore karena kode enum di database, bukan nama tampilan.
 */
export function parsePemasihKlasifikasiImport(raw: string): KlasifikasiKode | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase().replace(/\s+/g, "_");
  if (upper === "KRAMA_TAMIU") return "KRAMA_TAMIU";
  if (upper === "TAMIU") return "TAMIU";
  const lower = trimmed.toLowerCase();
  if (lower === "krama tamiu") return "KRAMA_TAMIU";
  if (lower === "tamiu") return "TAMIU";
  return null;
}

export function jenisPemasihNamaHint(klasifikasi: KlasifikasiKode): string {
  const list =
    klasifikasi === "KRAMA_TAMIU" ? JENIS_KRAMA_TAMIU_NAMA : JENIS_TAMIU_NAMA;
  return list.join(", ");
}

export function normalizeImportJenisName(raw: string): string {
  return raw.trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");
}

export function pemasihJenisNameCore(raw: string): string {
  let name = normalizeImportJenisName(raw);
  for (let i = 0; i < 3; i++) {
    const next = name.replace(/^(krama\s+tamiu|tamiu)\s+/, "");
    if (next === name) break;
    name = next;
  }
  return name;
}

/** Urutan resmi jenis Pemasih (Rajeg → Padunungan → …) per klasifikasi. */
export function pemasihJenisSortRank(klasifikasi: KlasifikasiKode, jenisNama: string): number {
  const list =
    klasifikasi === "KRAMA_TAMIU" ? JENIS_KRAMA_TAMIU_NAMA : JENIS_TAMIU_NAMA;
  const normalized = normalizeImportJenisName(jenisNama);
  if (!normalized) return list.length + 1;

  const exact = list.findIndex((n) => normalizeImportJenisName(n) === normalized);
  if (exact >= 0) return exact;

  const core = pemasihJenisNameCore(jenisNama);
  const byCore = list.findIndex((n) => pemasihJenisNameCore(n) === core);
  if (byCore >= 0) return byCore;

  return list.length + 1;
}

export function pemasihJenisNameVariants(raw: string): string[] {
  const trimmed = normalizeImportJenisName(raw);
  if (!trimmed) return [];
  const variants = new Set<string>([trimmed]);
  let stripped = trimmed;
  for (let i = 0; i < 3; i++) {
    const next = stripped.replace(/^(krama\s+tamiu|tamiu)\s+/, "");
    if (next === stripped) break;
    stripped = next;
    variants.add(stripped);
  }
  return [...variants].filter(Boolean);
}

/** Klasifikasi yang tersirat dari awalan jenis_nama. */
export function inferKlasifikasiFromJenisNama(jenisNama: string): KlasifikasiKode | null {
  const n = normalizeImportJenisName(jenisNama);
  if (n.startsWith("krama tamiu ")) return "KRAMA_TAMIU";
  if (n.startsWith("tamiu ")) return "TAMIU";
  return null;
}

export function buildJenisLookupMap(
  rows: { id: string; nama: string }[],
  prefix: "krama tamiu" | "tamiu"
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    const base = normalizeImportJenisName(row.nama);
    if (!base) continue;
    map.set(base, row.id);
    map.set(`${prefix} ${base}`, row.id);
    const core = pemasihJenisNameCore(row.nama);
    if (core && core !== base) {
      map.set(core, row.id);
      map.set(`${prefix} ${core}`, row.id);
    }
  }
  return map;
}

export function lookupJenisId(
  map: Map<string, string>,
  jenisNama: string
): string | undefined {
  for (const v of pemasihJenisNameVariants(jenisNama)) {
    const id = map.get(v);
    if (id) return id;
  }
  return undefined;
}

/** Cocokkan jenis_nama ke master sesuai klasifikasi kartu (tanpa lintas tabel). */
export function resolveJenisForKlasifikasi(
  jenisNama: string,
  klasifikasi: KlasifikasiKode,
  ktMap: Map<string, string>,
  tMap: Map<string, string>
): { jenisKtId?: string; jenisTId?: string } | null {
  if (!jenisNama.trim()) return null;
  if (klasifikasi === "KRAMA_TAMIU") {
    const id = lookupJenisId(ktMap, jenisNama);
    return id ? { jenisKtId: id } : null;
  }
  const id = lookupJenisId(tMap, jenisNama);
  return id ? { jenisTId: id } : null;
}

export function jenisPemasihImportErrorMessage(
  klasifikasi: KlasifikasiKode,
  jenisNama: string,
  opts: { isCreate: boolean; ktId?: string; tId?: string }
): string {
  const label = klasifikasiPemasihLabel(klasifikasi);
  const hint = jenisPemasihNamaHint(klasifikasi);
  const inferred = inferKlasifikasiFromJenisNama(jenisNama);
  const core = pemasihJenisNameCore(jenisNama) || jenisNama;

  if (!opts.isCreate && klasifikasi === "TAMIU" && opts.ktId && !opts.tId) {
    return `"${jenisNama}" (${core}) adalah jenis Krama Tamiu, bukan Tamiu. Kartu ini Tamiu — isi jenis_nama salah satu: ${hint}`;
  }
  if (!opts.isCreate && klasifikasi === "KRAMA_TAMIU" && opts.tId && !opts.ktId) {
    return `"${jenisNama}" (${core}) adalah jenis Tamiu, bukan Krama Tamiu. Kartu ini Krama Tamiu — isi jenis_nama salah satu: ${hint}`;
  }
  if (
    !opts.isCreate &&
    inferred &&
    inferred !== klasifikasi
  ) {
    return `jenis_nama menunjukkan ${klasifikasiPemasihLabel(inferred)}, tetapi kartu berklasifikasi ${label}. Sesuaikan jenis_nama (${hint}) atau periksa kartu di aplikasi.`;
  }

  return `Jenis ${label} "${jenisNama}" tidak ditemukan di Master. Gunakan salah satu: ${hint}`;
}
