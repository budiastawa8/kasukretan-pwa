import { useCallback } from "react";
import type { LaporanPdfInput } from "../lib/laporan-pdf";
import { stashLaporanPdfPreview } from "../lib/laporan-pdf-preview";
import { useLaporanPdfNavigate } from "./useLaporanPdfNavigate";

/** @param backLabel Label tombol kembali di pratinjau PDF. */
export function useLaporanPdfPreview(backLabel: string) {
  const openPdfNavigate = useLaporanPdfNavigate();

  return useCallback(
    (input: LaporanPdfInput) => {
      try {
        openPdfNavigate((backTo) => stashLaporanPdfPreview({ input, backTo, backLabel }));
      } catch (e) {
        window.alert(e instanceof Error ? e.message : String(e));
      }
    },
    [backLabel, openPdfNavigate]
  );
}
