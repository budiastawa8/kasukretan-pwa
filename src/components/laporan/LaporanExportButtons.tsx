import { Download, FileText } from "lucide-react";
import { Button } from "../ui/Button";

export function LaporanExportButtons({
  onExcel,
  onPdf,
  disabled,
  excelDisabled,
  pdfDisabled,
  busy,
  pdfOnly,
  iconOnly,
}: {
  onExcel?: () => void;
  onPdf: () => void;
  disabled?: boolean;
  excelDisabled?: boolean;
  pdfDisabled?: boolean;
  busy?: boolean;
  /** Sembunyikan tombol Excel (mis. Laporan Eksekutif). */
  pdfOnly?: boolean;
  /** Hanya ikon + tooltip (tanpa label teks). */
  iconOnly?: boolean;
}) {
  const off = disabled || busy;
  const btnClass = iconOnly ? "min-h-9 min-w-9" : "h-9 text-xs";
  return (
    <span className="inline-flex flex-wrap gap-1">
      {!pdfOnly && (
        <Button
          type="button"
          variant="secondary"
          icon={Download}
          iconOnly={iconOnly}
          className={btnClass}
          onClick={onExcel}
          disabled={off || excelDisabled}
          title="Ekspor Excel"
          aria-label="Ekspor Excel"
        >
          {iconOnly ? null : "Excel"}
        </Button>
      )}
      <Button
        type="button"
        variant="secondary"
        icon={FileText}
        iconOnly={iconOnly}
        className={btnClass}
        onClick={onPdf}
        disabled={off || pdfDisabled}
        title="Ekspor PDF"
        aria-label="Ekspor PDF"
      >
        {iconOnly ? null : "PDF"}
      </Button>
    </span>
  );
}
