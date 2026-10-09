import { useState } from "react";
import { readBytes } from "../../lib/read-bytes";
import { commitKramaImport, validateKramaImport, type KramaImportPreview } from "../../lib/import/krama-import";
import { downloadKramaExport, downloadKramaTemplate } from "../../lib/import/krama-template";
import { ImportExportPanelShell } from "../import-export/ImportExportPanelShell";
import { ImportPreviewPanel } from "../import-export/ImportPreviewPanel";

type Props = {
  canEdit: boolean;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
  onRefresh: () => Promise<void>;
  /** Tampilkan isi langsung (mis. di tab Impor/Ekspor) tanpa collapse */
  alwaysOpen?: boolean;
};

export function KramaImportExportPanel({
  canEdit,
  onSaved,
  onError,
  onRefresh,
  alwaysOpen = false,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<KramaImportPreview | null>(null);

  async function handleDownloadTemplate() {
    setBusy(true);
    try {
      const ok = await downloadKramaTemplate();
      if (ok) onSaved("Template berhasil diunduh");
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDownloadExport() {
    setBusy(true);
    try {
      const ok = await downloadKramaExport();
      if (ok) onSaved("Data krama berhasil diekspor");
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
      const result = await validateKramaImport(picked.bytes, picked.filename);
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
      await commitKramaImport(preview);
      await onRefresh();
      setPreview(null);
      onSaved("Data krama berhasil diimpor");
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ImportExportPanelShell
      title="Impor/Ekspor Krama Mipil"
      alwaysOpen={alwaysOpen}
      canEdit={canEdit}
      busy={busy}
      onDownloadTemplate={handleDownloadTemplate}
      onDownloadExport={handleDownloadExport}
      onPickFile={handlePickFile}
      description={
        <>
          Unduh template, isi di Excel, lalu impor dengan pratinjau. Kartu baru: kosongkan{" "}
          <code className="text-xs">nomor_kartu</code>, isi <code className="text-xs">kartu_ref</code> unik.
          Update: isi <code className="text-xs">nomor_kartu</code> yang sudah ada.
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
          />
        ) : null
      }
    />
  );
}
