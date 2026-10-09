import { useState } from "react";
import { AlertTriangle, Database, Download, RefreshCw, Trash2, Upload } from "lucide-react";
import {
  backupDesktopDatabase,
  clearAllPaturunanPembayaran,
  clearDesktopDatabase,
  loadVideoDemoDatabase,
  restoreDesktopDatabase,
} from "../../lib/db/admin-database";
import { verifyAdminPassword } from "../../lib/services/auth";
import { isDesktopApp } from "../../lib/runtime";
import { isAdmin } from "../../lib/auth-roles";
import { useAuth } from "../../context/AuthContext";
import { CollapsibleSettingsSection } from "./CollapsibleSettingsSection";
import { Button } from "../ui/Button";
import { Input, Label } from "../ui/Input";
import { Modal } from "../ui/Modal";

type ActionKind = "backup" | "restore" | "clear" | "clearPaturunan" | "videoDemo";
type ConfirmActionKind = Exclude<ActionKind, "backup">;

type StatusBanner = { kind: "success" | "error" | "info"; text: string };

function errMsg(e: unknown): string {
  if (e instanceof Error && e.message.trim()) return e.message;
  if (typeof e === "string" && e.trim()) return e;
  return "Terjadi kesalahan tidak diketahui";
}

function StatusBox({ status }: { status: StatusBanner | null }) {
  if (!status) return null;
  const styles =
    status.kind === "success"
      ? "text-emerald-900 bg-emerald-50 border-emerald-200"
      : status.kind === "error"
        ? "text-red-800 bg-red-50 border-red-200"
        : "text-copper-900 bg-copper-100 border-copper-200";
  return (
    <p
      role="status"
      className={`text-xs rounded-md px-2.5 py-2 flex items-start gap-2 border ${styles}`}
    >
      {status.kind === "info" ? (
        <RefreshCw size={16} className="shrink-0 mt-0.5 animate-spin" aria-hidden />
      ) : status.kind === "error" ? (
        <AlertTriangle size={16} className="shrink-0 mt-0.5" aria-hidden />
      ) : (
        <Database size={16} className="shrink-0 mt-0.5" aria-hidden />
      )}
      <span>{status.text}</span>
    </p>
  );
}

const CONFIRM_PHRASE: Record<ConfirmActionKind, string> = {
  restore: "RESTORE",
  clear: "KOSONGKAN",
  clearPaturunan: "HAPUS PATURUNAN",
  videoDemo: "DEMO VIDEO",
};

export function DatabaseAdminPanel() {
  const { user } = useAuth();
  const admin = isAdmin(user?.peran);

  const [status, setStatus] = useState<StatusBanner | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState<ActionKind | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmActionKind | null>(null);
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [confirmError, setConfirmError] = useState("");

  if (!isDesktopApp() || !admin) {
    return null;
  }

  async function runAction(action: ActionKind) {
    if (!user) return;
    setBusy(true);
    setBusyAction(action);
    setConfirmError("");
    setStatus({
      kind: "info",
      text:
        action === "backup"
          ? "Membuat backup database…"
          : action === "restore"
            ? "Memulihkan database…"
            : action === "clearPaturunan"
              ? "Menghapus pembayaran paturunan…"
              : action === "videoDemo"
                ? "Mengisi data demo video…"
                : "Mengosongkan database…",
    });
    try {
      if (action === "backup") {
        const path = await backupDesktopDatabase();
        setStatus({ kind: "success", text: `Backup tersimpan: ${path}` });
      } else if (action === "restore") {
        await restoreDesktopDatabase();
      } else if (action === "clearPaturunan") {
        const { deleted } = await clearAllPaturunanPembayaran();
        setStatus({
          kind: "success",
          text: `${deleted} pembayaran paturunan dihapus. Siap impor ulang.`,
        });
      } else if (action === "videoDemo") {
        await loadVideoDemoDatabase();
      } else {
        await clearDesktopDatabase();
      }
    } catch (e) {
      const msg = errMsg(e);
      setConfirmError(msg);
      setStatus({ kind: "error", text: msg });
    } finally {
      setBusy(false);
      setBusyAction(null);
      if (action !== "restore" && action !== "clear" && action !== "videoDemo") {
        setConfirmAction(null);
        setPassword("");
        setConfirmText("");
      }
    }
  }

  async function handleConfirmSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !confirmAction) return;
    setConfirmError("");

    const ok = await verifyAdminPassword(user.username, password);
    if (!ok) {
      setConfirmError("Password admin salah atau akun bukan admin.");
      return;
    }

    const expected = CONFIRM_PHRASE[confirmAction];
    if (confirmText.trim().toUpperCase() !== expected) {
      setConfirmError(`Ketik ${expected} untuk melanjutkan.`);
      return;
    }

    await runAction(confirmAction);
  }

  function openConfirm(action: ConfirmActionKind) {
    setConfirmAction(action);
    setPassword("");
    setConfirmText("");
    setConfirmError("");
    setStatus(null);
  }

  const confirmTitle =
    confirmAction === "restore"
      ? "Restore database"
      : confirmAction === "clear"
        ? "Kosongkan database"
        : confirmAction === "clearPaturunan"
          ? "Hapus pembayaran paturunan"
          : confirmAction === "videoDemo"
            ? "Isi data demo video"
            : "";

  const confirmDescription =
    confirmAction === "restore"
      ? "Semua data desktop akan diganti dengan isi berkas backup. Aplikasi akan dimuat ulang dan Anda harus login kembali."
      : confirmAction === "clear"
        ? "Semua data (krama, pembayaran, master, dll.) akan dihapus. Database kembali ke kondisi awal dengan akun admin default. Aplikasi akan dimuat ulang."
        : confirmAction === "clearPaturunan"
          ? "Semua baris di tabel pembayaran paturunan akan dihapus. Data krama, iuran, dudukan, dan master tidak terpengaruh. Berguna sebelum impor ulang Excel."
          : confirmAction === "videoDemo"
            ? "Semua data desktop akan diganti dengan data fiktif (Desa Adat Samplingsari, nama contoh, NIK demo). Berguna untuk rekaman video promosi. Backup database dulu jika masih ada data asli. Aplikasi akan dimuat ulang."
            : "";

  return (
    <>
      <CollapsibleSettingsSection
        title="Database (admin)"
        subtitle="Backup, restore, kosongkan"
        icon={Database}
      >
        <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-2 flex items-start gap-2 -mt-1">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" aria-hidden />
          <span>
            Hanya administrator. Backup/restore/kosongkan memengaruhi seluruh data desktop (SQLite).
            Cloud PostgreSQL tidak ikut terhapus — kelola terpisah di Supabase.
          </span>
        </p>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            icon={Download}
            disabled={busy}
            onClick={() => void runAction("backup")}
          >
            {busy && busyAction === "backup" ? "Membuat backup…" : "Backup database"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            icon={Upload}
            disabled={busy}
            onClick={() => openConfirm("restore")}
          >
            {busy && busyAction === "restore" ? "Memulihkan…" : "Restore database"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            icon={Trash2}
            disabled={busy}
            onClick={() => openConfirm("clearPaturunan")}
          >
            {busy && busyAction === "clearPaturunan"
              ? "Menghapus…"
              : "Hapus pembayaran paturunan"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            icon={Trash2}
            disabled={busy}
            onClick={() => openConfirm("clear")}
          >
            {busy && busyAction === "clear" ? "Mengosongkan…" : "Kosongkan database"}
          </Button>
        </div>

        <StatusBox status={status} />

        <p className="text-[11px] text-muted leading-relaxed">
          <strong>Backup</strong> — salinan aman sebelum update besar. <strong>Restore</strong> —
          kembalikan dari berkas .db backup. <strong>Kosongkan</strong> — hapus semua isi; berguna
          untuk mulai dari nol (akun admin bawaan dengan password wajib diganti saat login
          pertama).
        </p>
      </CollapsibleSettingsSection>

      <Modal
        open={confirmAction !== null}
        title={confirmTitle}
        onClose={() => {
          if (busy) return;
          setConfirmAction(null);
          setPassword("");
          setConfirmText("");
          setConfirmError("");
        }}
        elevated
      >
        <form onSubmit={(e) => void handleConfirmSubmit(e)} className="space-y-3">
          <p className="text-sm text-muted leading-relaxed">{confirmDescription}</p>

          <div>
            <Label>Password admin</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              disabled={busy}
            />
          </div>

          {confirmAction && (
            <div>
              <Label>
                Ketik <strong>{CONFIRM_PHRASE[confirmAction]}</strong> untuk konfirmasi
              </Label>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={CONFIRM_PHRASE[confirmAction]}
                required
                disabled={busy}
              />
            </div>
          )}


          {confirmError && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">
              {confirmError}
            </p>
          )}

          <div className="flex gap-2 justify-end pt-1">
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setConfirmAction(null);
                setPassword("");
                setConfirmText("");
                setConfirmError("");
              }}
            >
              Batal
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Memproses…" : "Lanjutkan"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
