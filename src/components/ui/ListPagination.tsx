import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  LIST_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  clampPage,
  paginationRange,
  totalPages,
} from "../../lib/pagination";
import { useIsPhoneClient } from "../../hooks/useClientFormFactor";
import { cn } from "../../lib/utils";
import { Button } from "./Button";
import { Select } from "./Input";

export function ListPagination({
  page,
  totalItems,
  pageSize = LIST_PAGE_SIZE,
  onPageChange,
  onPageSizeChange,
  className,
  compact = false,
}: {
  page: number;
  totalItems: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  className?: string;
  compact?: boolean;
}) {
  const isPhone = useIsPhoneClient();
  const pages = totalPages(totalItems, pageSize);
  const safePage = clampPage(page, totalItems, pageSize);
  const { from, to } = paginationRange(totalItems, safePage, pageSize);

  if (totalItems <= 0) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 border-t border-copper-100 pt-2 mt-2",
        compact ? "text-xs" : "text-sm",
        className
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-muted">
          Menampilkan{" "}
          <span className="font-medium text-copper-900">
            {from}–{to}
          </span>{" "}
          dari <span className="font-medium text-copper-900">{totalItems}</span>
        </p>
        <label className="inline-flex items-center gap-1 text-muted">
          <span>Baris per halaman:</span>
          <Select
            aria-label="Baris per halaman"
            value={pageSize}
            onChange={(event) => {
              onPageSizeChange(Number(event.target.value));
              onPageChange(1);
            }}
            className={cn(
              "w-auto min-h-8 py-1 pl-2 pr-7",
              compact && (isPhone ? "h-11 min-h-11 text-sm" : "h-8 text-xs")
            )}
          >
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="secondary"
          icon={ChevronLeft}
          className={cn(compact && (isPhone ? "h-11 text-sm px-3" : "h-8 text-xs px-2"))}
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
        >
          Sebelumnya
        </Button>
        <span className="px-2 text-muted tabular-nums">
          {safePage} / {pages}
        </span>
        <Button
          type="button"
          variant="secondary"
          iconRight={ChevronRight}
          className={cn(compact && (isPhone ? "h-11 text-sm px-3" : "h-8 text-xs px-2"))}
          disabled={safePage >= pages}
          onClick={() => onPageChange(safePage + 1)}
        >
          Berikutnya
        </Button>
      </div>
    </div>
  );
}
