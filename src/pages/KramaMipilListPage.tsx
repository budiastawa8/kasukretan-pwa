import { useCallback, useEffect, useMemo, useState } from "react";
import { clearPagePersistedState, usePersistedScalar } from "../lib/page-filter-state";
import {
  Eye,
  FilePlus,
  FileSpreadsheet,
  List,
  Pencil,
  RotateCcw,
  Trash2,
  UserCheck,
  UserX,
} from "lucide-react";
import { useTableSort } from "../hooks/useTableSort";
import { clampPage, LIST_PAGE_SIZE, paginateSlice } from "../lib/pagination";
import { sortTableRows } from "../lib/table-sort";
import { KRAMA_MIPIL_SORT } from "../lib/table-sort-accessors";
import { SortableTableHead } from "../components/ui/SortableTableHead";
import { isKramaNyada, labelAlasanNyadaKhusus } from "../lib/nyada-ketentuan";
import { formatAlasanTidakAktif } from "../lib/krama-status";
import { downloadKramaExport } from "../lib/import/krama-template";
import { getDesaAdat } from "../lib/services/desa";
import { deleteKrama, listKrama, reaktivasiKrama } from "../lib/services/krama";
import { kramaEditPath } from "../lib/krama-routes";
import { listArahan, listBanjar, listJenisMipil, listTempek } from "../lib/services/master";
import type { Arahan, Banjar, DesaAdat, JenisKramaMipilRow, KramaListItem, Tempek } from "../lib/types";
import { cn, formatTanggalLahir, hitungUmur } from "../lib/utils";
import { useAuth } from "../context/AuthContext";
import { canDeleteKrama, canEditKrama } from "../lib/auth-roles";
import { useIsPhoneClient } from "../hooks/useClientFormFactor";
import { AnggotaImportExportPanel } from "../components/krama/AnggotaImportExportPanel";
import { KramaImportExportPanel } from "../components/krama/KramaImportExportPanel";
import { KramaMipilWhatsAppButton } from "../components/krama/KramaMipilWhatsAppButton";
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

const PAGE_ID = "krama/mipil";

export function KramaMipilListPage() {
  const { user } = useAuth();
  const isPhone = useIsPhoneClient();
  const canEdit = canEditKrama(user?.peran);
  const allowDeleteKrama = canDeleteKrama(user?.peran);

  const [rows, setRows] = useState<KramaListItem[]>([]);
  const [banjar, setBanjar] = useState<Banjar[]>([]);
  const [jenisMipil, setJenisMipil] = useState<JenisKramaMipilRow[]>([]);
  const [tempekList, setTempekList] = useState<Tempek[]>([]);
  const [arahanList, setArahanList] = useState<Arahan[]>([]);
  const [desa, setDesa] = useState<DesaAdat | null>(null);

  const [q, setQ] = usePersistedScalar(PAGE_ID, "q", "");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [jenisKramaMipilId, setJenisKramaMipilId] = usePersistedScalar(PAGE_ID, "jenisKramaMipilId", "");
  const [banjarId, setBanjarId] = usePersistedScalar(PAGE_ID, "banjarId", "");
  const [tempekId, setTempekId] = usePersistedScalar(PAGE_ID, "tempekId", "");
  const [arahanId, setArahanId] = usePersistedScalar(PAGE_ID, "arahanId", "");
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

  const { sortKey, sortDir, toggleSort } = useTableSort();
  const sortedRows = useMemo(
    () => sortTableRows(rows, sortKey, sortDir, KRAMA_MIPIL_SORT),
    [rows, sortKey, sortDir]
  );
  const safePage = useMemo(
    () => clampPage(page, sortedRows.length, pageSize),
    [page, sortedRows.length, pageSize]
  );
  const pagedRows = useMemo(
    () => paginateSlice(sortedRows, safePage, pageSize),
    [sortedRows, safePage, pageSize]
  );

  useEffect(() => {
    setPage(1);
  }, [sortKey, sortDir]);

  const jenisRingkasan = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const nama = r.jenis_nama?.trim() || "—";
      map.set(nama, (map.get(nama) ?? 0) + 1);
    }
    return [...map.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "id")
    );
  }, [rows]);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    Promise.all([listBanjar(), listJenisMipil(), getDesaAdat()]).then(([b, j, d]) => {
      setBanjar(b);
      setJenisMipil(j);
      setDesa(d);
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
    if (!tempekId) {
      setArahanList([]);
      return;
    }
    listArahan(tempekId).then(setArahanList);
  }, [tempekId]);

  const load = useCallback(async () => {
    setPage(1);
    setRows(
      await listKrama({
        klasifikasi: "MIPIL",
        q: debouncedQ || undefined,
        banjarId: banjarId || undefined,
        jenisKramaMipilId: jenisKramaMipilId || undefined,
        tempekId: tempekId || undefined,
        arahanId: arahanId || undefined,
        statusKrama: listTab,
      })
    );
  }, [debouncedQ, banjarId, jenisKramaMipilId, tempekId, arahanId, listTab]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetFilters() {
    clearPagePersistedState(PAGE_ID);
    setQ("");
    setJenisKramaMipilId("");
    setBanjarId("");
    setTempekId("");
    setArahanId("");
  }

  function switchTab(tab: ListTab) {
    setListTab(tab);
    setPage(1);
  }

  async function handleExport() {
    setExportBusy(true);
    try {
      if (!rows.length) {
        alert("Tidak ada data untuk diekspor");
        return;
      }
      await downloadKramaExport({
        kramaIds: rows.map((r) => r.id),
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
        `Aktifkan kembali pipil ${r.nomor_kartu}? Status Pipil akan disesuaikan menurut masa berlaku.`
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

  return (
    <div className={cn(LIST_PAGE, "w-full max-w-full")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-xl font-bold">Krama Mipil</h2>
          <p className="text-[11px] text-muted mt-0.5">Daftar pipil aktif dan nonaktif.</p>
        </div>
        {pageTab === "daftar" && !isNonaktifTab && (
          <IconLink to="/krama-mipil/baru" icon={FilePlus}>
            Pipil Baru
          </IconLink>
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
          <KramaImportExportPanel
            canEdit={canEdit}
            alwaysOpen
            onRefresh={load}
            onSaved={(msg) => {
              setImportFlash({ kind: "ok", text: msg });
              setTimeout(() => setImportFlash(null), 4000);
            }}
            onError={(msg) => setImportFlash({ kind: "err", text: msg })}
          />
          <AnggotaImportExportPanel
            canEdit={canEdit}
            alwaysOpen
            onRefresh={load}
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
              <div className="min-w-0">
                <Label>Cari</Label>
                <Input
                  placeholder="Nomor pipil, nama, NIK/NIKA…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <div className="min-w-0">
                <Label>Jenis Krama</Label>
                <Select
                  value={jenisKramaMipilId}
                  onChange={(e) => setJenisKramaMipilId(e.target.value)}
                >
                  <option value="">Semua</option>
                  {jenisMipil.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.nama}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="min-w-0">
                <Label>Banjar</Label>
                <Select
                  value={banjarId}
                  onChange={(e) => {
                    setBanjarId(e.target.value);
                    setTempekId("");
                    setArahanId("");
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
                <Label>Tempek</Label>
                <Select
                  value={tempekId}
                  disabled={!banjarId}
                  onChange={(e) => {
                    setTempekId(e.target.value);
                    setArahanId("");
                  }}
                >
                  <option value="">{banjarId ? "Semua" : "Pilih banjar"}</option>
                  {tempekList.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nama}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="min-w-0">
                <Label>Arahan</Label>
                <Select
                  value={arahanId}
                  disabled={!tempekId}
                  onChange={(e) => setArahanId(e.target.value)}
                >
                  <option value="">{tempekId ? "Semua" : "Pilih tempek"}</option>
                  {arahanList.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nama}
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
              disabled={exportBusy || rows.length === 0}
              onClick={() => void handleExport()}
            >
              Ekspor Excel
            </Button>
          </div>

          <div className="mb-2 flex flex-wrap gap-1">
            <StatChip label="Total" value={String(rows.length)} />
            {jenisRingkasan.map(([nama, count]) => (
              <StatChip key={nama} label={nama} value={String(count)} />
            ))}
          </div>

          {isPhone ? (
            <ul className="space-y-2">
              {pagedRows.length === 0 ? (
                <li className="py-6 text-center text-xs text-muted">
                  {isNonaktifTab ? "Belum ada pipil nonaktif." : "Belum ada pipil aktif."}
                </li>
              ) : (
                pagedRows.map((r) => {
                  const nyada = !isNonaktifTab && isKramaNyada(r.jenis_krama_mipil_id, desa);
                  return (
                    <li
                      key={r.id}
                      className={cn(
                        "rounded-lg border border-copper-200/90 bg-card px-3 py-2.5 shadow-sm shadow-copper-950/5",
                        nyada && "border-amber-300 bg-amber-50/90"
                      )}
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
                        {[r.banjar_nama, r.tempek_nama?.trim() || null, r.arahan_nama?.trim() || null]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                      {!isNonaktifTab && (
                        <p className="mt-0.5 text-[11px] text-copper-700">
                          Lahir {formatTanggalLahir(r.kepala_tanggal_lahir)}
                          {hitungUmur(r.kepala_tanggal_lahir) != null
                            ? ` · ${hitungUmur(r.kepala_tanggal_lahir)} th`
                            : ""}
                          {nyada
                            ? ` · Nyada${
                                labelAlasanNyadaKhusus(r.alasan_nyada)
                                  ? ` (${labelAlasanNyadaKhusus(r.alasan_nyada).toLowerCase()})`
                                  : ""
                              }`
                            : ""}
                        </p>
                      )}
                      {isNonaktifTab && (
                        <p className="mt-0.5 text-[11px] text-copper-700">
                          {formatAlasanTidakAktif(r.alasan_tidak_aktif)}
                          {" · "}
                          {formatTanggalLahir(r.tanggal_tidak_aktif)}
                        </p>
                      )}
                      <div className="mt-2.5 grid grid-cols-2 gap-1.5 border-t border-copper-100 pt-2">
                        <IconLink
                          to={`/krama-mipil/${r.id}`}
                          icon={Eye}
                          variant="secondary"
                          className="h-10 justify-center text-xs"
                        >
                          Lihat
                        </IconLink>
                        {canEdit ? (
                          <IconLink
                            to={kramaEditPath("MIPIL", r.id)}
                            icon={Pencil}
                            variant="secondary"
                            className="h-10 justify-center text-xs"
                          >
                            Edit
                          </IconLink>
                        ) : (
                          <span />
                        )}
                        <div className="col-span-2 flex flex-wrap gap-1.5">
                          <KramaMipilWhatsAppButton
                            nomorKontak={r.nomor_kontak}
                            kepalaNama={r.kepala_nama}
                          />
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
                              className="h-10 flex-1 text-xs text-red-700 border-red-200 hover:bg-red-50"
                              onClick={() => setDeleteTarget(r)}
                            >
                              Hapus
                            </Button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          ) : (
          <div className="w-full -mx-0.5 overflow-x-auto">
            <table className={cn(LIST_TABLE_ELEMENT, "min-w-[640px]")}>
              <thead>
                <tr className={LIST_HEAD_ROW}>
                  <SortableTableHead
                    label="Nomor Pipil"
                    columnKey="nomor_kartu"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTableHead
                    label="Pengarep"
                    columnKey="kepala_nama"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  {!isNonaktifTab && (
                    <>
                      <SortableTableHead
                        label="Tgl. Lahir"
                        columnKey="kepala_tanggal_lahir"
                        activeKey={sortKey}
                        direction={sortDir}
                        onSort={toggleSort}
                        className="hidden md:table-cell"
                      />
                      <SortableTableHead
                        label="Umur"
                        columnKey="kepala_tanggal_lahir"
                        activeKey={sortKey}
                        direction={sortDir}
                        onSort={toggleSort}
                        className="hidden md:table-cell text-right"
                      />
                    </>
                  )}
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
                    <>
                      <SortableTableHead
                        label="Tempek"
                        columnKey="tempek_nama"
                        activeKey={sortKey}
                        direction={sortDir}
                        onSort={toggleSort}
                      />
                      <SortableTableHead
                        label="Arahan"
                        columnKey="arahan_nama"
                        activeKey={sortKey}
                        direction={sortDir}
                        onSort={toggleSort}
                        className="hidden lg:table-cell"
                      />
                    </>
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
                      />
                    </>
                  )}
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {pagedRows.length === 0 ? (
                  <tr>
                    <td colSpan={isNonaktifTab ? 7 : 9} className="py-3 text-center text-muted text-xs">
                      {isNonaktifTab ? "Belum ada pipil nonaktif." : "Belum ada pipil aktif."}
                    </td>
                  </tr>
                ) : (
                  pagedRows.map((r) => {
                    const nyada = !isNonaktifTab && isKramaNyada(r.jenis_krama_mipil_id, desa);
                    return (
                      <tr
                        key={r.id}
                        className={cn(
                          LIST_BODY_ROW,
                          nyada && "bg-amber-50/90 border-amber-200/80"
                        )}
                        title={
                          nyada
                            ? `Krama berstatus Nyada${
                                labelAlasanNyadaKhusus(r.alasan_nyada)
                                  ? ` · ${labelAlasanNyadaKhusus(r.alasan_nyada)}`
                                  : ""
                              }`
                            : undefined
                        }
                      >
                        <td className="font-mono text-[11px] whitespace-nowrap">{r.nomor_kartu}</td>
                        <td className="max-w-[9rem] truncate" title={r.kepala_nama}>
                          {r.kepala_nama}
                        </td>
                        {!isNonaktifTab && (
                          <>
                            <td className="hidden md:table-cell whitespace-nowrap tabular-nums">
                              {formatTanggalLahir(r.kepala_tanggal_lahir)}
                            </td>
                            <td
                              className={cn(
                                "hidden md:table-cell text-right tabular-nums font-medium",
                                nyada && "text-amber-900"
                              )}
                            >
                              {hitungUmur(r.kepala_tanggal_lahir) ?? "—"}
                            </td>
                          </>
                        )}
                        <td className="max-w-[6rem] truncate" title={r.jenis_nama?.trim()}>
                          {r.jenis_nama?.trim() || "—"}
                          {nyada && labelAlasanNyadaKhusus(r.alasan_nyada) && (
                            <span className="block truncate text-[10px] text-amber-800">
                              {labelAlasanNyadaKhusus(r.alasan_nyada)}
                            </span>
                          )}
                        </td>
                        <td
                          className="hidden sm:table-cell max-w-[5rem] truncate"
                          title={r.banjar_nama}
                        >
                          {r.banjar_nama}
                        </td>
                        {!isNonaktifTab && (
                          <>
                            <td className="max-w-[5rem] truncate" title={r.tempek_nama?.trim()}>
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
                        {isNonaktifTab && (
                          <>
                            <td>{formatAlasanTidakAktif(r.alasan_tidak_aktif)}</td>
                            <td className="whitespace-nowrap">
                              {formatTanggalLahir(r.tanggal_tidak_aktif)}
                            </td>
                          </>
                        )}
                        <td>
                          <div className="flex flex-wrap items-center gap-0.5">
                            <KramaMipilWhatsAppButton
                              nomorKontak={r.nomor_kontak}
                              kepalaNama={r.kepala_nama}
                            />
                            <IconLink
                              to={`/krama-mipil/${r.id}`}
                              icon={Eye}
                              iconOnly
                              variant="ghost"
                              title="Lihat"
                              aria-label="Lihat"
                            />
                            {canEdit && (
                              <IconLink
                                to={kramaEditPath("MIPIL", r.id)}
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
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                disabled={
                                  deleteBusy || reactivatingId === r.id || deleteTarget?.id === r.id
                                }
                                onClick={() => setDeleteTarget(r)}
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          )}
          <ListPagination
            page={safePage}
            totalItems={rows.length}
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
