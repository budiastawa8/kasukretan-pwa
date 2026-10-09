import { useCallback, useEffect, useMemo, useState } from "react";
import { useIsPhoneClient } from "../../hooks/useClientFormFactor";
import { usePersistedScalar } from "../../lib/page-filter-state";
import { useTableSort } from "../../hooks/useTableSort";
import { clampPage, LIST_PAGE_SIZE, paginateSlice } from "../../lib/pagination";
import { sortTableRows } from "../../lib/table-sort";
import { PATURUNAN_SORT } from "../../lib/table-sort-accessors";
import { SortableTableHead } from "../../components/ui/SortableTableHead";
import { downloadExcel } from "../../lib/excel-export";
import { buildLaporanPuniaPdfInput } from "../../lib/laporan-punia-pdf";
import { useLaporanPdfPreview } from "../../hooks/useLaporanPdfPreview";
import { LaporanExportButtons } from "../../components/laporan/LaporanExportButtons";
import { formatRupiah, isPastTanggalTarget } from "../../lib/paturunan-hitung";
import {
  getLaporanPunia,
  type LaporanPuniaRingkasan,
} from "../../lib/services/laporan-punia";
import { listBanjar, type PaturunanKramaRow } from "../../lib/services/paturunan";
import { listIuranPaturunan } from "../../lib/services/iuran-paturunan";
import type { Banjar, IuranPaturunanRow } from "../../lib/types";
import { cn, formatTanggalLahir } from "../../lib/utils";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input, Label, Select } from "../../components/ui/Input";
import { IconLink } from "../../components/ui/IconLink";
import { ListPagination } from "../../components/ui/ListPagination";
import {
  LAPORAN_CARD,
  LAPORAN_CARD_PHONE,
  LAPORAN_HEAD_ROW,
  LAPORAN_PAGE,
  LAPORAN_TABLE,
  LAPORAN_TABLE_ELEMENT,
} from "../../components/laporan/laporan-compact";
import { ArrowLeft, Coins, Filter, Gift } from "lucide-react";

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-copper-200 bg-copper-50/80 px-2 py-0.5 text-xs text-copper-900">
      <span className="text-muted">{label}:</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
}

const PAGE_ID = "laporan/punia";

export function LaporanPuniaPage() {
  const isPhone = useIsPhoneClient();
  const openPdfPreview = useLaporanPdfPreview("Kembali ke Laporan Punia");
  const [iuranList, setIuranList] = useState<IuranPaturunanRow[]>([]);
  const [banjar, setBanjar] = useState<Banjar[]>([]);
  const [ringkasan, setRingkasan] = useState<LaporanPuniaRingkasan | null>(null);
  const [rows, setRows] = useState<PaturunanKramaRow[]>([]);

  const [iuranId, setIuranId] = usePersistedScalar(PAGE_ID, "iuranId", "");
  const [banjarId, setBanjarId] = usePersistedScalar(PAGE_ID, "banjarId", "");
  const [q, setQ] = usePersistedScalar(PAGE_ID, "q", "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(LIST_PAGE_SIZE);

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

  const selectedIuran = iuranList.find((i) => i.id === iuranId);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  useEffect(() => {
    Promise.all([listIuranPaturunan(), listBanjar()]).then(([iuran, b]) => {
      setIuranList(iuran);
      setBanjar(b);
      if (iuran.length > 0) setIuranId((prev) => prev || iuran[0].id);
    });
  }, [setIuranId]);

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
      const result = await getLaporanPunia({
        iuranId,
        banjarId: banjarId || undefined,
        q: q || undefined,
      });
      setRingkasan(result.ringkasan);
      setRows(result.rows);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [iuranId, banjarId, q]);

  useEffect(() => {
    void load();
  }, [load]);

  function exportExcel() {
    if (!selectedIuran || rows.length === 0) return;
    const slug = selectedIuran.nama.replace(/[^\w-]+/g, "_").slice(0, 40);
    void downloadExcel(`laporan-punia-${slug}`, {
      name: "Punia",
      headers: ["No", "No. Pipil", "Pengarep", "Jenis", "Banjar", "Jumlah Punia"],
      rows: rows.map((r, i) => [
        i + 1,
        r.nomor_kartu,
        r.kepala_nama,
        r.jenis_nama,
        r.banjar_nama,
        r.punia ?? 0,
      ]),
    });
  }

  function exportPdf() {
    if (!selectedIuran || rows.length === 0) return;
    const slug = selectedIuran.nama.replace(/[^\w-]+/g, "_").slice(0, 40);
    openPdfPreview(
      buildLaporanPuniaPdfInput({
        rows,
        iuranNama: selectedIuran.nama,
        filenameSlug: slug,
        ringkasan,
      })
    );
  }

  return (
    <div className={LAPORAN_PAGE}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-1.5">
            <Gift className="text-copper-800" size={22} />
            Laporan Punia
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Krama Nyada (0%) dan krama lain yang sudah mepunia — tanpa tagihan/paturunan.
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <IconLink to="/laporan" icon={ArrowLeft} variant="secondary">
            Laporan
          </IconLink>
          <IconLink to="/laporan/paturunan" icon={Coins} variant="secondary">
            Laporan Paturunan
          </IconLink>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1">{error}</p>
      )}

      {ringkasan && selectedIuran && (
        <Card className={cn(LAPORAN_CARD, isPhone && LAPORAN_CARD_PHONE)}>
          <div className="flex flex-wrap items-center gap-1 mb-1">
            <span className="text-xs font-medium">{selectedIuran.nama}</span>
            {selectedIuran.tanggal_target && (
              <span className="text-[11px] text-muted">
                Target {formatTanggalLahir(selectedIuran.tanggal_target)}
                {isPastTanggalTarget(selectedIuran.tanggal_target) ? " (lewat)" : ""}
              </span>
            )}
          </div>
          <div className={cn("flex flex-wrap gap-1", isPhone && "gap-1.5")}>
            <StatChip label="Pemberi punia" value={String(ringkasan.total_krama)} />
            <StatChip label="Total punia" value={formatRupiah(ringkasan.total_punia)} />
            <StatChip label="Nyada / 0%" value={String(ringkasan.jumlah_tidak_wajib)} />
            <StatChip label="Jenis wajib" value={String(ringkasan.jumlah_wajib)} />
          </div>
        </Card>
      )}

      {iuranList.length > 0 && (
        <Card
          title="Daftar pemberi punia"
          className={cn(LAPORAN_CARD, isPhone && LAPORAN_CARD_PHONE, LAPORAN_TABLE)}
        >
          <div className="flex flex-wrap items-end gap-1.5 mb-2">
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
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="No. pipil, pengarep…"
              />
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
            <Button
              variant="secondary"
              type="button"
              icon={Filter}
              iconOnly
              className={cn("shrink-0", isPhone ? "min-h-11 min-w-11" : "min-h-9 min-w-9")}
              onClick={() => void load()}
              disabled={loading}
              title="Terapkan filter"
              aria-label="Terapkan filter"
            />
            <LaporanExportButtons
              onExcel={exportExcel}
              onPdf={exportPdf}
              excelDisabled={rows.length === 0}
              pdfDisabled={rows.length === 0}
            />
          </div>

          {isPhone ? (
            <ul className="space-y-2">
              {loading ? (
                <li className="py-4 text-center text-muted text-xs">Memuat…</li>
              ) : pagedRows.length === 0 ? (
                <li className="py-4 text-center text-muted text-xs">Belum ada yang mepunia.</li>
              ) : (
                pagedRows.map((r, idx) => (
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
                    <p className="mt-1.5 text-xs tabular-nums">
                      <span className="font-medium text-copper-900">
                        <span className="text-muted font-normal">Punia:</span>{" "}
                        {formatRupiah(r.punia ?? 0)}
                      </span>
                      <span className="ml-2 text-muted">
                        No. {(safePage - 1) * pageSize + idx + 1}
                      </span>
                    </p>
                  </li>
                ))
              )}
            </ul>
          ) : (
            <div className="overflow-x-auto">
              <table className={LAPORAN_TABLE_ELEMENT}>
                <thead>
                  <tr className={LAPORAN_HEAD_ROW}>
                    <th className="text-right w-10">No</th>
                    <SortableTableHead
                      label="No. Pipil"
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
                    />
                    <SortableTableHead
                      label="Jumlah Punia"
                      columnKey="punia"
                      activeKey={sortKey}
                      direction={sortDir}
                      onSort={toggleSort}
                      className="text-right"
                    />
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-4 text-center text-muted text-xs">
                        Memuat…
                      </td>
                    </tr>
                  ) : pagedRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-4 text-center text-muted text-xs">
                        Belum ada yang mepunia.
                      </td>
                    </tr>
                  ) : (
                    pagedRows.map((r, idx) => (
                      <tr key={r.id} className="border-b border-copper-50">
                        <td className="text-right tabular-nums text-xs text-muted">
                          {(safePage - 1) * pageSize + idx + 1}
                        </td>
                        <td className="font-mono text-xs">{r.nomor_kartu}</td>
                        <td className="max-w-[10rem] whitespace-normal break-words">
                          {r.kepala_nama}
                        </td>
                        <td className="text-xs">{r.jenis_nama}</td>
                        <td className="text-xs">{r.banjar_nama}</td>
                        <td className="text-right tabular-nums font-medium">
                          {formatRupiah(r.punia ?? 0)}
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

      {iuranList.length === 0 && !loading && (
        <Card className={LAPORAN_CARD}>
          <p className="text-sm text-muted">Belum ada iuran paturunan. Tambahkan di modul Paturunan.</p>
        </Card>
      )}
    </div>
  );
}
