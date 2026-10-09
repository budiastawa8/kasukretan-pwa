import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { ALASAN_NYADA_MANUAL_OPTIONS, type AlasanNyada } from "../../lib/nyada-ketentuan";
import type { NyadaManualInput } from "../../lib/services/nyada-otomatis";
import { today } from "../../lib/utils";
import { Button } from "../ui/Button";
import { DateInput } from "../ui/DateInput";
import { Input, Label, Select } from "../ui/Input";
import { Modal } from "../ui/Modal";

export function NyadaManualDialog({
  open,
  jenisNyadaNama,
  umurPengarep,
  batasUmurNyada,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  jenisNyadaNama: string;
  umurPengarep: number | null;
  batasUmurNyada: number | null;
  onConfirm: (values: NyadaManualInput) => void;
  onCancel: () => void;
}) {
  const [alasan, setAlasan] = useState<AlasanNyada>("cacat");
  const [tanggal, setTanggal] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setAlasan("cacat");
      setTanggal(today());
      setKeterangan("");
      setError("");
    }
  }, [open]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!tanggal.trim()) {
      setError("Tanggal berlaku wajib diisi");
      return;
    }
    onConfirm({ alasan, tanggalBerlaku: tanggal, keterangan: keterangan.trim() });
  }

  return (
    <Modal
      open={open}
      title={`Tetapkan ${jenisNyadaNama}`}
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
            form="nyada-manual-form"
            icon={Check}
            className="order-1 h-10 justify-center sm:order-none sm:h-9 sm:flex-1"
          >
            Simpan
          </Button>
        </div>
      }
    >
      <form id="nyada-manual-form" onSubmit={submit} className="space-y-3 text-sm leading-snug">
        <p className="text-copper-800">
          Umur Pengarep{umurPengarep != null ? ` ${umurPengarep} tahun` : ""} belum mencapai batas
          Nyada{batasUmurNyada != null ? ` (${batasUmurNyada} tahun)` : ""}. Lengkapi alasan
          penetapan. Paturunan menjadi 0% untuk iuran yang belum jatuh tempo pada tanggal berlaku.
        </p>
        {error && <p className="text-red-600">{error}</p>}
        <div>
          <Label>Alasan</Label>
          <Select value={alasan} onChange={(e) => setAlasan(e.target.value as AlasanNyada)}>
            {ALASAN_NYADA_MANUAL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Tanggal berlaku</Label>
          <DateInput value={tanggal} onChange={setTanggal} required />
          <p className="mt-0.5 text-[11px] text-copper-600">
            Misalnya tanggal keputusan paruman.
          </p>
        </div>
        <div>
          <Label>Keterangan</Label>
          <Input
            value={keterangan}
            onChange={(e) => setKeterangan(e.target.value)}
            placeholder="Nomor/tanggal keputusan (opsional)"
          />
        </div>
      </form>
    </Modal>
  );
}
