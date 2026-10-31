import { useEffect, useState } from "react";
import { Trash2, X } from "lucide-react";
import {
  ALASAN_HAPUS_PEMBAYARAN_OPTIONS,
  type AlasanHapusPembayaranKode,
} from "../../lib/services/pembayaran-hapus-log";
import { Button } from "../ui/Button";
import { Input, Label, Select } from "../ui/Input";
import { Modal } from "../ui/Modal";

export function HapusPembayaranDialog({
  open,
  title = "Hapus pembayaran?",
  message,
  error,
  confirmLabel = "Ya, hapus",
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title?: string;
  message: string;
  error?: string;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: (alasan: { kode: AlasanHapusPembayaranKode; teks: string }) => void;
  onCancel: () => void;
}) {
  const [kode, setKode] = useState<AlasanHapusPembayaranKode | "">("");
  const [teksLainnya, setTeksLainnya] = useState("");
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    if (!open) return;
    setKode("");
    setTeksLainnya("");
    setLocalError("");
  }, [open]);

  function submit() {
    if (!kode) {
      setLocalError("Pilih alasan hapus");
      return;
    }
    if (kode === "lainnya" && !teksLainnya.trim()) {
      setLocalError("Jelaskan alasan hapus");
      return;
    }
    setLocalError("");
    const label =
      ALASAN_HAPUS_PEMBAYARAN_OPTIONS.find((o) => o.value === kode)?.label ?? kode;
    onConfirm({
      kode,
      teks: kode === "lainnya" ? teksLainnya.trim() : label,
    });
  }

  const showError = localError || error;

  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      onEnter={submit}
      canClose={!busy}
      canEnter={!busy}
      dismissOnBackdrop
      elevated
      className="max-w-md"
    >
      <div className="space-y-3">
        <p className="text-sm text-copper-800 leading-relaxed">{message}</p>
        <p className="text-[11px] text-muted leading-snug">
          Penghapusan dicatat untuk audit admin/bendahara. Isi alasan dengan jujur.
        </p>
        <div>
          <Label>Alasan hapus</Label>
          <Select
            value={kode}
            onChange={(e) => {
              setKode(e.target.value as AlasanHapusPembayaranKode | "");
              setLocalError("");
            }}
            required
            disabled={busy}
          >
            <option value="">Pilih alasan…</option>
            {ALASAN_HAPUS_PEMBAYARAN_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        {kode === "lainnya" && (
          <div>
            <Label>Jelaskan</Label>
            <Input
              value={teksLainnya}
              onChange={(e) => {
                setTeksLainnya(e.target.value);
                setLocalError("");
              }}
              placeholder="Contoh: salah pilih bulan, krama batal bayar, …"
              disabled={busy}
              autoFocus
            />
          </div>
        )}
        {showError && (
          <p
            className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2 leading-relaxed"
            role="alert"
          >
            {showError}
          </p>
        )}
        <div className="flex flex-wrap gap-2 pt-1 border-t border-copper-100">
          <Button
            type="button"
            variant="danger"
            icon={Trash2}
            onClick={submit}
            disabled={busy}
          >
            {busy ? "Menghapus…" : confirmLabel}
          </Button>
          <Button type="button" variant="ghost" icon={X} onClick={onCancel} disabled={busy}>
            Batal
          </Button>
        </div>
      </div>
    </Modal>
  );
}
