import { useEffect, useState } from "react";
import { useLaporanPdfNavigate } from "../../hooks/useLaporanPdfNavigate";
import { getDesaAdatWithMedia } from "../../lib/services/desa";
import {
  perpanjangSuratMautsahaAdat,
  terbitSuratMautsahaAdat,
} from "../../lib/services/surat-keterangan-mautsaha-adat";
import { shouldChargeBiayaAdmin } from "../../lib/services/tarif-administrasi-ilikita";
import { stashSuratMautsahaAdatPreview } from "../../lib/laporan-pdf-preview";
import { buildSuratMautsahaAdatPdfPayload } from "../../lib/surat-keterangan-mautsaha-adat-pdf";
import type { LembagaBadanListItem } from "../../lib/types";
import { formatRupiah } from "../../lib/dudukan-hitung";
import { today } from "../../lib/utils";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { DateInput } from "../ui/DateInput";
import { Label } from "../ui/Input";

export function MautsahaAdatDialog({
  open,
  onClose,
  lembaga,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  lembaga: LembagaBadanListItem;
  onSuccess: () => void;
}) {
  const openPdf = useLaporanPdfNavigate();
  const [mode, setMode] = useState<"terbit" | "perpanjang">("terbit");
  const [tanggalTerbit, setTanggalTerbit] = useState(today());
  const [tampilkanTtdBandesa, setTampilkanTtdBandesa] = useState(true);
  const [hasTtdImage, setHasTtdImage] = useState(false);
  const [tarifLabel, setTarifLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const status = lembaga.mautsaha_status;
    const isPerpanjang =
      status === "berlaku" || status === "perlu_perpanjang" || status === "kedaluwarsa";
    setMode(isPerpanjang ? "perpanjang" : "terbit");
    setTanggalTerbit(today());
    setTampilkanTtdBandesa(true);
    setError("");

    void (async () => {
      const desa = await getDesaAdatWithMedia();
      setHasTtdImage(!!desa?.bandesa_ttd_url?.trim());
      const jenis = isPerpanjang ? "ipma_perpanjangan" : "ipma_terbit_baru";
      const { charge, nominal } = await shouldChargeBiayaAdmin(jenis);
      setTarifLabel(charge ? formatRupiah(nominal) : "Gratis");
    })();
  }, [open, lembaga]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const desa = await getDesaAdatWithMedia();
      if (!desa) throw new Error("Data desa adat belum ada.");

      const result =
        mode === "terbit"
          ? await terbitSuratMautsahaAdat({
              lembagaBadanId: lembaga.id,
              tanggalTerbit,
              tampilkanTtdBandesa,
            })
          : await perpanjangSuratMautsahaAdat({
              lembagaBadanId: lembaga.id,
              tanggalTerbit,
              tampilkanTtdBandesa,
            });

      const payload = buildSuratMautsahaAdatPdfPayload(desa, result);
      openPdf((backTo) =>
        stashSuratMautsahaAdatPreview([payload], backTo, "Kembali ke Lembaga/Badan")
      );
      onSuccess();
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  const title = mode === "terbit" ? "Terbit Surat IPMA" : "Perpanjang Surat IPMA";

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-muted">
          <strong>{lembaga.nama}</strong>
          {lembaga.mautsaha_nomor_surat ? (
            <>
              {" "}
              — surat terakhir: {lembaga.mautsaha_nomor_surat}
              {lembaga.mautsaha_berlaku_sampai
                ? ` (berlaku s/d ${lembaga.mautsaha_berlaku_sampai})`
                : ""}
            </>
          ) : null}
        </p>
        <div>
          <Label>Tanggal terbit</Label>
          <DateInput value={tanggalTerbit} onChange={setTanggalTerbit} required />
        </div>
        <p className="text-sm">
          Biaya administrasi: <strong>{tarifLabel}</strong>
        </p>
        {tarifLabel !== "Gratis" && (
          <p className="text-xs text-muted leading-snug bg-copper-50 border border-copper-200 rounded-md px-2.5 py-2">
            Nominal dicatat otomatis ke <strong>Keuangan → Pemasukan</strong> (Dana Kasukretan Lainnya).
            PDF pratinjau berisi <strong>surat IPMA + kwitansi</strong> biaya admin (halaman 2).
            Arsip surat ada di <strong>Laporan → Surat IPMA</strong>. Menghapus transaksi keuangan tidak
            menghapus arsip surat.
          </p>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={tampilkanTtdBandesa}
            onChange={(e) => setTampilkanTtdBandesa(e.target.checked)}
            disabled={busy || !hasTtdImage}
          />
          Tampilkan tanda tangan Bandesa
          {!hasTtdImage && (
            <span className="text-xs text-muted">(gambar TTD belum diunggah)</span>
          )}
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2 justify-end pt-1 border-t border-copper-100">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Batal
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Memproses..." : mode === "terbit" ? "Terbitkan & cetak" : "Perpanjang & cetak"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
