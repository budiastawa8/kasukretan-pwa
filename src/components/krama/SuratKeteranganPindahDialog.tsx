import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePageBackTo } from "../../lib/page-filter-state";
import { FileText } from "lucide-react";
import { Modal } from "../ui/Modal";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Button } from "../ui/Button";
import { Input, Label } from "../ui/Input";
import { getDesaAdatWithMedia } from "../../lib/services/desa";
import { deleteAnggota, nonaktifkanKramaPindah } from "../../lib/services/krama";
import {
  issueSkpAnggota,
  issueSkpKeluarga,
  skpSubjekTtlLabel,
  type SkpJenis,
  type SkpTujuanInput,
  type SuratKeteranganPindahRow,
} from "../../lib/services/surat-keterangan-pindah";
import {
  LAPORAN_PDF_PREVIEW_PATH,
  stashSuratKeteranganPindahPreview,
} from "../../lib/laporan-pdf-preview";
import { buildSuratKeteranganPindahPdfPayload } from "../../lib/surat-keterangan-pindah-pdf";
import type { KramaDetail } from "../../lib/types";
import { today } from "../../lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  krama: KramaDetail;
  jenis: SkpJenis;
  anggotaId?: string;
  onDone?: () => void;
};

const emptyTujuan = (): SkpTujuanInput => ({
  alamatTujuan: "",
  desaAdatTujuan: "",
  kecamatanTujuan: "",
  kabupatenTujuan: "",
  provinsiTujuan: "",
  alasanPindah: "",
});

export function SuratKeteranganPindahDialog({
  open,
  onClose,
  krama,
  jenis,
  anggotaId,
  onDone,
}: Props) {
  const navigate = useNavigate();
  const backTo = usePageBackTo();
  const [tanggalTerbit, setTanggalTerbit] = useState(today());
  const [tujuan, setTujuan] = useState<SkpTujuanInput>(emptyTujuan());
  const [tampilkanTtdBandesa, setTampilkanTtdBandesa] = useState(true);
  const [hasTtdImage, setHasTtdImage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [postStep, setPostStep] = useState<"form" | "followup">("form");
  const [tanggalNonaktif, setTanggalNonaktif] = useState(today());
  const [issuedSurat, setIssuedSurat] = useState<SuratKeteranganPindahRow | null>(null);
  const [confirmHapusAnggota, setConfirmHapusAnggota] = useState(false);

  const anggota =
    jenis === "anggota" && anggotaId
      ? krama.anggota_aktif.find((a) => a.anggota_id === anggotaId)
      : undefined;

  useEffect(() => {
    if (!open) return;
    setTanggalTerbit(today());
    setTujuan(emptyTujuan());
    setTanggalNonaktif(today());
    setError("");
    setPostStep("form");
    setIssuedSurat(null);
    setConfirmHapusAnggota(false);
    void getDesaAdatWithMedia().then((desa) => {
      const has = !!desa?.bandesa_ttd_url?.trim();
      setHasTtdImage(has);
      setTampilkanTtdBandesa(has);
    });
  }, [open, krama.id, jenis, anggotaId]);

  function updateTujuan(field: keyof SkpTujuanInput, value: string) {
    setTujuan((prev) => ({ ...prev, [field]: value }));
  }

  async function stashPreview(surat: SuratKeteranganPindahRow) {
    const desa = await getDesaAdatWithMedia();
    if (!desa) throw new Error("Data desa adat belum ada.");
    const payload = buildSuratKeteranganPindahPdfPayload(desa, surat);
    stashSuratKeteranganPindahPreview([payload], backTo, "Kembali ke detail krama");
    setIssuedSurat(surat);
    setPostStep("followup");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const ttd = hasTtdImage ? tampilkanTtdBandesa : false;
      if (jenis === "keluarga") {
        const { surat } = await issueSkpKeluarga(krama.id, {
          tanggalTerbit,
          tujuan,
          tampilkanTtdBandesa: ttd,
        });
        await stashPreview(surat);
      } else {
        if (!anggotaId) throw new Error("Anggota tidak dipilih.");
        const { surat } = await issueSkpAnggota(krama.id, {
          anggotaId,
          tanggalTerbit,
          tujuan,
          tampilkanTtdBandesa: ttd,
        });
        await stashPreview(surat);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function finishPreview() {
    onClose();
    onDone?.();
    navigate(LAPORAN_PDF_PREVIEW_PATH);
  }

  async function handleNonaktifkan() {
    setBusy(true);
    setError("");
    try {
      await nonaktifkanKramaPindah(krama.id, tanggalNonaktif);
      finishPreview();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleHapusAnggota() {
    if (!anggotaId) return;
    setBusy(true);
    setError("");
    try {
      await deleteAnggota(krama.id, anggotaId);
      setConfirmHapusAnggota(false);
      finishPreview();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const title =
    jenis === "keluarga" ? "Surat Keterangan Pindah (Keluarga)" : "Surat Keterangan Pindah (Anggota)";

  if (postStep === "followup" && issuedSurat) {
    return (
      <>
      <Modal open={open} title="Langkah selanjutnya" onClose={finishPreview} className="max-w-md">
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Surat Keterangan Pindah berhasil diterbitkan ({issuedSurat.nomor_surat}).
          </p>
          {jenis === "keluarga" ? (
            <>
              <p className="text-sm text-copper-900">
                Nonaktifkan krama Mipil ini dengan alasan pindah? (Opsional — dapat dilakukan nanti
                dari edit krama.)
              </p>
              <div>
                <Label>Tanggal tidak aktif</Label>
                <Input
                  type="date"
                  value={tanggalNonaktif}
                  onChange={(e) => setTanggalNonaktif(e.target.value)}
                  disabled={busy}
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-copper-900">
              Hapus {anggota?.nama_lengkap ?? "anggota"} dari daftar anggota Pipil ini? (Opsional)
            </p>
          )}
          {error && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={finishPreview} disabled={busy}>
              Lewati & pratinjau
            </Button>
            {jenis === "keluarga" ? (
              <Button type="button" onClick={() => void handleNonaktifkan()} disabled={busy}>
                {busy ? "Menyimpan…" : "Nonaktifkan & pratinjau"}
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => setConfirmHapusAnggota(true)}
                disabled={busy}
              >
                Hapus anggota & pratinjau
              </Button>
            )}
          </div>
        </div>
      </Modal>
      {jenis === "anggota" && (
        <ConfirmDialog
          open={confirmHapusAnggota}
          title="Hapus anggota keluarga?"
          message={`Hapus ${anggota?.nama_lengkap ?? "anggota"} dari daftar anggota Pipil ${krama.nomor_kartu}? Anggota akan dikeluarkan dari daftar aktif.`}
          error={error}
          busy={busy}
          onConfirm={() => void handleHapusAnggota()}
          onCancel={() => {
            if (!busy) {
              setConfirmHapusAnggota(false);
              setError("");
            }
          }}
        />
      )}
      </>
    );
  }

  return (
    <Modal open={open} title={title} onClose={onClose} className="max-w-lg">
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
        <p className="text-sm text-muted">
          {jenis === "keluarga"
            ? `Terbitkan SKP keluarga untuk Pipil ${krama.nomor_kartu} (${krama.kepala.nama_lengkap}).`
            : anggota
              ? `Terbitkan SKP untuk ${anggota.nama_lengkap} · ${skpSubjekTtlLabel(anggota)}.`
              : "Terbitkan SKP anggota."}
        </p>

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
            onChange={(e) => updateTujuan("alamatTujuan", e.target.value)}
            placeholder="Jl. … / Dusun …"
            disabled={busy}
            required
          />
        </div>
        <div>
          <Label>Desa adat tujuan</Label>
          <Input
            value={tujuan.desaAdatTujuan}
            onChange={(e) => updateTujuan("desaAdatTujuan", e.target.value)}
            disabled={busy}
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Kecamatan tujuan</Label>
            <Input
              value={tujuan.kecamatanTujuan}
              onChange={(e) => updateTujuan("kecamatanTujuan", e.target.value)}
              disabled={busy}
              required
            />
          </div>
          <div>
            <Label>Kabupaten tujuan</Label>
            <Input
              value={tujuan.kabupatenTujuan}
              onChange={(e) => updateTujuan("kabupatenTujuan", e.target.value)}
              disabled={busy}
              required
            />
          </div>
        </div>
        <div>
          <Label>Provinsi tujuan</Label>
          <Input
            value={tujuan.provinsiTujuan}
            onChange={(e) => updateTujuan("provinsiTujuan", e.target.value)}
            disabled={busy}
            required
          />
        </div>
        <div>
          <Label>Alasan pindah</Label>
          <Input
            value={tujuan.alasanPindah}
            onChange={(e) => updateTujuan("alasanPindah", e.target.value)}
            placeholder="Contoh: Pindah domisili ke desa adat tujuan"
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
          {!hasTtdImage && (
            <p className="text-[11px] text-copper-600">
              Unggah gambar TTD Bandesa di Master Data → Profil Desa Adat.
            </p>
          )}
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
          <Button type="submit" icon={FileText} disabled={busy}>
            {busy ? "Menerbitkan…" : "Terbitkan SKP"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
