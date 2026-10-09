import { useEffect, useState } from "react";
import { perpanjangPemasih } from "../../lib/services/krama";
import { shouldChargeBiayaAdmin } from "../../lib/services/tarif-administrasi-ilikita";
import { formatRupiah } from "../../lib/dudukan-hitung";
import { today } from "../../lib/utils";
import { Button } from "../ui/Button";
import { DateInput } from "../ui/DateInput";
import { Label } from "../ui/Input";
import { Modal } from "../ui/Modal";

export function PemasihPerpanjangDialog({
  kramaId,
  nomorKartu,
  open,
  onClose,
  onSuccess,
}: {
  kramaId: string;
  nomorKartu: string;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [tanggal, setTanggal] = useState(today());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tarifLabel, setTarifLabel] = useState("");

  useEffect(() => {
    if (!open) return;
    setTanggal(today());
    setError("");
    void shouldChargeBiayaAdmin("pemasih_perpanjangan").then(({ charge, nominal }) => {
      setTarifLabel(charge ? formatRupiah(nominal) : "Gratis");
    });
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await perpanjangPemasih(kramaId, tanggal);
      onSuccess();
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} title="Perpanjang Pemasih" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-muted">
          Nomor {nomorKartu}. Masa berlaku berikutnya dihitung dari tanggal perpanjangan; status
          Pemasih menjadi <strong>Aktif</strong>.
        </p>
        <div>
          <Label>Tanggal perpanjangan</Label>
          <DateInput value={tanggal} onChange={setTanggal} required />
        </div>
        <p className="text-sm">
          Biaya administrasi: <strong>{tarifLabel}</strong>
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2 justify-end pt-1 border-t border-copper-100">
          <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
            Batal
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "Menyimpan..." : "Simpan perpanjangan"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
