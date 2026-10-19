import { useCallback, useEffect, useMemo, useState } from "react";
import { clearPagePersistedState, usePersistedScalar } from "../../lib/page-filter-state";

import { useIsPhoneClient } from "../../hooks/useClientFormFactor";
import { useTableSort } from "../../hooks/useTableSort";
import { clampPage, LIST_PAGE_SIZE, paginateSlice } from "../../lib/pagination";
import { sortTableRows } from "../../lib/table-sort";
import { LAPORAN_DUDUKAN_SORT } from "../../lib/table-sort-accessors";
import { SortableTableHead } from "../../components/ui/SortableTableHead";

import { downloadExcel } from "../../lib/excel-export";

import { buildLaporanDudukanPdfInput } from "../../lib/laporan-dudukan-pdf";
import { useLaporanPdfPreview } from "../../hooks/useLaporanPdfPreview";

import { LaporanExportButtons } from "../../components/laporan/LaporanExportButtons";

import { formatStatusBayarDudukan, formatRupiah } from "../../lib/dudukan-hitung";

import {

  getLaporanDudukan,

  type LaporanDudukanFilter,

  type LaporanDudukanRingkasan,

} from "../../lib/services/laporan-dudukan";

import { listBanjar, type DudukanKramaRow } from "../../lib/services/dudukan";

import { listJenisKramaTamiu, listJenisTamiu } from "../../lib/services/master";

import type { JenisKramaTamiuRow, JenisTamiuRow, KlasifikasiKode } from "../../lib/types";

import { cn, formatTanggalLahir } from "../../lib/utils";

import { Card } from "../../components/ui/Card";

import { Button } from "../../components/ui/Button";

import { DateInput } from "../../components/ui/DateInput";

import { Input, Label, Select } from "../../components/ui/Input";

import { IconLink } from "../../components/ui/IconLink";

import { ListPagination } from "../../components/ui/ListPagination";

import { DudukanStatusBadge } from "../../components/dudukan/DudukanStatusBadge";

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

  Filter,

  HandCoins,

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



function exportSlug(dari: string, sampai: string): string {

  return dari && sampai

    ? `${dari}_${sampai}`

    : dari

      ? `dari-${dari}`

      : sampai

        ? `sampai-${sampai}`

        : "bulan-ini";

}



function formatPeriodeLabel(dari: string, sampai: string): string {

  if (dari && sampai) {

    return `${formatTanggalLahir(dari)} s.d. ${formatTanggalLahir(sampai)}`;

  }

  if (dari) return `Dari ${formatTanggalLahir(dari)}`;

  if (sampai) return `Sampai ${formatTanggalLahir(sampai)}`;

  return "Bulan berjalan";

}



function formatKeteranganKrama(row: DudukanKramaRow): string {
  if (row.status_krama?.trim().toLowerCase() !== "nonaktif") return "—";
  const tanggal = row.tanggal_tidak_aktif?.trim();
  return tanggal
    ? `Nonaktif sejak ${formatTanggalLahir(tanggal)}`
    : "Nonaktif (tanggal tidak tercatat)";
}

const PAGE_ID = "laporan/dudukan";

export function LaporanDudukanPage() {

  const isPhone = useIsPhoneClient();
  const openPdfPreview = useLaporanPdfPreview("Kembali ke Laporan Dudukan");



  const [banjar, setBanjar] = useState<Awaited<ReturnType<typeof listBanjar>>>([]);

  const [jenisKt, setJenisKt] = useState<JenisKramaTamiuRow[]>([]);

  const [jenisT, setJenisT] = useState<JenisTamiuRow[]>([]);

  const [ringkasan, setRingkasan] = useState<LaporanDudukanRingkasan | null>(null);

  const [rows, setRows] = useState<DudukanKramaRow[]>([]);



  const [dari, setDari] = usePersistedScalar(PAGE_ID, "dari", "");

  const [sampai, setSampai] = usePersistedScalar(PAGE_ID, "sampai", "");

  const [banjarId, setBanjarId] = usePersistedScalar(PAGE_ID, "banjarId", "");

  const [klasifikasi, setKlasifikasi] = usePersistedScalar(PAGE_ID, "klasifikasi", "");

  const [jenisFilter, setJenisFilter] = usePersistedScalar(PAGE_ID, "jenisFilter", "");

  const [statusBayar, setStatusBayar] = usePersistedScalar(PAGE_ID, "statusBayar", "");

  const [q, setQ] = usePersistedScalar(PAGE_ID, "q", "");
  const [debouncedQ, setDebouncedQ] = useState(q.trim());

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(LIST_PAGE_SIZE);



  const jenisKramaTamiuId = jenisFilter.startsWith("kt:") ? jenisFilter.slice(3) : undefined;

  const jenisTamiuId = jenisFilter.startsWith("t:") ? jenisFilter.slice(2) : undefined;



  const { sortKey, sortDir, toggleSort } = useTableSort();
  const sortedRows = useMemo(
    () => sortTableRows(rows, sortKey, sortDir, LAPORAN_DUDUKAN_SORT),
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

    (async () => {

      try {

        const [b, jkt, jt] = await Promise.all([

          listBanjar(),

          listJenisKramaTamiu(),

          listJenisTamiu(),

        ]);

        setBanjar(b);

        setJenisKt(jkt);

        setJenisT(jt);

      } catch (e) {

        setError(String(e));

      }

    })();

  }, []);



  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [q]);

  const load = useCallback(async () => {
    setPage(1);
    setLoading(true);
    setError("");
    try {
      const filterKlas = klasifikasi ? (klasifikasi as KlasifikasiKode) : undefined;
      const qSearch = debouncedQ.length >= 2 ? debouncedQ : undefined;
      const result = await getLaporanDudukan({
        dari: dari || undefined,
        sampai: sampai || undefined,
        banjarId: banjarId || undefined,
        klasifikasi: filterKlas,
        jenisKramaTamiuId,
        jenisTamiuId,
        q: qSearch,
        statusBayar: statusBayar
          ? (statusBayar as LaporanDudukanFilter["statusBayar"])
          : undefined,
      });
      setRingkasan(result.ringkasan);
      setRows(result.rows);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [dari, sampai, banjarId, klasifikasi, jenisKramaTamiuId, jenisTamiuId, debouncedQ, statusBayar]);

  useEffect(() => {
    load();
  }, [load]);



  const hasActiveFilters =

    q.trim() !== "" ||

    banjarId !== "" ||

    klasifikasi !== "" ||

    jenisFilter !== "" ||

    statusBayar !== "" ||

    dari !== "" ||

    sampai !== "";



  function resetFilters() {
    clearPagePersistedState(PAGE_ID);

    setQ("");

    setBanjarId("");

    setKlasifikasi("");

    setJenisFilter("");

    setStatusBayar("");

    setDari("");

    setSampai("");

    setPage(1);

  }



  const periodeLabel = formatPeriodeLabel(dari, sampai);



  function exportExcel() {

    if (rows.length === 0) return;

    const headers = [

      "No. Pemasih",

      "Pengajeg",

      "Klasifikasi",

      "Jenis",

      "Banjar",

      "Tagihan",

      "Dibayar Tagihan",

      "Diterima Periode",

      "Keringanan",

      "Sisa",

      "Status",

      "Keterangan",

    ];

    const data = rows.map((r) => [

      r.nomor_kartu,

      r.kepala_nama,

      r.klasifikasi_nama,

      r.jenis_nama,

      r.banjar_nama,

      r.tarif,

      r.dibayar,

      r.diterima_periode ?? 0,

      r.keringanan,

      r.sisa,

      formatStatusBayarDudukan(r.tarif, r.dibayar, r.keringanan),

      formatKeteranganKrama(r),

    ]);

    void downloadExcel(`laporan-dudukan-${exportSlug(dari, sampai)}`, {

      name: "Data",

      headers,

      rows: data,

    });

  }



  function exportPdf() {
    if (rows.length === 0) return;
    openPdfPreview(
      buildLaporanDudukanPdfInput({
        rows,
        ringkasan,
        dari,
        sampai,
      })
    );
  }



  return (

    <div className={LAPORAN_PAGE}>

      <div className="flex flex-wrap items-center justify-between gap-2">

        <div className="min-w-0">

          <h2 className="text-xl font-bold flex items-center gap-1.5">

            <BarChart3 className="text-copper-700 shrink-0" size={22} />

            Laporan Dudukan

          </h2>

          <p className="text-xs text-muted mt-0.5">

            Dibayar Tagihan = pembayaran untuk tagihan periode ini. Diterima
            Periode = uang masuk di rentang tanggal ini (bisa termasuk
            pelunasan tunggakan periode lain).

          </p>

        </div>

        <div className="flex flex-wrap gap-1">

          <IconLink to="/laporan" icon={ArrowLeft} variant="secondary">

            Laporan

          </IconLink>

          <IconLink to="/dudukan" icon={HandCoins} variant="secondary">

            Modul Dudukan

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

          <div className="flex flex-wrap items-center gap-1 mb-1">

            <span className="text-xs font-medium text-copper-900">{periodeLabel}</span>

          </div>

          <div className="flex flex-wrap items-center gap-1">

            <StatChip label="Krama wajib" value={String(ringkasan.total_krama)} />

            <StatChip label="Tagihan" value={formatRupiah(ringkasan.total_tagihan)} />

            <StatChip label="Dibayar tagihan" value={formatRupiah(ringkasan.total_dibayar)} />

            <StatChip label="Diterima periode" value={formatRupiah(ringkasan.total_diterima)} />

            <StatChip label="Keringanan" value={formatRupiah(ringkasan.total_keringanan)} />

            <StatChip label="Sisa" value={formatRupiah(ringkasan.total_sisa)} />

            <StatChip label="Belum lunas" value={String(ringkasan.jumlah_belum_lunas)} />

            {ringkasan.jumlah_lunas_keringanan > 0 && (

              <StatChip

                label="Lunas (R)"

                value={String(ringkasan.jumlah_lunas_keringanan)}

              />

            )}

            {ringkasan.jumlah_telat > 0 && (

              <StatChip label="Telat" value={String(ringkasan.jumlah_telat)} />

            )}

          </div>

          {ringkasan.perJenis.length > 0 && (

            <div className="flex flex-wrap gap-1 pt-1 mt-1 border-t border-copper-100">

              {ringkasan.perJenis.map((j) => (

                <span

                  key={`${j.klasifikasi_kode}-${j.jenis_nama}-${j.tarif}`}

                  className="text-[11px] text-copper-800 bg-white border border-copper-100 rounded px-1.5 py-0.5"

                >

                  {j.jenis_nama}: {j.jumlah_krama}× {formatRupiah(j.total_tagihan)}

                </span>

              ))}

            </div>

          )}

        </Card>

      )}



      <Card title="Detail per pemasih" className={cn(LAPORAN_CARD, isPhone && LAPORAN_CARD_PHONE, LAPORAN_TABLE)}>

        <div className="flex flex-wrap items-end gap-1.5 mb-2">

          <div>

            <Label className="text-[11px]">Dari tanggal</Label>

            <DateInput value={dari} onChange={setDari} />

          </div>

          <div>

            <Label className="text-[11px]">Sampai tanggal</Label>

            <DateInput value={sampai} onChange={setSampai} />

          </div>

          <div className="flex-1 min-w-[120px]">

            <Label className="text-[11px]">Cari</Label>

            <Input

              className="text-sm h-9"

              placeholder="Nama / no. pemasih…"

              value={q}

              onChange={(e) => setQ(e.target.value)}

            />

          </div>

          <div className="min-w-[110px]">

            <Label className="text-[11px]">Klasifikasi</Label>

            <Select

              className="text-sm h-9"

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

          <div className="min-w-[130px]">

            <Label className="text-[11px]">Jenis</Label>

            <Select

              className="text-sm h-9"

              value={jenisFilter}

              onChange={(e) => setJenisFilter(e.target.value)}

            >

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

          <div className="min-w-[120px]">

            <Label className="text-[11px]">Status</Label>

            <Select

              className="text-sm h-9"

              value={statusBayar}

              onChange={(e) => setStatusBayar(e.target.value)}

            >

              <option value="">Semua</option>

              <option value="belum">Belum</option>

              <option value="cicil">Cicil</option>

              <option value="lunas">Lunas</option>

              <option value="lunas_keringanan">Lunas (R)</option>

              <option value="telat">Telat</option>

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



        {isPhone ? (
          <ul className="space-y-2">
            {loading ? (
              <li className="py-4 text-center text-muted text-xs">Memuat…</li>
            ) : pagedRows.length === 0 ? (
              <li className="py-4 text-center text-muted text-xs">Tidak ada data.</li>
            ) : (
              pagedRows.map((r) => {
                const keterangan = formatKeteranganKrama(r);
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
                      {[r.jenis_nama, r.banjar_nama].filter(Boolean).join(" · ") || "—"}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
                      <span className="text-copper-900">
                        <span className="text-muted">Tagihan:</span> {formatRupiah(r.tarif)}
                      </span>
                      <span className="text-copper-900">
                        <span className="text-muted">Dibayar:</span> {formatRupiah(r.dibayar)}
                      </span>
                      <span
                        className={cn(
                          r.sisa > 0 ? "font-medium text-amber-900" : "text-copper-900"
                        )}
                      >
                        <span className="text-muted font-normal">Sisa:</span> {formatRupiah(r.sisa)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <DudukanStatusBadge
                        tagihan={r.tarif}
                        dibayar={r.dibayar}
                        keringanan={r.keringanan}
                      />
                    </div>
                    {keterangan !== "—" && (
                      <p className="mt-1 text-[11px] text-muted">{keterangan}</p>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        ) : (
          <div className="overflow-x-auto -mx-0.5">

            <table className={LAPORAN_TABLE_ELEMENT}>

              <thead>

                <tr className={LAPORAN_HEAD_ROW}>

                  <SortableTableHead label="No. Pemasih" columnKey="nomor_kartu" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />

                  <SortableTableHead label="Pengajeg" columnKey="kepala_nama" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />

                  <SortableTableHead label="Jenis" columnKey="jenis_nama" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />

                  <SortableTableHead label="Banjar" columnKey="banjar_nama" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />

                  <SortableTableHead label="Tagihan" columnKey="tarif" activeKey={sortKey} direction={sortDir} onSort={toggleSort} className="text-right" />

                  <SortableTableHead label="Dibayar Tagihan" columnKey="dibayar" activeKey={sortKey} direction={sortDir} onSort={toggleSort} className="text-right" />

                  <SortableTableHead label="Diterima Periode" columnKey="diterima_periode" activeKey={sortKey} direction={sortDir} onSort={toggleSort} className="text-right" />

                  <SortableTableHead label="Keringanan" columnKey="keringanan" activeKey={sortKey} direction={sortDir} onSort={toggleSort} className="text-right" />

                  <SortableTableHead label="Sisa" columnKey="sisa" activeKey={sortKey} direction={sortDir} onSort={toggleSort} className="text-right" />

                  <th>Status</th>

                  <th>Keterangan</th>

                </tr>

              </thead>

              <tbody>

                {loading ? (

                  <tr>

                    <td colSpan={11} className="py-4 text-center text-muted text-xs">

                      Memuat…

                    </td>

                  </tr>

                ) : pagedRows.length === 0 ? (

                  <tr>

                    <td colSpan={11} className="py-4 text-center text-muted text-xs">

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

                      <td className="text-right tabular-nums">{formatRupiah(r.tarif)}</td>

                      <td className="text-right tabular-nums">{formatRupiah(r.dibayar)}</td>

                      <td className="text-right tabular-nums">
                        {formatRupiah(r.diterima_periode ?? 0)}
                      </td>

                      <td className="text-right tabular-nums">

                        {r.keringanan > 0 ? formatRupiah(r.keringanan) : "—"}

                      </td>

                      <td className="text-right tabular-nums">{formatRupiah(r.sisa)}</td>

                      <td>

                        <DudukanStatusBadge

                          tagihan={r.tarif}

                          dibayar={r.dibayar}

                          keringanan={r.keringanan}

                        />

                      </td>

                      <td className="text-xs">{formatKeteranganKrama(r)}</td>

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

    </div>

  );

}


