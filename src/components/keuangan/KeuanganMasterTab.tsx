import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import {
  createAkunKeuangan,
  createSubAkunKelompok,
  deleteAkunKeuangan,
  formatSubAkunKelompokNama,
  isAkunKelompokRow,
  isAkunKeuanganInti,
  labelAkunKeuanganJenis,
  listAkunKeuanganHierarkis,
  resolveAkunDisplayNama,
  stripSubAkunPrefix,
  updateAkunKeuangan,
} from "../../lib/services/akun-keuangan";
import { createPosBiaya, deletePosBiaya, listPosBiaya, updatePosBiaya } from "../../lib/services/pos-biaya";
import {
  listAlokasiKasDudukan,
  updateAlokasiKasDudukan,
} from "../../lib/services/kas-dudukan-alokasi";
import {
  createPosPemasukan,
  deletePosPemasukan,
  listPosPemasukan,
  updatePosPemasukan,
} from "../../lib/services/pos-pemasukan";
import type { AkunKeuanganJenis, AkunKeuanganRow, KasDudukanAlokasiRow, PosBiayaRow, PosPemasukanRow } from "../../lib/types";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Input, Label, Select } from "../ui/Input";
import { MasterRow } from "../master/MasterRow";
import { MASTER_CARD_PHONE, MASTER_CARD_TITLED } from "../master/master-compact";
import { useIsPhoneClient } from "../../hooks/useClientFormFactor";
import { cn } from "../../lib/utils";

const JENIS_OPTIONS: { value: AkunKeuanganJenis; label: string }[] = [
  { value: "bank", label: "Bank" },
  { value: "ewallet", label: "Dompet digital" },
];

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err).replace(/^Error:\s*/i, "");
}

export function KeuanganMasterTab({ canEdit }: { canEdit: boolean }) {
  const isPhone = useIsPhoneClient();
  const cardClass = cn(MASTER_CARD_TITLED, isPhone && MASTER_CARD_PHONE);
  const formRowClass = cn(
    "flex flex-wrap gap-2 items-end mb-3 pb-3 border-b border-copper-100",
    isPhone && "flex-col items-stretch"
  );
  const actionBtnClass = cn("text-xs", isPhone ? "h-10 w-full" : "h-8");

  const [akun, setAkun] = useState<AkunKeuanganRow[]>([]);
  const [pos, setPos] = useState<PosBiayaRow[]>([]);
  const [posMasuk, setPosMasuk] = useState<PosPemasukanRow[]>([]);
  const [editAkun, setEditAkun] = useState<AkunKeuanganRow | null>(null);
  const [editPos, setEditPos] = useState<PosBiayaRow | null>(null);
  const [editPosMasuk, setEditPosMasuk] = useState<PosPemasukanRow | null>(null);
  const [namaAkun, setNamaAkun] = useState("");
  const [jenisAkun, setJenisAkun] = useState<AkunKeuanganJenis>("bank");
  const [ketAkun, setKetAkun] = useState("");
  const [subKelompokId, setSubKelompokId] = useState("");
  const [subNama, setSubNama] = useState("");
  const [subJenis, setSubJenis] = useState<AkunKeuanganJenis>("bank");
  const [namaPos, setNamaPos] = useState("");
  const [ketPos, setKetPos] = useState("");
  const [namaPosMasuk, setNamaPosMasuk] = useState("");
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{
    kind: "akun" | "pos" | "pos_masuk";
    id: string;
    label: string;
  } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [alokasi, setAlokasi] = useState<KasDudukanAlokasiRow[]>([]);
  const [alokasiDraft, setAlokasiDraft] = useState<{ id: string; persen: number }[]>([]);
  const [alokasiBusy, setAlokasiBusy] = useState(false);

  const alokasiPosIds = useMemo(() => new Set(alokasi.map((a) => a.pos_biaya_id)), [alokasi]);
  const totalPersenAlokasi = alokasiDraft.reduce((s, a) => s + (Number(a.persen) || 0), 0);

  const refresh = useCallback(async () => {
    const rows = await listAkunKeuanganHierarkis(false);
    setAkun(rows);
    setPos(await listPosBiaya(false));
    setPosMasuk(await listPosPemasukan(false));
    const alok = await listAlokasiKasDudukan();
    setAlokasi(alok);
    setAlokasiDraft(alok.map((a) => ({ id: a.id, persen: a.persen })));
    const firstKelompok = rows.find((a) => isAkunKelompokRow(a));
    if (firstKelompok && !subKelompokId) setSubKelompokId(firstKelompok.id);
  }, [subKelompokId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function simpanSubAkun(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit || !subKelompokId) return;
    setError("");
    try {
      await createSubAkunKelompok({
        kelompokId: subKelompokId,
        nama: subNama,
        jenis: subJenis,
        keterangan: ketAkun || undefined,
      });
      setSubNama("");
      setKetAkun("");
      await refresh();
    } catch (err) {
      setError(formatError(err));
    }
  }

  const kelompokAkun = useMemo(() => akun.filter((a) => isAkunKelompokRow(a)), [akun]);

  async function simpanAkunBaru(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setError("");
    try {
      await createAkunKeuangan({ nama: namaAkun, jenis: jenisAkun, keterangan: ketAkun || undefined });
      setNamaAkun("");
      setKetAkun("");
      await refresh();
    } catch (err) {
      setError(formatError(err));
    }
  }

  async function simpanPosBaru(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setError("");
    try {
      await createPosBiaya({ nama: namaPos, keterangan: ketPos || undefined });
      setNamaPos("");
      setKetPos("");
      await refresh();
    } catch (err) {
      setError(formatError(err));
    }
  }

  async function simpanPosMasukBaru(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setError("");
    try {
      await createPosPemasukan({ nama: namaPosMasuk });
      setNamaPosMasuk("");
      await refresh();
    } catch (err) {
      setError(formatError(err));
    }
  }

  async function simpanAlokasi(e: React.FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setAlokasiBusy(true);
    setError("");
    try {
      await updateAlokasiKasDudukan(alokasiDraft);
      await refresh();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setAlokasiBusy(false);
    }
  }

  function openDeleteTarget(target: typeof deleteTarget) {
    setDeleteError("");
    setDeleteTarget(target);
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      if (deleteTarget.kind === "akun") await deleteAkunKeuangan(deleteTarget.id);
      else if (deleteTarget.kind === "pos") await deletePosBiaya(deleteTarget.id);
      else await deletePosPemasukan(deleteTarget.id);
      setDeleteTarget(null);
      setDeleteError("");
      await refresh();
    } catch (err) {
      setDeleteError(formatError(err));
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div
      className={cn(
        "grid gap-4",
        isPhone ? "grid-cols-1" : "lg:grid-cols-2 xl:grid-cols-3"
      )}
    >
      {error && (
        <p
          className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2 lg:col-span-2 xl:col-span-3"
          role="alert"
        >
          {error}
        </p>
      )}

      <Card title="Akun keuangan" className={cardClass}>
        <p className="text-[11px] text-muted mb-2">
          Dana Dudukan dan Dana Paturunan memiliki sub-akun (Tunai, Bank). Induk kelompok hanya untuk ringkasan.
        </p>
        {canEdit && kelompokAkun.length > 0 && (
          <form onSubmit={simpanSubAkun} className={formRowClass}>
            <div className={cn(isPhone ? "w-full" : "w-40")}>
              <Label className="text-[11px]">Kelompok</Label>
              <Select value={subKelompokId} onChange={(e) => setSubKelompokId(e.target.value)} required>
                {kelompokAkun.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.nama}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex-1 min-w-[8rem]">
              <Label className="text-[11px]">Nama sub-akun</Label>
              <Input
                value={subNama}
                onChange={(e) => setSubNama(e.target.value)}
                required
                placeholder="mis. LPD TB Kauh"
              />
              {subKelompokId && subNama.trim() && (
                <div className="mt-1 rounded border border-copper-200 bg-copper-50/80 px-2 py-1 text-[11px] text-copper-900">
                  Disimpan sebagai:{" "}
                  <strong>
                    {formatSubAkunKelompokNama(
                      akun.find((a) => a.id === subKelompokId)?.nama ?? "",
                      subNama
                    )}
                  </strong>
                </div>
              )}
            </div>
            <div className={cn(isPhone ? "w-full" : "w-36")}>
              <Label className="text-[11px]">Jenis</Label>
              <Select value={subJenis} onChange={(e) => setSubJenis(e.target.value as AkunKeuanganJenis)}>
                <option value="bank">Bank</option>
                <option value="ewallet">Dompet digital</option>
              </Select>
            </div>
            <Button type="submit" icon={Plus} className={actionBtnClass}>
              Tambah sub
            </Button>
          </form>
        )}
        {canEdit && (
          <form onSubmit={simpanAkunBaru} className={formRowClass}>
            <div className="flex-1 min-w-[8rem]">
              <Label className="text-[11px]">Akun mandiri (luar kelompok)</Label>
              <Input value={namaAkun} onChange={(e) => setNamaAkun(e.target.value)} required />
            </div>
            <div className={cn(isPhone ? "w-full" : "w-36")}>
              <Label className="text-[11px]">Jenis</Label>
              <Select value={jenisAkun} onChange={(e) => setJenisAkun(e.target.value as AkunKeuanganJenis)}>
                {JENIS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" icon={Plus} className={actionBtnClass}>
              Tambah
            </Button>
          </form>
        )}
        {editAkun && canEdit && (
          <form
            className={cn(
              "mb-3 p-2 rounded border border-copper-200 bg-copper-50/50 space-y-2",
              isPhone && MASTER_CARD_PHONE
            )}
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              try {
                await updateAkunKeuangan(editAkun.id, {
                  nama: editAkun.nama,
                  jenis: editAkun.jenis,
                  keterangan: editAkun.keterangan ?? undefined,
                  aktif: editAkun.aktif === 1,
                });
                setEditAkun(null);
                await refresh();
              } catch (err) {
                setError(formatError(err));
              }
            }}
          >
            <Input
              value={editAkun.nama}
              onChange={(e) => setEditAkun({ ...editAkun, nama: e.target.value })}
            />
            {editAkun.parent_akun_id && (
              <p className="text-[11px] text-copper-800 bg-copper-50 border border-copper-200 rounded px-2 py-1">
                Sub-akun di bawah{" "}
                <strong>{akun.find((p) => p.id === editAkun.parent_akun_id)?.nama ?? "kelompok"}</strong>
                {" — "}
                disimpan sebagai:{" "}
                <strong>
                  {formatSubAkunKelompokNama(
                    akun.find((p) => p.id === editAkun.parent_akun_id)?.nama ?? "",
                    editAkun.nama
                  )}
                </strong>
              </p>
            )}
            <Select
              value={editAkun.jenis}
              disabled={isAkunKelompokRow(editAkun) || (isAkunKeuanganInti(editAkun.jenis) && !!editAkun.parent_akun_id)}
              onChange={(e) =>
                setEditAkun({ ...editAkun, jenis: e.target.value as AkunKeuanganJenis })
              }
            >
              {JENIS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
              {(editAkun.jenis === "kas_dudukan" || editAkun.jenis === "kas_paturunan") && (
                <option value={editAkun.jenis}>{labelAkunKeuanganJenis(editAkun.jenis)} (Tunai)</option>
              )}
            </Select>
            {isAkunKelompokRow(editAkun) ? (
              <p className="text-[11px] text-muted">Akun induk kelompok — jenis dan status aktif tidak dapat diubah.</p>
            ) : isAkunKeuanganInti(editAkun.jenis) && editAkun.parent_akun_id ? (
              <p className="text-[11px] text-muted">Sub tunai — jenis tidak dapat diubah.</p>
            ) : (
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={editAkun.aktif === 1}
                  onChange={(e) => setEditAkun({ ...editAkun, aktif: e.target.checked ? 1 : 0 })}
                />
                Aktif
              </label>
            )}
            <div className="flex gap-2">
              <Button type="submit" className="h-7 text-xs">
                Simpan
              </Button>
              <Button type="button" variant="ghost" className="h-7 text-xs" onClick={() => setEditAkun(null)}>
                Batal
              </Button>
            </div>
          </form>
        )}
        <ul className="text-sm space-y-0.5">
          {akun.map((a) => (
            <MasterRow
              key={a.id}
              label={`${a.parent_akun_id ? "↳ " : ""}${resolveAkunDisplayNama(a, akun)} (${labelAkunKeuanganJenis(a.jenis)})${a.aktif ? "" : " — nonaktif"}${isAkunKelompokRow(a) ? " · induk" : ""}`}
              canEdit={canEdit}
              showDelete={!isAkunKelompokRow(a) && !(isAkunKeuanganInti(a.jenis) && !!a.parent_akun_id)}
              onEdit={() => {
                if (!a.parent_akun_id) {
                  setEditAkun(a);
                  return;
                }
                const parent = akun.find((p) => p.id === a.parent_akun_id);
                setEditAkun({
                  ...a,
                  nama: parent ? stripSubAkunPrefix(parent.nama, a.nama) : a.nama,
                });
              }}
              onDelete={() => openDeleteTarget({ kind: "akun", id: a.id, label: resolveAkunDisplayNama(a, akun) })}
            />
          ))}
        </ul>
      </Card>

      <Card title="Pos biaya" className={cardClass}>
        {canEdit && (
          <form onSubmit={simpanPosBaru} className={formRowClass}>
            <div className="flex-1 min-w-[8rem]">
              <Label className="text-[11px]">Nama pos</Label>
              <Input value={namaPos} onChange={(e) => setNamaPos(e.target.value)} required />
            </div>
            <Button type="submit" icon={Plus} className={actionBtnClass}>
              Tambah
            </Button>
          </form>
        )}
        {editPos && canEdit && (
          <form
            className={cn(
              "mb-3 p-2 rounded border border-copper-200 bg-copper-50/50 space-y-2",
              isPhone && MASTER_CARD_PHONE
            )}
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await updatePosBiaya(editPos.id, {
                  nama: editPos.nama,
                  keterangan: editPos.keterangan ?? undefined,
                  aktif: editPos.aktif === 1,
                });
                setEditPos(null);
                await refresh();
              } catch (err) {
                setError(formatError(err));
              }
            }}
          >
            <Input value={editPos.nama} onChange={(e) => setEditPos({ ...editPos, nama: e.target.value })} />
            {!alokasiPosIds.has(editPos.id) ? (
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={editPos.aktif === 1}
                  onChange={(e) => setEditPos({ ...editPos, aktif: e.target.checked ? 1 : 0 })}
                />
                Aktif
              </label>
            ) : (
              <p className="text-[11px] text-muted">Pos alokasi Dana Dudukan — selalu aktif.</p>
            )}
            <div className="flex gap-2">
              <Button type="submit" className="h-7 text-xs">
                Simpan
              </Button>
              <Button type="button" variant="ghost" className="h-7 text-xs" onClick={() => setEditPos(null)}>
                Batal
              </Button>
            </div>
          </form>
        )}
        <ul className="text-sm space-y-0.5">
          {pos.map((p) => (
            <MasterRow
              key={p.id}
              label={`${p.nama}${p.aktif ? "" : " — nonaktif"}${alokasiPosIds.has(p.id) ? " · alokasi Dana Dudukan" : ""}`}
              canEdit={canEdit}
              showDelete={!alokasiPosIds.has(p.id)}
              onEdit={() => setEditPos(p)}
              onDelete={() => openDeleteTarget({ kind: "pos", id: p.id, label: p.nama })}
            />
          ))}
        </ul>
      </Card>

      <Card title="Pos pemasukan" className={cardClass}>
        <p className="text-[11px] text-muted mb-2">
          Untuk pendapatan pihak ketiga (lembaga, sponsor) di luar paturunan/dudukan krama.
        </p>
        {canEdit && (
          <form onSubmit={simpanPosMasukBaru} className={formRowClass}>
            <div className="flex-1 min-w-[8rem]">
              <Label className="text-[11px]">Nama pos</Label>
              <Input
                value={namaPosMasuk}
                onChange={(e) => setNamaPosMasuk(e.target.value)}
                placeholder="Mis. Donasi lembaga"
                required
              />
            </div>
            <Button type="submit" icon={Plus} className={actionBtnClass}>
              Tambah
            </Button>
          </form>
        )}
        {editPosMasuk && canEdit && (
          <form
            className={cn(
              "mb-3 p-2 rounded border border-copper-200 bg-copper-50/50 space-y-2",
              isPhone && MASTER_CARD_PHONE
            )}
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await updatePosPemasukan(editPosMasuk.id, {
                  nama: editPosMasuk.nama,
                  keterangan: editPosMasuk.keterangan ?? undefined,
                  aktif: editPosMasuk.aktif === 1,
                });
                setEditPosMasuk(null);
                await refresh();
              } catch (err) {
                setError(formatError(err));
              }
            }}
          >
            <Input
              value={editPosMasuk.nama}
              onChange={(e) => setEditPosMasuk({ ...editPosMasuk, nama: e.target.value })}
            />
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={editPosMasuk.aktif === 1}
                onChange={(e) =>
                  setEditPosMasuk({ ...editPosMasuk, aktif: e.target.checked ? 1 : 0 })
                }
              />
              Aktif
            </label>
            <div className="flex gap-2">
              <Button type="submit" className="h-7 text-xs">
                Simpan
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => setEditPosMasuk(null)}
              >
                Batal
              </Button>
            </div>
          </form>
        )}
        <ul className="text-sm space-y-0.5">
          {posMasuk.map((p) => (
            <MasterRow
              key={p.id}
              label={`${p.nama}${p.aktif ? "" : " — nonaktif"}`}
              canEdit={canEdit}
              onEdit={() => setEditPosMasuk(p)}
              onDelete={() =>
                openDeleteTarget({ kind: "pos_masuk", id: p.id, label: p.nama })
              }
            />
          ))}
        </ul>
      </Card>

      <Card
        title="Alokasi pengeluaran Dana Dudukan"
        className={cn(cardClass, !isPhone && "lg:col-span-2 xl:col-span-3")}
      >
        <p className="text-[11px] text-muted mb-3">
          Plafon per pos dihitung dari total penerimaan dudukan per tahun kalender × persentase. Total
          persentase harus 100%.
        </p>
        {canEdit ? (
          <form onSubmit={simpanAlokasi} className="space-y-3">
            {isPhone ? (
              <ul className="space-y-2">
                {alokasi.map((a) => {
                  const draft = alokasiDraft.find((d) => d.id === a.id);
                  return (
                    <li
                      key={a.id}
                      className="rounded-lg border border-copper-200 bg-copper-50/40 px-3 py-2.5 space-y-2"
                    >
                      <p className="text-sm font-medium text-copper-950">{a.pos_biaya_nama}</p>
                      <div>
                        <Label className="text-xs">Persentase (%)</Label>
                        <Input
                          type="number"
                          min={0.01}
                          max={100}
                          step={0.01}
                          value={draft?.persen ?? a.persen}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            setAlokasiDraft((prev) =>
                              prev.map((d) => (d.id === a.id ? { ...d, persen: v } : d))
                            );
                          }}
                          required
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted border-b border-copper-200">
                      <th className="pr-3 py-1">Pos biaya</th>
                      <th className="py-1 w-28">Persentase (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alokasi.map((a) => {
                      const draft = alokasiDraft.find((d) => d.id === a.id);
                      return (
                        <tr key={a.id} className="border-b border-copper-100">
                          <td className="pr-3 py-2">{a.pos_biaya_nama}</td>
                          <td className="py-2">
                            <Input
                              type="number"
                              min={0.01}
                              max={100}
                              step={0.01}
                              className="h-8 text-sm"
                              value={draft?.persen ?? a.persen}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                setAlokasiDraft((prev) =>
                                  prev.map((d) => (d.id === a.id ? { ...d, persen: v } : d))
                                );
                              }}
                              required
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className={cn("flex flex-wrap items-center gap-3", isPhone && "flex-col items-stretch")}>
              <span
                className={`text-xs font-medium ${Math.abs(totalPersenAlokasi - 100) < 0.001 ? "text-emerald-800" : "text-red-700"}`}
              >
                Total: {totalPersenAlokasi}%
              </span>
              <Button
                type="submit"
                disabled={alokasiBusy || Math.abs(totalPersenAlokasi - 100) > 0.001}
                className={actionBtnClass}
              >
                {alokasiBusy ? "Menyimpan…" : "Simpan alokasi"}
              </Button>
            </div>
          </form>
        ) : (
          <ul className="text-sm space-y-1">
            {alokasi.map((a) => (
              <li key={a.id}>
                {a.pos_biaya_nama}: <strong>{a.persen}%</strong>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={deleteTarget != null}
        title="Hapus data master?"
        message={deleteTarget ? `Yakin hapus «${deleteTarget.label}»? Tindakan ini tidak dapat dibatalkan.` : ""}
        error={deleteError}
        confirmLabel="Ya, hapus"
        busy={deleteBusy}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => {
          if (!deleteBusy) {
            setDeleteTarget(null);
            setDeleteError("");
          }
        }}
      />
    </div>
  );
}
