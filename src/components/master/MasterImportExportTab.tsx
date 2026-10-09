import { useState } from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { readBytes } from "../../lib/read-bytes";
import {
  commitMasterImport,
  validateMasterImport,
  type ImportPreviewResult,
} from "../../lib/import/master-import";
import {
  downloadMasterExport,
  downloadMasterTemplate,
} from "../../lib/import/master-template";
import { ImportPreviewPanel } from "../import-export/ImportPreviewPanel";
import { Button } from "../ui/Button";

type Props = {
  canEdit: boolean;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
  onRefresh: () => Promise<void>;
};

export function MasterImportExportTab({ canEdit, onSaved, onError, onRefresh }: Props) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);

  async function handleDownloadTemplate() {
    setBusy(true);
    try {
      const ok = await downloadMasterTemplate();
      if (ok) onSaved("Template master berhasil diunduh");
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDownloadExport() {
    setBusy(true);
    try {
      const ok = await downloadMasterExport();
      if (ok) onSaved("Data master berhasil diekspor");
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handlePickFile() {
    if (!canEdit) return;
    setBusy(true);
    onError("");
    try {
      const picked = await readBytes();
      if (!picked) return;
      const result = await validateMasterImport(picked.bytes, picked.filename);
      setPreview(result);
      if (result.errors.length > 0) {
        onError(`${result.errors.length} baris error — perbaiki file sebelum menyimpan`);
      }
    } catch (e) {
      onError(String(e));
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleCommit() {
    if (!preview?.canCommit) return;
    setBusy(true);
    try {
      await commitMasterImport(preview);
      await onRefresh();
      setPreview(null);
      onSaved("Data master berhasil diimpor");
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted leading-snug">
        Unduh template resmi, isi di Excel, lalu impor dengan pratinjau. Format kolom dan nama sheet
        harus sama dengan template. Ekspor data menghasilkan file dengan struktur identik untuk
        diedit dan diimpor kembali.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          icon={Download}
          onClick={handleDownloadTemplate}
          disabled={busy}
        >
          Unduh template kosong
        </Button>
        <Button variant="secondary" icon={FileSpreadsheet} onClick={handleDownloadExport} disabled={busy}>
          Ekspor data sekarang
        </Button>
        {canEdit && (
          <Button variant="primary" icon={Upload} onClick={handlePickFile} disabled={busy}>
            Impor dari Excel
          </Button>
        )}
      </div>

      {!canEdit && (
        <p className="text-sm text-muted">
          Hanya admin yang dapat mengimpor data. Anda tetap dapat mengunduh template dan
          mengekspor data.
        </p>
      )}

      {preview && (
        <ImportPreviewPanel
          filename={preview.filename}
          summaries={preview.summaries}
          errors={preview.errors}
          warnings={preview.warnings}
          canCommit={preview.canCommit}
          busy={busy}
          canEdit={canEdit}
          onCommit={handleCommit}
        />
      )}
    </div>
  );
}
