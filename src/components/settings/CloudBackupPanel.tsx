import { useState } from "react";
import { AlertTriangle, Database, Download, RefreshCw } from "lucide-react";
import { markBackupCompleted } from "../../lib/backup-reminder";
import { backupFileName, buildCloudBackup, downloadBytes } from "../../lib/cloud-backup";
import { CollapsibleSettingsSection } from "./CollapsibleSettingsSection";
import { Button } from "../ui/Button";

type Status = { kind: "info" | "success" | "error"; text: string } | null;

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function CloudBackupPanel() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  async function runBackup() {
    setBusy(true);
    setStatus({ kind: "info", text: "Menyiapkan backup…" });
    try {
      const { bytes, rows } = await buildCloudBackup((p) => {
        setStatus({
          kind: "info",
          text: `Mengunduh tabel ${p.tableIndex}/${p.tableCount}: ${p.table} (${p.rows} baris)…`,
        });
      });
      const name = backupFileName();
      downloadBytes(bytes, name);
      markBackupCompleted();
      setStatus({
        kind: "success",
        text: `Backup selesai: ${name} (${formatSize(bytes.length)}, ${rows} baris).`,
      });
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  const statusStyle =
    status?.kind === "success"
      ? "text-emerald-900 bg-emerald-50 border-emerald-200"
      : status?.kind === "error"
        ? "text-red-800 bg-red-50 border-red-200"
        : "text-copper-900 bg-copper-100 border-copper-200";

  return (
    <CollapsibleSettingsSection
      title="Backup database (admin)"
      subtitle="Unduh kasukretan.db dari cloud"
      icon={Database}
    >
      <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-2 flex items-start gap-2 -mt-1">
        <AlertTriangle size={16} className="shrink-0 mt-0.5" aria-hidden />
        <span>
          Berkas backup berisi seluruh data desa, termasuk foto dan akun pengguna. Simpan di tempat
          aman dan jangan dibagikan.
        </span>
      </p>

      <Button
        type="button"
        variant="secondary"
        icon={busy ? RefreshCw : Download}
        disabled={busy}
        onClick={() => void runBackup()}
      >
        {busy ? "Membuat backup…" : "Unduh backup (.db)"}
      </Button>

      {status && (
        <p role="status" className={`text-xs rounded-md px-2.5 py-2 border ${statusStyle}`}>
          {status.text}
        </p>
      )}

      <p className="text-[11px] text-muted leading-relaxed">
        Berkas <strong>.db</strong> dapat dibuka di aplikasi desktop Kasukretan lewat Pengaturan →
        Database → Restore database, atau dikembalikan ke cloud lewat panel Restore di bawah. Data
        cloud tidak berubah saat backup diunduh.
      </p>
    </CollapsibleSettingsSection>
  );
}
