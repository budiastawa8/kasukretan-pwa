import * as XLSX from "xlsx";
import { downloadBytes } from "./download-bytes";

export type ExcelSheetInput = {
  name: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
  /** Orientasi cetak worksheet (default portrait). */
  landscape?: boolean;
};

function sanitizeSheetName(name: string): string {
  return name.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || "Sheet1";
}

function buildWorkbook(sheets: ExcelSheetInput[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const data: (string | number)[][] = [
      sheet.headers,
      ...sheet.rows.map((row) => row.map((cell) => (cell == null ? "" : cell))),
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const colCount = sheet.headers.length;
    ws["!cols"] = Array.from({ length: colCount }, (_, col) => {
      let max = sheet.headers[col]?.length ?? 8;
      for (const row of sheet.rows) {
        const len = String(row[col] ?? "").length;
        if (len > max) max = len;
      }
      return { wch: Math.min(max + 2, 40) };
    });
    if (sheet.landscape) {
      ws["!pageSetup"] = { orientation: "landscape", paperSize: 9 };
    }
    XLSX.utils.book_append_sheet(wb, ws, sanitizeSheetName(sheet.name));
  }
  return wb;
}

/** Export satu atau beberapa sheet ke berkas .xlsx */
export async function downloadExcel(
  filename: string,
  sheets: ExcelSheetInput | ExcelSheetInput[]
): Promise<boolean> {
  const sheetList = Array.isArray(sheets) ? sheets : [sheets];
  if (sheetList.length === 0) return false;

  const wb = buildWorkbook(sheetList);
  const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const bytes = new Uint8Array(buffer);
  const safeName = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;

  return downloadBytes(
    bytes,
    safeName,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    [{ name: "Excel", extensions: ["xlsx"] }]
  );
}
