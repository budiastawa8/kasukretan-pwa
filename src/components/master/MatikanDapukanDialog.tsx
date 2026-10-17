import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import type { KramaDapukanRingkas } from "../../lib/services/nyada-otomatis";
import { Button } from "../ui/Button";
import { Input, Label } from "../ui/Input";
import { Modal } from "../ui/Modal";

const KATA_KONFIRMASI = "MATIKAN";

export function MatikanDapukanDialog({
  open,
  daftar,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  daftar: KramaDapukanRingkas[];
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [ketik, setKetik] = useState("");

  useEffect(() => {
    if (open) setKetik("");
  }, [open]);

  const cocok = ketik.trim().toUpperCase() === KATA_KONFIRMASI;

  return (
    <Modal
      open={open}
      title="Matikan Krama Dapukan?"
      onClose={busy ? () => undefined : onCancel}
      footer={
        <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
          <Button
            type="button"
            variant="danger"
            icon={AlertTriangle}
            className="h-10 justify-center sm:h-9 sm:flex-1"
            disabled={!cocok || busy}
            onClick={onConfirm}
          >
            {busy ? "Menyimpan…" : "Matikan & simpan profil"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            icon={X}
            className="h-10 justify-center sm:h-9"
            disabled={busy}
            onClick={onCancel}
          >
            Batal
          </Button>
        </div>
      }
    >
      <div className="space-y-3 text-sm leading-snug">
        <p className="rounded border border-red-200 bg-red-50 px-2.5 py-2 text-red-900">
          Setelah Krama Dapukan dimatikan, Pengarep yang mencapai usia Nyada langsung menjadi
          Nyada tanpa melihat Anak yang belum kawin.
          {daftar.length > 0 ? (
            <>
              {" "}
              <strong>{daftar.length} krama</strong> berjenis Dapukan akan menjadi Nyada mulai hari
              ini. Perubahan ini tidak dapat dibatalkan otomatis.
            </>
          ) : (
            " Saat ini tidak ada krama berjenis Dapukan."
          )}
        </p>
        {daftar.length > 0 && (
          <ul className="max-h-48 overflow-y-auto rounded border border-copper-200 bg-white text-xs">
            {daftar.map((k) => (
              <li key={k.id} className="flex justify-between gap-2 border-b border-copper-100 px-2 py-1 last:border-b-0">
                <span className="min-w-0 truncate">
                  <span className="font-mono text-copper-700">{k.nomor_kartu}</span> · {k.kepala_nama}
                </span>
                <span className="shrink-0 text-copper-600">{k.jenis_nama ?? "—"}</span>
              </li>
            ))}
          </ul>
        )}
        <div>
          <Label>
            Ketik <strong>{KATA_KONFIRMASI}</strong> untuk melanjutkan
          </Label>
          <Input
            value={ketik}
            onChange={(e) => setKetik(e.target.value)}
            autoComplete="off"
            disabled={busy}
          />
        </div>
      </div>
    </Modal>
  );
}
