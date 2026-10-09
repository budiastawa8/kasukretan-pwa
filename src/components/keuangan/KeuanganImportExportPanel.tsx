import { useState } from "react";
import { readBytes } from "../../lib/read-bytes";
import {
  commitKeuanganImport,
  validateKeuanganImport,
  type KeuanganImportPreview,
} from "../../lib/import/keuangan-import";
import {
  downloadKeuanganExport,
  downloadKeuanganTemplate,
  type KeuanganImportMode,
} from "../../lib/import/keuangan-template";
import { ImportExportPanelShell } from "../import-export/ImportExportPanelShell";
import { ImportPreviewPanel } from "../import-export/ImportPreviewPanel";

const TITLES: Record<KeuanganImportMode, string> = {
  paturunan: "Impor/Ekspor Pembayaran Paturunan",
  dudukan: "Impor/Ekspor Pembayaran Dudukan",
};

type Props = {
  mode: KeuanganImportMode;
  canEdit: boolean;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
  onRefresh: () => Promise<void>;
  /** Tampilkan isi langsung (mis. di tab Impor/Ekspor) tanpa collapse */
  alwaysOpen?: boolean;
};

export function KeuanganImportExportPanel({
  mode,
  canEdit,
  onSaved,
  onError,
  onRefresh,
  alwaysOpen = false,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<KeuanganImportPreview | null>(null);

  async function handleDownloadTemplate() {
    setBusy(true);
    try {
      const ok = await downloadKeuanganTemplate(mode);
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
      const ok = await downloadKeuanganExport(mode);
      if (ok) onSaved("Data pembayaran berhasil diekspor");
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
      const result = await validateKeuanganImport(picked.bytes, picked.filename, mode);
      setPreview(result);
      if (result.errors.length > 0) {
        onError(`${result.errors.length} baris error — perbaiki file sebelum menyimpan`);
      } else if (result.operations.length === 0 && result.warnings.length > 0) {
        onSaved("Semua baris sudah tercatat di database — tidak ada perubahan baru");
      }
    } catch (e) {
      onError(String(e));
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleCommit() {
    if (!preview || preview.errors.length > 0) return;
    if (preview.operations.length === 0) {
      onSaved("Tidak ada pembayaran baru untuk disimpan");
      setPreview(null);
      return;
    }
    setBusy(true);
    try {
      await commitKeuanganImport(preview);
      await onRefresh();
      setPreview(null);
      onSaved("Pembayaran berhasil diimpor");
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const canSave =
    preview != null && preview.errors.length === 0 && preview.operations.length > 0;

  return (
    <ImportExportPanelShell
      title={TITLES[mode]}
      alwaysOpen={alwaysOpen}
      canEdit={canEdit}
      busy={busy}
      onDownloadTemplate={handleDownloadTemplate}
      onDownloadExport={handleDownloadExport}
      onPickFile={handlePickFile}
      description={
        <>
          Ekspor/unduh riwayat pembayaran. Impor baris baru lewat pratinjau. Isi{" "}
          <code className="text-xs">pembayaran_id</code> hanya untuk mengubah baris yang sudah ada.
        </>
      }
      preview={
        preview ? (
          <ImportPreviewPanel
            filename={preview.filename}
            summaries={preview.summaries}
            errors={preview.errors}
            warnings={preview.warnings}
            canCommit={canSave}
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
