export const LIST_PAGE_SIZE = 25;

export const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;

export function totalPages(totalItems: number, pageSize = LIST_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

export function clampPage(page: number, totalItems: number, pageSize = LIST_PAGE_SIZE): number {
  return Math.min(Math.max(1, page), totalPages(totalItems, pageSize));
}

export function paginateSlice<T>(items: T[], page: number, pageSize = LIST_PAGE_SIZE): T[] {
  const safePage = clampPage(page, items.length, pageSize);
  const start = (safePage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function paginationRange(
  totalItems: number,
  page: number,
  pageSize = LIST_PAGE_SIZE
): { from: number; to: number } {
  if (totalItems <= 0) return { from: 0, to: 0 };
  const safePage = clampPage(page, totalItems, pageSize);
  const from = (safePage - 1) * pageSize + 1;
  const to = Math.min(safePage * pageSize, totalItems);
  return { from, to };
}
