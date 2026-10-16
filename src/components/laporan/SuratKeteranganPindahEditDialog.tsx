import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Input, Label } from "../ui/Input";
import { getDesaAdatWithMedia } from "../../lib/services/desa";
import {
  parseSkpSnapshot,
  updateSuratKeteranganPindah,
  type SkpTujuanInput,
  type SuratKeteranganPindahListRow,
} from "../../lib/services/surat-keterangan-pindah";

type Props = {
  open: boolean;
  row: SuratKeteranganPindahListRow | null;
  onClose: () => void;
  onSaved: () => void;
};

export function SuratKeteranganPindahEditDialog({ open, row, onClose, onSaved }: Props) {
  const [tanggalTerbit, setTanggalTerbit] = useState("");
  const [tujuan, setTujuan] = useState<SkpTujuanInput>({
    alamatTujuan: "",
    desaAdatTujuan: "",
    kecamatanTujuan: "",
    kabupatenTujuan: "",
    provinsiTujuan: "",
    alasanPindah: "",
  });
  const [tampilkanTtdBandesa, setTampilkanTtdBandesa] = useState(true);
  const [hasTtdImage, setHasTtdImage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !row) return;
    const snap = parseSkpSnapshot(row.snapshot_json);
    setTanggalTerbit(row.tanggal_terbit.slice(0, 10));
    setTujuan({
      alamatTujuan: snap.alamat_tujuan,
      desaAdatTujuan: snap.desa_adat_tujuan,
      kecamatanTujuan: snap.kecamatan_tujuan,
      kabupatenTujuan: snap.kabupaten_tujuan,
      provinsiTujuan: snap.provinsi_tujuan,
      alasanPindah: snap.alasan_pindah,
    });
    setTampilkanTtdBandesa(snap.tampilkan_ttd_bandesa !== false);
    setError("");
    void getDesaAdatWithMedia().then((desa) => {
      const has = !!desa?.bandesa_ttd_url?.trim();
      setHasTtdImage(has);
      if (!has) setTampilkanTtdBandesa(false);
    });
  }, [open, row]);

  function updateField(field: keyof SkpTujuanInput, value: string) {
    setTujuan((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!row) return;
    setBusy(true);
    setError("");
    try {
      await updateSuratKeteranganPindah(row.id, {
        tanggalTerbit,
        tujuan,
        tampilkanTtdBandesa: hasTtdImage ? tampilkanTtdBandesa : false,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!row) return null;

  return (
    <Modal open={open} title="Edit Surat Keterangan Pindah" onClose={onClose} className="max-w-lg">
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
        <p className="text-sm text-muted">
          {row.nomor_surat} · {row.nama_subjek}
        </p>
        <p className="text-[11px] text-copper-600">Nomor surat tidak dapat diubah.</p>

        <div>
          <Label>Tanggal terbit</Label>
          <Input
            type="date"
            value={tanggalTerbit}
            onChange={(e) => setTanggalTerbit(e.target.value)}
            disabled={busy}
            required
          />
        </div>
        <div>
          <Label>Alamat tujuan</Label>
          <Input
            value={tujuan.alamatTujuan}
            onChange={(e) => updateField("alamatTujuan", e.target.value)}
            disabled={busy}
            required
          />
        </div>
        <div>
          <Label>Desa adat tujuan</Label>
          <Input
            value={tujuan.desaAdatTujuan}
            onChange={(e) => updateField("desaAdatTujuan", e.target.value)}
            disabled={busy}
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Kecamatan tujuan</Label>
            <Input
              value={tujuan.kecamatanTujuan}
              onChange={(e) => updateField("kecamatanTujuan", e.target.value)}
              disabled={busy}
              required
            />
          </div>
          <div>
            <Label>Kabupaten tujuan</Label>
            <Input
              value={tujuan.kabupatenTujuan}
              onChange={(e) => updateField("kabupatenTujuan", e.target.value)}
              disabled={busy}
              required
            />
          </div>
        </div>
        <div>
          <Label>Provinsi tujuan</Label>
          <Input
            value={tujuan.provinsiTujuan}
            onChange={(e) => updateField("provinsiTujuan", e.target.value)}
            disabled={busy}
            required
          />
        </div>
        <div>
          <Label>Alasan pindah</Label>
          <Input
            value={tujuan.alasanPindah}
            onChange={(e) => updateField("alasanPindah", e.target.value)}
            disabled={busy}
            required
          />
        </div>

        <div className="space-y-1">
          <label className="flex items-center gap-2 text-sm text-copper-900 cursor-pointer">
            <input
              type="checkbox"
              className="rounded border-copper-300"
              checked={tampilkanTtdBandesa}
              onChange={(e) => setTampilkanTtdBandesa(e.target.checked)}
              disabled={busy || !hasTtdImage}
            />
            Tampilkan tanda tangan Bandesa
          </label>
        </div>

        {error && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1">
            {error}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Menyimpan…" : "Simpan"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
