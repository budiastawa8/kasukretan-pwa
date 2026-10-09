export type SortDirection = "asc" | "desc";

export type SortValue = string | number | null | undefined;

export type SortAccessors<T> = Record<string, (row: T) => SortValue>;

export function compareSortText(
  a: string | null | undefined,
  b: string | null | undefined
): number {
  return (a ?? "").trim().localeCompare((b ?? "").trim(), "id", {
    numeric: true,
    sensitivity: "base",
  });
}

export function compareSortNumber(
  a: number | null | undefined,
  b: number | null | undefined
): number {
  return (Number(a) || 0) - (Number(b) || 0);
}

function compareSortValues(a: SortValue, b: SortValue): number {
  const aNum = typeof a === "number";
  const bNum = typeof b === "number";
  if (aNum && bNum) return compareSortNumber(a, b);
  if (aNum) return -1;
  if (bNum) return 1;
  return compareSortText(String(a ?? ""), String(b ?? ""));
}

/** Urutkan salinan baris; jika sortKey null, kembalikan urutan asli (mis. dari SQL). */
export function sortTableRows<T>(
  rows: T[],
  sortKey: string | null,
  sortDir: SortDirection,
  accessors: SortAccessors<T>
): T[] {
  if (!sortKey) return rows;
  const accessor = accessors[sortKey];
  if (!accessor) return rows;
  const dir = sortDir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => dir * compareSortValues(accessor(a), accessor(b)));
}
