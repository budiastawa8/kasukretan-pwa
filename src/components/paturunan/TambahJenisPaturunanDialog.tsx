import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { createIuranPaturunan } from "../../lib/services/iuran-paturunan";
import type { RupiahInputValue } from "../../lib/rupiah-input";
import { Button } from "../ui/Button";
import { DateInput } from "../ui/DateInput";
import { Input, Label } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { RupiahInput } from "../ui/RupiahInput";
import { FieldHint } from "../pembayaran/pembayaran-dialog-shared";

export function TambahJenisPaturunanDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void | Promise<void>;
}) {
  const [nama, setNama] = useState("");
  const [nominal, setNominal] = useState<RupiahInputValue>("");
  const [tanggalTarget, setTanggalTarget] = useState("");
  const [keterangan, setKeterangan] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setNama("");
    setNominal("");
    setTanggalTarget("");
    setKeterangan("");
    setBusy(false);
    setError("");
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const id = await createIuranPaturunan(
        nama,
        nominal === "" ? 0 : nominal,
        tanggalTarget,
        keterangan || undefined
      );
      await onCreated(id);
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Tambah Jenis Paturunan"
      onClose={onClose}
      canClose={!busy}
      className="max-w-lg"
    >
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="tambah-iuran-nama">Nama paturunan</Label>
          <FieldHint>Judul kegiatan atau iuran, misalnya Ngenteg Linggih 2027.</FieldHint>
          <Input
            id="tambah-iuran-nama"
            value={nama}
            onChange={(e) => setNama(e.target.value)}
            placeholder="Ngenteg Linggih 2027"
            required
            disabled={busy}
            className="text-sm h-9"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tambah-iuran-nominal">Nominal dasar</Label>
          <FieldHint>
            Tarif acuan per krama; tagihan = nominal × persen jenis krama (Master).
          </FieldHint>
          <RupiahInput
            id="tambah-iuran-nominal"
            value={nominal}
            onChange={setNominal}
            className="text-sm h-9"
            required
            disabled={busy}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tambah-iuran-target">Tanggal target</Label>
          <FieldHint>Batas waktu bayar; lewat tanggal ini dianggap telat.</FieldHint>
          <DateInput
            id="tambah-iuran-target"
            value={tanggalTarget}
            onChange={setTanggalTarget}
            required
            disabled={busy}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tambah-iuran-keterangan">Keterangan</Label>
          <FieldHint>Catatan tambahan untuk paturunan ini (opsional).</FieldHint>
          <Input
            id="tambah-iuran-keterangan"
            value={keterangan}
            onChange={(e) => setKeterangan(e.target.value)}
            placeholder="Contoh: pelaksanaan di pura desa"
            disabled={busy}
            className="text-sm h-9"
          />
        </div>
        {error ? (
          <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1.5">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2 pt-2 border-t border-copper-100">
          <Button
            type="button"
            variant="secondary"
            icon={X}
            onClick={onClose}
            disabled={busy}
            className="h-9 text-sm"
          >
            Batal
          </Button>
          <Button type="submit" icon={Plus} disabled={busy} className="h-9 text-sm px-4">
            {busy ? "Menyimpan..." : "Simpan paturunan"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
