import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createPembayaranDenganAlokasi,
  deletePembayaranPaturunan,
  listPembayaranPaturunan,
  updatePembayaranPaturunan,
} from "../../lib/services/paturunan-pembayaran";
import {
  getDefaultAkunPaturunanId,
  listAkunForPembayaranPaturunan,
  akunPembayaranOptionLabel,
} from "../../lib/services/akun-keuangan";
import { normalizeTanggalIsoForInput } from "../../lib/date-iso";
import {
  alokasiPembayaranBaru,
  formatRupiah,
  formatStatusBayarPaturunan,
  hitungSisaPaturunan,
} from "../../lib/paturunan-hitung";
import type { RupiahInputValue } from "../../lib/rupiah-input";
import type {
  PaturunanPembayaranJenis,
  PaturunanPembayaranRow,
} from "../../lib/types";
import { cn, formatTanggalLahir, today } from "../../lib/utils";
import { Button } from "../ui/Button";
import { DateInput } from "../ui/DateInput";
import { Input, Label, Select } from "../ui/Input";
import { RupiahInput } from "../ui/RupiahInput";
import { Modal } from "../ui/Modal";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import {
  completePembayaranBaruSave,
  PembayaranDialogTabs,
  StatMini,
  usePembayaranAkunDanPetugas,
  ZoneHeading,
} from "../pembayaran/pembayaran-dialog-shared";
import {
  PATURUNAN_BAYAR_DIALOG,
  PATURUNAN_DIALOG_ZONE_BAYAR,
  PATURUNAN_DIALOG_ZONE_RIWAYAT,
} from "./paturunan-compact";
import { Check, Pencil, Trash2, X } from "lucide-react";

function JenisBadge({ jenis }: { jenis: PaturunanPembayaranJenis }) {
  return (
    <span
      className={cn(
        "inline-block text-[10px] font-medium px-1 rounded mr-0.5",
        jenis === "punia"
          ? "bg-violet-100 text-violet-900"
          : "bg-copper-100 text-copper-800"
      )}
    >
      {jenis === "punia" ? "Punia" : "Wajib"}
    </span>
  );
}

export function PaturunanPembayaranDialog({
  open,
  onClose,
  onSuccess,
  onSaved,
  canEdit,
  canDeleteFinancial = false,
  kramaId,
  iuranId,
  nomorKartu,
  kepalaNama,
  banjarId,
  banjarNama,
  tempekNama,
  arahanNama,
  tagihan,
  initialTab = "bayar",
  initialEditingPaymentId = null,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onSaved?: (message: string) => void;
  canEdit: boolean;
  canDeleteFinancial?: boolean;
  kramaId: string;
  iuranId: string;
  nomorKartu: string;
  kepalaNama: string;
  banjarId: string;
  banjarNama: string;
  tempekNama?: string | null;
  arahanNama?: string | null;
  tagihan: number;
  initialTab?: "bayar" | "riwayat";
  initialEditingPaymentId?: string | null;
}) {
  const [riwayat, setRiwayat] = useState<PaturunanPembayaranRow[]>([]);
  const {
    petugasList,
    akunList,
    akunLabelCtx,
    petugasId,
    setPetugasId,
    akunKeuanganId,
    setAkunKeuanganId,
  } = usePembayaranAkunDanPetugas({
    open,
    banjarId,
    listAkunTransaksional: listAkunForPembayaranPaturunan,
    getDefaultAkunId: getDefaultAkunPaturunanId,
  });
  const [jumlah, setJumlah] = useState<RupiahInputValue>("");
  const [tanggal, setTanggal] = useState(today());
  const [keterangan, setKeterangan] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editJenis, setEditJenis] = useState<PaturunanPembayaranJenis>("wajib");
  const [editJumlah, setEditJumlah] = useState<RupiahInputValue>("");
  const [editTanggal, setEditTanggal] = useState("");
  const [editPetugasId, setEditPetugasId] = useState("");
  const [editAkunKeuanganId, setEditAkunKeuanganId] = useState("");
  const [editKeterangan, setEditKeterangan] = useState("");
  const [tab, setTab] = useState<"bayar" | "riwayat">("bayar");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const dibayarWajib = riwayat
    .filter((p) => p.jenis === "wajib")
    .reduce((sum, p) => sum + (Number(p.jumlah) || 0), 0);
  const punia = riwayat
    .filter((p) => p.jenis === "punia")
    .reduce((sum, p) => sum + (Number(p.jumlah) || 0), 0);
  const sisaWajib = hitungSisaPaturunan(tagihan, dibayarWajib);
  const puniaOnly = tagihan <= 0;

  const preview = useMemo(() => {
    const n = jumlah === "" ? 0 : jumlah;
    if (!Number.isFinite(n) || n <= 0) return null;
    try {
      return alokasiPembayaranBaru(tagihan, dibayarWajib, n);
    } catch {
      return null;
    }
  }, [jumlah, tagihan, dibayarWajib]);

  const loadRiwayat = useCallback(async () => {
    if (!open || !kramaId || !iuranId) return;
    setRiwayat(await listPembayaranPaturunan(kramaId, iuranId));
  }, [open, kramaId, iuranId]);

  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setJumlah("");
      setTanggal(today());
      setPetugasId("");
      setKeterangan("");
      setError("");
      setEditingId(null);
      void loadRiwayat();
    }
  }, [open, loadRiwayat, initialTab, setPetugasId]);

  const appliedEditIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      appliedEditIdRef.current = null;
      return;
    }
    if (!initialEditingPaymentId || !canEdit) return;
    if (appliedEditIdRef.current === initialEditingPaymentId) return;
    const row = riwayat.find((p) => p.id === initialEditingPaymentId);
    if (!row) return;
    appliedEditIdRef.current = initialEditingPaymentId;
    setTab("riwayat");
    mulaiEdit(row);
  }, [open, initialEditingPaymentId, canEdit, riwayat]);

  function mulaiEdit(p: PaturunanPembayaranRow) {
    setTab("riwayat");
    setEditingId(p.id);
    setEditJenis(p.jenis);
    setEditJumlah(Math.round(Number(p.jumlah) || 0));
    setEditTanggal(normalizeTanggalIsoForInput(p.tanggal));
    setEditPetugasId(p.petugas_id ?? "");
    setEditAkunKeuanganId(p.akun_keuangan_id ?? akunKeuanganId);
    setEditKeterangan(p.keterangan ?? "");
    setError("");
  }

  function batalEdit() {
    setEditingId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    if (!petugasId) {
      setError("Petugas wajib dipilih");
      return;
    }
    if (!akunKeuanganId) {
      setError("Akun penerimaan wajib dipilih");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await createPembayaranDenganAlokasi({
        kramaId,
        iuranId,
        jumlah: jumlah === "" ? 0 : jumlah,
        tanggal,
        tagihan,
        petugasId,
        akunKeuanganId,
        keterangan: keterangan || undefined,
      });
      setJumlah("");
      setKeterangan("");
      completePembayaranBaruSave("Pembayaran paturunan berhasil disimpan.", {
        onSuccess,
        onClose,
        onSaved,
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleSimpanEdit(e: React.FormEvent, id: string) {
    e.preventDefault();
    if (!canEdit) return;
    if (!editPetugasId) {
      setError("Petugas wajib dipilih");
      return;
    }
    if (!editAkunKeuanganId) {
      setError("Akun penerimaan wajib dipilih");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await updatePembayaranPaturunan(id, {
        kramaId,
        jenis: editJenis,
        jumlah: editJumlah === "" ? 0 : editJumlah,
        tanggal: editTanggal,
        petugasId: editPetugasId,
        akunKeuanganId: editAkunKeuanganId,
        keterangan: editKeterangan || undefined,
      });
      batalEdit();
      await loadRiwayat();
      onSuccess();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  function requestHapus(id: string) {
    if (!canDeleteFinancial) return;
    setDeleteId(id);
  }

  async function confirmHapus() {
    if (!deleteId || !canDeleteFinancial) return;
    setDeleteBusy(true);
    setError("");
    try {
      if (editingId === deleteId) batalEdit();
      await deletePembayaranPaturunan(deleteId);
      setDeleteId(null);
      await loadRiwayat();
      onSuccess();
    } catch (err) {
      setError(String(err));
    } finally {
      setDeleteBusy(false);
    }
  }

  function isiSisa() {
    if (sisaWajib > 0) setJumlah(sisaWajib);
  }

  const formJudul = puniaOnly
    ? "Tambah Punia"
    : sisaWajib > 0
      ? "Tambah pembayaran"
      : "Tambah Punia";

  const petugasOptions = (
    <>
      <option value="">Pilih petugas</option>
      {petugasList.map((p) => (
        <option key={p.id} value={p.id}>
          {p.nama} ({p.jabatan})
        </option>
      ))}
    </>
  );

  const akunOptions = (
    <>
      <option value="">Pilih akun</option>
      {akunList.map((a) => (
        <option key={a.id} value={a.id}>
          {akunPembayaranOptionLabel(a, akunLabelCtx)}
        </option>
      ))}
    </>
  );

  return (
    <>
    <Modal
      open={open}
      title="Pembayaran Paturunan"
      onClose={onClose}
      className="[&>div:last-child]:p-2 [&>div:last-child]:max-h-[min(78vh,640px)] [&>div:first-child]:py-2 [&_h3]:text-sm max-w-xl"
    >
      <div className={PATURUNAN_BAYAR_DIALOG}>
        <div className="rounded border border-copper-200 bg-copper-50/50 px-2 py-1.5 space-y-0.5">
          <p className="font-mono text-[11px] text-copper-700">{nomorKartu}</p>
          <p className="text-base font-semibold text-copper-950 leading-snug">{kepalaNama}</p>
          <p className="text-[11px] text-copper-800 leading-snug flex flex-wrap gap-x-2 gap-y-0.5">
            <span>
              <span className="text-muted">Banjar</span> {banjarNama.trim() || "—"}
            </span>
            <span className="text-copper-300 hidden sm:inline">·</span>
            <span>
              <span className="text-muted">Tempek</span> {tempekNama?.trim() || "—"}
            </span>
            <span className="text-copper-300 hidden sm:inline">·</span>
            <span>
              <span className="text-muted">Arahan</span> {arahanNama?.trim() || "—"}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-x-3 gap-y-1 rounded border border-copper-200 bg-copper-50/60 px-2 py-1.5">
          <StatMini
            label="Tagihan"
            value={tagihan > 0 ? formatRupiah(tagihan) : "—"}
            compact
          />
          <StatMini
            label="Wajib"
            value={tagihan > 0 ? formatRupiah(dibayarWajib) : "—"}
            className="text-copper-800"
            compact
          />
          <StatMini
            label="Punia"
            value={punia > 0 ? formatRupiah(punia) : "—"}
            className="text-violet-900"
            compact
          />
          <StatMini
            label="Sisa"
            value={tagihan > 0 ? formatRupiah(sisaWajib) : "—"}
            className={sisaWajib > 0 ? "text-amber-900" : "text-copper-800"}
            compact
          />
          <span className="text-[10px] text-muted ml-auto">
            {formatStatusBayarPaturunan(tagihan, dibayarWajib, punia)}
            {(dibayarWajib > 0 || punia > 0) && (
              <> · kas {formatRupiah(dibayarWajib + punia)}</>
            )}
          </span>
        </div>

        <PembayaranDialogTabs tab={tab} onTabChange={setTab} riwayatCount={riwayat.length} />

        {tab === "bayar" && (
          <section className={PATURUNAN_DIALOG_ZONE_BAYAR} aria-label="Wilayah bayar">
            <ZoneHeading
              title="Wilayah bayar"
              hint={
                puniaOnly
                  ? "Iuran tanpa tagihan wajib — catat punia di sini."
                  : sisaWajib > 0
                    ? "Isi nominal pembayaran; alokasi wajib dan punia otomatis."
                    : "Tagihan wajib lunas — pembayaran baru masuk sebagai punia."
              }
            />

            {canEdit ? (
              <form onSubmit={handleSubmit} className="space-y-1.5">
                <p className="font-medium text-copper-900 text-sm">{formJudul}</p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  <div>
                    <Label>Jumlah</Label>
                    <RupiahInput value={jumlah} onChange={setJumlah} required />
                  </div>
                  <div>
                    <Label>Tanggal</Label>
                    <DateInput value={tanggal} onChange={setTanggal} required />
                  </div>
                  <div>
                    <Label>Petugas</Label>
                    <Select
                      value={petugasId}
                      onChange={(e) => setPetugasId(e.target.value)}
                      required
                      disabled={petugasList.length === 0}
                    >
                      {petugasOptions}
                    </Select>
                  </div>
                  <div>
                    <Label>Diterima di</Label>
                    <Select
                      value={akunKeuanganId}
                      onChange={(e) => setAkunKeuanganId(e.target.value)}
                      required
                      disabled={akunList.length === 0}
                    >
                      {akunOptions}
                    </Select>
                  </div>
                </div>
                {petugasList.length === 0 && (
                  <p className="text-xs text-amber-800 leading-tight">
                    Belum ada petugas di banjar {banjarNama}. Tambahkan di Master → Tim Kasukretan.
                  </p>
                )}
                {akunList.length === 0 && (
                  <p className="text-xs text-amber-800 leading-tight">
                    Belum ada akun keuangan. Tambahkan di Master → Akun & Pos.
                  </p>
                )}
                <Input
                  placeholder="Keterangan (opsional)"
                  value={keterangan}
                  onChange={(e) => setKeterangan(e.target.value)}
                />
                {preview && (preview.wajib > 0 || preview.punia > 0) && (
                  <p className="text-xs text-copper-800 bg-white border border-copper-200 rounded px-1.5 py-0.5 leading-tight">
                    {preview.wajib > 0 && (
                      <span>
                        Wajib <strong>{formatRupiah(preview.wajib)}</strong>
                      </span>
                    )}
                    {preview.wajib > 0 && preview.punia > 0 && " · "}
                    {preview.punia > 0 && (
                      <span>
                        Punia <strong>{formatRupiah(preview.punia)}</strong>
                      </span>
                    )}
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {sisaWajib > 0 && (
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-8 text-xs px-2"
                      onClick={isiSisa}
                    >
                      Isi sisa ({formatRupiah(sisaWajib)})
                    </Button>
                  )}
                  <Button
                    type="submit"
                    disabled={loading || petugasList.length === 0 || akunList.length === 0}
                    className="h-8 text-sm flex-1"
                  >
                    {loading ? "Menyimpan…" : "Simpan pembayaran"}
                  </Button>
                </div>
              </form>
            ) : (
              <p className="text-xs text-muted leading-tight">
                Anda tidak memiliki izin untuk mencatat pembayaran baru.
              </p>
            )}

            {canEdit && tagihan > 0 && sisaWajib <= 0 && !puniaOnly && (
              <p className="text-xs text-green-800 leading-tight">
                Tagihan wajib sudah lunas. Pembayaran baru akan dicatat sebagai punia.
              </p>
            )}
          </section>
        )}

        {tab === "riwayat" && (
          <section className={PATURUNAN_DIALOG_ZONE_RIWAYAT} aria-label="Riwayat">
            <ZoneHeading
              title="Riwayat"
              hint="Data tercatat — ubah atau hapus di sini, bukan menambah uang masuk baru."
              tone="riwayat"
            />
            {riwayat.length === 0 ? (
              <p className="text-muted text-sm leading-tight">Belum ada pembayaran.</p>
            ) : (
              <ul className="divide-y divide-copper-100 max-h-[min(50vh,280px)] overflow-y-auto pr-0.5">
                {riwayat.map((p) =>
                  editingId === p.id ? (
                    <li
                      key={p.id}
                      className="p-1 rounded border border-copper-200 bg-copper-50/80 space-y-1"
                    >
                      <form onSubmit={(e) => handleSimpanEdit(e, p.id)} className="space-y-1">
                        <div className="grid gap-1 sm:grid-cols-2">
                          <div>
                            <Label>Jenis</Label>
                            <Select
                              value={editJenis}
                              onChange={(e) =>
                                setEditJenis(e.target.value as PaturunanPembayaranJenis)
                              }
                            >
                              <option value="wajib">Wajib</option>
                              <option value="punia">Punia</option>
                            </Select>
                          </div>
                          <div>
                            <Label>Jumlah</Label>
                            <RupiahInput value={editJumlah} onChange={setEditJumlah} required />
                          </div>
                          <div>
                            <Label>Tanggal</Label>
                            <DateInput value={editTanggal} onChange={setEditTanggal} required />
                          </div>
                          <div>
                            <Label>Petugas</Label>
                            <Select
                              value={editPetugasId}
                              onChange={(e) => setEditPetugasId(e.target.value)}
                              required
                            >
                              {petugasOptions}
                            </Select>
                          </div>
                          <div className="sm:col-span-2">
                            <Label>Diterima di</Label>
                            <Select
                              value={editAkunKeuanganId}
                              onChange={(e) => setEditAkunKeuanganId(e.target.value)}
                              required
                            >
                              {akunOptions}
                            </Select>
                          </div>
                        </div>
                        <Input
                          placeholder="Keterangan"
                          value={editKeterangan}
                          onChange={(e) => setEditKeterangan(e.target.value)}
                        />
                        <div className="flex gap-1">
                          <Button
                            type="submit"
                            icon={Check}
                            className="h-8 text-sm flex-1"
                            disabled={loading}
                          >
                            Simpan
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            icon={X}
                            className="h-8 text-sm"
                            onClick={batalEdit}
                            disabled={loading}
                          >
                            Batal
                          </Button>
                        </div>
                      </form>
                    </li>
                  ) : (
                    <li
                      key={p.id}
                      className="flex items-start justify-between gap-1 py-px text-sm leading-tight"
                    >
                      <span className="min-w-0 leading-tight">
                        <JenisBadge jenis={p.jenis} />
                        <span className="font-medium tabular-nums">
                          {formatRupiah(Number(p.jumlah))}
                        </span>
                        <span className="text-muted mx-0.5">·</span>
                        {formatTanggalLahir(p.tanggal)}
                        {p.akun_keuangan_nama ? (
                          <span className="text-muted"> · {p.akun_keuangan_nama}</span>
                        ) : null}
                        {p.petugas_nama ? (
                          <span className="text-muted">
                            {" "}
                            · {p.petugas_nama}
                            {p.petugas_jabatan ? ` (${p.petugas_jabatan})` : ""}
                          </span>
                        ) : null}
                        {p.keterangan ? (
                          <span className="text-muted block truncate">{p.keterangan}</span>
                        ) : null}
                      </span>
                      {canEdit && (
                        <span className="flex shrink-0">
                          <Button
                            type="button"
                            variant="ghost"
                            icon={Pencil}
                            iconOnly
                            title="Ubah"
                            className="min-h-8 min-w-8"
                            onClick={() => mulaiEdit(p)}
                          />
                          {canDeleteFinancial && (
                          <Button
                            type="button"
                            variant="ghost"
                            icon={Trash2}
                            iconOnly
                            title="Hapus"
                            className="min-h-8 min-w-8"
                            onClick={() => requestHapus(p.id)}
                          />
                          )}
                        </span>
                      )}
                    </li>
                  )
                )}
              </ul>
            )}
          </section>
        )}

        {error && <p className="text-red-600 text-sm leading-tight">{error}</p>}

        <div className="flex justify-end pt-1 border-t border-copper-100">
          <Button type="button" variant="secondary" className="h-8 text-sm" onClick={onClose}>
            Tutup
          </Button>
        </div>
      </div>
    </Modal>

    <ConfirmDialog
      open={deleteId != null}
      title="Hapus pembayaran paturunan?"
      message={
        deleteId
          ? (() => {
              const p = riwayat.find((x) => x.id === deleteId);
              return p
                ? `Hapus pembayaran ${formatRupiah(Number(p.jumlah))} (${p.jenis === "punia" ? "Punia" : "Wajib"})? Sisa tagihan paturunan akan disesuaikan.`
                : "Hapus pembayaran ini? Sisa tagihan paturunan akan disesuaikan.";
            })()
          : ""
      }
      confirmLabel="Ya, hapus"
      busy={deleteBusy}
      onConfirm={() => void confirmHapus()}
      onCancel={() => {
        if (!deleteBusy) setDeleteId(null);
      }}
    />
    </>
  );
}
