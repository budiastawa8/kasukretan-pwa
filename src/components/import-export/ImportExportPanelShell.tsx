import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Download, FileSpreadsheet, Upload } from "lucide-react";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

type Props = {
  title: string;
  description: ReactNode;
  canEdit: boolean;
  busy: boolean;
  alwaysOpen?: boolean;
  onDownloadTemplate: () => void | Promise<void>;
  onDownloadExport: () => void | Promise<void>;
  onPickFile: () => void | Promise<void>;
  preview?: ReactNode;
};

export function ImportExportPanelShell({
  title,
  description,
  canEdit,
  busy,
  alwaysOpen = false,
  onDownloadTemplate,
  onDownloadExport,
  onPickFile,
  preview,
}: Props) {
  const [open, setOpen] = useState(false);
  const isOpen = alwaysOpen || open;

  return (
    <Card className="leading-snug">
      {alwaysOpen ? (
        <h3 className="flex items-center gap-2 font-semibold text-copper-900">
          <FileSpreadsheet size={18} />
          {title}
        </h3>
      ) : (
        <button
          type="button"
          className="w-full flex items-center justify-between gap-2 text-left font-semibold text-copper-900"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="flex items-center gap-2">
            <FileSpreadsheet size={18} />
            {title}
          </span>
          {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>
      )}

      {isOpen && (
        <div
          className={
            alwaysOpen ? "mt-3 space-y-3" : "mt-3 space-y-3 pt-3 border-t border-copper-100"
          }
        >
          <div className="text-sm text-muted">{description}</div>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={Download} onClick={onDownloadTemplate} disabled={busy}>
              Unduh template
            </Button>
            <Button variant="secondary" icon={FileSpreadsheet} onClick={onDownloadExport} disabled={busy}>
              Ekspor data
            </Button>
            {canEdit && (
              <Button variant="primary" icon={Upload} onClick={onPickFile} disabled={busy}>
                Impor Excel
              </Button>
            )}
          </div>

          {!canEdit && (
            <p className="text-xs text-muted">Hanya admin/operator/keuangan yang dapat mengimpor.</p>
          )}

          {preview}
        </div>
      )}
    </Card>
  );
}
