import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { clampPage, LIST_PAGE_SIZE } from "../lib/pagination";
import { Eye, FileSpreadsheet, List, Pencil, RotateCcw, Trash2, UserCheck, UserX } from "lucide-react";
import { isKramaNyada } from "../lib/nyada-ketentuan";
import {
  ALASAN_TIDAK_AKTIF_OPTIONS,
  formatAlasanTidakAktif,
  type AlasanTidakAktifKode,
} from "../lib/krama-status";
import { getDesaAdat } from "../lib/services/desa";
import { countKrama, deleteKrama, listKrama, reaktivasiKrama } from "../lib/services/krama";
import { listBanjar } from "../lib/services/master";
import { kramaEditPath } from "../lib/krama-routes";
import type { Banjar, DesaAdat, KlasifikasiKode, KramaListItem } from "../lib/types";
import { cn, formatTanggalLahir, hitungUmur } from "../lib/utils";
import { useAuth } from "../context/AuthContext";
import { canDeleteKrama, canEditKrama } from "../lib/auth-roles";
import { Button } from "../components/ui/Button";
import { IconLink } from "../components/ui/IconLink";
import { Input, Select, Label } from "../components/ui/Input";
import { Card } from "../components/ui/Card";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { ListPagination } from "../components/ui/ListPagination";
import {
  LIST_BODY_ROW,
  LIST_CARD,
  LIST_FILTER_GRID,
  LIST_FILTER_ROW,
  LIST_HEAD_ROW,
  LIST_PAGE,
  LIST_TABLE,
  LIST_TABLE_ELEMENT,
} from "../components/ui/list-compact";
import { AnggotaImportExportPanel } from "../components/krama/AnggotaImportExportPanel";
import { KramaImportExportPanel } from "../components/krama/KramaImportExportPanel";
import { PemasihAnggotaImportExportPanel } from "../components/krama/PemasihAnggotaImportExportPanel";
import { PemasihImportExportPanel } from "../components/krama/PemasihImportExportPanel";
import { downloadPemasihExport } from "../lib/import/pemasih-template";

type ListTab = "aktif" | "nonaktif";
type PageTab = "daftar" | "impor";

export function KramaListPage({
  title,
  basePath,
  fixedKlasifikasi,
  klasifikasiIn,
  showKlasifikasiFilter = false,
  newActions,
}: {
  title: string;
  basePath: string;
  fixedKlasifikasi?: KlasifikasiKode;
  klasifikasiIn?: KlasifikasiKode[];
  showKlasifikasiFilter?: boolean;
  newActions: ReactNode;
}) {
  const [rows, setRows] = useState<KramaListItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [nonaktifRingkasan, setNonaktifRingkasan] = useState({
    meninggal: 0,
    pindah: 0,
    total: 0,
  });
  const [banjar, setBanjar] = useState<Banjar[]>([]);
  const [desa, setDesa] = useState<DesaAdat | null>(null);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [klasifikasi, setKlasifikasi] = useState("");
  const [banjarId, setBanjarId] = useState("");
  const [listTab, setListTab] = useState<ListTab>("aktif");
  const [pageTab, setPageTab] = useState<PageTab>("daftar");
  const [alasanFilter, setAlasanFilter] = useState("");
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<KramaListItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(LIST_PAGE_SIZE);
  const [importFlash, setImportFlash] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null
  );
  const [exportBusy, setExportBusy] = useState(false);
  const { user } = useAuth();
  const canEdit = canEditKrama(user?.peran);
  const allowDeleteKrama = canDeleteKrama(user?.peran);
  const isMipilList = fixedKlasifikasi === "MIPIL";
  const isPemasihList = !fixedKlasifikasi && Boolean(klasifikasiIn?.length);
  const isNonaktifTab = listTab === "nonaktif";

  const safePage = useMemo(
    () => clampPage(page, totalItems, pageSize),
    [page, totalItems, pageSize]
  );
  const pagedRows = rows;

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, klasifikasi, banjarId, alasanFilter, listTab]);

  const listFilter = useMemo(() => {
    const filterKode = klasifikasi ? (klasifikasi as KlasifikasiKode) : undefined;
    const alasan =
      isNonaktifTab && alasanFilter
        ? (alasanFilter as AlasanTidakAktifKode)
        : undefined;
    return {
      q: debouncedQ || undefined,
      klasifikasi: fixedKlasifikasi ?? filterKode,
      klasifikasiIn: fixedKlasifikasi || filterKode ? undefined : klasifikasiIn,
      banjarId: banjarId || undefined,
      statusKrama: listTab,
      alasanTidakAktif: alasan,
    };
  }, [
    debouncedQ,
    klasifikasi,
    banjarId,
    alasanFilter,
    listTab,
    isNonaktifTab,
    fixedKlasifikasi,
    klasifikasiIn,
  ]);

  const load = useCallback(async () => {
    const offset = (Math.max(1, page) - 1) * pageSize;
    const [pageRows, total] = await Promise.all([
      listKrama({
        ...listFilter,
        limit: pageSize,
        offset,
      }),
      countKrama(listFilter),
    ]);
    setRows(pageRows);
    setTotalItems(total);

    if (isNonaktifTab && !alasanFilter) {
      const base = { ...listFilter, alasanTidakAktif: undefined };
      const [meninggal, pindah] = await Promise.all([
        countKrama({ ...base, alasanTidakAktif: "meninggal" }),
        countKrama({ ...base, alasanTidakAktif: "pindah" }),
      ]);
      setNonaktifRingkasan({ meninggal, pindah, total });
    } else if (isNonaktifTab) {
      setNonaktifRingkasan({
        meninggal: alasanFilter === "meninggal" ? total : 0,
        pindah: alasanFilter === "pindah" ? total : 0,
        total,
      });
    }
  }, [listFilter, page, pageSize, isNonaktifTab, alasanFilter]);

  useEffect(() => {
    let cancelled = false;
    void load().catch((e) => {
      if (!cancelled) console.error(e);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    listBanjar().then(setBanjar);
    if (isMipilList) getDesaAdat().then(setDesa);
  }, [isMipilList]);

  function switchTab(tab: ListTab) {
    setListTab(tab);
    setPage(1);
    if (tab === "aktif") setAlasanFilter("");
  }

  function requestDelete(r: KramaListItem) {
    if (!allowDeleteKrama) return;
    setDeleteTarget(r);
  }

  async function handleConfirmDelete() {
    if (!deleteTarget || !allowDeleteKrama) return;
    setDeleteBusy(true);
    try {
      await deleteKrama(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menghapus krama");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function handleReaktivasi(r: KramaListItem) {
    const label = isMipilList ? "pipil" : isPemasihList ? "pemasih" : "kartu";
    if (
      !confirm(
        `Aktifkan kembali ${label} ${r.nomor_kartu}? Status Pipil/Pemasih akan disesuaikan menurut masa berlaku.`
      )
    ) {
      return;
    }
    setReactivatingId(r.id);
    try {
      await reaktivasiKrama(r.id);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal mengaktifkan kembali");
    } finally {
      setReactivatingId(null);
    }
  }

  const showImportTab = isMipilList || isPemasihList;

  async function handleExportPemasih() {
    if (!isPemasihList) return;
    setExportBusy(true);
    try {
      const filterKode = klasifikasi ? (klasifikasi as KlasifikasiKode) : undefined;
      const alasan =
        isNonaktifTab && alasanFilter
          ? (alasanFilter as AlasanTidakAktifKode)
          : undefined;
      const exportRows = await listKrama({
        q: debouncedQ || undefined,
        klasifikasi: filterKode,
        klasifikasiIn: filterKode ? undefined : klasifikasiIn,
        banjarId: banjarId || undefined,
        statusKrama: listTab,
        alasanTidakAktif: alasan,
      });
      if (!exportRows.length) {
        alert("Tidak ada data untuk diekspor");
        return;
      }
      await downloadPemasihExport({
        kramaIds: exportRows.map((r) => r.id),
        statusKrama: listTab,
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal mengekspor");
    } finally {
      setExportBusy(false);
    }
  }

  return (
    <div className={cn(LIST_PAGE, "w-full max-w-full")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl sm:text-2xl font-bold min-w-0">{title}</h2>
        {pageTab === "daftar" && !isNonaktifTab && (
          <div className="flex flex-wrap gap-2">{newActions}</div>
        )}
      </div>

      {showImportTab && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant={pageTab === "daftar" ? "primary" : "secondary"}
            icon={List}
            type="button"
            onClick={() => setPageTab("daftar")}
          >
            Daftar
          </Button>
          <Button
            variant={pageTab === "impor" ? "primary" : "secondary"}
            icon={FileSpreadsheet}
            type="button"
            onClick={() => setPageTab("impor")}
          >
            Impor/Ekspor
          </Button>
        </div>
      )}

      {showImportTab && pageTab === "impor" && (
        <div className="space-y-3">
          {importFlash && (
            <p
              className={cn(
                "text-sm rounded-lg px-4 py-1.5 border leading-snug",
                importFlash.kind === "ok"
                  ? "text-copper-900 bg-copper-100 border-copper-300"
                  : "text-red-600 bg-red-50 border-red-100"
              )}
            >
              {importFlash.text}
            </p>
          )}
          {isMipilList ? (
            <>
              <KramaImportExportPanel
                canEdit={canEdit}
                alwaysOpen
                onRefresh={load}
                onSaved={(msg) => {
                  setImportFlash({ kind: "ok", text: msg });
                  setTimeout(() => setImportFlash(null), 4000);
                }}
                onError={(msg) => {
                  setImportFlash({ kind: "err", text: msg });
                }}
              />
              <AnggotaImportExportPanel
                canEdit={canEdit}
                alwaysOpen
                onRefresh={load}
                onSaved={(msg) => {
                  setImportFlash({ kind: "ok", text: msg });
                  setTimeout(() => setImportFlash(null), 4000);
                }}
                onError={(msg) => {
                  setImportFlash({ kind: "err", text: msg });
                }}
              />
            </>
          ) : (
            <>
              <PemasihImportExportPanel
                canEdit={canEdit}
                alwaysOpen
                onRefresh={load}
                onSaved={(msg) => {
                  setImportFlash({ kind: "ok", text: msg });
                  setTimeout(() => setImportFlash(null), 4000);
                }}
                onError={(msg) => {
                  setImportFlash({ kind: "err", text: msg });
                }}
              />
              <PemasihAnggotaImportExportPanel
                canEdit={canEdit}
                alwaysOpen
                onRefresh={load}
                onSaved={(msg) => {
                  setImportFlash({ kind: "ok", text: msg });
                  setTimeout(() => setImportFlash(null), 4000);
                }}
                onError={(msg) => {
                  setImportFlash({ kind: "err", text: msg });
                }}
              />
            </>
          )}
        </div>
      )}

      {(!showImportTab || pageTab === "daftar") && (
        <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={listTab === "aktif" ? "primary" : "secondary"}
          icon={UserCheck}
          type="button"
          onClick={() => switchTab("aktif")}
        >
          Krama Aktif
        </Button>
        <Button
          variant={listTab === "nonaktif" ? "primary" : "secondary"}
          icon={UserX}
          type="button"
          onClick={() => switchTab("nonaktif")}
        >
          Krama Nonaktif
        </Button>
        {isPemasihList && (
          <Button
            variant="secondary"
            icon={FileSpreadsheet}
            type="button"
            className="h-9 text-xs"
            disabled={exportBusy || totalItems === 0}
            onClick={() => void handleExportPemasih()}
          >
            Ekspor Excel
          </Button>
        )}
      </div>

      {isNonaktifTab && nonaktifRingkasan.total > 0 && (
        <p className="text-xs text-muted leading-snug">
          Ringkasan (hasil filter):{" "}
          <strong>{nonaktifRingkasan.meninggal}</strong> meninggal,{" "}
          <strong>{nonaktifRingkasan.pindah}</strong> pindah — total{" "}
          <strong>{nonaktifRingkasan.total}</strong> krama
        </p>
      )}

      <Card compact className={cn(LIST_CARD, LIST_TABLE)}>
        <div className={LIST_FILTER_ROW}>
          <div className={cn(LIST_FILTER_GRID, "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4")}>
            <div className="min-w-0 sm:col-span-2">
              <Label>Cari</Label>
              <Input
                placeholder={
                  isMipilList
                    ? "Nomor pipil, nama anggota, NIK/NIKA..."
                    : isPemasihList
                      ? "Nomor pemasih, nama anggota, NIK/NRKT/NRT, alamat..."
                      : "Nomor kartu, nama, NIK..."
                }
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            {showKlasifikasiFilter && !isNonaktifTab && (
              <div className="min-w-0">
                <Label>Klasifikasi</Label>
                <Select value={klasifikasi} onChange={(e) => setKlasifikasi(e.target.value)}>
                  <option value="">Semua</option>
                  <option value="KRAMA_TAMIU">Krama Tamiu</option>
                  <option value="TAMIU">Tamiu</option>
                </Select>
              </div>
            )}
            {isNonaktifTab && (
              <div className="min-w-0">
                <Label>Alasan nonaktif</Label>
                <Select value={alasanFilter} onChange={(e) => setAlasanFilter(e.target.value)}>
                  <option value="">Semua</option>
                  {ALASAN_TIDAK_AKTIF_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            {isPemasihList && isNonaktifTab && (
              <div className="min-w-0">
                <Label>Klasifikasi</Label>
                <Select value={klasifikasi} onChange={(e) => setKlasifikasi(e.target.value)}>
                  <option value="">Semua</option>
                  <option value="KRAMA_TAMIU">Krama Tamiu</option>
                  <option value="TAMIU">Tamiu</option>
                </Select>
              </div>
            )}
            <div className="min-w-0">
              <Label>Banjar</Label>
              <Select value={banjarId} onChange={(e) => setBanjarId(e.target.value)}>
                <option value="">Semua</option>
                {banjar.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nama}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-2 mt-2">
          <span className="inline-flex items-center gap-1 rounded-md border border-copper-200 bg-copper-50/80 px-2 py-0.5 text-xs text-copper-900">
            <span className="text-muted">Krama:</span>
            <span className="font-semibold tabular-nums">{totalItems}</span>
          </span>
        </div>

        <div className="overflow-x-auto w-full -mx-0.5">
          <table className={cn(LIST_TABLE_ELEMENT, "min-w-[640px]")}>
            <thead>
              <tr className={LIST_HEAD_ROW}>
                <th>
                  {isMipilList ? "Nomor Pipil" : isPemasihList ? "Nomor Pemasih" : "Nomor Kartu"}
                </th>
                <th>
                  {isPemasihList ? "Pengajeg" : "Kepala KK"}
                </th>
                {isPemasihList && isNonaktifTab && (
                  <th className="hidden sm:table-cell">Klasifikasi</th>
                )}
                {isPemasihList && !isNonaktifTab && (
                  <th className="hidden md:table-cell">Alamat</th>
                )}
                {!fixedKlasifikasi && !isPemasihList && (
                  <th className="hidden sm:table-cell">Klasifikasi</th>
                )}
                {(isMipilList || isPemasihList) && !isNonaktifTab && <th>Jenis Krama</th>}
                {isMipilList && !isNonaktifTab && (
                  <>
                    <th className="hidden md:table-cell">Tgl. lahir</th>
                    <th className="hidden md:table-cell">Umur</th>
                  </>
                )}
                {isNonaktifTab && (
                  <>
                    <th>Alasan</th>
                    <th className="hidden sm:table-cell">Tgl. nonaktif</th>
                    <th className="hidden lg:table-cell">Keterangan</th>
                  </>
                )}
                <th className="hidden sm:table-cell">Banjar</th>
                {isMipilList && !isNonaktifTab && (
                  <>
                    <th>Tempek</th>
                    <th className="hidden lg:table-cell">Arahan</th>
                  </>
                )}
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.map((r) => {
                const nyada =
                  !isNonaktifTab &&
                  isMipilList &&
                  isKramaNyada(r.jenis_krama_mipil_id, desa);
                return (
                  <tr
                    key={r.id}
                    className={cn(
                      LIST_BODY_ROW,
                      nyada && "bg-amber-50/90 border-amber-200/80"
                    )}
                    title={
                      nyada
                        ? "Krama berstatus Nyada"
                        : undefined
                    }
                  >
                    <td className="font-mono text-[11px] whitespace-nowrap">{r.nomor_kartu}</td>
                    <td
                      className="max-w-[9rem] truncate"
                      title={r.kepala_nama}
                    >
                      {r.kepala_nama}
                    </td>
                    {isPemasihList && isNonaktifTab && (
                      <td className="hidden sm:table-cell">{r.klasifikasi_nama}</td>
                    )}
                    {isPemasihList && !isNonaktifTab && (
                      <td
                        className="hidden md:table-cell max-w-[10rem] truncate"
                        title={r.alamat?.trim()}
                      >
                        {r.alamat?.trim() || "—"}
                      </td>
                    )}
                    {!fixedKlasifikasi && !isPemasihList && (
                      <td className="hidden sm:table-cell">{r.klasifikasi_nama}</td>
                    )}
                    {(isMipilList || isPemasihList) && !isNonaktifTab && (
                      <td
                        className="max-w-[6rem] truncate"
                        title={r.jenis_nama?.trim()}
                      >
                        {r.jenis_nama?.trim() || "—"}
                      </td>
                    )}
                    {isMipilList && !isNonaktifTab && (
                      <>
                        <td className="hidden md:table-cell whitespace-nowrap tabular-nums">
                          {formatTanggalLahir(r.kepala_tanggal_lahir)}
                        </td>
                        <td
                          className={cn(
                            "hidden md:table-cell tabular-nums font-medium",
                            nyada && "text-amber-900"
                          )}
                        >
                          {hitungUmur(r.kepala_tanggal_lahir) ?? "—"}
                        </td>
                      </>
                    )}
                    {isNonaktifTab && (
                      <>
                        <td className="font-medium">
                          {formatAlasanTidakAktif(r.alasan_tidak_aktif)}
                        </td>
                        <td className="hidden sm:table-cell whitespace-nowrap tabular-nums">
                          {formatTanggalLahir(r.tanggal_tidak_aktif)}
                        </td>
                        <td
                          className="hidden lg:table-cell max-w-[10rem] truncate"
                          title={r.keterangan_tidak_aktif?.trim()}
                        >
                          {r.keterangan_tidak_aktif?.trim() || "—"}
                        </td>
                      </>
                    )}
                    <td
                      className="hidden sm:table-cell max-w-[5rem] truncate"
                      title={r.banjar_nama}
                    >
                      {r.banjar_nama}
                    </td>
                    {isMipilList && !isNonaktifTab && (
                      <>
                        <td
                          className="max-w-[5rem] truncate"
                          title={r.tempek_nama?.trim()}
                        >
                          {r.tempek_nama?.trim() || "—"}
                        </td>
                        <td
                          className="hidden lg:table-cell max-w-[5rem] truncate"
                          title={r.arahan_nama?.trim()}
                        >
                          {r.arahan_nama?.trim() || "—"}
                        </td>
                      </>
                    )}
                    <td>
                      <div className="flex flex-wrap items-center gap-0.5">
                        <IconLink
                          to={`${basePath}/${r.id}`}
                          icon={Eye}
                          iconOnly
                          variant="ghost"
                          title="Lihat pratinjau"
                          aria-label="Lihat pratinjau"
                        />
                        {canEdit && (
                          <IconLink
                            to={kramaEditPath(r.klasifikasi_kode as KlasifikasiKode, r.id)}
                            icon={Pencil}
                            iconOnly
                            variant="ghost"
                            title="Edit"
                            aria-label="Edit"
                          />
                        )}
                        {isNonaktifTab && canEdit && (
                          <Button
                            type="button"
                            variant="ghost"
                            icon={RotateCcw}
                            iconOnly
                            title="Aktifkan kembali"
                            aria-label="Aktifkan kembali"
                            disabled={reactivatingId === r.id}
                            onClick={() => handleReaktivasi(r)}
                          />
                        )}
                        {allowDeleteKrama && (
                          <Button
                            type="button"
                            variant="ghost"
                            icon={Trash2}
                            iconOnly
                            title="Hapus krama"
                            aria-label="Hapus krama"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            disabled={
                              deleteBusy || reactivatingId === r.id || deleteTarget?.id === r.id
                            }
                            onClick={() => requestDelete(r)}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {totalItems === 0 && (
            <p className="text-center text-muted py-3 leading-snug text-xs">
              {isNonaktifTab
                ? "Belum ada krama nonaktif"
                : "Belum ada data terdaftar"}
            </p>
          )}
          <ListPagination
            page={safePage}
            totalItems={totalItems}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            compact
          />
        </div>
      </Card>
        </>
      )}

      <ConfirmDialog
        open={deleteTarget != null}
        title="Hapus krama?"
        message={
          deleteTarget
            ? `Hapus krama ${deleteTarget.nomor_kartu} (${deleteTarget.kepala_nama})? Semua anggota keluarga dan riwayat pembayaran paturunan/dudukan ikut terhapus. Tindakan ini tidak dapat dibatalkan.`
            : ""
        }
        confirmLabel="Ya, hapus krama"
        busy={deleteBusy}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => {
          if (!deleteBusy) setDeleteTarget(null);
        }}
      />
    </div>
  );
}
