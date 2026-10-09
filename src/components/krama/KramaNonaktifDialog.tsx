import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import {
  ALASAN_TIDAK_AKTIF_OPTIONS,
  type AlasanTidakAktifKode,
} from "../../lib/krama-status";
import { Button } from "../ui/Button";
import { DateInput } from "../ui/DateInput";
import { Input, Label, Select } from "../ui/Input";
import { Modal } from "../ui/Modal";

export type KramaNonaktifValues = {
  alasanTidakAktif: AlasanTidakAktifKode | "";
  tanggalTidakAktif: string;
  keteranganTidakAktif: string;
};

export type KramaNonaktifConfirmValues = {
  alasanTidakAktif: AlasanTidakAktifKode;
  tanggalTidakAktif: string;
  keteranganTidakAktif: string;
};

export function KramaNonaktifDialog({
  open,
  initial,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  initial?: KramaNonaktifValues;
  onConfirm: (values: KramaNonaktifConfirmValues) => void;
  onCancel: () => void;
}) {
  const [alasan, setAlasan] = useState<AlasanTidakAktifKode | "">("");
  const [tanggal, setTanggal] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setAlasan(initial?.alasanTidakAktif ?? "");
      setTanggal(initial?.tanggalTidakAktif ?? "");
      setKeterangan(initial?.keteranganTidakAktif ?? "");
      setError("");
    }
  }, [open, initial]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!alasan) {
      setError("Pilih alasan tidak aktif");
      return;
    }
    if (!tanggal.trim()) {
      setError("Tanggal mulai tidak aktif wajib diisi");
      return;
    }
    onConfirm({
      alasanTidakAktif: alasan,
      tanggalTidakAktif: tanggal,
      keteranganTidakAktif: keterangan.trim(),
    });
  }

  return (
    <Modal
      open={open}
      title="Krama tidak aktif"
      onClose={onCancel}
      footer={
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Button
            type="button"
            variant="secondary"
            icon={X}
            className="order-2 h-10 justify-center sm:order-none sm:h-9"
            onClick={onCancel}
          >
            Batal
          </Button>
          <Button
            type="submit"
            form="krama-nonaktif-form"
            icon={Check}
            className="order-1 h-10 justify-center sm:order-none sm:h-9 sm:flex-1"
          >
            Simpan
          </Button>
        </div>
      }
    >
      <form id="krama-nonaktif-form" onSubmit={submit} className="space-y-3">
        <p className="text-sm leading-snug text-copper-700">
          Lengkapi alasan, tanggal, dan keterangan sebelum menyimpan perubahan status.
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div>
          <Label>Alasan tidak aktif</Label>
          <Select
            value={alasan}
            onChange={(e) => setAlasan(e.target.value as AlasanTidakAktifKode | "")}
            required
          >
            <option value="">— Pilih alasan —</option>
            {ALASAN_TIDAK_AKTIF_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Tanggal mulai tidak aktif</Label>
          <DateInput value={tanggal} onChange={setTanggal} required />
        </div>
        <div>
          <Label>Keterangan</Label>
          <Input
            value={keterangan}
            onChange={(e) => setKeterangan(e.target.value)}
            placeholder="Catatan tambahan (opsional)"
          />
        </div>
      </form>
    </Modal>
  );
}
