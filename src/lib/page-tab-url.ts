export type DudukanPageTab = "daftar" | "tunggakan" | "riwayat" | "impor";
export type PaturunanPageTab = "daftar" | "riwayat" | "impor";

const DUDUKAN_TABS = new Set<DudukanPageTab>(["daftar", "tunggakan", "riwayat", "impor"]);
const PATURUNAN_TABS = new Set<PaturunanPageTab>(["daftar", "riwayat", "impor"]);

export function parseDudukanPageTab(raw: string | null | undefined): DudukanPageTab {
  if (raw && DUDUKAN_TABS.has(raw as DudukanPageTab)) return raw as DudukanPageTab;
  return "daftar";
}

export function parsePaturunanPageTab(raw: string | null | undefined): PaturunanPageTab {
  if (raw && PATURUNAN_TABS.has(raw as PaturunanPageTab)) return raw as PaturunanPageTab;
  return "daftar";
}

/** Path halaman dengan tab aktif (query `tab`, diabaikan jika daftar). */
export function dudukanPagePath(
  tab: DudukanPageTab = "daftar",
  baseParams?: URLSearchParams
): string {
  const params = new URLSearchParams(baseParams);
  if (tab === "daftar") params.delete("tab");
  else params.set("tab", tab);
  const qs = params.toString();
  return qs ? `/dudukan?${qs}` : "/dudukan";
}

export function paturunanPagePath(
  tab: PaturunanPageTab = "daftar",
  baseParams?: URLSearchParams
): string {
  const params = new URLSearchParams(baseParams);
  if (tab === "daftar") params.delete("tab");
  else params.set("tab", tab);
  const qs = params.toString();
  return qs ? `/paturunan?${qs}` : "/paturunan";
}

/** Terapkan tab ke URLSearchParams yang ada (replace). */
export function applyPageTabToSearchParams<T extends string>(
  params: URLSearchParams,
  tab: T,
  defaultTab: T
): URLSearchParams {
  const next = new URLSearchParams(params);
  if (tab === defaultTab) next.delete("tab");
  else next.set("tab", tab);
  return next;
}
