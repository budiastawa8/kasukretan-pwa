import type { ReactNode } from "react";
import { chunkKartuA4Pages, KARTU_A4_GRID } from "../../lib/kartu-a4-grid";

export function KartuA4Grid({ children }: { children: ReactNode[] }) {
  const pages = chunkKartuA4Pages(children);

  return (
    <div className="kartu-a4-pages">
      {pages.map((pageItems, pageIndex) => (
        <div key={pageIndex} className="kartu-a4-page" aria-label={`Lembar A4 ${pageIndex + 1}`}>
          {pageItems}
        </div>
      ))}
    </div>
  );
}

export function kartuA4GridHint(count: number): string {
  const pages = Math.ceil(count / KARTU_A4_GRID.perPage) || 1;
  return `${count} pasang kartu · ${KARTU_A4_GRID.rows} baris per A4 (${pages} lembar)`;
}
