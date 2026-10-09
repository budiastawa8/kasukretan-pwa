import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePageBackTo } from "../../lib/page-filter-state";
import { FileText, Search } from "lucide-react";
import { Modal } from "../ui/Modal";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Button } from "../ui/Button";
import { Input, Label, Select } from "../ui/Input";
import { getDesaAdat } from "../../lib/services/desa";
import { deleteAnggota, getKramaDetail, listKrama } from "../../lib/services/krama";
import {
  issueSkpAnggota,
  skpSubjekTtlLabel,
  skpTujuanFromKramaTujuan,
  skpTujuanIntraDesaFromDesa,
  type SkpTujuanInput,
  type SuratKeteranganPindahRow,
} from "../../lib/services/surat-keterangan-pindah";
import {
  keluarPipilIntraDesa,
  type KeluarPipilAlur,
} from "../../lib/services/pipil-keluar-intra-desa";
import {
  listArahan,
  listBanjar,
  listJenisMipil,
  listTempek,
} from "../../lib/services/master";
import {
  LAPORAN_PDF_PREVIEW_PATH,
  stashSuratKeteranganPindahPreview,
} from "../../lib/laporan-pdf-preview";
import { buildSuratKeteranganPindahPdfPayload } from "../../lib/surat-keterangan-pindah-pdf";
import type { DesaAdat, KramaDetail, KramaListItem } from "../../lib/types";
import type { Arahan, Banjar, JenisKramaMipilRow, Tempek } from "../../lib/types";
import { STATUS_KELUARGA_TAMBAH_ANGGOTA } from "../../lib/status-keluarga";
import { today } from "../../lib/utils";

type Props = {
  open: boolean;
  onClose: () => void;
  krama: KramaDetail;
  anggotaId: string;
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

export function KeluarPipilIntraDesaDialog({
  open,
  onClose,
  krama,
  anggotaId,
  onDone,
}: Props) {
  const navigate = useNavigate();
  const backTo = usePageBackTo();
  const anggota = krama.anggota_aktif.find((a) => a.anggota_id === anggotaId);

  const [desa, setDesa] = useState<DesaAdat | null>(null);
  const [alur, setAlur] = useState<KeluarPipilAlur>("gabung");
  const [tanggalTerbit, setTanggalTerbit] = useState(today());
  const [tujuan, setTujuan] = useState<SkpTujuanInput>(emptyTujuan());
  const [tampilkanTtdBandesa, setTampilkanTtdBandesa] = useState(true);
  const [hasTtdImage, setHasTtdImage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [postStep, setPostStep] = useState<"form" | "followup">("form");
  const [issuedSurat, setIssuedSurat] = useState<SuratKeteranganPindahRow | null>(null);
  const [resultKramaId, setResultKramaId] = useState<string | null>(null);

  // Gabung
  const [pipilQ, setPipilQ] = useState("");
  const [pipilOptions, setPipilOptions] = useState<KramaListItem[]>([]);
  const [targetKramaId, setTargetKramaId] = useState("");
  const [statusKeluarga, setStatusKeluarga] = useState("Anak");

  // Pipil baru
  const [banjar, setBanjar] = useState<Banjar[]>([]);
  const [tempek, setTempek] = useState<Tempek[]>([]);
  const [arahan, setArahan] = useState<Arahan[]>([]);
  const [jenisMipil, setJenisMipil] = useState<JenisKramaMipilRow[]>([]);
  const [banjarId, setBanjarId] = useState("");
  const [banjarKode, setBanjarKode] = useState("");
  const [tempekId, setTempekId] = useState("");
  const [arahanId, setArahanId] = useState("");
  const [jenisMipilId, setJenisMipilId] = useState("");
  const [alamatBaru, setAlamatBaru] = useState("");
  const [tanggalTerdaftar, setTanggalTerdaftar] = useState(today());
  const [nomorKontak, setNomorKontak] = useState("");

  const [hapusSetelahSkp, setHapusSetelahSkp] = useState(true);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);

  const targetPreview = useMemo(
    () => pipilOptions.find((p) => p.id === targetKramaId),
    [pipilOptions, targetKramaId]
  );

  const loadPipilOptions = useCallback(
    async (q: string) => {
      const rows = await listKrama({
        klasifikasi: "MIPIL",
        statusKrama: "aktif",
        q: q.trim() || undefined,
      });
      setPipilOptions(rows.filter((r) => r.id !== krama.id));
    },
    [krama.id]
  );

  useEffect(() => {
    if (!open) return;
    setAlur("gabung");
    setTanggalTerbit(today());
    setTujuan(emptyTujuan());
    setError("");
    setPostStep("form");
    setIssuedSurat(null);
    setResultKramaId(null);
    setPipilQ("");
    setTargetKramaId("");
    setStatusKeluarga(anggota?.jenis_kelamin === "P" ? "Istri" : "Anak");
    setBanjarId("");
    setBanjarKode("");
    setTempekId("");
    setArahanId("");
    setJenisMipilId("");
    setAlamatBaru("");
    setTanggalTerdaftar(today());
    setNomorKontak(krama.nomor_kontak ?? "");
    setHapusSetelahSkp(true);
    setSubmitConfirmOpen(false);

    void Promise.all([getDesaAdat(), listBanjar(), listJenisMipil(), loadPipilOptions("")]).then(
      ([d, b, jm]) => {
        setDesa(d);
        const has = !!d?.bandesa_ttd_url?.trim();
        setHasTtdImage(has);
        setTampilkanTtdBandesa(has);
        setBanjar(b);
        setJenisMipil(jm);
        if (d) {
          setTujuan(
            skpTujuanIntraDesaFromDesa(d, "", "Pindah domisili dalam desa adat")
          );
        }
      }
    );
  }, [open, krama.id, krama.nomor_kontak, anggota?.jenis_kelamin, loadPipilOptions]);

  useEffect(() => {
    if (!open || !banjarId) {
      setTempek([]);
      return;
    }
    void listTempek(banjarId).then(setTempek);
    const b = banjar.find((x) => x.id === banjarId);
    if (b) setBanjarKode(b.kode);
  }, [open, banjarId, banjar]);

  useEffect(() => {
    if (!open || !tempekId) {
      setArahan([]);
      return;
    }
    void listArahan(tempekId).then(setArahan);
  }, [open, tempekId]);

  useEffect(() => {
    if (!open || alur !== "gabung") return;
    const t = window.setTimeout(() => void loadPipilOptions(pipilQ), 280);
    return () => window.clearTimeout(t);
  }, [open, alur, pipilQ, loadPipilOptions]);

  useEffect(() => {
    if (!open || alur !== "gabung" || !targetKramaId || !desa) return;
    void getKramaDetail(targetKramaId).then((target) => {
      if (!target) return;
      const pengarep = target.kepala.nama_lengkap;
      setTujuan(
        skpTujuanFromKramaTujuan(
          desa,
          target,
          `Bergabung ke Pipil ${target.nomor_kartu} (${pengarep}) sebagai ${statusKeluarga}`
        )
      );
    });
  }, [open, alur, targetKramaId, statusKeluarga, desa]);

  useEffect(() => {
    if (!open || alur !== "pipil_baru" || !desa) return;
    setTujuan(
      skpTujuanIntraDesaFromDesa(
        desa,
        alamatBaru,
        "Membentuk Pipil baru / keluarga sendiri"
      )
    );
  }, [open, alur, alamatBaru, desa]);

  function updateTujuan(field: keyof SkpTujuanInput, value: string) {
    setTujuan((prev) => ({ ...prev, [field]: value }));
  }

  async function stashPreview(surat: SuratKeteranganPindahRow, kramaHasilId?: string) {
    if (!desa) throw new Error("Data desa adat belum ada.");
    const payload = buildSuratKeteranganPindahPdfPayload(desa, surat);
    const backLabel = kramaHasilId ? "Ke Pipil tujuan" : "Kembali ke detail krama";
    stashSuratKeteranganPindahPreview([payload], backTo, backLabel);
    setIssuedSurat(surat);
    setResultKramaId(kramaHasilId ?? null);
    setPostStep("followup");
  }

  const willDeleteAnggotaFromAsal = alur !== "keluar_saja" || hapusSetelahSkp;

  const submitDeleteMessage = useMemo(() => {
    if (!anggota) return "";
    const nama = anggota.nama_lengkap;
    if (alur === "gabung") {
      const t = targetPreview;
      return `Hapus ${nama} dari Pipil ${krama.nomor_kartu} dan gabung ke Pipil ${t?.nomor_kartu ?? "tujuan"} sebagai ${statusKeluarga}? SKP intra desa akan diterbitkan.`;
    }
    if (alur === "pipil_baru") {
      return `${nama} akan menjadi Pengarep Pipil baru dan dihapus dari Pipil ${krama.nomor_kartu} asal. SKP intra desa akan diterbitkan.`;
    }
    return `Hapus ${nama} dari Pipil ${krama.nomor_kartu} setelah SKP diterbitkan?`;
  }, [alur, anggota, krama.nomor_kartu, statusKeluarga, targetPreview]);

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (willDeleteAnggotaFromAsal) {
      setSubmitConfirmOpen(true);
      return;
    }
    await executeSubmit();
  }

  async function executeSubmit() {
    if (!anggota) return;
    setBusy(true);
    setError("");
    try {
      const ttd = hasTtdImage ? tampilkanTtdBandesa : false;

      if (alur === "keluar_saja") {
        const { surat } = await issueSkpAnggota(krama.id, {
          anggotaId,
          tanggalTerbit,
          tujuan,
          tampilkanTtdBandesa: ttd,
          snapshotMeta: { jenis_alur: "keluar_saja" },
        });
        if (hapusSetelahSkp) {
          await deleteAnggota(krama.id, anggotaId);
        }
        await stashPreview(surat);
        setSubmitConfirmOpen(false);
        return;
      }

      if (alur === "pipil_baru" && (!banjarId || !banjarKode)) {
        throw new Error("Pilih banjar untuk Pipil baru");
      }
      if (alur === "gabung" && !targetKramaId) {
        throw new Error("Pilih Pipil tujuan");
      }
      if (!statusKeluarga.trim() && alur === "gabung") {
        throw new Error("Status keluarga di Pipil tujuan wajib dipilih");
      }

      const result = await keluarPipilIntraDesa({
        sourceKramaId: krama.id,
        sourceAnggotaId: anggotaId,
        alur,
        skp: { tanggalTerbit, tujuan, tampilkanTtdBandesa: ttd },
        hapusDariAsal: true,
        pipilBaru:
          alur === "pipil_baru"
            ? {
                banjarId,
                banjarKode,
                tempekId: tempekId || undefined,
                arahanId: arahanId || undefined,
                jenisMipilId: jenisMipilId || undefined,
                alamat: alamatBaru || undefined,
                tanggalTerdaftar,
                nomorKontak: nomorKontak || undefined,
              }
            : undefined,
        gabung:
          alur === "gabung"
            ? {
                targetKramaId,
                statusKeluarga,
                tanggalMasuk: tanggalTerbit,
              }
            : undefined,
      });

      await stashPreview(
        result.surat,
        result.newKramaId ?? result.targetKramaId
      );
      setSubmitConfirmOpen(false);
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

  if (postStep === "followup" && issuedSurat) {
    return (
      <Modal open={open} title="Selesai" onClose={finishPreview} className="max-w-md">
        <div className="space-y-3">
          <p className="text-sm text-muted">
            SKP {issuedSurat.nomor_surat} berhasil diterbitkan.
            {alur !== "keluar_saja" && " Perpindahan Pipil intra desa telah dicatat."}
          </p>
          {resultKramaId && (
            <p className="text-sm text-copper-900">
              Buka detail Pipil tujuan setelah pratinjau PDF untuk menambah anggota lain bila
              perlu.
            </p>
          )}
          {error && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1">
              {error}
            </p>
          )}
          <div className="flex justify-end pt-1">
            <Button type="button" onClick={finishPreview} disabled={busy}>
              Pratinjau PDF
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  if (!anggota) return null;

  return (
    <>
    <Modal open={open} title="Keluar Pipil — intra desa" onClose={onClose} className="max-w-lg">
      <form onSubmit={(e) => void handleFormSubmit(e)} className="space-y-3">
        <p className="text-sm text-muted">
          {anggota.nama_lengkap} · {skpSubjekTtlLabel(anggota)} · Pipil {krama.nomor_kartu}
        </p>

        <div>
          <Label>Setelah SKP</Label>
          <Select
            value={alur}
            onChange={(e) => setAlur(e.target.value as KeluarPipilAlur)}
            disabled={busy}
          >
            <option value="gabung">Gabung ke Pipil lain di desa ini</option>
            <option value="pipil_baru">Bentuk Pipil baru (Pengarep)</option>
            <option value="keluar_saja">Hanya SKP / keluar (tanpa Pipil tujuan)</option>
          </Select>
        </div>

        {alur === "gabung" && (
          <div className="space-y-2 rounded border border-copper-200 bg-copper-50/50 p-2">
            <div>
              <Label>Cari Pipil tujuan</Label>
              <div className="relative">
                <Search
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-muted"
                  size={14}
                />
                <Input
                  className="pl-7"
                  value={pipilQ}
                  onChange={(e) => setPipilQ(e.target.value)}
                  placeholder="NPK / nama Pengarep / alamat…"
                  disabled={busy}
                />
              </div>
            </div>
            <div>
              <Label>Pipil tujuan</Label>
              <Select
                value={targetKramaId}
                onChange={(e) => setTargetKramaId(e.target.value)}
                disabled={busy}
                required
              >
                <option value="">— Pilih —</option>
                {pipilOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nomor_kartu} · {p.kepala_nama}
                    {p.alamat ? ` · ${p.alamat}` : ""}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Status keluarga di Pipil tujuan</Label>
              <Select
                value={statusKeluarga}
                onChange={(e) => setStatusKeluarga(e.target.value)}
                disabled={busy}
                required
              >
                {STATUS_KELUARGA_TAMBAH_ANGGOTA.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
            {targetPreview && (
              <p className="text-[11px] text-copper-700">
                Akan menjadi <strong>{statusKeluarga}</strong> di Pipil{" "}
                {targetPreview.nomor_kartu} ({targetPreview.kepala_nama}).
              </p>
            )}
          </div>
        )}

        {alur === "pipil_baru" && (
          <div className="space-y-2 rounded border border-copper-200 bg-copper-50/50 p-2">
            <p className="text-[11px] text-copper-800">
              <strong>{anggota.nama_lengkap}</strong> akan menjadi Pengarep Pipil baru (data
              identitas dipertahankan).
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Banjar</Label>
                <Select
                  value={banjarId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setBanjarId(id);
                    setBanjarKode(banjar.find((b) => b.id === id)?.kode ?? "");
                  }}
                  disabled={busy}
                  required
                >
                  <option value="">— Pilih —</option>
                  {banjar.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nama}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Jenis Mipil</Label>
                <Select
                  value={jenisMipilId}
                  onChange={(e) => setJenisMipilId(e.target.value)}
                  disabled={busy}
                >
                  <option value="">— Opsional —</option>
                  {jenisMipil.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.nama}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Tempek</Label>
                <Select
                  value={tempekId}
                  onChange={(e) => setTempekId(e.target.value)}
                  disabled={busy}
                >
                  <option value="">— Opsional —</option>
                  {tempek.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nama}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Arahan</Label>
                <Select
                  value={arahanId}
                  onChange={(e) => setArahanId(e.target.value)}
                  disabled={busy}
                >
                  <option value="">— Opsional —</option>
                  {arahan.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nama}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div>
              <Label>Alamat domisili baru</Label>
              <Input
                value={alamatBaru}
                onChange={(e) => setAlamatBaru(e.target.value)}
                disabled={busy}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Tanggal pencatatan Pipil</Label>
                <Input
                  type="date"
                  value={tanggalTerdaftar}
                  onChange={(e) => setTanggalTerdaftar(e.target.value)}
                  disabled={busy}
                  required
                />
              </div>
              <div>
                <Label>No. kontak</Label>
                <Input
                  value={nomorKontak}
                  onChange={(e) => setNomorKontak(e.target.value)}
                  disabled={busy}
                />
              </div>
            </div>
          </div>
        )}

        <div className="border-t border-copper-100 pt-2 space-y-2">
          <p className="text-xs font-medium text-copper-900">Surat Keterangan Pindah</p>
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
            <Label>Alamat tujuan (SKP)</Label>
            <Input
              value={tujuan.alamatTujuan}
              onChange={(e) => updateTujuan("alamatTujuan", e.target.value)}
              disabled={busy || alur !== "keluar_saja"}
              required
            />
          </div>
          <div>
            <Label>Provinsi tujuan</Label>
            <Input
              value={tujuan.provinsiTujuan}
              onChange={(e) => updateTujuan("provinsiTujuan", e.target.value)}
              placeholder="Contoh: Bali"
              disabled={busy}
              required
            />
          </div>
          <div>
            <Label>Alasan pindah</Label>
            <Input
              value={tujuan.alasanPindah}
              onChange={(e) => updateTujuan("alasanPindah", e.target.value)}
              disabled={busy}
              required
            />
          </div>
          {alur === "keluar_saja" && (
            <label className="flex items-center gap-2 text-sm text-copper-900 cursor-pointer">
              <input
                type="checkbox"
                className="rounded border-copper-300"
                checked={hapusSetelahSkp}
                onChange={(e) => setHapusSetelahSkp(e.target.checked)}
                disabled={busy}
              />
              Hapus anggota dari Pipil asal setelah SKP
            </label>
          )}
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
          <Button type="submit" icon={FileText} disabled={busy}>
            {busy ? "Menyimpan…" : "Terbitkan SKP & proses"}
          </Button>
        </div>
      </form>
    </Modal>
    <ConfirmDialog
      open={submitConfirmOpen}
      title="Hapus anggota dari Pipil asal?"
      message={submitDeleteMessage}
      error={error}
      busy={busy}
      confirmLabel="Ya, lanjutkan"
      onConfirm={() => void executeSubmit()}
      onCancel={() => {
        if (!busy) {
          setSubmitConfirmOpen(false);
          setError("");
        }
      }}
    />
    </>
  );
}
