/** Tata letak pasangan kartu depan+belakang 8,5×5 cm — 1 pasang × 4 baris per lembar A4 portrait. */

export const KARTU_A4_GRID = {
  cols: 1,
  rows: 4,
  perPage: 4,
  cardWmm: 85,
  cardHmm: 50,
  pairGapMm: 2,
  pageWmm: 210,
  pageHmm: 297,
  marginLeftMm: 12,
  marginTopMm: 12,
  colGapMm: 8,
  rowGapMm: 6,
} as const;

export const MM_TO_PT = 2.834645669;

export function chunkKartuA4Pages<T>(items: T[]): T[][] {
  const n = KARTU_A4_GRID.perPage;
  const pages: T[][] = [];
  for (let i = 0; i < items.length; i += n) {
    pages.push(items.slice(i, i + n));
  }
  return pages;
}

export function kartuA4PageSizePt(): [number, number] {
  return [KARTU_A4_GRID.pageWmm * MM_TO_PT, KARTU_A4_GRID.pageHmm * MM_TO_PT];
}

/** Sudut kiri-bawah kartu dalam koordinat PDF (pt). */
export function kartuGridSlotOriginPt(col: number, row: number): { x: number; y: number } {
  const cardW = KARTU_A4_GRID.cardWmm * MM_TO_PT;
  const cardH = KARTU_A4_GRID.cardHmm * MM_TO_PT;
  const ml = KARTU_A4_GRID.marginLeftMm * MM_TO_PT;
  const mt = KARTU_A4_GRID.marginTopMm * MM_TO_PT;
  const cg = KARTU_A4_GRID.colGapMm * MM_TO_PT;
  const rg = KARTU_A4_GRID.rowGapMm * MM_TO_PT;
  const pageH = KARTU_A4_GRID.pageHmm * MM_TO_PT;

  const x = ml + col * (cardW + cg);
  const y = pageH - mt - (row + 1) * cardH - row * rg;
  return { x, y };
}

/** Sudut kiri-bawah kartu belakang (sebelah kanan depan) dalam koordinat PDF (pt). */
export function kartuGridBackOriginPt(frontX: number, frontY: number): { x: number; y: number } {
  const cardW = KARTU_A4_GRID.cardWmm * MM_TO_PT;
  const pairGap = KARTU_A4_GRID.pairGapMm * MM_TO_PT;
  return { x: frontX + cardW + pairGap, y: frontY };
}

export function kartuA4PageCount(cardCount: number): number {
  return Math.max(1, Math.ceil(cardCount / KARTU_A4_GRID.perPage));
}
