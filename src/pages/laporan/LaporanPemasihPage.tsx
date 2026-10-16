import { useCallback, useEffect, useMemo, useState } from "react";
import { clearPagePersistedState, usePersistedScalar } from "../../lib/page-filter-state";
import { useIsPhoneClient } from "../../hooks/useClientFormFactor";
import { useTableSort } from "../../hooks/useTableSort";
import { clampPage, LIST_PAGE_SIZE, paginateSlice } from "../../lib/pagination";
import { sortTableRows } from "../../lib/table-sort";
import { LAPORAN_PEMASIH_SORT } from "../../lib/table-sort-accessors";
import { SortableTableHead } from "../../components/ui/SortableTableHead";
import { downloadExcel } from "../../lib/excel-export";
import { useLaporanPdfPreview } from "../../hooks/useLaporanPdfPreview";
import { buildLaporanPemasihPdfInput } from "../../lib/laporan-pemasih-pdf";
import { LaporanExportButtons } from "../../components/laporan/LaporanExportButtons";
import { PEMASIH_PERINGATAN_HARI } from "../../lib/pemasih-perhatian";
import {
  getLaporanPemasih,
  type LaporanPemasihFilter,
  type LaporanPemasihRingkasan,
  type LaporanPemasihRow,
} from "../../lib/services/laporan-pemasih";
import { listBanjar, listJenisKramaTamiu, listJenisTamiu } from "../../lib/services/master";
import type { Banjar, JenisKramaTamiuRow, JenisTamiuRow, KlasifikasiKode } from "../../lib/types";
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
import {
  ArrowLeft,
  BarChart3,
  Filter,
  RotateCcw,
  UserCircle,
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

const PAGE_ID = "laporan/pemasih";

export function LaporanPemasihPage() {
  const isPhone = useIsPhoneClient();
  const openPdfPreview = useLaporanPdfPreview("Kembali ke Laporan Pemasih");
  const [banjar, setBanjar] = useState<Banjar[]>([]);
  const [jenisKt, setJenisKt] = useState<JenisKramaTamiuRow[]>([]);
  const [jenisT, setJenisT] = useState<JenisTamiuRow[]>([]);
  const [ringkasan, setRingkasan] = useState<LaporanPemasihRingkasan | null>(null);
  const [rows, setRows] = useState<LaporanPemasihRow[]>([]);

  const [banjarId, setBanjarId] = usePersistedScalar(PAGE_ID, "banjarId", "");
  const [klasifikasi, setKlasifikasi] = usePersistedScalar(PAGE_ID, "klasifikasi", "");
  const [jenisFilter, setJenisFilter] = usePersistedScalar(PAGE_ID, "jenisFilter", "");
  const [statusPemasih, setStatusPemasih] = usePersistedScalar(PAGE_ID, "statusPemasih", "");
  const [perhatian, setPerhatian] = usePersistedScalar(PAGE_ID, "perhatian", "");
  const [q, setQ] = usePersistedScalar(PAGE_ID, "q", "");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(LIST_PAGE_SIZE);

  const jenisKramaTamiuId = jenisFilter.startsWith("kt:") ? jenisFilter.slice(3) : undefined;
  const jenisTamiuId = jenisFilter.startsWith("t:") ? jenisFilter.slice(2) : undefined;

  const { sortKey, sortDir, toggleSort } = useTableSort();
  const sortedRows = useMemo(
    () => sortTableRows(rows, sortKey, sortDir, LAPORAN_PEMASIH_SORT),
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
    Promise.all([listBanjar(), listJenisKramaTamiu(), listJenisTamiu()]).then(([b, jkt, jt]) => {
      setBanjar(b);
      setJenisKt(jkt);
      setJenisT(jt);
    });
  }, []);

  const load = useCallback(async () => {
    setPage(1);
    /** Tanpa filter: jangan scan seluruh pemasih (hemat kuota Turso). */
    if (
      !banjarId &&
      !q.trim() &&
      !klasifikasi &&
      !jenisKramaTamiuId &&
      !jenisTamiuId &&
      !statusPemasih &&
      !perhatian
    ) {
      setRingkasan(null);
      setRows([]);
      setLoading(false);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const filterKlas = klasifikasi ? (klasifikasi as KlasifikasiKode) : undefined;
      const result = await getLaporanPemasih({
        banjarId: banjarId || undefined,
        klasifikasi: filterKlas,
        jenisKramaTamiuId,
        jenisTamiuId,
        statusPemasih: statusPemasih
          ? (statusPemasih as LaporanPemasihFilter["statusPemasih"])
          : undefined,
        perhatian: perhatian
          ? (perhatian as LaporanPemasihFilter["perhatian"])
          : undefined,
        q: q || undefined,
      });
      setRingkasan(result.ringkasan);
      setRows(result.rows);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [banjarId, klasifikasi, jenisKramaTamiuId, jenisTamiuId, statusPemasih, perhatian, q]);

  useEffect(() => {
    load();
  }, [load]);

  const hasActiveFilters =
    q.trim() !== "" ||
    banjarId !== "" ||
    klasifikasi !== "" ||
    jenisFilter !== "" ||
    statusPemasih !== "" ||
    perhatian !== "";

  function resetFilters() {
    clearPagePersistedState(PAGE_ID);
    setQ("");
    setBanjarId("");
    setKlasifikasi("");
    setJenisFilter("");
    setStatusPemasih("");
    setPerhatian("");
    setPage(1);
  }

  function exportExcel() {
    if (rows.length === 0) return;
    const headers = [
      "No. Pemasih",
      "Pengajeg",
      "Alamat",
      "Banjar",
      "Tempek",
      "Status Pemasih",
      "Berlaku S/D",
    ];
    const data = rows.map((r) => [
      r.nomor_kartu,
      r.kepala_nama,
      r.alamat?.trim() || "—",
      r.banjar_nama,
      r.tempek_nama?.trim() || "—",
      r.status_label,
      r.berlaku_sampai ? formatTanggalLahir(r.berlaku_sampai) : "—",
    ]);
    void downloadExcel("laporan-pemasih", { name: "Data", headers, rows: data });
  }

  function exportPdf() {
    if (rows.length === 0) return;
    openPdfPreview(buildLaporanPemasihPdfInput({ rows, ringkasan }));
  }

  return (
    <div className={LAPORAN_PAGE}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-xl font-bold flex items-center gap-1.5">
            <BarChart3 className="text-copper-700 shrink-0" size={22} />
            Laporan Pemasih
          </h2>
          <p className="text-xs text-muted mt-0.5">
            Status masa berlaku Krama Tamiu &amp; Tamiu — tanpa data dudukan.
          </p>
        </div>
        <div className="flex flex-wrap gap-1">
          <IconLink to="/laporan" icon={ArrowLeft} variant="secondary">
            Laporan
          </IconLink>
          <IconLink to="/krama-pemasih" icon={UserCircle} variant="secondary">
            Krama Tamiu &amp; Tamiu
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
          <div className="flex flex-wrap items-center gap-1">
            <StatChip label="Total" value={String(ringkasan.total_krama)} />
            <StatChip label="Krama Tamiu" value={String(ringkasan.jumlah_kt)} />
            <StatChip label="Tamiu" value={String(ringkasan.jumlah_t)} />
            <StatChip label="Aktif" value={String(ringkasan.jumlah_aktif)} />
            <StatChip label="Tidak aktif" value={String(ringkasan.jumlah_tidak_aktif)} />
            {ringkasan.jumlah_akan_habis > 0 && (
              <StatChip
                label={`Akan habis ≤${PEMASIH_PERINGATAN_HARI} hr`}
                value={String(ringkasan.jumlah_akan_habis)}
              />
            )}
          </div>
          {ringkasan.perJenis.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1 mt-1 border-t border-copper-100">
              {ringkasan.perJenis.map((j) => (
                <span
                  key={`${j.klasifikasi_kode}-${j.jenis_nama}`}
                  className="text-[11px] text-copper-800 bg-white border border-copper-100 rounded px-1.5 py-0.5"
                >
                  {j.jenis_nama}: {j.jumlah}
                </span>
              ))}
            </div>
          )}
        </Card>
      )}

      <Card title="Daftar pemasih" className={cn(LAPORAN_CARD, isPhone && LAPORAN_CARD_PHONE, LAPORAN_TABLE)}>
        <div className="flex flex-wrap items-end gap-1.5 mb-2">
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
          <div className="min-w-[110px]">
            <Label className="text-[11px]">Status</Label>
            <Select
              className="text-sm h-9"
              value={statusPemasih}
              onChange={(e) => setStatusPemasih(e.target.value)}
            >
              <option value="">Semua</option>
              <option value="aktif">Aktif</option>
              <option value="tidak_aktif">Tidak aktif</option>
            </Select>
          </div>
          <div className="min-w-[120px]">
            <Label className="text-[11px]">Perhatian</Label>
            <Select
              className="text-sm h-9"
              value={perhatian}
              onChange={(e) => setPerhatian(e.target.value)}
            >
              <option value="">Semua</option>
              <option value="akan_habis">Akan habis</option>
              <option value="tidak_aktif">Tidak aktif</option>
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
              <li className="py-4 text-center text-muted text-xs">
                {!hasActiveFilters
                  ? "Pilih banjar, status, atau kata kunci untuk memuat laporan."
                  : "Tidak ada data."}
              </li>
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
                    {[r.banjar_nama, r.tempek_nama?.trim() || null].filter(Boolean).join(" · ") || "—"}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-copper-800">
                    <span>{r.status_label}</span>
                    <span className="text-muted">·</span>
                    <span className="whitespace-nowrap">
                      Berlaku {r.berlaku_sampai ? formatTanggalLahir(r.berlaku_sampai) : "—"}
                    </span>
                  </p>
                </li>
              ))
            )}
          </ul>
        ) : (
          <div className="overflow-x-auto -mx-0.5">
            <table className={LAPORAN_TABLE_ELEMENT}>
              <thead>
                <tr className={LAPORAN_HEAD_ROW}>
                  <SortableTableHead label="No. Pemasih" columnKey="nomor_kartu" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                  <SortableTableHead label="Pengajeg" columnKey="kepala_nama" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                  <SortableTableHead label="Alamat" columnKey="alamat" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                  <SortableTableHead label="Banjar" columnKey="banjar_nama" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                  <SortableTableHead label="Tempek" columnKey="tempek_nama" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                  <SortableTableHead label="Status" columnKey="status_label" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                  <SortableTableHead label="Berlaku S/D" columnKey="berlaku_sampai" activeKey={sortKey} direction={sortDir} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-4 text-center text-muted text-xs">
                      Memuat…
                    </td>
                  </tr>
                ) : pagedRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-4 text-center text-muted text-xs">
                      {!hasActiveFilters
                        ? "Pilih banjar, status, atau kata kunci untuk memuat laporan."
                        : "Tidak ada data."}
                    </td>
                  </tr>
                ) : (
                  pagedRows.map((r) => (
                    <tr key={r.id} className="border-b border-copper-50">
                      <td className="font-mono text-xs">{r.nomor_kartu}</td>
                      <td>{r.kepala_nama}</td>
                      <td className="text-xs">{r.alamat?.trim() || "—"}</td>
                      <td className="text-xs">{r.banjar_nama}</td>
                      <td className="text-xs">{r.tempek_nama?.trim() || "—"}</td>
                      <td className="text-xs">{r.status_label}</td>
                      <td className="text-xs whitespace-nowrap">
                        {r.berlaku_sampai ? formatTanggalLahir(r.berlaku_sampai) : "—"}
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
    </div>
  );
}
