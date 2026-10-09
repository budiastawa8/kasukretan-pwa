import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useTableSort } from "../hooks/useTableSort";
import { clampPage, LIST_PAGE_SIZE, paginateSlice } from "../lib/pagination";
import { sortTableRows } from "../lib/table-sort";
import { LEMBAGA_BADAN_SORT } from "../lib/table-sort-accessors";
import { SortableTableHead } from "../components/ui/SortableTableHead";
import { SEKTOR_SWASTA_KOMERSIAL, SEKTOR_UTAMA_OPTIONS } from "../lib/lembaga-badan-options";
import {
  getLembagaBadanStats,
  labelMautsahaStatus,
  listLembagaBadan,
  softDeleteLembagaBadan,
} from "../lib/services/lembaga-badan";
import type { LembagaBadanListItem, LembagaBadanRow } from "../lib/types";
import { cn, formatTanggalLahir } from "../lib/utils";
import { useAuth } from "../context/AuthContext";
import { canEditMaster } from "../lib/auth-roles";
import { useIsPhoneClient } from "../hooks/useClientFormFactor";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
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
import { LembagaBadanFormDialog } from "../components/lembaga-badan/LembagaBadanFormDialog";
import { MautsahaAdatDialog } from "../components/lembaga-badan/MautsahaAdatDialog";

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-copper-200 bg-copper-50/80 px-2 py-0.5 text-[11px] text-copper-900">
      <span className="text-muted">{label}:</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
}

function statusBadgeClass(status?: string | null): string {
  switch (status) {
    case "berlaku":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "perlu_perpanjang":
      return "bg-amber-100 text-amber-900 border-amber-200";
    case "kedaluwarsa":
      return "bg-red-100 text-red-800 border-red-200";
    case "belum_terbit":
      return "bg-copper-100 text-copper-800 border-copper-200";
    default:
      return "";
  }
}

export function LembagaBadanPage() {
  const { user } = useAuth();
  const isPhone = useIsPhoneClient();
  const canEdit = canEditMaster(user?.peran);

  const [rows, setRows] = useState<LembagaBadanListItem[]>([]);
  const [stats, setStats] = useState({ totalAktif: 0, swastaBerlaku: 0, swastaPerluPerpanjang: 0, swastaKedaluwarsa: 0 });
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [sektor, setSektor] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(LIST_PAGE_SIZE);
  const [formOpen, setFormOpen] = useState(false);
  const [editRow, setEditRow] = useState<LembagaBadanRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LembagaBadanListItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [ipmaTarget, setIpmaTarget] = useState<LembagaBadanListItem | null>(null);

  const { sortKey, sortDir, toggleSort } = useTableSort();
  const sortedRows = useMemo(
    () => sortTableRows(rows, sortKey, sortDir, LEMBAGA_BADAN_SORT),
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

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setPage(1);
    setLoading(true);
    setError("");
    try {
      const [list, st] = await Promise.all([
        listLembagaBadan({ q: debouncedQ || undefined, sektorUtama: sektor || undefined }),
        getLembagaBadanStats(),
      ]);
      setRows(list);
      setStats(st);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, sektor]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditRow(null);
    setFormOpen(true);
  }

  function openEdit(row: LembagaBadanRow) {
    setEditRow(row);
    setFormOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await softDeleteLembagaBadan(deleteTarget.id);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className={cn(LIST_PAGE, "w-full max-w-full")}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-copper-950">Lembaga / Badan</h1>
          <p className="text-sm text-muted mt-0.5">
            Pendataan lembaga dan badan usaha di wewidangan Desa Adat.
          </p>
        </div>
        {canEdit && (
          <Button type="button" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Tambah
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        <StatChip label="Aktif" value={String(stats.totalAktif)} />
        <StatChip label="IPMA berlaku" value={String(stats.swastaBerlaku)} />
        <StatChip label="Perlu perpanjang" value={String(stats.swastaPerluPerpanjang)} />
        <StatChip label="Kedaluwarsa" value={String(stats.swastaKedaluwarsa)} />
      </div>

      <Card className={cn(LIST_CARD, isPhone && LIST_CARD_PHONE)}>
        <div className={LIST_FILTER_ROW}>
          <div className={cn(LIST_FILTER_GRID, "sm:grid-cols-2 lg:grid-cols-3")}>
            <div className="min-w-0 sm:col-span-2">
              <Label htmlFor="lb-q">Cari</Label>
              <Input
                id="lb-q"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Nama, alamat, PJ..."
              />
            </div>
            <div className="min-w-0">
              <Label htmlFor="lb-sektor-filter">Sektor</Label>
              <Select id="lb-sektor-filter" value={sektor} onChange={(e) => setSektor(e.target.value)}>
                <option value="">Semua</option>
                {SEKTOR_UTAMA_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            className={cn("shrink-0 self-end", isPhone && "h-11")}
            onClick={() => {
              setQ("");
              setSektor("");
            }}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>

        {error && <p className="mb-2 px-1 text-sm text-red-600">{error}</p>}

        {isPhone ? (
          <ul className="space-y-2">
            {loading ? (
              <li className="py-6 text-center text-xs text-muted">Memuat...</li>
            ) : pagedRows.length === 0 ? (
              <li className="py-6 text-center text-xs text-muted">Belum ada data.</li>
            ) : (
              pagedRows.map((row) => (
                <li
                  key={row.id}
                  className="rounded-lg border border-copper-200/90 bg-card px-3 py-2.5 shadow-sm shadow-copper-950/5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-copper-950">{row.nama}</p>
                    {row.alamat ? (
                      <p className="mt-0.5 text-xs leading-snug text-muted">{row.alamat}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-copper-800">
                      {row.sektor_utama}
                      {row.nama_penanggung_jawab ? ` · ${row.nama_penanggung_jawab}` : ""}
                    </p>
                    {row.sektor_utama === SEKTOR_SWASTA_KOMERSIAL ? (
                      <p className="mt-1">
                        <span
                          className={cn(
                            "inline-block rounded border px-1.5 py-0.5 text-[11px]",
                            statusBadgeClass(row.mautsaha_status)
                          )}
                        >
                          {labelMautsahaStatus(row.mautsaha_status)}
                        </span>
                        {row.mautsaha_berlaku_sampai ? (
                          <span className="ml-1.5 text-[11px] text-muted">
                            s/d {formatTanggalLahir(row.mautsaha_berlaku_sampai)}
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                  {canEdit && (
                    <div className="mt-2.5 grid grid-cols-2 gap-1.5 border-t border-copper-100 pt-2">
                      {row.sektor_utama === SEKTOR_SWASTA_KOMERSIAL && (
                        <Button
                          type="button"
                          variant="secondary"
                          icon={FileText}
                          className="col-span-2 h-10 justify-center text-xs"
                          onClick={() => setIpmaTarget(row)}
                        >
                          IPMA
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="secondary"
                        icon={Pencil}
                        className="h-10 justify-center text-xs"
                        onClick={() => openEdit(row)}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        icon={Trash2}
                        className="h-10 justify-center border-red-200 text-xs text-red-700 hover:bg-red-50"
                        onClick={() => setDeleteTarget(row)}
                      >
                        Hapus
                      </Button>
                    </div>
                  )}
                </li>
              ))
            )}
          </ul>
        ) : (
        <div className={cn(LIST_TABLE, "w-full -mx-0.5 overflow-x-auto")}>
          <table className={cn(LIST_TABLE_ELEMENT, "min-w-[520px]", "[&_td]:!py-1.5")}>
            <thead>
              <tr className={LIST_HEAD_ROW}>
                <SortableTableHead
                  label="Nama"
                  columnKey="nama"
                  activeKey={sortKey}
                  direction={sortDir}
                  onSort={toggleSort}
                />
                <SortableTableHead
                  label="Sektor"
                  columnKey="sektor_utama"
                  activeKey={sortKey}
                  direction={sortDir}
                  onSort={toggleSort}
                  className="hidden sm:table-cell"
                />
                <SortableTableHead
                  label="Penanggung Jawab"
                  columnKey="nama_penanggung_jawab"
                  activeKey={sortKey}
                  direction={sortDir}
                  onSort={toggleSort}
                  className="hidden md:table-cell"
                />
                <th className="hidden lg:table-cell">IPMA</th>
                <th className="w-28" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-4 text-sm text-muted">
                    Memuat...
                  </td>
                </tr>
              ) : pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-4 text-sm text-muted">
                    Belum ada data.
                  </td>
                </tr>
              ) : (
                pagedRows.map((row) => (
                  <tr key={row.id} className={LIST_BODY_ROW}>
                    <td className="min-w-0">
                      <div className="max-w-[14rem] truncate font-medium sm:max-w-none" title={row.nama}>
                        {row.nama}
                      </div>
                      {row.alamat && (
                        <div className="max-w-[14rem] truncate text-xs text-muted sm:max-w-[16rem]">
                          {row.alamat}
                        </div>
                      )}
                      <div className="mt-0.5 text-xs text-muted sm:hidden">{row.sektor_utama}</div>
                    </td>
                    <td className="hidden max-w-[6rem] truncate text-sm sm:table-cell" title={row.sektor_utama}>
                      {row.sektor_utama}
                    </td>
                    <td
                      className="hidden max-w-[8rem] truncate text-sm md:table-cell"
                      title={row.nama_penanggung_jawab}
                    >
                      {row.nama_penanggung_jawab}
                    </td>
                    <td className="hidden lg:table-cell">
                      {row.sektor_utama === SEKTOR_SWASTA_KOMERSIAL ? (
                        <div className="space-y-0.5">
                          <span
                            className={cn(
                              "inline-block rounded border px-1.5 py-0.5 text-[11px]",
                              statusBadgeClass(row.mautsaha_status)
                            )}
                          >
                            {labelMautsahaStatus(row.mautsaha_status)}
                          </span>
                          {row.mautsaha_berlaku_sampai && (
                            <div className="text-[11px] text-muted">
                              s/d {formatTanggalLahir(row.mautsaha_berlaku_sampai)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                    <td>
                      <div className="flex flex-wrap justify-end gap-1">
                        {canEdit && row.sektor_utama === SEKTOR_SWASTA_KOMERSIAL && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            title="Terbit/Perpanjang IPMA"
                            onClick={() => setIpmaTarget(row)}
                          >
                            <FileText className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canEdit && (
                          <>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => openEdit(row)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => setDeleteTarget(row)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </>
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
          totalItems={rows.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </Card>

      <LembagaBadanFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editRow={editRow}
        onSaved={() => void load()}
      />

      {ipmaTarget && (
        <MautsahaAdatDialog
          open={!!ipmaTarget}
          onClose={() => setIpmaTarget(null)}
          lembaga={ipmaTarget}
          onSuccess={() => void load()}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Nonaktifkan lembaga/badan?"
        message={`"${deleteTarget?.nama}" akan dinonaktifkan dari daftar.`}
        confirmLabel="Nonaktifkan"
        busy={deleteBusy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
