import { useCallback, useEffect, useState } from "react";
import { FolderOpen, Save } from "lucide-react";
import {
  AUTO_BACKUP_UPDATED_EVENT,
  pickAutoBackupFolder,
  readAutoBackupConfig,
  resolveDefaultBackupFolder,
  writeAutoBackupConfig,
  type AutoBackupConfig,
} from "../../lib/auto-backup";
import { isDesktopApp } from "../../lib/runtime";
import { isAdmin } from "../../lib/auth-roles";
import { useAuth } from "../../context/AuthContext";
import { CollapsibleSettingsSection } from "./CollapsibleSettingsSection";
import { Button } from "../ui/Button";
import { Input, Label } from "../ui/Input";
import { formatTanggalLahir } from "../../lib/utils";

function formatLastRun(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${formatTanggalLahir(iso.slice(0, 10))} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function AutoBackupPanel() {
  const { user } = useAuth();
  const admin = isAdmin(user?.peran);
  const [config, setConfig] = useState<AutoBackupConfig>(() => readAutoBackupConfig());
  const [folderBusy, setFolderBusy] = useState(false);
  const [defaultFolderHint, setDefaultFolderHint] = useState("Dokumen\\Kasukretan\\Backup");

  const reload = useCallback(() => {
    setConfig(readAutoBackupConfig());
  }, []);

  useEffect(() => {
    reload();
    window.addEventListener(AUTO_BACKUP_UPDATED_EVENT, reload);
    return () => window.removeEventListener(AUTO_BACKUP_UPDATED_EVENT, reload);
  }, [reload]);

  useEffect(() => {
    if (!isDesktopApp()) return;
    void resolveDefaultBackupFolder()
      .then((p) => setDefaultFolderHint(p))
      .catch(() => {
        /* biarkan hint generik */
      });
  }, []);

  if (!isDesktopApp() || !admin) {
    return null;
  }

  function setEnabled(enabled: boolean) {
    setConfig(writeAutoBackupConfig({ enabled }));
  }

  async function handlePickFolder() {
    setFolderBusy(true);
    try {
      const folder = await pickAutoBackupFolder();
      if (folder) {
        setConfig(writeAutoBackupConfig({ folderPath: folder }));
      }
    } finally {
      setFolderBusy(false);
    }
  }

  function handleResetFolder() {
    setConfig(writeAutoBackupConfig({ folderPath: "" }));
  }

  const folderDisplay = config.folderPath.trim() || defaultFolderHint;

  return (
    <CollapsibleSettingsSection
      title="Backup otomatis"
      subtitle="Salinan saat aplikasi ditutup"
      icon={Save}
    >
      <p className="text-[11px] text-muted leading-relaxed -mt-1">
        Setiap kali aplikasi ditutup, database disalin ke berkas{" "}
        <span className="font-mono text-copper-900">kasukretan-{"{kode_desa}"}.db</span>{" "}
        (menimpa file yang sama). Folder default: Dokumen → Kasukretan → Backup. Jika proses agak
        lama, bilah kemajuan akan ditampilkan.
      </p>

      <label className="flex items-start gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          className="mt-0.5 rounded border-copper-300"
          checked={config.enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        <span className="text-sm text-copper-900">Backup otomatis saat tutup aplikasi</span>
      </label>

      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="min-w-0">
          <Label>Folder tujuan</Label>
          <Input
            readOnly
            value={folderDisplay}
            className="font-mono text-xs truncate"
            title={folderDisplay}
          />
          {!config.folderPath.trim() ? (
            <p className="text-[10px] text-muted mt-1">Menggunakan folder default</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            icon={FolderOpen}
            disabled={folderBusy}
            onClick={() => void handlePickFolder()}
          >
            {folderBusy ? "Membuka…" : "Pilih folder"}
          </Button>
          {config.folderPath.trim() ? (
            <Button type="button" variant="ghost" disabled={folderBusy} onClick={handleResetFolder}>
              Reset default
            </Button>
          ) : null}
        </div>
      </div>

      <div className="text-[11px] text-muted space-y-0.5 border-t border-copper-100 pt-2">
        <p>
          Terakhir berjalan:{" "}
          <span className="text-copper-900">{formatLastRun(config.lastRunAt)}</span>
        </p>
        {config.lastBackupPath ? (
          <p className="truncate" title={config.lastBackupPath}>
            Berkas: <span className="text-copper-900 font-mono">{config.lastBackupPath}</span>
          </p>
        ) : null}
        {config.lastError ? (
          <p className="text-red-700">Error terakhir: {config.lastError}</p>
        ) : null}
      </div>
    </CollapsibleSettingsSection>
  );
}
