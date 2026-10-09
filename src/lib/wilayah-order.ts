/**
 * Aturan urutan wilayah — dipakai di seluruh tampilan & laporan:
 * - Banjar: kode banjar
 * - Tempek & Arahan: waktu pembuatan (created_at)
 */

export function compareBanjarKode(a: string, b: string): number {
  return a.trim().localeCompare(b.trim(), "id", { numeric: true, sensitivity: "base" });
}

export function compareWilayahCreatedAt(
  a: string | null | undefined,
  b: string | null | undefined
): number {
  const ta = a?.trim() ?? "";
  const tb = b?.trim() ?? "";
  if (!ta && !tb) return 0;
  if (!ta) return 1;
  if (!tb) return -1;
  return ta.localeCompare(tb);
}

export type BanjarSortable = {
  banjar_kode?: string | null;
  banjar_nama?: string | null;
};

export type TempekSortable = {
  tempek_created_at?: string | null;
  tempek_nama?: string | null;
};

export type ArahanSortable = {
  arahan_created_at?: string | null;
  arahan_nama?: string | null;
};

export function compareBanjarRow(a: BanjarSortable, b: BanjarSortable): number {
  const byKode = compareBanjarKode(a.banjar_kode ?? "", b.banjar_kode ?? "");
  if (byKode !== 0) return byKode;
  return (a.banjar_nama ?? "").localeCompare(b.banjar_nama ?? "", "id");
}

export function compareTempekRow(a: TempekSortable, b: TempekSortable): number {
  const byCreated = compareWilayahCreatedAt(a.tempek_created_at, b.tempek_created_at);
  if (byCreated !== 0) return byCreated;
  return (a.tempek_nama ?? "").localeCompare(b.tempek_nama ?? "", "id");
}

export function compareArahanRow(a: ArahanSortable, b: ArahanSortable): number {
  const aName = a.arahan_nama?.trim() || "—";
  const bName = b.arahan_nama?.trim() || "—";
  const aEmpty = !a.arahan_nama?.trim() || aName === "—";
  const bEmpty = !b.arahan_nama?.trim() || bName === "—";
  if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
  const byCreated = compareWilayahCreatedAt(a.arahan_created_at, b.arahan_created_at);
  if (byCreated !== 0) return byCreated;
  return aName.localeCompare(bName, "id");
}

/** Urut Banjar → Tempek → Arahan (lalu nomor kartu jika ada). */
export function compareKramaWilayah(
  a: BanjarSortable & TempekSortable & ArahanSortable & { nomor_kartu?: string },
  b: BanjarSortable & TempekSortable & ArahanSortable & { nomor_kartu?: string }
): number {
  const byBanjar = compareBanjarRow(a, b);
  if (byBanjar !== 0) return byBanjar;
  const byTempek = compareTempekRow(a, b);
  if (byTempek !== 0) return byTempek;
  const byArahan = compareArahanRow(a, b);
  if (byArahan !== 0) return byArahan;
  if (a.nomor_kartu && b.nomor_kartu) {
    return a.nomor_kartu.localeCompare(b.nomor_kartu, "id", { numeric: true });
  }
  return 0;
}

export function sortBanjarByKode<T extends BanjarSortable>(rows: T[]): T[] {
  return [...rows].sort(compareBanjarRow);
}

export function sortByWilayahCreatedAt<T extends { created_at?: string | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => compareWilayahCreatedAt(a.created_at, b.created_at));
}

export function sortKramaByWilayah<
  T extends BanjarSortable & TempekSortable & ArahanSortable & { nomor_kartu?: string },
>(rows: T[]): T[] {
  return [...rows].sort(compareKramaWilayah);
}
