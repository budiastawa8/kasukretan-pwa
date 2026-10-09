import { useCallback, useState } from "react";
import type { SortDirection } from "../lib/table-sort";

type TableSortState = {
  key: string | null;
  direction: SortDirection;
};

export function useTableSort(initialKey: string | null = null, initialDir: SortDirection = "asc") {
  const [sort, setSort] = useState<TableSortState>({
    key: initialKey,
    direction: initialDir,
  });

  const toggleSort = useCallback((key: string) => {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    );
  }, []);

  return { sortKey: sort.key, sortDir: sort.direction, toggleSort };
};
