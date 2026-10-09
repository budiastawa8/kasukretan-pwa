import { useCallback, useEffect, useMemo, useState } from "react";
import { usePersistedScalar } from "../../lib/page-filter-state";
import { useTableSort } from "../../hooks/useTableSort";
import { clampPage, LIST_PAGE_SIZE, paginateSlice } from "../../lib/pagination";
import { sortTableRows } from "../../lib/table-sort";
import { CAPAIAN_PATURUNAN_TEMPEK_SORT } from "../../lib/table-sort-accessors";
import { SortableTableHead } from "../../components/ui/SortableTableHead";
import { downloadExcel } from "../../lib/excel-export";
import { buildLaporanCapaianPaturunanTempekPdfInput } from "../../lib/laporan-capaian-paturunan-tempek-pdf";
import { useLaporanPdfPreview } from "../../hooks/useLaporanPdfPreview";
import { LaporanExportButtons } from "../../components/laporan/LaporanExportButtons";
import { formatRupiah, isPastTanggalTarget } from "../../lib/paturunan-hitung";
import {
  formatPctTerhadapTagihan,
  getLaporanCapaianPaturunanTempek,
  type CapaianPaturunanTempekRingkasan,
  type CapaianPaturunanTempekRow,
} from "../../lib/services/laporan-capaian-paturunan-tempek";
import { listBanjar } from "../../lib/services/paturunan";
import { listIuranPaturunan } from "../../lib/services/iuran-paturunan";
import type { Banjar, IuranPaturunanRow } from "../../lib/types";
import { cn, formatTanggalLahir } from "../../lib/utils";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Label, Select } from "../../components/ui/Input";
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
import { useIsPhoneClient } from "../../hooks/useClientFormFactor";
import { ArrowLeft, BarChart3, Coins, Filter } from "lucide-react";
import { formatBanjarLaporanNama } from "../../lib/services/laporan-rekap-penerimaan-dudukan";

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-copper-200 bg-copper-50/80 px-2 py-0.5 text-xs text-copper-900">
      <span className="text-muted">{label}:</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
}

const PAGE_ID = "laporan/capaian-paturunan-tempek";

export function LaporanCapaianPaturunanTempekPage() {
  const isPhone = useIsPhoneClient();
  const openPdfPreview = useLaporanPdfPreview("Kembali ke Capaian Paturunan per Tempek");
  const [iuranList, setIuranList] = useState<IuranPaturunanRow[]>([]);
  const [banjar, setBanjar] = useState<Banjar[]>([]);
  const [ringkasan, setRingkasan] = useState<CapaianPaturunanTempekRingkasan | null>(null);
  const [rows, setRows] = useState<CapaianPaturunanTempekRow[]>([]);

  const [iuranId, setIuranId] = usePersistedScalar(PAGE_ID, "iuranId", "");
  const [banjarId, setBanjarId] = usePersistedScalar(PAGE_ID, "banjarId", "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(LIST_PAGE_SIZE);

  const { sortKey, sortDir, toggleSort } = useTableSort();
  const sortedRows = useMemo(
    () => sortTableRows(rows, sortKey, sortDir, CAPAIAN_PATURUNAN_TEMPEK_SORT),
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

  const selectedIuran = iuranList.find((i) => i.id === iuranId);
  const selectedBanjarNama = banjar.find((b) => b.id === banjarId)?.nama;

  useEffect(() => {
    setPage(1);
  }, [sortKey, sortDir]);

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
      const result = await getLaporanCapaianPaturunanTempek({
        iuranId,
        banjarId: banjarId || undefined,
      });
      setRingkasan(result.ringkasan);
      setRows(result.rows);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [iuranId, banjarId]);

  useEffect(() => {
    void load();
  }, [load]);

  function exportExcel() {
    if (!selectedIuran || rows.length === 0) return;
    const slug = selectedIuran.nama.replace(/[^\w-]+/g, "_").slice(0, 40);
    const exportRows: (string | number)[][] = sortedRows.map((r, i) => [
      i + 1,
      formatBanjarLaporanNama(r.banjar_nama),
      r.tempek_nama,
      r.tagihan,
      r.dibayar,
      r.pct_dibayar != null ? Number(r.pct_dibayar.toFixed(1)) : "",
      r.sisa,
      r.pct_sisa != null ? Number(r.pct_sisa.toFixed(1)) : "",
      r.punia,
    ]);
    if (ringkasan) {
      exportRows.push([
        "",
        "",
        "JUMLAH KESELURUHAN",
        ringkasan.total_tagihan,
        ringkasan.total_dibayar,
        ringkasan.pct_dibayar != null ? Number(ringkasan.pct_dibayar.toFixed(1)) : "",
        ringkasan.total_sisa,
        ringkasan.pct_sisa != null ? Number(ringkasan.pct_sisa.toFixed(1)) : "",
        ringkasan.total_punia,
      ]);
    }
    void downloadExcel(`capaian-paturunan-tempek-${slug}`, {
      name: "Capaian Tempek",
      headers: [
        "No",
        "Banjar",
        "Tempek",
        "Tagihan",
        "Dibayar",
        "% Dibayar",
        "Sisa",
        "% Sisa",
        "Jml Punia",
      ],
      rows: exportRows,
      landscape: true,
    });
  }

  function exportPdf() {
    if (!selectedIuran || rows.length === 0) return;
    const slug = selectedIuran.nama.replace(/[^\w-]+/g, "_").slice(0, 40);
    openPdfPreview(
      buildLaporanCapaianPaturunanTempekPdfInput({
        rows: sortedRows,
        ringkasan,
        iuranNama: selectedIuran.nama,
        banjarFilterNama: selectedBanjarNama
          ? formatBanjarLaporanNama(selectedBanjarNama)
          : undefined,
        filenameSlug: slug,
      })
    );
  }

  return (
    <div className={LAPORAN_PAGE}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-1.5">
            <BarChart3 className="text-copper-800" size={22} />
            Capaian Paturunan per Tempek
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Progres tagihan wajib per tempek — % dibayar & % sisa (punia tidak mengurangi sisa).
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
            <StatChip label="Tempek" value={String(ringkasan.jumlah_tempek)} />
            <StatChip label="Krama" value={String(ringkasan.jumlah_krama)} />
            <StatChip label="Tagihan" value={formatRupiah(ringkasan.total_tagihan)} />
            <StatChip label="Dibayar" value={formatRupiah(ringkasan.total_dibayar)} />
            <StatChip label="% Dibayar" value={formatPctTerhadapTagihan(ringkasan.pct_dibayar)} />
            <StatChip label="Sisa" value={formatRupiah(ringkasan.total_sisa)} />
            <StatChip label="% Sisa" value={formatPctTerhadapTagihan(ringkasan.pct_sisa)} />
            <StatChip label="Punia" value={formatRupiah(ringkasan.total_punia)} />
          </div>
        </Card>
      )}

      {iuranList.length === 0 ? (
        <Card className={LAPORAN_CARD}>
          <p className="text-sm text-muted">Belum ada iuran paturunan. Tambahkan di modul Paturunan.</p>
        </Card>
      ) : (
        <Card
          title="Rekap per tempek"
          className={cn(LAPORAN_CARD, isPhone && LAPORAN_CARD_PHONE, LAPORAN_TABLE)}
        >
          <div className="flex flex-wrap items-end gap-1.5 mb-2">
            <div className="min-w-[160px]">
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
            <div className="min-w-[120px]">
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
              icon={Filter}
              className={cn("text-xs", isPhone ? "h-11" : "h-9")}
              onClick={() => void load()}
              disabled={loading}
            >
              Filter
            </Button>
            <LaporanExportButtons
              onExcel={exportExcel}
              onPdf={exportPdf}
              excelDisabled={rows.length === 0}
              pdfDisabled={rows.length === 0}
            />
          </div>

          <div className="overflow-x-auto">
            <table className={cn(LAPORAN_TABLE_ELEMENT, "[&_td]:!py-1.5")}>
              <thead>
                <tr className={LAPORAN_HEAD_ROW}>
                  <th className="text-right w-10">No</th>
                  <SortableTableHead
                    label="Banjar"
                    columnKey="banjar_nama"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTableHead
                    label="Tempek"
                    columnKey="tempek_nama"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                  />
                  <SortableTableHead
                    label="Tagihan"
                    columnKey="tagihan"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                    className="text-right"
                  />
                  <SortableTableHead
                    label="Dibayar"
                    columnKey="dibayar"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                    className="text-right"
                  />
                  <SortableTableHead
                    label="% Dibayar"
                    columnKey="pct_dibayar"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                    className="text-right"
                  />
                  <SortableTableHead
                    label="Sisa"
                    columnKey="sisa"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                    className="text-right"
                  />
                  <SortableTableHead
                    label="% Sisa"
                    columnKey="pct_sisa"
                    activeKey={sortKey}
                    direction={sortDir}
                    onSort={toggleSort}
                    className="text-right"
                  />
                  <SortableTableHead
                    label="Jml Punia"
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
                    <td colSpan={9} className="py-4 text-center text-muted text-sm">
                      Memuat…
                    </td>
                  </tr>
                ) : pagedRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-4 text-center text-muted text-sm">
                      Tidak ada data.
                    </td>
                  </tr>
                ) : (
                  pagedRows.map((r, i) => (
                    <tr key={`${r.banjar_id}-${r.tempek_nama}`} className="border-b border-copper-100">
                      <td className="text-right tabular-nums text-muted pr-2">
                        {(safePage - 1) * pageSize + i + 1}
                      </td>
                      <td className="pr-2">{formatBanjarLaporanNama(r.banjar_nama)}</td>
                      <td className="pr-2">{r.tempek_nama}</td>
                      <td className="text-right tabular-nums">{formatRupiah(r.tagihan)}</td>
                      <td className="text-right tabular-nums text-emerald-800">
                        {formatRupiah(r.dibayar)}
                      </td>
                      <td className="text-right tabular-nums font-medium">
                        {formatPctTerhadapTagihan(r.pct_dibayar)}
                      </td>
                      <td className="text-right tabular-nums text-red-800">
                        {formatRupiah(r.sisa)}
                      </td>
                      <td className="text-right tabular-nums font-medium">
                        {formatPctTerhadapTagihan(r.pct_sisa)}
                      </td>
                      <td className="text-right tabular-nums">{formatRupiah(r.punia)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

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
    </div>
  );
}
