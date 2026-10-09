import * as XLSX from "xlsx";

export type SheetCell = string | number | null | undefined;
export type SheetRows = SheetCell[][];

/** Parse workbook .xlsx ke map sheet (nama lowercase) → baris mentah (header:1). */
export function parseWorkbook(bytes: Uint8Array): Map<string, SheetRows> {
  const wb = XLSX.read(bytes, { type: "array" });
  const result = new Map<string, SheetRows>();

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json<SheetCell[]>(ws, {
      header: 1,
      defval: "",
      raw: false,
    }) as SheetRows;
    result.set(name.trim().toLowerCase(), rows);
  }

  return result;
}

export function getSheet(
  sheets: Map<string, SheetRows>,
  canonicalName: string
): SheetRows | undefined {
  return sheets.get(canonicalName.trim().toLowerCase());
}

export function cellStr(row: SheetCell[] | undefined, col: number): string {
  if (!row) return "";
  const v = row[col];
  if (v == null) return "";
  return String(v).trim();
}

export function isEmptyRow(row: SheetCell[] | undefined): boolean {
  if (!row || row.length === 0) return true;
  return row.every((c) => c == null || String(c).trim() === "");
}
