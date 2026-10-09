import { useState } from "react";
import {
  commitAnggotaImport,
  validateAnggotaImport,
  type AnggotaImportPreview,
} from "../../lib/import/anggota-import";
import { downloadAnggotaExport, downloadAnggotaTemplate } from "../../lib/import/anggota-template";
import { readBytes } from "../../lib/read-bytes";
import { ImportExportPanelShell } from "../import-export/ImportExportPanelShell";
import { ImportPreviewPanel } from "../import-export/ImportPreviewPanel";

type Props = {
  canEdit: boolean;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
  onRefresh: () => Promise<void>;
  kramaId?: string;
  nomorKartu?: string;
  alwaysOpen?: boolean;
};

export function AnggotaImportExportPanel({
  canEdit,
  onSaved,
  onError,
  onRefresh,
  kramaId,
  nomorKartu,
  alwaysOpen = false,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<AnggotaImportPreview | null>(null);

  const scopeOpts = kramaId ? { kramaId, nomorKartu } : undefined;
  const single = Boolean(kramaId);
  const title = single ? "Impor/Ekspor Anggota Keluarga" : "Impor/Ekspor Anggota Mipil";

  async function handleDownloadTemplate() {
    setBusy(true);
    try {
      const ok = await downloadAnggotaTemplate(scopeOpts);
      if (ok) onSaved("Template anggota berhasil diunduh");
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDownloadExport() {
    setBusy(true);
    try {
      const ok = await downloadAnggotaExport(scopeOpts);
      if (ok) onSaved("Data anggota berhasil diekspor");
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
      const result = await validateAnggotaImport(picked.bytes, picked.filename, {
        kramaId,
        nomorKartu,
      });
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
      await commitAnggotaImport(preview);
      await onRefresh();
      setPreview(null);
      onSaved("Data anggota berhasil diimpor");
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ImportExportPanelShell
      title={title}
      alwaysOpen={alwaysOpen}
      canEdit={canEdit}
      busy={busy}
      onDownloadTemplate={handleDownloadTemplate}
      onDownloadExport={handleDownloadExport}
      onPickFile={handlePickFile}
      description={
        single ? (
          <>
            Unduh daftar anggota kartu <strong>{nomorKartu}</strong>, edit di Excel, lalu impor
            kembali. Kolom <code className="text-xs">anggota_id</code> dari ekspor memudahkan
            update.
          </>
        ) : (
          <>
            Hanya data anggota (tanpa sheet krama). Isi <code className="text-xs">nomor_kartu</code>{" "}
            per baris. Foto tidak ikut file Excel.
          </>
        )
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
