import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { LAPORAN_PDF_PREVIEW_PATH } from "../lib/laporan-pdf-preview";
import { usePageBackTo } from "../lib/page-filter-state";

/** Buka pratinjau PDF laporan; `stash` menerima backTo (path+query saat ini). */
export function useLaporanPdfNavigate() {
  const navigate = useNavigate();
  const backTo = usePageBackTo();

  return useCallback(
    (stash: (backTo: string) => void) => {
      stash(backTo);
      navigate(LAPORAN_PDF_PREVIEW_PATH);
    },
    [backTo, navigate]
  );
}
