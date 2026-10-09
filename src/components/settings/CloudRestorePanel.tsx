import { useEffect, useRef, useState } from "react";
import { AlertTriangle, FileUp, LogIn, RefreshCw, RotateCcw, Unlock } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { backupFileName, buildCloudBackup, downloadBytes } from "../../lib/cloud-backup";
import {
  cancelCloudRestore,
  inspectBackupFile,
  runCloudRestore,
  type RestoreSummary,
} from "../../lib/cloud-restore";
import { CollapsibleSettingsSection } from "./CollapsibleSettingsSection";
import { Button } from "../ui/Button";
import { Input, Label } from "../ui/Input";

type Phase = "idle" | "inspecting" | "ready" | "backup" | "restoring" | "failed" | "done";
type Status = { kind: "info" | "success" | "error"; text: string } | null;

const CONFIRM_WORD = "RESTORE";

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function CloudRestorePanel() {
  const { logout } = useAuth();
  const fileInput = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<Status>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [summary, setSummary] = useState<RestoreSummary | null>(null);
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [backupFailed, setBackupFailed] = useState(false);
  const [skipBackup, setSkipBackup] = useState(false);

  const busy = phase === "inspecting" || phase === "backup" || phase === "restoring";

  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  async function onFileChosen(file: File | undefined) {
    if (!file) return;
    setPhase("inspecting");
    setStatus({ kind: "info", text: "Memeriksa berkas…" });
    setSummary(null);
    setBytes(null);
    try {
      const result = await inspectBackupFile(file);
      setBytes(result.bytes);
      setSummary(result.summary);
      setStatus(null);
      setPhase("ready");
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof Error ? e.message : String(e) });
      setPhase("idle");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function runRestore() {
    if (!bytes) return;
    if (!skipBackup) {
      setPhase("backup");
      setStatus({ kind: "info", text: "Mengunduh backup data saat ini sebelum ditimpa…" });
      try {
        const backup = await buildCloudBackup((p) =>
          setStatus({
            kind: "info",
            text: `Backup otomatis: tabel ${p.tableIndex}/${p.tableCount} (${p.table})…`,
          })
        );
        downloadBytes(backup.bytes, backupFileName().replace(".db", "-sebelum-restore.db"));
      } catch (e) {
        setBackupFailed(true);
        setPhase("ready");
        setStatus({
          kind: "error",
          text: `Backup otomatis gagal: ${e instanceof Error ? e.message : String(e)}. Restore dibatalkan — data cloud tidak diubah.`,
        });
        return;
      }
    }

    setPhase("restoring");
    setStatus({ kind: "info", text: "Memulai restore…" });
    let started = false;
    try {
      await runCloudRestore(bytes, password, (p) => {
        started = true;
        setStatus({
          kind: "info",
          text:
            p.tableIndex === 0
              ? "Database dikunci dan dikosongkan, mengirim data…"
              : `Restore tabel ${p.tableIndex}/${p.tableCount}: ${p.table} (${p.rows} baris)… Jangan tutup halaman ini.`,
        });
      });
      setPhase("done");
      setStatus(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (started) {
        setPhase("failed");
        setStatus({ kind: "error", text: message });
      } else {
        setPhase("ready");
        setStatus({ kind: "error", text: `${message} Data cloud tidak diubah.` });
      }
    }
  }

  function retryAfterFailure() {
    // Backup otomatis sudah terunduh; data cloud sekarang setengah jadi sehingga tidak perlu dibackup lagi.
    setSkipBackup(true);
    setStatus(null);
    setPhase("ready");
  }

  async function unlock() {
    try {
      await cancelCloudRestore();
      setStatus({ kind: "info", text: "Kunci restore dilepas. Staf bisa kembali mengubah data." });
      setPhase(bytes ? "ready" : "idle");
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof Error ? e.message : String(e) });
    }
  }

  const canRestore =
    phase === "ready" && !!bytes && password.length > 0 && confirmText.trim() === CONFIRM_WORD;

  const statusStyle =
    status?.kind === "success"
      ? "text-emerald-900 bg-emerald-50 border-emerald-200"
      : status?.kind === "error"
        ? "text-red-800 bg-red-50 border-red-200"
        : "text-copper-900 bg-copper-100 border-copper-200";

  return (
    <CollapsibleSettingsSection
      title="Restore database (admin)"
      subtitle="Ganti seluruh data cloud dari berkas .db"
      icon={RotateCcw}
    >
      <p className="text-xs text-red-800 bg-red-50 border border-red-200 rounded-md px-2.5 py-2 flex items-start gap-2 -mt-1">
        <AlertTriangle size={16} className="shrink-0 mt-0.5" aria-hidden />
        <span>
          Restore <strong>menghapus seluruh data cloud</strong> (krama, keuangan, pengguna) dan
          menggantinya dengan isi berkas. Selama proses, staf lain tidak bisa mengubah data. Backup
          data saat ini diunduh otomatis lebih dulu.
        </span>
      </p>

      {phase === "done" ? (
        <div className="space-y-3">
          <p role="status" className="text-xs rounded-md px-2.5 py-2 border text-emerald-900 bg-emerald-50 border-emerald-200">
            Restore selesai. Akun pengguna kini mengikuti berkas backup — masuk ulang dengan akun admin
            dari berkas tersebut ({summary?.adminUsernames.join(", ")}).
          </p>
          <Button type="button" icon={LogIn} onClick={logout}>
            Masuk ulang
          </Button>
        </div>
      ) : (
        <>
          <input
            ref={fileInput}
            type="file"
            accept=".db,.sqlite,.sqlite3,application/vnd.sqlite3,application/octet-stream"
            className="hidden"
            onChange={(e) => void onFileChosen(e.target.files?.[0])}
          />
          <Button
            type="button"
            variant="secondary"
            icon={phase === "inspecting" ? RefreshCw : FileUp}
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            {summary ? "Pilih berkas lain" : "Pilih berkas .db"}
          </Button>

          {summary && (
            <dl className="text-xs grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md border border-copper-200 bg-copper-50 px-3 py-2">
              <dt className="text-muted">Berkas</dt>
              <dd className="font-medium break-all">
                {summary.fileName} ({formatSize(summary.fileSize)})
              </dd>
              <dt className="text-muted">Desa adat</dt>
              <dd className="font-medium">{summary.desaNama ?? "—"}</dd>
              <dt className="text-muted">Krama</dt>
              <dd className="font-medium">{summary.krama.toLocaleString("id-ID")}</dd>
              <dt className="text-muted">Penduduk</dt>
              <dd className="font-medium">{summary.penduduk.toLocaleString("id-ID")}</dd>
              <dt className="text-muted">Pengguna</dt>
              <dd className="font-medium">
                {summary.users} (admin: {summary.adminUsernames.join(", ")})
              </dd>
              <dt className="text-muted">Total</dt>
              <dd className="font-medium">
                {summary.tableCount} tabel, {summary.totalRows.toLocaleString("id-ID")} baris
              </dd>
            </dl>
          )}

          {summary && phase !== "failed" && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="restore-password">Password admin Anda</Label>
                <Input
                  id="restore-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  disabled={busy}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="restore-confirm">
                  Ketik <strong>{CONFIRM_WORD}</strong> untuk konfirmasi
                </Label>
                <Input
                  id="restore-confirm"
                  autoComplete="off"
                  value={confirmText}
                  disabled={busy}
                  onChange={(e) => setConfirmText(e.target.value)}
                />
              </div>
              {backupFailed && (
                <label className="flex items-start gap-2 text-xs text-red-800">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={skipBackup}
                    disabled={busy}
                    onChange={(e) => setSkipBackup(e.target.checked)}
                  />
                  <span>
                    Lanjutkan tanpa backup otomatis (hanya bila data cloud memang sudah rusak, mis. restore
                    sebelumnya gagal).
                  </span>
                </label>
              )}
              <Button
                type="button"
                variant="danger"
                icon={busy ? RefreshCw : RotateCcw}
                disabled={!canRestore}
                onClick={() => void runRestore()}
              >
                {phase === "backup"
                  ? "Membuat backup…"
                  : phase === "restoring"
                    ? "Me-restore…"
                    : "Restore sekarang"}
              </Button>
            </div>
          )}

          {status && (
            <p role="status" className={`text-xs rounded-md px-2.5 py-2 border ${statusStyle}`}>
              {status.text}
            </p>
          )}

          {phase === "failed" && (
            <div className="space-y-2 text-xs text-copper-900">
              <p>
                Restore berhenti di tengah. Database masih <strong>terkunci</strong> dan isinya mungkin belum
                lengkap. Ulangi restore — dengan berkas yang sama, atau berkas{" "}
                <strong>…-sebelum-restore.db</strong> yang tadi terunduh untuk kembali ke data semula.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" icon={RotateCcw} onClick={retryAfterFailure}>
                  Ulangi restore
                </Button>
                <Button type="button" variant="ghost" icon={Unlock} onClick={() => void unlock()}>
                  Buka kunci saja
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </CollapsibleSettingsSection>
  );
}
