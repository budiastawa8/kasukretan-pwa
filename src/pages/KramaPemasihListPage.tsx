import { useCallback, useEffect, useMemo, useState } from "react";
import { clearPagePersistedState, usePersistedScalar } from "../lib/page-filter-state";
import {
  Eye,
  FileSpreadsheet,
  List,
  Pencil,
  RotateCcw,
  Trash2,
  UserCheck,
  UserCircle,
  UserSquare,
  UserX,
} from "lucide-react";
import { useTableSort } from "../hooks/useTableSort";
import { clampPage, LIST_PAGE_SIZE } from "../lib/pagination";
import { KRAMA_PEMASIH_SORT } from "../lib/table-sort-accessors";
import { SortableTableHead } from "../components/ui/SortableTableHead";
import { formatAlasanTidakAktif } from "../lib/krama-status";
import { downloadPemasihExport } from "../lib/import/pemasih-template";
import {
  deleteKrama,
  listKrama,
  listKramaPageWithMeta,
  listRtBtnPemasih,
  reaktivasiKrama,
} from "../lib/services/krama";
import { kramaEditPath } from "../lib/krama-routes";
import { listBanjar, listJenisKramaTamiu, listJenisTamiu, listTempek } from "../lib/services/master";
import type {
  Banjar,
  JenisKramaTamiuRow,
  JenisTamiuRow,
  KramaListItem,
  Tempek,
} from "../lib/types";
import { cn, formatTanggalLahir } from "../lib/utils";
import { useAuth } from "../context/AuthContext";
import { useIsPhoneClient } from "../hooks/useClientFormFactor";
import { canDeleteKrama, canEditKrama } from "../lib/auth-roles";
import { PemasihAnggotaImportExportPanel } from "../components/krama/PemasihAnggotaImportExportPanel";
import { PemasihImportExportPanel } from "../components/krama/PemasihImportExportPanel";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { IconLink } from "../components/ui/IconLink";
import { Input, Label, Select } from "../components/ui/Input";
import { ListPagination } from "../components/ui/ListPagination";
import {
  LIST_BODY_ROW,
  LIST_CARD,
  LIST_CARD_PHONE,
  LIST_FILTER_GRID,
  LIST_FILTER_ROW,
  LIST_HEAD_ROW,
  LIST_PAGE,
  LIST_TABLE,
  LIST_TABLE_ELEMENT,
} from "../components/ui/list-compact";

type ListTab = "aktif" | "nonaktif";
type PageTab = "daftar" | "impor";

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-copper-200 bg-copper-50/80 px-2 py-0.5 text-[11px] text-copper-900">
      <span className="text-muted">{label}:</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
}

const PAGE_ID = "krama/pemasih";

export function KramaPemasihListPage() {
  const { user } = useAuth();
  const isPhone = useIsPhoneClient();
  const canEdit = canEditKrama(user?.peran);
  const allowDeleteKrama = canDeleteKrama(user?.peran);

  const [rows, setRows] = useState<KramaListItem[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [jenisRingkasan, setJenisRingkasan] = useState<[string, number][]>([]);
  const [banjar, setBanjar] = useState<Banjar[]>([]);
  const [jenisKt, setJenisKt] = useState<JenisKramaTamiuRow[]>([]);
  const [jenisT, setJenisT] = useState<JenisTamiuRow[]>([]);
  const [tempekList, setTempekList] = useState<Tempek[]>([]);
  const [rtBtnOptions, setRtBtnOptions] = useState<string[]>([]);

  const [q, setQ] = usePersistedScalar(PAGE_ID, "q", "");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [jenisFilter, setJenisFilter] = usePersistedScalar(PAGE_ID, "jenisFilter", "");
  const [banjarId, setBanjarId] = usePersistedScalar(PAGE_ID, "banjarId", "");
  const [rtBtn, setRtBtn] = usePersistedScalar(PAGE_ID, "rtBtn", "");
  const [tempekId, setTempekId] = usePersistedScalar(PAGE_ID, "tempekId", "");
  const [listTab, setListTab] = usePersistedScalar<ListTab>(PAGE_ID, "listTab", "aktif");
  const [pageTab, setPageTab] = usePersistedScalar<PageTab>(PAGE_ID, "pageTab", "daftar");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(LIST_PAGE_SIZE);
  const [exportBusy, setExportBusy] = useState(false);
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<KramaListItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [importFlash, setImportFlash] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const isNonaktifTab = listTab === "nonaktif";
  const jenisKramaTamiuId = jenisFilter.startsWith("kt:") ? jenisFilter.slice(3) : undefined;
  const jenisTamiuId = jenisFilter.startsWith("t:") ? jenisFilter.slice(2) : undefined;

  const { sortKey, sortDir, toggleSort } = useTableSort();
  const safePage = useMemo(
    () => clampPage(page, totalItems, pageSize),
    [page, totalItems, pageSize]
  );
  const pagedRows = rows;

  useEffect(() => {
    setPage(1);
  }, [sortKey, sortDir, debouncedQ, banjarId, jenisFilter, tempekId, rtBtn, listTab]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    Promise.all([listBanjar(), listJenisKramaTamiu(), listJenisTamiu()]).then(([b, jkt, jt]) => {
      setBanjar(b);
      setJenisKt(jkt);
      setJenisT(jt);
    });
  }, []);

  useEffect(() => {
    if (!banjarId) {
      setTempekList([]);
      return;
    }
    listTempek(banjarId).then(setTempekList);
  }, [banjarId]);

  useEffect(() => {
    listRtBtnPemasih({ banjarId: banjarId || undefined, statusKrama: listTab }).then(setRtBtnOptions);
  }, [banjarId, listTab]);

  const listFilter = useMemo(
    () => ({
      klasifikasiIn: ["KRAMA_TAMIU", "TAMIU"] as const,
      q: debouncedQ || undefined,
      banjarId: banjarId || undefined,
      jenisKramaTamiuId,
      jenisTamiuId,
      tempekId: tempekId || undefined,
      rtBtn: rtBtn || undefined,
      statusKrama: listTab,
    }),
    [debouncedQ, banjarId, jenisKramaTamiuId, jenisTamiuId, tempekId, rtBtn, listTab]
  );

  const reloadList = useCallback(async () => {
    const offset = (Math.max(1, page) - 1) * pageSize;
    const filter = { ...listFilter, klasifikasiIn: [...listFilter.klasifikasiIn] };
    const { rows: pageRows, total, summary } = await listKramaPageWithMeta({
      ...filter,
      limit: pageSize,
      offset,
      orderBy: sortKey && sortKey in KRAMA_PEMASIH_SORT ? sortKey : undefined,
      orderDir: sortKey ? sortDir : undefined,
    });
    setRows(pageRows);
    setTotalItems(total);
    setJenisRingkasan(
      summary.map((s) => {
        const label = s.jenis_nama?.trim()
          ? `${s.klasifikasi_nama}: ${s.jenis_nama.trim()}`
          : s.klasifikasi_nama;
        return [label, Number(s.count)] as [string, number];
      })
    );
  }, [listFilter, page, pageSize, sortKey, sortDir]);

  useEffect(() => {
    let cancelled = false;
    void reloadList().catch((e) => {
      if (!cancelled) console.error(e);
    });
    return () => {
      cancelled = true;
    };
  }, [reloadList]);

  function resetFilters() {
    clearPagePersistedState(PAGE_ID);
    setQ("");
    setJenisFilter("");
    setBanjarId("");
    setRtBtn("");
    setTempekId("");
  }

  function switchTab(tab: ListTab) {
    setListTab(tab);
    setPage(1);
    setRtBtn("");
  }

  async function handleExport() {
    setExportBusy(true);
    try {
      const allRows = await listKrama({
        ...listFilter,
        klasifikasiIn: [...listFilter.klasifikasiIn],
      });
      if (!allRows.length) {
        alert("Tidak ada data untuk diekspor");
        return;
      }
      await downloadPemasihExport({
        kramaIds: allRows.map((r) => r.id),
        statusKrama: listTab,
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal mengekspor");
    } finally {
      setExportBusy(false);
    }
  }

  async function handleReaktivasi(r: KramaListItem) {
    if (
      !confirm(
        `Aktifkan kembali pemasih ${r.nomor_kartu}? Status Pemasih akan disesuaikan menurut masa berlaku.`
      )
    ) {
      return;
    }
    setReactivatingId(r.id);
    try {
      await reaktivasiKrama(r.id);
      await reloadList();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal mengaktifkan kembali");
    } finally {
      setReactivatingId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget || !allowDeleteKrama) return;
    setDeleteBusy(true);
    try {
      await deleteKrama(deleteTarget.id);
      setDeleteTarget(null);
      await reloadList();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menghapus krama");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className={cn(LIST_PAGE, "w-full max-w-full")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-xl font-bold">Krama Tamiu & Tamiu</h2>
          <p className="text-[11px] text-muted mt-0.5">Daftar pemasih aktif dan nonaktif.</p>
        </div>
        {pageTab === "daftar" && !isNonaktifTab && (
          <div className="flex flex-wrap gap-1.5 shrink-0">
            <IconLink to="/krama-pemasih/krama-tamiu/baru" icon={UserCircle} className="h-8 text-xs">
              Krama Tamiu
            </IconLink>
            <IconLink
              to="/krama-pemasih/tamiu/baru"
              variant="secondary"
              icon={UserSquare}
              className="h-8 text-xs"
            >
              Tamiu
            </IconLink>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Button
          variant={pageTab === "daftar" ? "primary" : "secondary"}
          icon={List}
          type="button"
          className="h-8 text-xs"
          onClick={() => setPageTab("daftar")}
        >
          Daftar
        </Button>
        <Button
          variant={pageTab === "impor" ? "primary" : "secondary"}
          icon={FileSpreadsheet}
          type="button"
          className="h-8 text-xs"
          onClick={() => setPageTab("impor")}
        >
          Impor/Ekspor
        </Button>
      </div>

      {pageTab === "impor" && (
        <div className="space-y-2">
          {importFlash && (
            <p
              className={cn(
                "text-xs rounded-md px-2.5 py-1.5 border",
                importFlash.kind === "ok"
                  ? "text-copper-900 bg-copper-100 border-copper-300"
                  : "text-red-600 bg-red-50 border-red-100"
              )}
            >
              {importFlash.text}
            </p>
          )}
          <PemasihImportExportPanel
            canEdit={canEdit}
            alwaysOpen
            onRefresh={reloadList}
            onSaved={(msg) => {
              setImportFlash({ kind: "ok", text: msg });
              setTimeout(() => setImportFlash(null), 4000);
            }}
            onError={(msg) => setImportFlash({ kind: "err", text: msg })}
          />
          <PemasihAnggotaImportExportPanel
            canEdit={canEdit}
            alwaysOpen
            onRefresh={reloadList}
            onSaved={(msg) => {
              setImportFlash({ kind: "ok", text: msg });
              setTimeout(() => setImportFlash(null), 4000);
            }}
            onError={(msg) => setImportFlash({ kind: "err", text: msg })}
          />
        </div>
      )}

      {pageTab === "daftar" && (
        <Card compact className={cn(LIST_CARD, isPhone && LIST_CARD_PHONE, LIST_TABLE)}>
          <div className={LIST_FILTER_ROW}>
            <div className={cn(LIST_FILTER_GRID, "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5")}>
              <div className="min-w-0 sm:col-span-2">
                <Label>Cari</Label>
                <Input
                  placeholder="No. pemasih, nama, NIK/NRKT/NRT, alamat…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <div className="min-w-0">
                <Label>Jenis Krama</Label>
                <Select value={jenisFilter} onChange={(e) => setJenisFilter(e.target.value)}>
                  <option value="">Semua</option>
                  <optgroup label="Krama Tamiu">
                    {jenisKt.map((j) => (
                      <option key={`kt:${j.id}`} value={`kt:${j.id}`}>
                        {j.nama}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Tamiu">
                    {jenisT.map((j) => (
                      <option key={`t:${j.id}`} value={`t:${j.id}`}>
                        {j.nama}
                      </option>
                    ))}
                  </optgroup>
                </Select>
              </div>
              <div className="min-w-0">
                <Label>Banjar</Label>
                <Select
                  value={banjarId}
                  onChange={(e) => {
                    setBanjarId(e.target.value);
                    setTempekId("");
                    setRtBtn("");
                  }}
                >
                  <option value="">Semua</option>
                  {banjar.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nama}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="min-w-0">
                <Label>RT/BTN</Label>
                <Select value={rtBtn} onChange={(e) => setRtBtn(e.target.value)}>
                  <option value="">Semua</option>
                  {rtBtnOptions.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="min-w-0">
                <Label>Tempek</Label>
                <Select
                  value={tempekId}
                  disabled={!banjarId}
                  onChange={(e) => setTempekId(e.target.value)}
                >
                  <option value="">{banjarId ? "Semua" : "Pilih banjar"}</option>
                  {tempekList.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nama}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <Button
              type="button"
              variant="secondary"
              icon={RotateCcw}
              className="h-8 text-xs shrink-0 self-end"
              onClick={resetFilters}
            >
              Reset
            </Button>
          </div>

          <div className="mb-2 mt-1 flex flex-wrap items-center gap-1.5">
            <Button
              variant={listTab === "aktif" ? "primary" : "secondary"}
              icon={UserCheck}
              type="button"
              className={cn("text-xs", isPhone ? "h-10 flex-1" : "h-8")}
              onClick={() => switchTab("aktif")}
            >
              Aktif
            </Button>
            <Button
              variant={listTab === "nonaktif" ? "primary" : "secondary"}
              icon={UserX}
              type="button"
              className={cn("text-xs", isPhone ? "h-10 flex-1" : "h-8")}
              onClick={() => switchTab("nonaktif")}
            >
              Nonaktif
            </Button>
            <Button
              variant="secondary"
              icon={FileSpreadsheet}
              type="button"
              className={cn("text-xs", isPhone ? "h-10 w-full" : "h-8")}
              disabled={exportBusy || totalItems === 0}
              onClick={() => void handleExport()}
            >
              Ekspor Excel
            </Button>
          </div>

          <div className="mb-2 flex flex-wrap gap-1">
            <StatChip label="Total" value={String(totalItems)} />
            {jenisRingkasan.map(([nama, count]) => (
              <StatChip key={nama} label={nama} value={String(count)} />
            ))}
          </div>

          {isPhone ? (
            <ul className="space-y-2">
              {pagedRows.length === 0 ? (
                <li className="py-6 text-center text-xs text-muted">
                  {isNonaktifTab ? "Belum ada pemasih nonaktif." : "Belum ada pemasih aktif."}
                </li>
              ) : (
                pagedRows.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-lg border border-copper-200/90 bg-card px-3 py-2.5 shadow-sm shadow-copper-950/5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-copper-950">
                          {r.kepala_nama}
                        </p>
                        <p className="font-mono text-[11px] text-copper-700">{r.nomor_kartu}</p>
                      </div>
                      <span className="shrink-0 rounded border border-copper-200 bg-copper-50 px-1.5 py-0.5 text-[10px] text-copper-800">
                        {r.jenis_nama?.trim() || "—"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-snug text-muted">
                      {[r.alamat?.trim() || null, r.banjar_nama, !isNonaktifTab ? r.rt_btn?.trim() || null : null]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                    {isNonaktifTab && (
                      <p className="mt-0.5 text-[11px] text-copper-700">
                        {formatAlasanTidakAktif(r.alasan_tidak_aktif)}
                        {" · "}
                        {formatTanggalLahir(r.tanggal_tidak_aktif)}
                      </p>
                    )}
                    <div className="mt-2.5 grid grid-cols-2 gap-1.5 border-t border-copper-100 pt-2">
                      <IconLink
                        to={`/krama-pemasih/${r.id}`}
                        icon={Eye}
                        variant="secondary"
                        className="h-10 justify-center text-xs"
                      >
                        Lihat
                      </IconLink>
                      {canEdit ? (
                        <IconLink
                          to={kramaEditPath(r.klasifikasi_kode as "KRAMA_TAMIU" | "TAMIU", r.id)}
                          icon={Pencil}
                          variant="secondary"
                          className="h-10 justify-center text-xs"
                        >
                          Edit
                        </IconLink>
                      ) : (
                        <span />
                      )}
                      {(isNonaktifTab && canEdit) || allowDeleteKrama ? (
                        <div className="col-span-2 flex flex-wrap gap-1.5">
                          {isNonaktifTab && canEdit && (
                            <Button
                              type="button"
                              variant="secondary"
                              icon={RotateCcw}
                              className="h-10 flex-1 text-xs"
                              disabled={reactivatingId === r.id}
                              onClick={() => void handleReaktivasi(r)}
                            >
                              Aktifkan
                            </Button>
                          )}
                          {allowDeleteKrama && (
                            <Button
                              type="button"
                              variant="secondary"
                              icon={Trash2}
                              className="h-10 flex-1 border-red-200 text-xs text-red-700 hover:bg-red-50"
                              disabled={
                                deleteBusy ||
                                reactivatingId === r.id ||
                                deleteTarget?.id === r.id
                              }
                              onClick={() => setDeleteTarget(r)}
                            >
                              Hapus
                            </Button>
                          )}
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))
              )}
            </ul>
          ) : (
          <div className="w-full -mx-0.5 overflow-x-auto">
            <table className={cn(LIST_TABLE_ELEMENT, "min-w-[640px]")}>
              <thead>
                <tr className={LIST_HEAD_ROW}>
                  <SortableTableHead
                    label="No. Pemasih"
                    columnKey="nomor_kartu"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTableHead
                    label="Pengajeg"
                    columnKey="kepala_nama"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTableHead
                    label="Alamat"
                    columnKey="alamat"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                    className="hidden md:table-cell"
                  />
                  <SortableTableHead
                    label="Jenis"
                    columnKey="jenis_nama"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTableHead
                    label="Banjar"
                    columnKey="banjar_nama"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                    className="hidden sm:table-cell"
                  />
                  {!isNonaktifTab && (
                    <SortableTableHead
                      label="RT/BTN"
                      columnKey="rt_btn"
                      activeKey={sortKey}
                      direction={sortDir}
                      onSort={toggleSort}
                      className="hidden lg:table-cell"
                    />
                  )}
                  {isNonaktifTab && (
                    <>
                      <SortableTableHead
                        label="Alasan"
                        columnKey="alasan_tidak_aktif"
                        activeKey={sortKey}
                        direction={sortDir}
                        onSort={toggleSort}
                      />
                      <SortableTableHead
                        label="Tgl. nonaktif"
                        columnKey="tanggal_tidak_aktif"
                        activeKey={sortKey}
                        direction={sortDir}
                        onSort={toggleSort}
                        className="hidden sm:table-cell"
                      />
                    </>
                  )}
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={isNonaktifTab ? 8 : 7}
                      className="py-3 text-center text-xs text-muted"
                    >
                      {isNonaktifTab ? "Belum ada pemasih nonaktif." : "Belum ada pemasih aktif."}
                    </td>
                  </tr>
                ) : (
                  pagedRows.map((r) => (
                    <tr key={r.id} className={LIST_BODY_ROW}>
                      <td className="whitespace-nowrap font-mono text-[11px]">{r.nomor_kartu}</td>
                      <td className="max-w-[9rem] truncate" title={r.kepala_nama}>
                        {r.kepala_nama}
                      </td>
                      <td
                        className="hidden max-w-[10rem] truncate md:table-cell"
                        title={r.alamat?.trim()}
                      >
                        {r.alamat?.trim() || "—"}
                      </td>
                      <td className="max-w-[6rem] truncate" title={r.jenis_nama?.trim()}>
                        {r.jenis_nama?.trim() || "—"}
                      </td>
                      <td
                        className="hidden max-w-[5rem] truncate sm:table-cell"
                        title={r.banjar_nama}
                      >
                        {r.banjar_nama}
                      </td>
                      {!isNonaktifTab && (
                        <td className="hidden whitespace-nowrap lg:table-cell">
                          {r.rt_btn?.trim() || "—"}
                        </td>
                      )}
                      {isNonaktifTab && (
                        <>
                          <td>{formatAlasanTidakAktif(r.alasan_tidak_aktif)}</td>
                          <td className="hidden whitespace-nowrap tabular-nums sm:table-cell">
                            {formatTanggalLahir(r.tanggal_tidak_aktif)}
                          </td>
                        </>
                      )}
                      <td>
                        <div className="flex flex-wrap items-center gap-0.5">
                          <IconLink
                            to={`/krama-pemasih/${r.id}`}
                            icon={Eye}
                            iconOnly
                            variant="ghost"
                            title="Lihat"
                            aria-label="Lihat"
                          />
                          {canEdit && (
                            <IconLink
                              to={kramaEditPath(r.klasifikasi_kode as "KRAMA_TAMIU" | "TAMIU", r.id)}
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
                              onClick={() => void handleReaktivasi(r)}
                            />
                          )}
                          {allowDeleteKrama && (
                            <Button
                              type="button"
                              variant="ghost"
                              icon={Trash2}
                              iconOnly
                              title="Hapus"
                              aria-label="Hapus"
                              className="text-red-600 hover:bg-red-50 hover:text-red-700"
                              disabled={
                                deleteBusy || reactivatingId === r.id || deleteTarget?.id === r.id
                              }
                              onClick={() => setDeleteTarget(r)}
                            />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          )}
          <ListPagination
            page={safePage}
            totalItems={totalItems}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            compact
          />
        </Card>
      )}

      <ConfirmDialog
        open={deleteTarget != null}
        title="Hapus krama?"
        message={
          deleteTarget
            ? `Hapus krama ${deleteTarget.nomor_kartu} (${deleteTarget.kepala_nama})? Semua anggota keluarga dan riwayat pembayaran ikut terhapus.`
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
