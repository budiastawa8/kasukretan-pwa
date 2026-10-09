import { useState } from "react";
import { Check, ChevronDown, ChevronRight, Download, FileSpreadsheet, Upload, Users } from "lucide-react";
import { readBytes } from "../../lib/read-bytes";
import {
  commitPemasihAnggotaImport,
  validatePemasihAnggotaImport,
  type PemasihAnggotaImportPreview,
} from "../../lib/import/pemasih-anggota-import";
import {
  downloadPemasihAnggotaExport,
  downloadPemasihAnggotaTemplate,
} from "../../lib/import/pemasih-anggota-template";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";

type Props = {
  canEdit: boolean;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
  onRefresh: () => Promise<void>;
  kramaId?: string;
  nomorKartu?: string;
  /** Tampilkan isi langsung (mis. di tab Impor/Ekspor) tanpa collapse */
  alwaysOpen?: boolean;
};

export function PemasihAnggotaImportExportPanel({
  canEdit,
  onSaved,
  onError,
  onRefresh,
  kramaId,
  nomorKartu,
  alwaysOpen = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const isOpen = alwaysOpen || open;
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<PemasihAnggotaImportPreview | null>(null);
  const [showErrors, setShowErrors] = useState(true);
  const single = Boolean(kramaId);
  const scopeOpts = kramaId ? { kramaId, nomorKartu } : undefined;

  async function handleDownloadTemplate() {
    setBusy(true);
    try {
      const ok = await downloadPemasihAnggotaTemplate(scopeOpts);
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
      const ok = await downloadPemasihAnggotaExport(scopeOpts);
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
      const result = await validatePemasihAnggotaImport(picked.bytes, picked.filename, scopeOpts);
      setPreview(result);
      setShowErrors(true);
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
      await commitPemasihAnggotaImport(preview);
      await onRefresh();
      setPreview(null);
      onSaved("Data anggota berhasil diimpor");
    } catch (e) {
      onError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const totalCreates = preview?.summaries.reduce((s, x) => s + x.creates, 0) ?? 0;
  const totalUpdates = preview?.summaries.reduce((s, x) => s + x.updates, 0) ?? 0;
  const totalErrors = preview?.errors.length ?? 0;

  return (
    <Card className="leading-snug">
      {alwaysOpen ? (
        <h3 className="flex items-center gap-2 font-semibold text-copper-900">
          <Users size={18} />
          {single ? "Impor/Ekspor Anggota Keluarga" : "Impor/Ekspor Anggota Tamiu & Krama Tamiu"}
        </h3>
      ) : (
        <button
          type="button"
          className="w-full flex items-center justify-between gap-2 text-left font-semibold text-copper-900"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="flex items-center gap-2">
            <Users size={18} />
            {single ? "Impor/Ekspor Anggota Keluarga" : "Impor/Ekspor Anggota Tamiu & Krama Tamiu"}
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
          <p className="text-sm text-muted">
            {single ? (
              <>
                Unduh daftar anggota kartu <strong>{nomorKartu}</strong>, edit di Excel, lalu impor
                kembali.
              </>
            ) : (
              <>Hanya data anggota (tanpa sheet krama). Isi nomor_kartu per baris.</>
            )}
          </p>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={Download} onClick={handleDownloadTemplate} disabled={busy}>
              Unduh template
            </Button>
            <Button variant="secondary" icon={FileSpreadsheet} onClick={handleDownloadExport} disabled={busy}>
              Ekspor data
            </Button>
            {canEdit && (
              <Button variant="primary" icon={Upload} onClick={handlePickFile} disabled={busy}>
                Impor Excel
              </Button>
            )}
          </div>

          {!canEdit && (
            <p className="text-xs text-muted">Hanya admin/operator/keuangan yang dapat mengimpor.</p>
          )}

          {preview && (
            <div className="space-y-3 rounded-lg border border-copper-200 bg-copper-50/50 p-3">
              <p className="text-sm font-medium">Pratinjau: {preview.filename}</p>
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-200">
                  {totalCreates} tambah
                </span>
                <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-900 border border-sky-200">
                  {totalUpdates} update
                </span>
                {totalErrors > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-900 border border-red-200">
                    {totalErrors} error
                  </span>
                )}
              </div>

              {preview.errors.length > 0 && (
                <div>
                  <button
                    type="button"
                    className="flex items-center gap-1 text-xs font-medium text-copper-800"
                    onClick={() => setShowErrors((v) => !v)}
                  >
                    {showErrors ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    Detail error ({preview.errors.length})
                  </button>
                  {showErrors && (
                    <ul className="mt-1 max-h-40 overflow-y-auto text-xs space-y-0.5 text-red-800">
                      {preview.errors.map((err, i) => (
                        <li key={i}>
                          [{err.sheet} baris {err.excelRow || "—"}
                          {err.column ? ` / ${err.column}` : ""}] {err.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {canEdit && (
                <Button icon={Check} onClick={handleCommit} disabled={busy || !preview.canCommit}>
                  Simpan ke database
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
