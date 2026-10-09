import { useState } from "react";
import { readBytes } from "../../lib/read-bytes";
import {
  commitPemasihImport,
  validatePemasihImport,
  type PemasihImportPreview,
} from "../../lib/import/pemasih-import";
import {
  downloadPemasihExport,
  downloadPemasihTemplate,
} from "../../lib/import/pemasih-template";
import { ImportExportPanelShell } from "../import-export/ImportExportPanelShell";
import { ImportPreviewPanel } from "../import-export/ImportPreviewPanel";

type Props = {
  canEdit: boolean;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
  onRefresh: () => Promise<void>;
  alwaysOpen?: boolean;
};

export function PemasihImportExportPanel({
  canEdit,
  onSaved,
  onError,
  onRefresh,
  alwaysOpen = false,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PemasihImportPreview | null>(null);

  async function handleDownloadTemplate() {
    setBusy(true);
    try {
      const ok = await downloadPemasihTemplate();
      if (ok) onSaved("Template Krama Tamiu/Tamiu berhasil diunduh");
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDownloadExport() {
    setBusy(true);
    try {
      const ok = await downloadPemasihExport();
      if (ok) onSaved("Data Krama Tamiu/Tamiu berhasil diekspor");
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
      const result = await validatePemasihImport(picked.bytes, picked.filename);
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
      await commitPemasihImport(preview);
      await onRefresh();
      setPreview(null);
      onSaved("Data Krama Tamiu/Tamiu berhasil diimpor");
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ImportExportPanelShell
      title="Impor/Ekspor Krama Tamiu & Tamiu"
      alwaysOpen={alwaysOpen}
      canEdit={canEdit}
      busy={busy}
      onDownloadTemplate={handleDownloadTemplate}
      onDownloadExport={handleDownloadExport}
      onPickFile={handlePickFile}
      description={
        <>
          Unduh template, isi di Excel (sheet KramaPemasih + AnggotaPemasih), lalu impor dengan
          pratinjau. Kolom <strong>klasifikasi</strong>: Krama Tamiu atau Tamiu. Kolom{" "}
          <strong>jenis_nama</strong> harus sesuai Master Data.
        </>
      }
      preview={
        preview ? (
          <ImportPreviewPanel
            filename={preview.filename}
            summaries={preview.summaries}
            errors={preview.errors}
            canCommit={preview.canCommit}
            busy={busy}
            canEdit={canEdit}
            onCommit={handleCommit}
            showSheetTable={false}
          />
        ) : null
      }
    />
  );
}
