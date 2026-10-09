import { Trash2, X } from "lucide-react";
import { Button } from "./Button";
import { Modal } from "./Modal";

export function ConfirmDialog({
  open,
  title = "Konfirmasi hapus",
  message,
  error,
  confirmLabel = "Hapus",
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title?: string;
  message: string;
  /** Pesan error ditampilkan di dalam dialog (mis. gagal hapus). */
  error?: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      onEnter={onConfirm}
      canClose={!busy}
      canEnter={!busy}
      dismissOnBackdrop
      elevated
    >
      <div className="space-y-4">
        <p className="text-sm text-copper-800 leading-relaxed">{message}</p>
        {error && (
          <p
            className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2 leading-relaxed"
            role="alert"
          >
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2 pt-1 border-t border-copper-100">
          <Button
            type="button"
            variant="danger"
            icon={Trash2}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Menghapus..." : confirmLabel}
          </Button>
          <Button type="button" variant="ghost" icon={X} onClick={onCancel} disabled={busy}>
            Batal
          </Button>
        </div>
      </div>
    </Modal>
  );
}
