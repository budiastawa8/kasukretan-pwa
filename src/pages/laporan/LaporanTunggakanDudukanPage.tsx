import { useCallback, useEffect, useMemo, useState } from "react";
import { useIsPhoneClient } from "../../hooks/useClientFormFactor";
import { clearPagePersistedState, usePersistedScalar } from "../../lib/page-filter-state";
import { useLaporanPdfNavigate } from "../../hooks/useLaporanPdfNavigate";
import {
  formatBulanIndonesiaSingkat,
  formatRupiah,
  formatTunggakanPeriodeRingkas,
} from "../../lib/dudukan-hitung";
import { useTableSort } from "../../hooks/useTableSort";
import { clampPage, LIST_PAGE_SIZE, paginateSlice } from "../../lib/pagination";
import { sortTableRows } from "../../lib/table-sort";
import { DUDUKAN_SORT } from "../../lib/table-sort-accessors";
import { SortableTableHead } from "../../components/ui/SortableTableHead";
import { downloadExcel } from "../../lib/excel-export";
import { stashTunggakanDudukanPreview } from "../../lib/laporan-pdf-preview";
import { buildTunggakanDudukanPdfPayload } from "../../lib/tunggakan-dudukan-pdf";
import { LaporanExportButtons } from "../../components/laporan/LaporanExportButtons";
import {
  getLaporanTunggakanDudukan,
  type LaporanTunggakanDudukanRingkasan,
} from "../../lib/services/laporan-tunggakan-dudukan";
import type { DudukanTunggakanBulan, DudukanTunggakanLaporanRow } from "../../lib/services/dudukan";
import { listRtBtnPemasih } from "../../lib/services/krama";
import { listBanjar, listJenisKramaTamiu, listJenisTamiu } from "../../lib/services/master";
import type { JenisKramaTamiuRow, JenisTamiuRow, KlasifikasiKode } from "../../lib/types";
import { cn } from "../../lib/utils";
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
import { LIST_FILTER_ROW } from "../../components/ui/list-compact";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  HandCoins,
  RotateCcw,
} from "lucide-react";

const TUNGGKAN_TABLE_COLS =
  "[&_colgroup_col:nth-child(1)]:w-[11%] [&_colgroup_col:nth-child(2)]:w-[calc(14%+60pt)] [&_colgroup_col:nth-child(3)]:w-[calc(22%+60pt)] [&_colgroup_col:nth-child(4)]:w-[12%] [&_colgroup_col:nth-child(5)]:w-[8%] [&_colgroup_col:nth-child(6)]:w-[13%] [&_colgroup_col:nth-child(7)]:w-[20%]";

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-copper-200 bg-copper-50/80 px-2 py-0.5 text-[11px] text-copper-900">
      <span className="text-muted">{label}:</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
}

function periodeTooltip(bulan: DudukanTunggakanBulan[]): string {
  return bulan
    .map(
      (b) =>
        `${formatBulanIndonesiaSingkat(b.bulan, b.tahun)} ${formatRupiah(b.sisa)}${b.telat ? " (telat)" : ""}`
    )
    .join(" · ");
}

function rowPeriodeLabel(bulan: DudukanTunggakanBulan[]): string {
  const ringkas = formatTunggakanPeriodeRingkas(bulan);
  if (bulan.length <= 1) return ringkas;
  return `${ringkas} (${bulan.length} bln)`;
}

function mapExportRow(r: DudukanTunggakanLaporanRow): (string | number)[] {
  return [
    r.nomor_kartu,
    r.kepala_nama,
    r.alamat,
    r.banjar_nama,
    r.tunggakan_bulan,
    r.total_sisa,
    rowPeriodeLabel(r.bulan_tunggakan),
  ];
}

const PAGE_ID = "laporan/tunggakan-dudukan";

export function LaporanTunggakanDudukanPage() {
  const isPhone = useIsPhoneClient();
  const openPdf = useLaporanPdfNavigate();
  const [banjar, setBanjar] = useState<Awaited<ReturnType<typeof listBanjar>>>([]);
  const [jenisKt, setJenisKt] = useState<JenisKramaTamiuRow[]>([]);
  const [jenisT, setJenisT] = useState<JenisTamiuRow[]>([]);
  const [rtBtnOptions, setRtBtnOptions] = useState<string[]>([]);
  const [ringkasan, setRingkasan] = useState<LaporanTunggakanDudukanRingkasan | null>(null);
  const [rows, setRows] = useState<DudukanTunggakanLaporanRow[]>([]);

  const [banjarId, setBanjarId] = usePersistedScalar(PAGE_ID, "banjarId", "");
  const [klasifikasi, setKlasifikasi] = usePersistedScalar(PAGE_ID, "klasifikasi", "");
  const [jenisFilter, setJenisFilter] = usePersistedScalar(PAGE_ID, "jenisFilter", "");
  const [rtBtn, setRtBtn] = usePersistedScalar(PAGE_ID, "rtBtn", "");
  const [q, setQ] = usePersistedScalar(PAGE_ID, "q", "");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(LIST_PAGE_SIZE);

  const jenisKramaTamiuId = jenisFilter.startsWith("kt:") ? jenisFilter.slice(3) : undefined;
  const jenisTamiuId = jenisFilter.startsWith("t:") ? jenisFilter.slice(2) : undefined;

  const { sortKey, sortDir, toggleSort } = useTableSort();
  const sortedRows = useMemo(
    () => sortTableRows(rows, sortKey, sortDir, DUDUKAN_SORT),
    [rows, sortKey, sortDir]
  );
  const safePage = useMemo(() => clampPage(page, sortedRows.length, pageSize), [page, sortedRows.length, pageSize]);
  const pagedRows = useMemo(() => paginateSlice(sortedRows, safePage, pageSize), [sortedRows, safePage, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [sortKey, sortDir]);

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
    listRtBtnPemasih({ banjarId: banjarId || undefined, statusKrama: "aktif" }).then(
      setRtBtnOptions
    );
  }, [banjarId]);

  const load = useCallback(async () => {
    setPage(1);
    /** Tanpa filter: jangan scan seluruh pemasih (hemat kuota Turso). */
    if (!banjarId && !debouncedQ && !klasifikasi && !jenisKramaTamiuId && !jenisTamiuId && !rtBtn) {
      setRingkasan(null);
      setRows([]);
      setLoading(false);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await getLaporanTunggakanDudukan({
        banjarId: banjarId || undefined,
        klasifikasi: klasifikasi ? (klasifikasi as KlasifikasiKode) : undefined,
        jenisKramaTamiuId,
        jenisTamiuId,
        rtBtn: rtBtn || undefined,
        q: debouncedQ || undefined,
      });
      setRingkasan(result.ringkasan);
      setRows(result.rows);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [banjarId, klasifikasi, jenisKramaTamiuId, jenisTamiuId, rtBtn, debouncedQ]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetFilters() {
    clearPagePersistedState(PAGE_ID);
    setQ("");
    setKlasifikasi("");
    setJenisFilter("");
    setBanjarId("");
    setRtBtn("");
  }

  const exportHeaders = [
    "No. Pemasih",
    "Pengajeg",
    "Alamat",
    "Banjar",
    "Jml Bln",
    "Sisa",
    "Periode",
  ];

  function exportExcel() {
    if (rows.length === 0) return;
    const detailRows: (string | number)[][] = [];
    for (const r of rows) {
      for (const b of r.bulan_tunggakan) {
        detailRows.push([
          r.nomor_kartu,
          r.kepala_nama,
          r.alamat,
          r.banjar_nama,
          formatBulanIndonesiaSingkat(b.bulan, b.tahun),
          b.sisa,
          b.telat ? "Telat" : "",
        ]);
      }
    }
    void downloadExcel("tunggakan-dudukan", [
      {
        name: "Ringkas",
        headers: exportHeaders,
        rows: rows.map(mapExportRow),
      },
      {
        name: "Detail per bulan",
        headers: [
          "No. Pemasih",
          "Pengajeg",
          "Alamat",
          "Banjar",
          "Periode",
          "Sisa",
          "Status",
        ],
        rows: detailRows,
      },
    ]);
  }

  function exportPdf() {
    if (rows.length === 0) return;
    try {
      openPdf((backTo) =>
        stashTunggakanDudukanPreview(
          buildTunggakanDudukanPdfPayload(rows),
          backTo,
          "Kembali ke Tunggakan Dudukan"
        )
      );
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className={LAPORAN_PAGE}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-1.5">
            <BarChart3 className="text-copper-700" size={22} />
            Tunggakan Dudukan
          </h2>
          <p className="text-[11px] text-muted mt-0.5">
            Sisa tagihan pemasih hingga bulan berjalan (tidak termasuk bulan mendatang).
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <IconLink to="/laporan" icon={ArrowLeft} variant="secondary">
            Laporan
          </IconLink>
          <IconLink to="/laporan/dudukan" icon={HandCoins} variant="secondary">
            Laporan Dudukan
          </IconLink>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1">
          {error}
        </p>
      )}

      {ringkasan && (
        <Card className={LAPORAN_CARD}>
          <div className="flex flex-wrap gap-1">
            <StatChip label="Krama tunggakan" value={String(ringkasan.total_krama)} />
            <StatChip label="Total sisa" value={formatRupiah(ringkasan.total_sisa)} />
            {ringkasan.jumlah_telat > 0 && (
              <StatChip label="Bulan telat" value={String(ringkasan.jumlah_telat)} />
            )}
          </div>
        </Card>
      )}

      <Card title="Daftar tunggakan" className={cn(LAPORAN_CARD, isPhone && LAPORAN_CARD_PHONE, LAPORAN_TABLE)}>
        <div className={cn(LIST_FILTER_ROW, "[&_label]:!text-[11px] [&_input]:!h-8 [&_select]:!h-8 [&_input]:!text-xs [&_select]:!text-xs")}>
          <div className="flex-1 min-w-[140px]">
            <Label>Cari</Label>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nama / no. pemasih / alamat…"
            />
          </div>
          <div className="min-w-[110px]">
            <Label>Klasifikasi</Label>
            <Select
              value={klasifikasi}
              onChange={(e) => {
                setKlasifikasi(e.target.value);
                setJenisFilter("");
              }}
            >
              <option value="">Semua</option>
              <option value="KRAMA_TAMIU">Krama Tamiu</option>
              <option value="TAMIU">Tamiu</option>
            </Select>
          </div>
          <div className="min-w-[120px]">
            <Label>Jenis</Label>
            <Select value={jenisFilter} onChange={(e) => setJenisFilter(e.target.value)}>
              <option value="">Semua</option>
              {(!klasifikasi || klasifikasi === "KRAMA_TAMIU") &&
                jenisKt.map((j) => (
                  <option key={`kt:${j.id}`} value={`kt:${j.id}`}>
                    {j.nama}
                  </option>
                ))}
              {(!klasifikasi || klasifikasi === "TAMIU") &&
                jenisT.map((j) => (
                  <option key={`t:${j.id}`} value={`t:${j.id}`}>
                    {j.nama}
                  </option>
                ))}
            </Select>
          </div>
          <div className="min-w-[100px]">
            <Label>Banjar</Label>
            <Select
              value={banjarId}
              onChange={(e) => {
                setBanjarId(e.target.value);
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
          <div className="min-w-[90px]">
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
          <LaporanExportButtons
            onExcel={exportExcel}
            onPdf={exportPdf}
            excelDisabled={rows.length === 0}
            pdfDisabled={rows.length === 0}
          />
          <Button
            type="button"
            variant="secondary"
            icon={RotateCcw}
            iconOnly
            className={cn("shrink-0", isPhone ? "min-h-11 min-w-11" : "min-h-9 min-w-9")}
            onClick={resetFilters}
            title="Reset filter"
            aria-label="Reset filter"
          />
        </div>

        {isPhone ? (
          <ul className="space-y-2">
            {loading ? (
              <li className="py-3 text-center text-muted text-xs">Memuat…</li>
            ) : pagedRows.length === 0 ? (
              <li className="py-3 text-center text-muted text-xs">Tidak ada tunggakan.</li>
            ) : (
              pagedRows.map((r) => {
                const adaTelat = r.bulan_tunggakan.some((b) => b.telat);
                const periode = rowPeriodeLabel(r.bulan_tunggakan);
                return (
                  <li
                    key={r.id}
                    className="rounded-lg border border-copper-200/90 bg-card px-3 py-2.5 shadow-sm shadow-copper-950/5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-copper-950">{r.kepala_nama}</p>
                      <p className="font-mono text-[11px] text-copper-700">{r.nomor_kartu}</p>
                    </div>
                    <p className="mt-1 text-xs leading-snug text-muted">
                      {[r.alamat, r.banjar_nama].filter(Boolean).join(" · ") || "—"}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
                      <span className="text-copper-900">
                        <span className="text-muted">Jml bln:</span> {r.tunggakan_bulan}
                      </span>
                      <span className="font-medium text-amber-900">
                        <span className="text-muted font-normal">Sisa:</span> {formatRupiah(r.total_sisa)}
                      </span>
                    </div>
                    <p
                      className={cn("mt-1 text-[11px]", adaTelat && "text-amber-900")}
                      title={periodeTooltip(r.bulan_tunggakan)}
                    >
                      {adaTelat && <AlertTriangle size={11} className="inline mr-0.5 shrink-0" />}
                      {periode}
                    </p>
                  </li>
                );
              })
            )}
          </ul>
        ) : (
        <div className="overflow-x-auto">
          <table className={cn(LAPORAN_TABLE_ELEMENT, "table-fixed w-full", TUNGGKAN_TABLE_COLS)}>
            <colgroup>
              <col />
              <col />
              <col />
              <col />
              <col />
              <col />
              <col />
            </colgroup>
            <thead>
              <tr className={LAPORAN_HEAD_ROW}>
                <SortableTableHead label="No. Pemasih" columnKey="nomor_kartu" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                <SortableTableHead label="Pengajeg" columnKey="kepala_nama" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                <SortableTableHead label="Alamat" columnKey="alamat" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                <SortableTableHead label="Banjar" columnKey="banjar_nama" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                <SortableTableHead label="Jml Bln" columnKey="tunggakan_bulan" activeKey={sortKey} direction={sortDir} onSort={toggleSort} className="text-right" />
                <SortableTableHead label="Sisa" columnKey="total_sisa" activeKey={sortKey} direction={sortDir} onSort={toggleSort} className="text-right" />
                <th>Periode</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-3 text-center text-muted text-xs">
                    Memuat…
                  </td>
                </tr>
              ) : pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-3 text-center text-muted text-xs">
                    {!banjarId && !debouncedQ && !klasifikasi && !jenisKramaTamiuId && !jenisTamiuId && !rtBtn
                      ? "Pilih banjar, klasifikasi, atau kata kunci untuk memuat laporan."
                      : "Tidak ada tunggakan."}
                  </td>
                </tr>
              ) : (
                pagedRows.map((r) => {
                  const adaTelat = r.bulan_tunggakan.some((b) => b.telat);
                  const periode = rowPeriodeLabel(r.bulan_tunggakan);
                  return (
                    <tr key={r.id} className="border-b border-copper-50">
                      <td className="font-mono text-[11px] truncate">{r.nomor_kartu}</td>
                      <td className="truncate" title={r.kepala_nama}>
                        {r.kepala_nama}
                      </td>
                      <td className="truncate" title={r.alamat}>
                        {r.alamat}
                      </td>
                      <td className="truncate" title={r.banjar_nama}>
                        {r.banjar_nama}
                      </td>
                      <td className="text-right tabular-nums whitespace-nowrap">
                        {r.tunggakan_bulan}
                      </td>
                      <td className="text-right tabular-nums font-medium whitespace-nowrap">
                        {formatRupiah(r.total_sisa)}
                      </td>
                      <td
                        className={cn(
                          "text-[11px] truncate",
                          adaTelat && "text-amber-900"
                        )}
                        title={periodeTooltip(r.bulan_tunggakan)}
                      >
                        {adaTelat && (
                          <AlertTriangle size={11} className="inline mr-0.5 shrink-0" />
                        )}
                        {periode}
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
          className="mt-2"
          compact
        />
      </Card>
    </div>
  );
}
