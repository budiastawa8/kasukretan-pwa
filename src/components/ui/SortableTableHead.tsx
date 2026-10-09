import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { SortDirection } from "../../lib/table-sort";
import { cn } from "../../lib/utils";

type Props = {
  label: string;
  columnKey: string;
  activeKey: string | null;
  direction: SortDirection;
  onSort: (key: string) => void;
  className?: string;
};

export function SortableTableHead({
  label,
  columnKey,
  activeKey,
  direction,
  onSort,
  className,
}: Props) {
  const active = activeKey === columnKey;
  return (
    <th
      className={cn(
        "cursor-pointer select-none whitespace-nowrap hover:!text-copper-900",
        className
      )}
      onClick={() => onSort(columnKey)}
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
      title={`Urutkan ${label}`}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        {active ? (
          direction === "asc" ? (
            <ArrowUp className="h-3 w-3 shrink-0" aria-hidden />
          ) : (
            <ArrowDown className="h-3 w-3 shrink-0" aria-hidden />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 shrink-0 opacity-35" aria-hidden />
        )}
      </span>
    </th>
  );
}
