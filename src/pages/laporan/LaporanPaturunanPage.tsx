import { useCallback, useEffect, useMemo, useState } from "react";
import { clearPagePersistedState, usePersistedScalar } from "../../lib/page-filter-state";
import { useIsPhoneClient } from "../../hooks/useClientFormFactor";
import { useTableSort } from "../../hooks/useTableSort";
import { clampPage, LIST_PAGE_SIZE, paginateSlice } from "../../lib/pagination";
import { sortTableRows } from "../../lib/table-sort";
import { PATURUNAN_SORT } from "../../lib/table-sort-accessors";
import { SortableTableHead } from "../../components/ui/SortableTableHead";
import { downloadExcel } from "../../lib/excel-export";
import { useLaporanPdfPreview } from "../../hooks/useLaporanPdfPreview";
import { buildLaporanPaturunanPdfInput } from "../../lib/laporan-paturunan-pdf";
import { LaporanExportButtons } from "../../components/laporan/LaporanExportButtons";
import { formatStatusBayarPaturunan } from "../../lib/paturunan-hitung";
import { formatRupiah, isPastTanggalTarget } from "../../lib/paturunan-hitung";
import {
  getLaporanPaturunan,
  type LaporanPaturunanRingkasan,
  type LaporanPaturunanStatusFilter,
} from "../../lib/services/laporan-paturunan";
import { listBanjar, type PaturunanKramaRow } from "../../lib/services/paturunan";
import { listIuranPaturunan } from "../../lib/services/iuran-paturunan";
import { listJenisMipil, listTempek } from "../../lib/services/master";
import type { Banjar, IuranPaturunanRow, JenisKramaMipilRow, Tempek } from "../../lib/types";
import { cn, formatTanggalLahir } from "../../lib/utils";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input, Label, Select } from "../../components/ui/Input";
import { IconLink } from "../../components/ui/IconLink";
import { ListPagination } from "../../components/ui/ListPagination";
import { PaturunanStatusBadge } from "../../components/paturunan/PaturunanStatusBadge";
import {
  LAPORAN_CARD,
  LAPORAN_CARD_PHONE,
  LAPORAN_HEAD_ROW,
  LAPORAN_PAGE,
  LAPORAN_TABLE,
  LAPORAN_TABLE_ELEMENT,
} from "../../components/laporan/laporan-compact";
import {
  ArrowLeft,
  BarChart3,
  Coins,
  Filter,
  RotateCcw,
} from "lucide-react";

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border border-copper-200 bg-copper-50/80 px-2 py-0.5 text-xs text-copper-900"
      title={label}
    >
      <span className="text-muted">{label}:</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
}

const PAGE_ID = "laporan/paturunan";

const STATUS_FILTER_OPTIONS: { value: LaporanPaturunanStatusFilter; label: string }[] = [
  { value: "belum", label: "Belum" },
  { value: "cicil", label: "Cicil" },
  { value: "lunas", label: "Lunas" },
  { value: "cicil_punia", label: "Cicil+Punia" },
  { value: "lunas_punia", label: "Lunas +" },
  { value: "punia", label: "Punia saja" },
  { value: "telat", label: "Telat" },
];

function normalizePersistedStatusList(raw: unknown): LaporanPaturunanStatusFilter[] {
  const allowed = new Set(STATUS_FILTER_OPTIONS.map((o) => o.value));
  const asList = Array.isArray(raw) ? raw : typeof raw === "string" && raw ? [raw] : [];
  return asList.filter(
    (v): v is LaporanPaturunanStatusFilter => typeof v === "string" && allowed.has(v as LaporanPaturunanStatusFilter)
  );
}

export function LaporanPaturunanPage() {
  const isPhone = useIsPhoneClient();
  const openPdfPreview = useLaporanPdfPreview("Kembali ke Laporan Paturunan");
  const [iuranList, setIuranList] = useState<IuranPaturunanRow[]>([]);
  const [banjar, setBanjar] = useState<Banjar[]>([]);
  const [jenisMipil, setJenisMipil] = useState<JenisKramaMipilRow[]>([]);
  const [ringkasan, setRingkasan] = useState<LaporanPaturunanRingkasan | null>(null);
  const [rows, setRows] = useState<PaturunanKramaRow[]>([]);

  const [iuranId, setIuranId] = usePersistedScalar(PAGE_ID, "iuranId", "");
  const [banjarId, setBanjarId] = usePersistedScalar(PAGE_ID, "banjarId", "");
  const [tempek, setTempek] = useState<Tempek[]>([]);
  const [tempekId, setTempekId] = usePersistedScalar(PAGE_ID, "tempekId", "");
  const [jenisMipilId, setJenisMipilId] = usePersistedScalar(PAGE_ID, "jenisMipilId", "");
  const [statusBayarList, setStatusBayarList] = usePersistedScalar<LaporanPaturunanStatusFilter[]>(
    PAGE_ID,
    "statusBayarList",
    []
  );
  const [q, setQ] = usePersistedScalar(PAGE_ID, "q", "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(LIST_PAGE_SIZE);

  // Migrasi filter status lama (string tunggal) → daftar centang
  useEffect(() => {
    if (statusBayarList.length > 0) return;
    try {
      const raw = sessionStorage.getItem(`kasukretan:page-filters:${PAGE_ID}`);
      if (!raw) return;
      const blob = JSON.parse(raw) as Record<string, unknown>;
      if (blob.statusBayarList != null) return;
      const migrated = normalizePersistedStatusList(blob.statusBayar);
      if (migrated.length > 0) setStatusBayarList(migrated);
    } catch {
      /* ignore */
    }
  }, [statusBayarList.length, setStatusBayarList]);

  const { sortKey, sortDir, toggleSort } = useTableSort();
  const sortedRows = useMemo(
    () => sortTableRows(rows, sortKey, sortDir, PATURUNAN_SORT),
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
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  useEffect(() => {
    (async () => {
      try {
        const [iuran, b, j] = await Promise.all([
          listIuranPaturunan(),
          listBanjar(),
          listJenisMipil(),
        ]);
        setIuranList(iuran);
        setBanjar(b);
        setJenisMipil(j);
        if (iuran.length > 0 && !iuranId) setIuranId(iuran[0].id);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);

  useEffect(() => {
    if (!banjarId) {
      setTempek([]);
      setTempekId("");
      return;
    }
    listTempek(banjarId).then(setTempek);
    setTempekId("");
  }, [banjarId]);

  const load = useCallback(async () => {
    if (!iuranId) {
      setRows([]);
      setRingkasan(null);
      setLoading(false);
      return;
    }
    setPage(1);
    setLoading(true);
    setError("");
    try {
      const result = await getLaporanPaturunan({
        iuranId,
        banjarId: banjarId || undefined,
        tempekId: tempekId || undefined,
        jenisMipilId: jenisMipilId || undefined,
        q: q || undefined,
        statusBayar: statusBayarList.length > 0 ? statusBayarList : undefined,
      });
      setRingkasan(result.ringkasan);
      setRows(result.rows);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [iuranId, banjarId, tempekId, jenisMipilId, q, statusBayarList]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedIuran = iuranList.find((i) => i.id === iuranId);

  const hasActiveFilters =
    q.trim() !== "" ||
    banjarId !== "" ||
    tempekId !== "" ||
    jenisMipilId !== "" ||
    statusBayarList.length > 0;

  function resetFilters() {
    clearPagePersistedState(PAGE_ID);
    setQ("");
    setBanjarId("");
    setTempekId("");
    setJenisMipilId("");
    setStatusBayarList([]);
    setPage(1);
  }

  function toggleStatusFilter(value: LaporanPaturunanStatusFilter) {
    setStatusBayarList((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  }

  function exportExcel() {
    if (!selectedIuran || rows.length === 0) return;
    const headers = [
      "No. Pipil",
      "Pengarep",
      "Jenis",
      "Banjar",
      "Tagihan",
      "Dibayar Wajib",
      "Punia",
      "Sisa",
      "Status",
    ];
    const data = rows.map((r) => [
      r.nomor_kartu,
      r.kepala_nama,
      r.jenis_nama,
      r.banjar_nama,
      r.tagihan ?? 0,
      r.dibayar ?? 0,
      r.punia ?? 0,
      r.sisa ?? 0,
      r.tagihan != null
        ? formatStatusBayarPaturunan(r.tagihan, r.dibayar ?? 0, r.punia ?? 0)
        : "—",
    ]);
    const slug = selectedIuran.nama.replace(/[^\w-]+/g, "_").slice(0, 40);
    void downloadExcel(`laporan-paturunan-${slug}`, {
      name: "Data",
      headers,
      rows: data,
    });
  }

  function exportPdf() {
    if (!selectedIuran || rows.length === 0) return;
    const slug = selectedIuran.nama.replace(/[^\w-]+/g, "_").slice(0, 40);
    openPdfPreview(
      buildLaporanPaturunanPdfInput({
        rows,
        iuranNama: selectedIuran.nama,
        banjarId,
        banjar,
        filenameSlug: slug,
      })
    );
  }

  return (
    <div className={LAPORAN_PAGE}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-xl font-bold flex items-center gap-1.5">
            <BarChart3 className="text-copper-700 shrink-0" size={22} />
            Laporan Paturunan
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Ringkasan per iuran — uang wajib terpisah dari punia.
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <IconLink
            to="/laporan"
            icon={ArrowLeft}
            variant="secondary"
            iconOnly
            title="Kembali ke Laporan"
            aria-label="Kembali ke Laporan"
          />
          <IconLink
            to="/paturunan"
            icon={Coins}
            variant="secondary"
            iconOnly
            title="Modul Paturunan"
            aria-label="Modul Paturunan"
          />
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1">
          {error}
        </p>
      )}

      {iuranList.length === 0 && !loading && (
        <Card>
          <p className="text-sm text-muted">Belum ada iuran paturunan. Tambahkan di modul Paturunan.</p>
        </Card>
      )}

      {ringkasan && selectedIuran && (
        <Card className={LAPORAN_CARD}>
          <div className="flex flex-wrap items-center gap-1 mb-1">
            <span className="text-xs font-medium text-copper-900">{selectedIuran.nama}</span>
            {selectedIuran.tanggal_target && (
              <span className="text-[11px] text-muted">
                Target {formatTanggalLahir(selectedIuran.tanggal_target)}
                {isPastTanggalTarget(selectedIuran.tanggal_target) ? " (lewat)" : ""}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <StatChip label="Krama" value={String(ringkasan.total_krama)} />
            <StatChip label="Tagihan" value={formatRupiah(ringkasan.total_tagihan)} />
            <StatChip label="Terkumpul wajib" value={formatRupiah(ringkasan.total_dibayar_wajib)} />
            <StatChip label="Punia" value={formatRupiah(ringkasan.total_punia)} />
            <StatChip label="Sisa" value={formatRupiah(ringkasan.total_sisa)} />
            <StatChip label="Lunas" value={String(ringkasan.jumlah_lunas)} />
            <StatChip label="Cicil" value={String(ringkasan.jumlah_cicil)} />
            <StatChip label="Belum" value={String(ringkasan.jumlah_belum)} />
            {ringkasan.jumlah_belum_lunas_telat > 0 && (
              <StatChip
                label="Telat"
                value={String(ringkasan.jumlah_belum_lunas_telat)}
              />
            )}
          </div>
          {ringkasan.perJenis.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1 mt-1 border-t border-copper-100">
              {ringkasan.perJenis.map((j) => (
                <span
                  key={j.jenis_id}
                  className="text-[11px] text-copper-800 bg-white border border-copper-100 rounded px-1.5 py-0.5"
                >
                  {j.jenis_nama} {j.paturunan_persen}%: {j.jumlah_krama}×{" "}
                  {formatRupiah(j.total_tagihan)}
                </span>
              ))}
            </div>
          )}
        </Card>
      )}

      {iuranList.length > 0 && (
        <Card title="Detail per krama" className={cn(LAPORAN_CARD, isPhone && LAPORAN_CARD_PHONE, LAPORAN_TABLE)}>
          <div className="mb-2 space-y-2">
            <div className="flex flex-wrap items-end gap-1.5">
              <div className="min-w-[140px]">
                <Label className="text-[11px]">Iuran</Label>
                <Select
                  className="text-sm h-9"
                  value={iuranId}
                  onChange={(e) => setIuranId(e.target.value)}
                >
                  {iuranList.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.nama}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex-1 min-w-[120px]">
                <Label className="text-[11px]">Cari</Label>
                <Input
                  className="text-sm h-9"
                  placeholder="No. pipil, pengarep…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <div className="min-w-[110px]">
                <Label className="text-[11px]">Jenis krama</Label>
                <Select
                  className="text-sm h-9"
                  value={jenisMipilId}
                  onChange={(e) => setJenisMipilId(e.target.value)}
                >
                  <option value="">Semua</option>
                  {jenisMipil.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.nama}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="min-w-[100px]">
                <Label className="text-[11px]">Banjar</Label>
                <Select
                  className="text-sm h-9"
                  value={banjarId}
                  onChange={(e) => setBanjarId(e.target.value)}
                >
                  <option value="">Semua</option>
                  {banjar.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nama}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="min-w-[100px]">
                <Label className="text-[11px]">Tempek</Label>
                <Select
                  className="text-sm h-9"
                  value={tempekId}
                  onChange={(e) => setTempekId(e.target.value)}
                  disabled={!banjarId}
                >
                  <option value="">{banjarId ? "Semua" : "Pilih banjar"}</option>
                  {tempek.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nama}
                    </option>
                  ))}
                </Select>
              </div>
              <Button
                variant="secondary"
                type="button"
                icon={Filter}
                iconOnly
                className={cn("shrink-0", isPhone ? "min-h-11 min-w-11" : "min-h-9 min-w-9")}
                onClick={load}
                disabled={loading}
                title="Terapkan filter"
                aria-label="Terapkan filter"
              />
              <Button
                variant="secondary"
                type="button"
                icon={RotateCcw}
                iconOnly
                className={cn("shrink-0", isPhone ? "min-h-11 min-w-11" : "min-h-9 min-w-9")}
                onClick={resetFilters}
                disabled={loading || !hasActiveFilters}
                title="Reset filter"
                aria-label="Reset filter"
              />
              <LaporanExportButtons
                onExcel={exportExcel}
                onPdf={exportPdf}
                disabled={loading}
                excelDisabled={rows.length === 0}
                pdfDisabled={rows.length === 0}
                iconOnly
              />
            </div>

            <div>
              <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <Label className="!mb-0 text-[11px]">Status</Label>
                <span className="text-[10px] text-muted">centang beberapa · kosong = semua</span>
                {statusBayarList.length > 0 && (
                  <button
                    type="button"
                    className="text-[10px] font-medium text-copper-800 underline-offset-2 hover:underline"
                    onClick={() => setStatusBayarList([])}
                  >
                    Hapus pilihan
                  </button>
                )}
              </div>
              <div
                className={cn("flex flex-wrap gap-1.5", isPhone && "gap-2")}
                role="group"
                aria-label="Filter status pembayaran"
              >
                {STATUS_FILTER_OPTIONS.map((opt) => {
                  const checked = statusBayarList.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={checked}
                      onClick={() => toggleStatusFilter(opt.value)}
                      className={cn(
                        "inline-flex items-center rounded-md border px-2.5 text-xs transition-colors",
                        isPhone ? "min-h-10" : "min-h-8",
                        checked
                          ? "border-copper-600 bg-copper-100 font-semibold text-copper-950"
                          : "border-copper-200 bg-card font-medium text-copper-700 hover:border-copper-300 hover:bg-copper-50"
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {isPhone ? (
            <ul className="space-y-2">
              {loading ? (
                <li className="py-4 text-center text-muted text-xs">Memuat…</li>
              ) : pagedRows.length === 0 ? (
                <li className="py-4 text-center text-muted text-xs">Tidak ada data.</li>
              ) : (
                pagedRows.map((r) => (
                  <li
                    key={r.id}
                    className="rounded-lg border border-copper-200/90 bg-card px-3 py-2.5 shadow-sm shadow-copper-950/5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-copper-950">{r.kepala_nama}</p>
                      <p className="font-mono text-[11px] text-copper-700">{r.nomor_kartu}</p>
                    </div>
                    <p className="mt-1 text-xs leading-snug text-muted">
                      {[r.jenis_nama, r.banjar_nama].filter(Boolean).join(" · ") || "—"}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
                      <span className="text-copper-900">
                        <span className="text-muted">Tagihan:</span>{" "}
                        {r.tagihan != null ? formatRupiah(r.tagihan) : "—"}
                      </span>
                      <span className="text-copper-900">
                        <span className="text-muted">Wajib:</span>{" "}
                        {r.dibayar != null ? formatRupiah(r.dibayar) : "—"}
                      </span>
                      <span
                        className={cn(
                          (r.sisa ?? 0) > 0 ? "font-medium text-amber-900" : "text-copper-900"
                        )}
                      >
                        <span className="text-muted font-normal">Sisa:</span>{" "}
                        {r.sisa != null ? formatRupiah(r.sisa) : "—"}
                      </span>
                    </div>
                    {r.tagihan != null && (
                      <div className="mt-1.5">
                        <PaturunanStatusBadge
                          tagihan={r.tagihan}
                          dibayarWajib={r.dibayar ?? 0}
                          punia={r.punia ?? 0}
                        />
                      </div>
                    )}
                  </li>
                ))
              )}
            </ul>
          ) : (
            <div className="overflow-x-auto -mx-0.5">
              <table className={LAPORAN_TABLE_ELEMENT}>
                <thead>
                  <tr className={LAPORAN_HEAD_ROW}>
                    <SortableTableHead label="No. Pipil" columnKey="nomor_kartu" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                    <SortableTableHead label="Pengarep" columnKey="kepala_nama" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                    <SortableTableHead label="Jenis" columnKey="jenis_nama" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                    <SortableTableHead label="Banjar" columnKey="banjar_nama" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                    <SortableTableHead label="Tagihan" columnKey="tagihan" activeKey={sortKey} direction={sortDir} onSort={toggleSort} className="text-right" />
                    <SortableTableHead label="Wajib" columnKey="dibayar" activeKey={sortKey} direction={sortDir} onSort={toggleSort} className="text-right" />
                    <SortableTableHead label="Punia" columnKey="punia" activeKey={sortKey} direction={sortDir} onSort={toggleSort} className="text-right" />
                    <SortableTableHead label="Sisa" columnKey="sisa" activeKey={sortKey} direction={sortDir} onSort={toggleSort} className="text-right" />
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="py-4 text-center text-muted text-xs">
                        Memuat…
                      </td>
                    </tr>
                  ) : pagedRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-4 text-center text-muted text-xs">
                        Tidak ada data.
                      </td>
                    </tr>
                  ) : (
                    pagedRows.map((r) => (
                      <tr key={r.id} className="border-b border-copper-50">
                        <td className="font-mono text-xs">{r.nomor_kartu}</td>
                        <td>{r.kepala_nama}</td>
                        <td className="text-xs">{r.jenis_nama}</td>
                        <td className="text-xs">{r.banjar_nama}</td>
                        <td className="text-right tabular-nums">
                          {r.tagihan != null ? formatRupiah(r.tagihan) : "—"}
                        </td>
                        <td className="text-right tabular-nums">
                          {r.dibayar != null ? formatRupiah(r.dibayar) : "—"}
                        </td>
                        <td className="text-right tabular-nums">
                          {r.punia != null ? formatRupiah(r.punia) : "—"}
                        </td>
                        <td className="text-right tabular-nums">
                          {r.sisa != null ? formatRupiah(r.sisa) : "—"}
                        </td>
                        <td>
                          {r.tagihan != null ? (
                            <PaturunanStatusBadge
                              tagihan={r.tagihan}
                              dibayarWajib={r.dibayar ?? 0}
                              punia={r.punia ?? 0}
                            />
                          ) : (
                            "—"
                          )}
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
            className="mt-2"
          />
        </Card>
      )}
    </div>
  );
}
